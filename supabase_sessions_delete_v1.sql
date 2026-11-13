-- MANUAL, NO EJECUTADO. Ejecutar primero el verificador de solo lectura.
-- Borrado transaccional exclusivamente de una sesión abierta/autorizada.
-- No deshabilita triggers/RLS/FK. No borra Biblioteca, jugadores ni contadores.
begin;
set local lock_timeout = '5s';

do $pre$
declare name text;
begin
  if current_user<>'postgres' or auth.uid() is not null then
    raise exception 'Instalar como postgres sin JWT de aplicación';
  end if;
  if to_regclass('public.planned_session_deletion_archive_v1') is not null
     or to_regprocedure('public.delete_planned_session_v1(uuid,uuid,integer,boolean)') is not null then
    raise exception 'Migración de borrado ya instalada o instalación parcial: revisar verificador';
  end if;
  if to_regprocedure('public.planned_session_04b_lock(uuid,integer)') is null then
    raise exception 'Falta el bloqueo/autorización de Sesiones 04B';
  end if;
  foreach name in array array['planned_training_sessions','planned_session_slots',
    'planned_session_items','planned_session_player_roster','planned_session_player_availability',
    'planned_session_audit_events','planned_session_date_change_authorizations'] loop
    if to_regclass('public.'||name) is null then raise exception 'Falta public.%',name; end if;
  end loop;
end $pre$;

-- Sin FK al registro que se elimina. Conserva la auditoría y las instantáneas
-- íntegras fuera de las tablas operativas. No es visible/escribible por clientes.
create table public.planned_session_deletion_archive_v1 (
  session_id uuid primary key,
  club_team_season_id uuid not null,
  revision integer not null,
  actor_user_id uuid not null,
  actor_membership_id uuid not null,
  transaction_id bigint not null,
  deleted_at timestamptz not null default now(),
  snapshot jsonb not null
);
alter table public.planned_session_deletion_archive_v1 owner to postgres;
alter table public.planned_session_deletion_archive_v1 enable row level security;
revoke all on public.planned_session_deletion_archive_v1 from public,anon,authenticated,service_role;

create function public.guard_planned_session_deletion_archive_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog as $fn$
begin
  raise exception 'Archivo de eliminación inmutable' using errcode='42501';
end $fn$;
alter function public.guard_planned_session_deletion_archive_v1() owner to postgres;
revoke all on function public.guard_planned_session_deletion_archive_v1() from public,anon,authenticated,service_role;
create trigger planned_deletion_archive_immutable before update or delete
  on public.planned_session_deletion_archive_v1 for each row
  execute function public.guard_planned_session_deletion_archive_v1();
create trigger planned_deletion_archive_no_truncate before truncate
  on public.planned_session_deletion_archive_v1 for each statement
  execute function public.guard_planned_session_deletion_archive_v1();

-- Autorización interna de una única transacción; no usa variables configurables
-- por el cliente. Solo la RPC puede insertar el archivo que acredita el borrado.
create function public.planned_session_delete_authorized_v1(target_session_id uuid)
returns boolean language sql volatile security definer set search_path=pg_catalog as $fn$
  select auth.uid() is not null and exists (
    select 1 from public.planned_session_deletion_archive_v1 a
    join public.planned_training_sessions s on s.id=a.session_id
      and s.club_team_season_id=a.club_team_season_id and s.revision=a.revision
    where a.session_id=target_session_id and a.transaction_id=txid_current()
      and a.actor_user_id=auth.uid()
      and public.can_write_club_team_season(a.club_team_season_id)
  );
$fn$;
alter function public.planned_session_delete_authorized_v1(uuid) owner to postgres;
revoke all on function public.planned_session_delete_authorized_v1(uuid) from public,anon,authenticated,service_role;

