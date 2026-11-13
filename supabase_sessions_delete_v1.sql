-- MANUAL, NO EJECUTADO. Ejecutar primero el verificador de solo lectura.
-- Borrado transaccional exclusivamente de una sesión abierta/autorizada.
-- No deshabilita triggers/RLS/FK. No borra Biblioteca, jugadores ni contadores.
begin;
set local lock_timeout = '5s';

do $pre$
declare name text;
begin
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

-- Amplía los guards existentes SOLO para la operación anterior. Todos los
-- demás caminos (incluido DELETE directo) conservan exactamente su validación.
do $guards$
declare entry record; routine oid; definition text; body text; patched text;
begin
  for entry in select * from (values
    ('guard_planned_session_row','La anulación de sesiones no pertenece a 03A','old.id'),
    ('guard_planned_session_player_roster','La instantánea de plantilla es inmutable','old.session_id'),
    ('guard_planned_session_audit','Auditoría append-only','old.session_id')
  ) specs(name,marker,identity_expression) loop
    routine:=to_regprocedure('public.'||entry.name||'()');
    select prosrc,pg_get_functiondef(oid) into body,definition from pg_proc
      where oid=routine and prosecdef and proowner='postgres'::regrole
        and 'search_path=pg_catalog'=any(proconfig);
    if definition is null or position(entry.marker in body)=0
      or position('planned_session_delete_authorized_v1' in body)>0 then
      raise exception 'Guard % incompatible; no se sustituye',entry.name;
    end if;
    patched:=regexp_replace(body,'\mbegin\M',
      'begin'||chr(10)||'  if tg_op=''DELETE'' and public.planned_session_delete_authorized_v1('
      ||entry.identity_expression||') then return old; end if;', 'i');
    if patched=body then raise exception 'No se pudo ampliar %',entry.name; end if;
    execute replace(definition,body,patched);
  end loop;
end $guards$;

create function public.delete_planned_session_v1(
  p_session_id uuid,p_club_team_season_id uuid,p_expected_revision integer,p_confirm boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare ctx record; saved public.planned_training_sessions%rowtype;
  archive public.planned_session_deletion_archive_v1%rowtype;
  target text; relation oid; targets oid[]:='{}'; rows_json jsonb; snapshot jsonb;
  affected integer;
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
  -- Reintento con la misma identidad tras perder una respuesta: sin repetir DELETE.
  if not exists(select 1 from public.planned_training_sessions where id=p_session_id) then
    select * into archive from public.planned_session_deletion_archive_v1
      where session_id=p_session_id and club_team_season_id=p_club_team_season_id
        and revision=p_expected_revision;
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
  targets:=array['public.planned_training_sessions'::regclass::oid];
  foreach target in array ordered_tables loop
    relation:=to_regclass('public.'||target);
    if relation is not null then
      targets:=array_append(targets,relation);
      execute format('lock table public.%I in share row exclusive mode',target);
    end if;
  end loop;
  if exists(select 1 from pg_constraint where contype='f' and confrelid=any(targets)
    and not conrelid=any(targets)) then
    raise exception 'SESSION_DELETE_EXTERNAL_DEPENDENCY: revisar verificador' using errcode='23503';
  end if;
  if exists(select 1 from pg_trigger where tgrelid=any(targets) and not tgisinternal
    and (tgtype & 8)<>0 and (tgenabled not in ('O','A') or tgname not in (
      'planned_sessions_guard','planned_slots_guard','planned_items_guard',
      'planned_session_player_roster_guard','planned_session_player_availability_guard','planned_audit_guard'))) then
    raise exception 'SESSION_DELETE_TRIGGER_REVIEW_REQUIRED' using errcode='42501';
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
    and (select count(*)=6 from pg_trigger where not tgisinternal and tgenabled in ('O','A')
      and (tgrelid,tgname) in (
        ('public.planned_training_sessions'::regclass,'planned_sessions_guard'),
        ('public.planned_session_slots'::regclass,'planned_slots_guard'),
        ('public.planned_session_items'::regclass,'planned_items_guard'),
        ('public.planned_session_player_roster'::regclass,'planned_session_player_roster_guard'),
        ('public.planned_session_player_availability'::regclass,'planned_session_player_availability_guard'),
        ('public.planned_session_audit_events'::regclass,'planned_audit_guard')));
$fn$;
alter function public.planned_session_delete_ready_v1() owner to postgres;
revoke all on function public.planned_session_delete_ready_v1() from public,anon,authenticated,service_role;
grant execute on function public.planned_session_delete_ready_v1() to authenticated;
commit;