-- Preflight estricto: no sobrescribir guards locales modificados. Los hashes
-- corresponden al cuerpo completo 03A/04A, normalizando solo CRLF y bordes.
-- El verificador muestra hashes y definiciones; una diferencia exige revision.
do $guards_preflight$
declare expected record;
begin
  for expected in select * from (values
    ('public.guard_planned_session_row()', '491865ab08c80da496bea7ba369ad51c'),
    ('public.guard_planned_session_player_roster()', '5aa7234d70b762e9602ca255336b8cd5'),
    ('public.guard_planned_session_audit()', 'b5612164156faa7b2c4cd5026ed25e7c')
  ) baseline(signature,body_md5) loop
    if not exists (select 1 from pg_proc p where p.oid=to_regprocedure(expected.signature)
      and p.prorettype='trigger'::regtype and p.prosecdef and p.proowner='postgres'::regrole
      and p.proconfig=array['search_path=pg_catalog']::text[]
      and md5(btrim(replace(p.prosrc,chr(13)||chr(10),chr(10)),E' \t\r\n'))=expected.body_md5) then
      raise exception 'Guard % distinto de la definicion revisada; comparar verificador',expected.signature;
    end if;
  end loop;
end $guards_preflight$;

-- Definiciones completas: solamente se agrega la excepcion DELETE inicial.
-- INSERT, UPDATE y DELETE no autorizado conservan el cuerpo previo integro.
create or replace function public.guard_planned_session_row()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_club uuid; v_start date; v_end date; v_status text; v_actor uuid;
begin
  -- Unica excepcion nueva: DELETE acreditado para esta sesion y transaccion.
  if tg_op='DELETE' and public.planned_session_delete_authorized_v1(old.id) then
    return old;
  end if;
  if tg_op='DELETE' then
    raise exception 'La anulación de sesiones no pertenece a 03A' using errcode='42501';
  end if;
  if auth.uid() is null or
     public.can_write_club_team_season(new.club_team_season_id) is not true then
    raise exception 'Sesión no autorizada' using errcode='42501';
  end if;
  select cts.club_id,se.starts_on,se.ends_on,se.status
    into v_club,v_start,v_end,v_status
  from public.club_team_seasons cts
  join public.club_seasons se on se.id=cts.season_id and se.club_id=cts.club_id
  where cts.id=new.club_team_season_id for update of se;
  if not found or v_status<>'open' or
     public.can_write_club_team_season(new.club_team_season_id) is not true then
    raise exception 'Temporada cerrada o acceso revocado' using errcode='42501';
  end if;
  if new.session_date<v_start or new.session_date>v_end then
    raise exception 'Fecha fuera de la temporada canónica' using errcode='23514';
  end if;
  select m.id into v_actor from public.club_memberships m
  where m.user_id=auth.uid() and m.club_id=v_club and m.is_active
    and m.role in ('owner','admin','staff')
  order by m.id limit 1;
  if v_actor is null then
    raise exception 'Membresía no autorizada' using errcode='42501';
  end if;
  if tg_op='INSERT' then
    if new.planning_state<>'draft' or new.session_number is not null or
       new.confirmed_at is not null or new.revision<>1 or
       new.created_by_membership_id<>v_actor then
      raise exception 'Borrador inicial inválido' using errcode='42501';
    end if;
    new.created_at:=now();
  else
    if new.id<>old.id or new.club_team_season_id<>old.club_team_season_id or
       new.created_by_membership_id<>old.created_by_membership_id or
       new.created_at<>old.created_at or new.revision<>old.revision+1 or
       (old.planning_state='confirmed' and new.planning_state<>'confirmed') or
       (old.planning_state='confirmed' and
        (new.confirmed_at is distinct from old.confirmed_at or
         new.team_name_snapshot is distinct from old.team_name_snapshot or
         new.season_label_snapshot is distinct from old.season_label_snapshot)) then
      raise exception 'Identidad, estado o revisión inmutable' using errcode='42501';
    end if;
  end if;
  new.updated_at:=now();
  return new;
end $fn$;

create or replace function public.guard_planned_session_player_roster()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
declare
  v_cts uuid;
  v_status text;
  v_session_date date;
  v_joined_on date;
  v_left_on date;
  v_name text;
  v_position text;
  v_primary_count integer;
begin
  -- Unica excepcion nueva: DELETE acreditado para esta sesion y transaccion.
  if tg_op='DELETE' and public.planned_session_delete_authorized_v1(old.session_id) then
    return old;
  end if;
  if tg_op<>'INSERT' then
    raise exception 'La instantánea de plantilla es inmutable' using errcode='42501';
  end if;
  select s.club_team_season_id,se.status,s.session_date
    into v_cts,v_status,v_session_date
  from public.planned_training_sessions s
  join public.club_team_seasons cts on cts.id=s.club_team_season_id
  join public.club_seasons se on se.id=cts.season_id and se.club_id=cts.club_id
  where s.id=new.session_id for update of se;
  if not found or v_status<>'open' or auth.uid() is null or
     public.can_write_club_team_season(v_cts) is not true then
    raise exception 'Plantilla de sesión no autorizada' using errcode='42501';
  end if;
  select m.joined_on,m.left_on into v_joined_on,v_left_on
  from public.club_team_season_players m
  where m.id=new.source_membership_id and m.club_team_season_id=v_cts
    and m.player_id=new.player_id and m.voided_at is null for share of m;
  if not found then
    raise exception 'Pertenencia canónica no corresponde a esta sesión y jugador'
      using errcode='23514';
  end if;
  if (v_joined_on is not null and v_session_date<v_joined_on) or
     (v_left_on is not null and v_session_date>=v_left_on) then
    raise exception 'Pertenencia fuera del intervalo conocido de la sesión'
      using errcode='23514';
  end if;
  select p.name into v_name from public.players_database p where p.id=new.player_id;
  if nullif(btrim(v_name),'') is null then
    raise exception 'Nombre canónico de jugador vacío' using errcode='23514';
  end if;
  new.player_name_snapshot:=v_name;
  select count(*),min(pos.position_key) into v_primary_count,v_position
  from public.player_positions pos
  where pos.player_id=new.player_id and pos.position_type='natural' and pos.is_primary;
  if v_primary_count>1 then
    raise exception 'Posición natural principal ambigua' using errcode='23514';
  end if;
  new.position_key_snapshot:=v_position;
  new.created_at:=now();
  return new;
end $fn$;

create or replace function public.guard_planned_session_audit()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_cts uuid; v_club uuid; v_revision integer; v_status text;
begin
  -- Unica excepcion nueva: DELETE acreditado para esta sesion y transaccion.
  if tg_op='DELETE' and public.planned_session_delete_authorized_v1(old.session_id) then
    return old;
  end if;
  if tg_op<>'INSERT' then
    raise exception 'Auditoría append-only' using errcode='42501';
  end if;
  select s.club_team_season_id,s.revision,cts.club_id
    into v_cts,v_revision,v_club
  from public.planned_training_sessions s
  join public.club_team_seasons cts on cts.id=s.club_team_season_id
  where s.id=new.session_id;
  if auth.uid() is null or v_cts is null or
     public.can_write_club_team_season(v_cts) is not true or
     new.revision<>v_revision or not exists (
       select 1 from public.club_memberships m
       where m.id=new.actor_membership_id and m.user_id=auth.uid()
         and m.club_id=v_club and m.is_active
         and m.role in ('owner','admin','staff')) then
    raise exception 'Evento de auditoría no autorizado' using errcode='42501';
  end if;
  select se.status into v_status from public.club_team_seasons cts
  join public.club_seasons se on se.id=cts.season_id and se.club_id=cts.club_id
  where cts.id=v_cts for update of se;
  if v_status is distinct from 'open' then
    raise exception 'Temporada cerrada' using errcode='42501';
  end if;
  new.occurred_at:=now(); return new;
end $fn$;

-- Contrato cerrado de las diez FK revisadas y de los seis triggers DELETE.
-- Rechaza tambien FK nuevas entre tablas conocidas y triggers renombrados,
-- parciales, deshabilitados o conectados a otra funcion. No modifica el catalogo.
create function public.planned_session_delete_contract_v1()
returns boolean language sql stable security definer set search_path=pg_catalog as $fn$
  with expected_fk(child,parent,child_columns,parent_columns,delete_action) as (values
    ('planned_session_slots','planned_training_sessions',array['session_id'],array['id'],'r'),
    ('planned_session_items','planned_training_sessions',array['session_id'],array['id'],'r'),
    ('planned_session_items','planned_session_slots',array['slot_id','session_id'],array['id','session_id'],'r'),
    ('planned_session_player_roster','planned_training_sessions',array['session_id'],array['id'],'r'),
    ('planned_session_player_availability','planned_session_player_roster',array['session_id','player_id'],array['session_id','player_id'],'r'),
    ('planned_session_audit_events','planned_training_sessions',array['session_id'],array['id'],'r'),
    ('planned_session_date_change_authorizations','planned_training_sessions',array['session_id'],array['id'],'r'),
    ('planned_session_distributions','planned_training_sessions',array['session_id'],array['id'],'r'),
    ('planned_session_board_seed_v11','planned_training_sessions',array['session_id'],array['id'],'r'),
    ('planned_session_exercise_dimensions_v12','planned_session_slots',array['slot_id','session_id'],array['id','session_id'],'c')
  ), target_tables as (
    select to_regclass('public.'||child)::oid as oid from expected_fk
    union select to_regclass('public.planned_training_sessions')::oid
  ), actual_fk as (
    select c.*,array(select a.attname::text from unnest(c.conkey) with ordinality k(num,ord)
      join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num order by k.ord) as child_columns,
      array(select a.attname::text from unnest(c.confkey) with ordinality k(num,ord)
      join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.num order by k.ord) as parent_columns
    from pg_constraint c where c.contype='f' and c.confrelid in(select oid from target_tables)
  ), expected_trigger(relation,name,routine) as (values
    ('planned_training_sessions','planned_sessions_guard','guard_planned_session_row()'),
    ('planned_session_slots','planned_slots_guard','guard_planned_session_child()'),
    ('planned_session_items','planned_items_guard','guard_planned_session_child()'),
    ('planned_session_player_roster','planned_session_player_roster_guard','guard_planned_session_player_roster()'),
    ('planned_session_player_availability','planned_session_player_availability_guard','guard_planned_session_player_availability()'),
    ('planned_session_audit_events','planned_audit_guard','guard_planned_session_audit()')
  ), actual_trigger as (
    select * from pg_trigger where not tgisinternal and (tgtype & 8)<>0
      and tgrelid in(select oid from target_tables)
  )
  select (select count(*)=10 from target_tables)
    and (select count(*)=10 from pg_class c where c.oid in(select oid from target_tables)
      and c.relkind='r' and not c.relhassubclass and c.relrowsecurity)
    -- Una regla de reescritura DELETE tambien podria modificar otras tablas.
    and not exists(select 1 from pg_rewrite r where r.ev_class in(select oid from target_tables)
      and r.ev_type='4')
    and (select count(*)=10 from actual_fk)
    and not exists(select 1 from expected_fk e where not exists(
      select 1 from actual_fk c where c.conrelid=to_regclass('public.'||e.child)
        and c.confrelid=to_regclass('public.'||e.parent)
        and c.child_columns=e.child_columns and c.parent_columns=e.parent_columns
        and c.confdeltype::text=e.delete_action and c.confupdtype='a'
        and c.convalidated and not c.condeferrable))
    and (select count(*)=6 from actual_trigger)
    and not exists(select 1 from expected_trigger e where not exists(
      select 1 from actual_trigger t join pg_proc p on p.oid=t.tgfoid
      where t.tgrelid=to_regclass('public.'||e.relation) and t.tgname=e.name
        and t.tgfoid=to_regprocedure('public.'||e.routine) and t.tgtype=31
        and t.tgenabled in ('O','A') and t.tgqual is null and t.tgnargs=0
        and p.prosecdef and p.proowner='postgres'::regrole
        and p.proconfig=array['search_path=pg_catalog']::text[]));
$fn$;
alter function public.planned_session_delete_contract_v1() owner to postgres;
revoke all on function public.planned_session_delete_contract_v1() from public,anon,authenticated,service_role;

create function public.delete_planned_session_v1(
  p_session_id uuid,p_club_team_season_id uuid,p_expected_revision integer,p_confirm boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare ctx record; saved public.planned_training_sessions%rowtype;
  archive public.planned_session_deletion_archive_v1%rowtype;
  target text; relation oid; rows_json jsonb; snapshot jsonb;
  affected integer;
  authorized_club uuid; season_status text; actor_id uuid; actor_role text;
  -- Children before parents: availability -> roster, dimensions/items -> slots.
  ordered_tables constant text[] := array[
    'planned_session_player_availability','planned_session_player_roster',
    'planned_session_exercise_dimensions_v12','planned_session_items',
    'planned_session_distributions','planned_session_board_seed_v11',
    'planned_session_date_change_authorizations','planned_session_slots',
    'planned_session_audit_events'];
begin
  if p_confirm is distinct from true or p_session_id is null or p_club_team_season_id is null
    or p_expected_revision is null or p_expected_revision<1 then
    raise exception 'Confirmación, identidad o revisión inválida' using errcode='22023';
  end if;
  if auth.uid() is null or public.can_write_club_team_season(p_club_team_season_id) is not true then
    raise exception 'Temporada cerrada o sesión no autorizada' using errcode='42501';
  end if;
  -- Mismos bloqueos de autorización también en el camino de reintento:
  -- temporada abierta -> membresía activa -> asignación STAFF explícita.
  select cts.club_id,se.status into authorized_club,season_status
    from public.club_team_seasons cts
    join public.club_seasons se on se.id=cts.season_id and se.club_id=cts.club_id
    where cts.id=p_club_team_season_id for update of se;
  if not found or season_status is distinct from 'open'
    or public.can_write_club_team_season(p_club_team_season_id) is not true then
    raise exception 'Temporada cerrada o permiso revocado' using errcode='42501';
  end if;
  select m.id,m.role into actor_id,actor_role from public.club_memberships m
    where m.club_id=authorized_club and m.user_id=auth.uid() and m.is_active
      and m.role in ('owner','admin','staff') order by m.id limit 1 for share of m;
  if actor_id is null then raise exception 'Membresía no autorizada' using errcode='42501'; end if;
  if actor_role='staff' then
    perform 1 from public.club_team_season_permissions p
      where p.club_id=authorized_club and p.membership_id=actor_id
        and p.club_team_season_id=p_club_team_season_id for share of p;
    if not found then raise exception 'Asignación revocada' using errcode='42501'; end if;
  end if;
  -- Reintento con la misma identidad tras perder una respuesta: sin repetir DELETE.
  if not exists(select 1 from public.planned_training_sessions where id=p_session_id) then
    select * into archive from public.planned_session_deletion_archive_v1
      where session_id=p_session_id and club_team_season_id=p_club_team_season_id
        and revision=p_expected_revision and actor_user_id=auth.uid();
    if not found then raise exception 'Sesión no encontrada o no autorizada' using errcode='42501'; end if;
    return jsonb_build_object('status','deleted','session_id',p_session_id,
      'club_team_season_id',p_club_team_season_id,'revision',p_expected_revision);
  end if;
  select * into ctx from public.planned_session_04b_lock(p_session_id,p_expected_revision);
  if ctx.cts_id is distinct from p_club_team_season_id then
    raise exception 'La sesión pertenece a otro CTS' using errcode='42501';
  end if;
  select * into saved from public.planned_training_sessions where id=p_session_id;
  if to_jsonb(saved)->>'retired_at' is not null then
    raise exception 'Sesión retirada históricamente: conservar archivo' using errcode='42501';
  end if;
  -- Solo relaciones conocidas. Dependencias nuevas/externas exigen revisión;
  -- nunca se siguen cascadas hacia otros módulos.
  -- Impide cambiar el catálogo del padre durante la comprobación y el DELETE.
  lock table public.planned_training_sessions in row exclusive mode;
  foreach target in array ordered_tables loop
    relation:=to_regclass('public.'||target);
    if relation is not null then
      execute format('lock table public.%I in share row exclusive mode',target);
    end if;
  end loop;
  if public.planned_session_delete_contract_v1() is not true then
    raise exception 'SESSION_DELETE_EXTERNAL_DEPENDENCY_OR_TRIGGER_REVIEW_REQUIRED: revisar verificador'
      using errcode='42501';
  end if;
  snapshot:=jsonb_build_object('session',to_jsonb(saved));
  foreach target in array ordered_tables loop
    if to_regclass('public.'||target) is not null then
      execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from public.%I r where session_id=$1',target)
        into rows_json using p_session_id;
      snapshot:=snapshot||jsonb_build_object(target,rows_json);
    end if;
  end loop;
  insert into public.planned_session_deletion_archive_v1
    (session_id,club_team_season_id,revision,actor_user_id,actor_membership_id,transaction_id,snapshot)
    values(p_session_id,ctx.cts_id,p_expected_revision,auth.uid(),ctx.actor_id,txid_current(),snapshot);
  foreach target in array ordered_tables loop
    if to_regclass('public.'||target) is not null then
      execute format('delete from public.%I where session_id=$1',target) using p_session_id;
      -- Detecta también triggers que omitan silenciosamente alguna fila.
      execute format('select count(*) from public.%I where session_id=$1',target) into affected using p_session_id;
      if affected<>0 then raise exception 'Borrado incompleto: %',target; end if;
    end if;
  end loop;
  delete from public.planned_training_sessions
    where id=p_session_id and club_team_season_id=ctx.cts_id and revision=p_expected_revision;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Borrado de sesión no confirmado'; end if;
  -- No se reduce highest_ever_assigned: nunca se reutiliza numeración histórica.
  return jsonb_build_object('status','deleted','session_id',p_session_id,
    'club_team_season_id',ctx.cts_id,'revision',p_expected_revision);
end $fn$;
alter function public.delete_planned_session_v1(uuid,uuid,integer,boolean) owner to postgres;
revoke all on function public.delete_planned_session_v1(uuid,uuid,integer,boolean) from public,anon,authenticated,service_role;
grant execute on function public.delete_planned_session_v1(uuid,uuid,integer,boolean) to authenticated;

create function public.planned_session_delete_ready_v1() returns boolean
language sql stable security definer set search_path=pg_catalog as $fn$
  select auth.uid() is not null and
    (select count(*)=3 from pg_proc where oid in (
      'public.guard_planned_session_row()'::regprocedure,
      'public.guard_planned_session_player_roster()'::regprocedure,
      'public.guard_planned_session_audit()'::regprocedure)
      and position('planned_session_delete_authorized_v1' in prosrc)>0)
    and public.planned_session_delete_contract_v1();
$fn$;
alter function public.planned_session_delete_ready_v1() owner to postgres;
revoke all on function public.planned_session_delete_ready_v1() from public,anon,authenticated,service_role;
grant execute on function public.planned_session_delete_ready_v1() to authenticated;
do $postflight$
begin
  if public.planned_session_delete_contract_v1() is not true then
    raise exception 'Contrato de FK/triggers distinto del revisado: instalación revertida';
  end if;
end $postflight$;
commit;
