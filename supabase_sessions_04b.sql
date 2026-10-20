-- APPCAUDAL / Sesiones 04B. PENDIENTE DE REVISION: NO EJECUTAR.
-- Requiere 04A instalado y verificado. No carga jugadores ni modifica sesiones.
-- Las RPC de 03A/03C permanecen intactas.
begin;
set local search_path = pg_catalog;

do $pre$
declare v_name text;
begin
  if to_regclass('public.planned_session_player_roster') is null
     or to_regclass('public.planned_session_player_availability') is null
     or to_regclass('public.planned_training_sessions') is null
     or to_regclass('public.planned_session_audit_events') is null
     or to_regclass('public.club_team_season_players') is null
     or to_regprocedure('public.save_planned_session(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])') is null
     or to_regprocedure('public.save_planned_session_03c(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])') is null
     or to_regprocedure('public.confirm_planned_session(uuid,integer)') is null
     or to_regprocedure('public.confirm_planned_session_03c(uuid,integer)') is null
     or to_regprocedure('public.guard_planned_session_row()') is null
     or to_regprocedure('public.guard_planned_session_audit()') is null
     or to_regprocedure('public.can_write_club_team_season(uuid)') is null
     or to_regprocedure('public.planned_session_state(uuid)') is null then
    raise exception 'Sesiones 04B: instalar y verificar 04A, 03A y autorizacion CTS antes';
  end if;
  if obj_description(to_regclass('public.planned_session_player_roster'),'pg_class') is distinct from
       'APPCAUDAL Sesiones 04A: immutable session roster snapshot'
     or obj_description(to_regclass('public.planned_session_player_availability'),'pg_class') is distinct from
       'APPCAUDAL Sesiones 04A: sparse session availability overrides'
     or not exists (select 1 from pg_trigger t
       where t.tgrelid=to_regclass('public.planned_session_player_roster')
         and t.tgname='planned_session_player_roster_guard' and t.tgenabled='O'
         and t.tgfoid=to_regprocedure('public.guard_planned_session_player_roster()'))
     or not exists (select 1 from pg_trigger t
       where t.tgrelid=to_regclass('public.planned_session_player_availability')
         and t.tgname='planned_session_player_availability_guard' and t.tgenabled='O'
         and t.tgfoid=to_regprocedure('public.guard_planned_session_player_availability()'))
     or not exists (select 1 from pg_class c
       where c.oid=to_regclass('public.planned_session_player_roster') and c.relrowsecurity)
     or not exists (select 1 from pg_class c
       where c.oid=to_regclass('public.planned_session_player_availability') and c.relrowsecurity)
     or has_table_privilege('authenticated',
       to_regclass('public.planned_session_player_roster'),'INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated',
       to_regclass('public.planned_session_player_availability'),'INSERT,UPDATE,DELETE')
     or exists(select 1 from pg_attribute a
       where a.attrelid in (to_regclass('public.planned_session_player_roster'),
         to_regclass('public.planned_session_player_availability'))
         and a.attnum>0 and not a.attisdropped
         and has_column_privilege('authenticated',a.attrelid,a.attname,'INSERT,UPDATE')) then
    raise exception 'Sesiones 04B: esquema o guards 04A incompatibles';
  end if;
  if exists (select 1 from pg_proc p where p.oid=any(array[
       to_regprocedure('public.save_planned_session(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])'),
       to_regprocedure('public.save_planned_session_03c(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])')])
       and not p.prosecdef) then
    raise exception 'Sesiones 04B: guardados existentes no usan SECURITY DEFINER';
  end if;
  perform set_config('appcaudal.sessions04b.save03a_before',
    md5(pg_get_functiondef(to_regprocedure(
      'public.save_planned_session(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])')::oid)),true);
  perform set_config('appcaudal.sessions04b.save03c_before',
    md5(pg_get_functiondef(to_regprocedure(
      'public.save_planned_session_03c(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])')::oid)),true);
  perform set_config('appcaudal.sessions04b.state_before',
    md5(pg_get_functiondef(to_regprocedure('public.planned_session_state(uuid)')::oid)),true);
  perform set_config('appcaudal.sessions04b.confirm03a_before',
    md5(pg_get_functiondef(to_regprocedure('public.confirm_planned_session(uuid,integer)')::oid)),true);
  perform set_config('appcaudal.sessions04b.confirm03c_before',
    md5(pg_get_functiondef(to_regprocedure('public.confirm_planned_session_03c(uuid,integer)')::oid)),true);
  perform set_config('appcaudal.sessions04b.rls_before',
    coalesce((select md5(string_agg(
      c.relname||':'||p.polname||':'||p.polcmd::text||':'||
      p.polpermissive::text||':'||p.polroles::text||':'||
      coalesce(pg_get_expr(p.polqual,p.polrelid),'')||':'||
      coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),
      '|' order by c.relname,p.polname))
      from pg_policy p join pg_class c on c.oid=p.polrelid
      where p.polrelid in (to_regclass('public.planned_training_sessions'),
        to_regclass('public.planned_session_slots'),
        to_regclass('public.planned_session_items'),
        to_regclass('public.planned_session_audit_events'),
        to_regclass('public.planned_session_number_state'))),'none'),true);
  foreach v_name in array array[
    'planned_session_04b_lock(uuid,integer)',
    'planned_session_04b_state(uuid)',
    'guard_planned_session_04b_date()',
    'freeze_planned_session_roster_04b(uuid,integer,uuid[],boolean,boolean)',
    'save_planned_session_availability_04b(uuid,integer,jsonb)',
    'reconcile_planned_session_date_04b(uuid,integer,date,uuid[],boolean)'] loop
    if exists (select 1 from pg_proc p
      where p.pronamespace='public'::regnamespace
        and p.proname=split_part(v_name,'(',1)
        and p.oid is distinct from to_regprocedure('public.'||v_name)) then
      raise exception 'Sesiones 04B: sobrecarga conflictiva: %',v_name;
    end if;
    if to_regprocedure('public.'||v_name) is not null and
       obj_description(to_regprocedure('public.'||v_name),'pg_proc') is distinct from
         'APPCAUDAL Sesiones 04B: '||split_part(v_name,'(',1) then
      raise exception 'Sesiones 04B: funcion preexistente incompatible: %',v_name;
    end if;
  end loop;
  if to_regclass('public.planned_session_date_change_authorizations') is not null and
     obj_description(to_regclass('public.planned_session_date_change_authorizations'),'pg_class')
       is distinct from 'APPCAUDAL Sesiones 04B: transient date reconciliation token' then
    raise exception 'Sesiones 04B: nombre de tabla de conciliacion ocupado';
  end if;
  if exists (select 1 from pg_trigger t
    where t.tgrelid=to_regclass('public.planned_training_sessions')
      and t.tgname='planned_sessions_04b_date_guard'
      and t.tgfoid is distinct from to_regprocedure('public.guard_planned_session_04b_date()')) then
    raise exception 'Sesiones 04B: trigger de fecha preexistente incompatible';
  end if;
end $pre$;

-- Token transaccional: solo la RPC de conciliacion puede insertarlo. Nunca
-- persiste al finalizar la RPC. Un GUC personalizado seria falsificable.
create table if not exists public.planned_session_date_change_authorizations (
  session_id uuid primary key,
  old_date date not null,
  new_date date not null,
  expected_revision integer not null,
  actor_membership_id uuid not null,
  created_at timestamptz not null default now(),
  constraint planned_04b_date_session_fkey foreign key (session_id)
    references public.planned_training_sessions(id) on delete restrict,
  constraint planned_04b_date_actor_fkey foreign key (actor_membership_id)
    references public.club_memberships(id) on delete restrict,
  constraint planned_04b_date_revision_check check (expected_revision>0),
  constraint planned_session_date_change_difference_check check (new_date<>old_date)
);
comment on table public.planned_session_date_change_authorizations is
  'APPCAUDAL Sesiones 04B: transient date reconciliation token';
alter table public.planned_session_date_change_authorizations owner to postgres;
alter table public.planned_session_date_change_authorizations enable row level security;
revoke all on table public.planned_session_date_change_authorizations
  from public,anon,authenticated,service_role;

-- Bloqueo unico para todas las RPC: temporada -> sesion -> actor/asignacion.
create or replace function public.planned_session_04b_lock(
  p_session_id uuid,p_expected_revision integer)
returns table(cts_id uuid,club_id uuid,session_date date,
  planning_state text,actor_id uuid)
language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_cts uuid; v_club uuid; v_status text; v_revision integer;
  v_date date; v_state text; v_actor uuid; v_role text;
begin
  if auth.uid() is null or p_session_id is null or p_expected_revision is null then
    raise exception 'Sesion no autorizada' using errcode='42501';
  end if;
  select s.club_team_season_id into v_cts
    from public.planned_training_sessions s where s.id=p_session_id;
  if v_cts is null or public.can_write_club_team_season(v_cts) is not true then
    raise exception 'Sesion no autorizada' using errcode='42501';
  end if;
  select cts.club_id,se.status into v_club,v_status
    from public.club_team_seasons cts
    join public.club_seasons se on se.id=cts.season_id and se.club_id=cts.club_id
    where cts.id=v_cts for update of se;
  if not found or v_status<>'open' or
     public.can_write_club_team_season(v_cts) is not true then
    raise exception 'Temporada cerrada o acceso revocado' using errcode='42501';
  end if;
  select s.revision,s.session_date,s.planning_state
    into v_revision,v_date,v_state
    from public.planned_training_sessions s where s.id=p_session_id for update;
  if not found or v_revision<>p_expected_revision then
    raise exception 'Revision obsoleta' using errcode='40001';
  end if;
  select m.id,m.role into v_actor,v_role from public.club_memberships m
    where m.club_id=v_club and m.user_id=auth.uid() and m.is_active
      and m.role in ('owner','admin','staff')
    order by m.id limit 1 for share of m;
  if v_actor is null then
    raise exception 'Membresia no autorizada' using errcode='42501';
  end if;
  if v_role='staff' then
    perform 1 from public.club_team_season_permissions p
      where p.club_id=v_club and p.membership_id=v_actor
        and p.club_team_season_id=v_cts for share of p;
    if not found then
      raise exception 'Asignacion revocada' using errcode='42501';
    end if;
  end if;
  return query select v_cts,v_club,v_date,v_state,v_actor;
end $fn$;
comment on function public.planned_session_04b_lock(uuid,integer) is
  'APPCAUDAL Sesiones 04B: planned_session_04b_lock';

-- Hash 04B incluye el estado deportivo 03A/03C y la plantilla congelada.
create or replace function public.planned_session_04b_state(p_session_id uuid)
returns jsonb language sql volatile security definer set search_path=pg_catalog as $fn$
  select pg_catalog.jsonb_build_object(
    'session',public.planned_session_state(p_session_id),
    'players',coalesce((select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('player_id',r.player_id,
        'source_membership_id',r.source_membership_id,
        'name',r.player_name_snapshot,'position',r.position_key_snapshot,
        'status',coalesce(a.status,'available'),'observation',a.observation)
      order by r.player_id)
      from public.planned_session_player_roster r
      left join public.planned_session_player_availability a
        on a.session_id=r.session_id and a.player_id=r.player_id
      where r.session_id=p_session_id),'[]'::jsonb));
$fn$;
comment on function public.planned_session_04b_state(uuid) is
  'APPCAUDAL Sesiones 04B: planned_session_04b_state';

-- Protege tambien a los clientes 03A/03C: pueden conservar fecha, pero no
-- cambiar una fecha con roster congelado sin una conciliacion atomica 04B.
create or replace function public.guard_planned_session_04b_date()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
begin
  if new.session_date is distinct from old.session_date and
     exists(select 1 from public.planned_session_player_roster r
       where r.session_id=old.id) and
     not exists(select 1 from public.planned_session_date_change_authorizations a
       join public.club_memberships m on m.id=a.actor_membership_id
       where a.session_id=old.id and a.old_date=old.session_date
         and a.new_date=new.session_date and a.expected_revision=old.revision
         and m.user_id=auth.uid() and m.is_active) then
    raise exception 'Fecha con plantilla congelada: usar conciliacion 04B'
      using errcode='23514';
  end if;
  return new;
end $fn$;
comment on function public.guard_planned_session_04b_date() is
  'APPCAUDAL Sesiones 04B: guard_planned_session_04b_date';
do $trigger$
begin
  if not exists(select 1 from pg_trigger t
    where t.tgrelid='public.planned_training_sessions'::regclass
      and t.tgname='planned_sessions_04b_date_guard') then
    create trigger planned_sessions_04b_date_guard
      before update of session_date on public.planned_training_sessions
      for each row execute function public.guard_planned_session_04b_date();
  end if;
end $trigger$;

create or replace function public.freeze_planned_session_roster_04b(
  p_session_id uuid,p_expected_revision integer,p_source_membership_ids uuid[],
  p_confirm_uncertain_dates boolean default false,
  p_confirm_existing_session boolean default false)
returns integer language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_ctx record; v_source uuid; v_player uuid; v_joined date; v_left date;
  v_departed boolean; v_name text; v_before jsonb; v_after jsonb;
  v_before_03a jsonb; v_after_03a jsonb;
  v_revision integer;
begin
  if p_source_membership_ids is null or cardinality(p_source_membership_ids) not between 1 and 100
     or array_position(p_source_membership_ids,null) is not null
     or p_confirm_uncertain_dates is null or p_confirm_existing_session is null
     or (select count(distinct u.id) from unnest(p_source_membership_ids) as u(id))
          <>cardinality(p_source_membership_ids) then
    raise exception 'Seleccion explicita de pertenencias invalida' using errcode='22023';
  end if;
  select * into v_ctx from public.planned_session_04b_lock(p_session_id,p_expected_revision);
  if v_ctx.planning_state='confirmed' and not p_confirm_existing_session then
    raise exception 'Confirmar expresamente la plantilla de una sesion ya confirmada'
      using errcode='22023';
  end if;
  if exists(select 1 from public.planned_session_player_roster r
      where r.session_id=p_session_id) then
    raise exception 'Plantilla ya congelada' using errcode='23505';
  end if;
  v_before_03a:=public.planned_session_state(p_session_id);
  v_before:=public.planned_session_04b_state(p_session_id);
  foreach v_source in array p_source_membership_ids loop
    select m.player_id,m.joined_on,m.left_on,m.has_departed,p.name
      into v_player,v_joined,v_left,v_departed,v_name
      from public.club_team_season_players m
      join public.players_database p on p.id=m.player_id
      where m.id=v_source and m.club_team_season_id=v_ctx.cts_id
        and m.voided_at is null for share of m;
    if not found or (v_joined is not null and v_ctx.session_date<v_joined)
       or (v_left is not null and v_ctx.session_date>=v_left) then
      raise exception 'Pertenencia fuera de la sesion o no vigente' using errcode='23514';
    end if;
    if (v_joined is null or (v_departed and v_left is null))
       and not p_confirm_uncertain_dates then
      raise exception 'Fecha de pertenencia incierta: requiere confirmacion expresa'
        using errcode='22023';
    end if;
    -- El guard 04A vuelve a acreditar identidad, fecha, nombre y posicion.
    insert into public.planned_session_player_roster
      (session_id,player_id,source_membership_id,player_name_snapshot)
      values (p_session_id,v_player,v_source,v_name);
  end loop;
  update public.planned_training_sessions set revision=revision+1
    where id=p_session_id returning revision into v_revision;
  v_after_03a:=public.planned_session_state(p_session_id);
  v_after:=public.planned_session_04b_state(p_session_id);
  insert into public.planned_session_audit_events
    (session_id,revision,actor_membership_id,event_type,changed_sections,
     before_hash,after_hash,metadata)
    values (p_session_id,v_revision,v_ctx.actor_id,
      case when v_ctx.planning_state='draft' then 'draft_saved' else 'confirmed_saved' end,
      array['players'],md5(v_before_03a::text),md5(v_after_03a::text),
      jsonb_build_object('operation','roster_frozen',
        'players_before_hash',md5((v_before->'players')::text),
        'players_after_hash',md5((v_after->'players')::text),
        'count',cardinality(p_source_membership_ids),
        'uncertain_dates_confirmed',p_confirm_uncertain_dates));
  return v_revision;
end $fn$;
comment on function public.freeze_planned_session_roster_04b(uuid,integer,uuid[],boolean,boolean) is
  'APPCAUDAL Sesiones 04B: freeze_planned_session_roster_04b';

-- PATCH por jugador: objeto completo {player_id,status,observation?}.
-- Fila ausente = available sin observacion. No hay borrados en lote implicitos.
create or replace function public.save_planned_session_availability_04b(
  p_session_id uuid,p_expected_revision integer,p_changes jsonb)
returns integer language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_ctx record; v_change jsonb; v_key text; v_player uuid;
  v_status text; v_observation text; v_seen uuid[]:='{}'::uuid[];
  v_before jsonb; v_after jsonb; v_before_03a jsonb; v_after_03a jsonb;
  v_revision integer;
begin
  if jsonb_typeof(p_changes) is distinct from 'array' then
    raise exception 'Cambios de disponibilidad invalidos' using errcode='22023';
  end if;
  if octet_length(p_changes::text)>131072 or jsonb_array_length(p_changes)>100 then
    raise exception 'Cambios de disponibilidad invalidos' using errcode='22023';
  end if;
  select * into v_ctx from public.planned_session_04b_lock(p_session_id,p_expected_revision);
  if not exists(select 1 from public.planned_session_player_roster r
    where r.session_id=p_session_id) then
    raise exception 'Congelar primero la plantilla de la sesion' using errcode='23514';
  end if;
  v_before_03a:=public.planned_session_state(p_session_id);
  v_before:=public.planned_session_04b_state(p_session_id);
  for v_change in select value from jsonb_array_elements(p_changes) loop
    if jsonb_typeof(v_change) is distinct from 'object'
       or not (v_change ?& array['player_id','status'])
       or jsonb_typeof(v_change->'player_id') is distinct from 'string'
       or jsonb_typeof(v_change->'status') is distinct from 'string'
       or (v_change ? 'observation' and
           jsonb_typeof(v_change->'observation') not in ('string','null')) then
      raise exception 'Cambio de jugador invalido' using errcode='22023';
    end if;
    for v_key in select jsonb_object_keys(v_change) loop
      if v_key<>all(array['player_id','status','observation']) then
        raise exception 'Campo de disponibilidad no admitido' using errcode='22023';
      end if;
    end loop;
    v_player:=(v_change->>'player_id')::uuid;
    v_status:=v_change->>'status';
    v_observation:=nullif(btrim(v_change->>'observation'),'');
    if v_player is null or v_player=any(v_seen)
       or v_status<>all(array['available','absent','injured','adapted'])
       or char_length(v_observation)>1000
       or not exists(select 1 from public.planned_session_player_roster r
         where r.session_id=p_session_id and r.player_id=v_player) then
      raise exception 'Estado, observacion o jugador no valido' using errcode='23514';
    end if;
    v_seen:=array_append(v_seen,v_player);
    if v_status='available' and v_observation is null then
      delete from public.planned_session_player_availability a
        where a.session_id=p_session_id and a.player_id=v_player;
    else
      insert into public.planned_session_player_availability
        (session_id,player_id,status,observation)
        values (p_session_id,v_player,v_status,v_observation)
        on conflict (session_id,player_id) do update
          set status=excluded.status,observation=excluded.observation
          where planned_session_player_availability.status is distinct from excluded.status
             or planned_session_player_availability.observation is distinct from excluded.observation;
    end if;
  end loop;
  v_after:=public.planned_session_04b_state(p_session_id);
  if v_after is not distinct from v_before then return p_expected_revision; end if;
  update public.planned_training_sessions set revision=revision+1
    where id=p_session_id returning revision into v_revision;
  v_after_03a:=public.planned_session_state(p_session_id);
  insert into public.planned_session_audit_events
    (session_id,revision,actor_membership_id,event_type,changed_sections,
     before_hash,after_hash,metadata)
    values (p_session_id,v_revision,v_ctx.actor_id,
      case when v_ctx.planning_state='draft' then 'draft_saved' else 'confirmed_saved' end,
      array['players'],md5(v_before_03a::text),md5(v_after_03a::text),
      jsonb_build_object('operation','availability_saved',
        'players_before_hash',md5((v_before->'players')::text),
        'players_after_hash',md5((v_after->'players')::text)));
  return v_revision;
end $fn$;
comment on function public.save_planned_session_availability_04b(uuid,integer,jsonb) is
  'APPCAUDAL Sesiones 04B: save_planned_session_availability_04b';

-- No reescribe el roster. Exige revisar todos sus UUID de origen para la nueva
-- fecha; si una fecha acreditada lo contradice o el origen fue anulado, aborta.
create or replace function public.reconcile_planned_session_date_04b(
  p_session_id uuid,p_expected_revision integer,p_new_date date,
  p_confirmed_source_membership_ids uuid[],
  p_confirm_uncertain_dates boolean default false)
returns integer language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_ctx record; v_source uuid; v_joined date; v_left date;
  v_departed boolean; v_sources uuid[]; v_before jsonb; v_after jsonb;
  v_before_03a jsonb; v_after_03a jsonb;
  v_revision integer;
begin
  if p_new_date is null or p_confirmed_source_membership_ids is null
     or p_confirm_uncertain_dates is null
     or cardinality(p_confirmed_source_membership_ids) not between 1 and 100
     or array_position(p_confirmed_source_membership_ids,null) is not null
     or (select count(distinct u.id) from unnest(p_confirmed_source_membership_ids) as u(id))
        <>cardinality(p_confirmed_source_membership_ids) then
    raise exception 'Conciliacion incompleta' using errcode='22023';
  end if;
  select * into v_ctx from public.planned_session_04b_lock(p_session_id,p_expected_revision);
  select array_agg(r.source_membership_id order by r.source_membership_id)
    into v_sources from public.planned_session_player_roster r
    where r.session_id=p_session_id;
  if v_sources is null or v_sources is distinct from
       (select array_agg(u.id order by u.id)
          from unnest(p_confirmed_source_membership_ids) as u(id)) then
    raise exception 'Debe revisar exactamente la plantilla congelada'
      using errcode='23514';
  end if;
  if p_new_date=v_ctx.session_date then return p_expected_revision; end if;
  foreach v_source in array v_sources loop
    select m.joined_on,m.left_on,m.has_departed
      into v_joined,v_left,v_departed
      from public.club_team_season_players m
      join public.planned_session_player_roster r
        on r.source_membership_id=m.id and r.player_id=m.player_id
      where r.session_id=p_session_id and m.id=v_source
        and m.club_team_season_id=v_ctx.cts_id and m.voided_at is null
      for share of m;
    if not found or (v_joined is not null and p_new_date<v_joined)
       or (v_left is not null and p_new_date>=v_left) then
      raise exception 'Fecha nueva incompatible con pertenencia acreditada'
        using errcode='23514';
    end if;
    if (v_joined is null or (v_departed and v_left is null))
       and not p_confirm_uncertain_dates then
      raise exception 'Fecha incierta: requiere confirmacion expresa'
        using errcode='22023';
    end if;
  end loop;
  v_before_03a:=public.planned_session_state(p_session_id);
  v_before:=public.planned_session_04b_state(p_session_id);
  insert into public.planned_session_date_change_authorizations
    (session_id,old_date,new_date,expected_revision,actor_membership_id)
    values (p_session_id,v_ctx.session_date,p_new_date,p_expected_revision,v_ctx.actor_id);
  update public.planned_training_sessions
    set session_date=p_new_date,revision=revision+1
    where id=p_session_id returning revision into v_revision;
  delete from public.planned_session_date_change_authorizations
    where session_id=p_session_id;
  v_after_03a:=public.planned_session_state(p_session_id);
  v_after:=public.planned_session_04b_state(p_session_id);
  insert into public.planned_session_audit_events
    (session_id,revision,actor_membership_id,event_type,changed_sections,
     before_hash,after_hash,metadata)
    values (p_session_id,v_revision,v_ctx.actor_id,
      case when v_ctx.planning_state='draft' then 'draft_saved' else 'confirmed_saved' end,
      array['date','players'],md5(v_before_03a::text),md5(v_after_03a::text),
      jsonb_build_object('operation','date_reconciled',
        'players_before_hash',md5((v_before->'players')::text),
        'players_after_hash',md5((v_after->'players')::text),
        'uncertain_dates_confirmed',p_confirm_uncertain_dates));
  return v_revision;
end $fn$;
comment on function public.reconcile_planned_session_date_04b(uuid,integer,date,uuid[],boolean) is
  'APPCAUDAL Sesiones 04B: reconcile_planned_session_date_04b';

alter function public.planned_session_04b_lock(uuid,integer) owner to postgres;
alter function public.planned_session_04b_state(uuid) owner to postgres;
alter function public.guard_planned_session_04b_date() owner to postgres;
alter function public.freeze_planned_session_roster_04b(uuid,integer,uuid[],boolean,boolean) owner to postgres;
alter function public.save_planned_session_availability_04b(uuid,integer,jsonb) owner to postgres;
alter function public.reconcile_planned_session_date_04b(uuid,integer,date,uuid[],boolean) owner to postgres;
revoke all on function public.planned_session_04b_lock(uuid,integer),
  public.planned_session_04b_state(uuid),public.guard_planned_session_04b_date(),
  public.freeze_planned_session_roster_04b(uuid,integer,uuid[],boolean,boolean),
  public.save_planned_session_availability_04b(uuid,integer,jsonb),
  public.reconcile_planned_session_date_04b(uuid,integer,date,uuid[],boolean)
  from public,anon,authenticated,service_role;
grant execute on function
  public.freeze_planned_session_roster_04b(uuid,integer,uuid[],boolean,boolean),
  public.save_planned_session_availability_04b(uuid,integer,jsonb),
  public.reconcile_planned_session_date_04b(uuid,integer,date,uuid[],boolean)
  to authenticated;

do $post$
declare v_signature text;
begin
  if md5(pg_get_functiondef(to_regprocedure(
       'public.save_planned_session(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])')::oid))
       is distinct from current_setting('appcaudal.sessions04b.save03a_before',true)
     or md5(pg_get_functiondef(to_regprocedure(
       'public.save_planned_session_03c(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])')::oid))
       is distinct from current_setting('appcaudal.sessions04b.save03c_before',true)
     or md5(pg_get_functiondef(to_regprocedure('public.planned_session_state(uuid)')::oid))
       is distinct from current_setting('appcaudal.sessions04b.state_before',true)
     or md5(pg_get_functiondef(to_regprocedure('public.confirm_planned_session(uuid,integer)')::oid))
       is distinct from current_setting('appcaudal.sessions04b.confirm03a_before',true)
     or md5(pg_get_functiondef(to_regprocedure('public.confirm_planned_session_03c(uuid,integer)')::oid))
       is distinct from current_setting('appcaudal.sessions04b.confirm03c_before',true)
     or coalesce((select md5(string_agg(
       c.relname||':'||p.polname||':'||p.polcmd::text||':'||
       p.polpermissive::text||':'||p.polroles::text||':'||
       coalesce(pg_get_expr(p.polqual,p.polrelid),'')||':'||
       coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''),
       '|' order by c.relname,p.polname))
       from pg_policy p join pg_class c on c.oid=p.polrelid
       where p.polrelid in (to_regclass('public.planned_training_sessions'),
         to_regclass('public.planned_session_slots'),
         to_regclass('public.planned_session_items'),
         to_regclass('public.planned_session_audit_events'),
         to_regclass('public.planned_session_number_state'))),'none')
       is distinct from current_setting('appcaudal.sessions04b.rls_before',true) then
    raise exception 'Sesiones 04B: RPC 03A/03C, estado o RLS cambiaron';
  end if;
  if exists(select 1 from public.planned_session_date_change_authorizations)
     or not exists(select 1 from pg_trigger t
       join pg_attribute a on a.attrelid=t.tgrelid and a.attname='session_date'
       where t.tgrelid='public.planned_training_sessions'::regclass
         and t.tgname='planned_sessions_04b_date_guard'
         and t.tgenabled='O' and t.tgtype=19
         and t.tgattr::text=a.attnum::text
         and t.tgfoid=to_regprocedure('public.guard_planned_session_04b_date()'))
     or not exists(select 1 from pg_class c
       where c.oid='public.planned_session_date_change_authorizations'::regclass
         and c.relrowsecurity)
     or exists(select 1 from pg_policy p
       where p.polrelid='public.planned_session_date_change_authorizations'::regclass)
     or (select count(*) from pg_constraint c
       where c.conrelid='public.planned_session_date_change_authorizations'::regclass
         and c.convalidated and c.conname in
         ('planned_session_date_change_authorizations_pkey',
          'planned_04b_date_session_fkey',
          'planned_04b_date_actor_fkey',
          'planned_04b_date_revision_check',
          'planned_session_date_change_difference_check'))<>5
     or (select count(*) from pg_attribute a
       where a.attrelid='public.planned_session_date_change_authorizations'::regclass
         and a.attnum>0 and not a.attisdropped)<>6
     or (select count(*) from pg_attribute a
       where a.attrelid='public.planned_session_date_change_authorizations'::regclass
         and a.attnum>0 and not a.attisdropped
         and ((a.attname in ('session_id','actor_membership_id')
                and a.atttypid='uuid'::regtype and a.attnotnull)
           or (a.attname in ('old_date','new_date')
                and a.atttypid='date'::regtype and a.attnotnull)
           or (a.attname='expected_revision'
                and a.atttypid='integer'::regtype and a.attnotnull)
           or (a.attname='created_at'
                and a.atttypid='timestamptz'::regtype and a.attnotnull)))<>6
     or not exists(select 1 from pg_constraint c
       where c.conrelid='public.planned_session_date_change_authorizations'::regclass
         and c.conname='planned_04b_date_revision_check' and c.contype='c'
         and regexp_replace(pg_get_expr(c.conbin,c.conrelid),
           '[[:space:]()]','','g')='expected_revision>0')
     or not exists(select 1 from pg_constraint c
       where c.conrelid='public.planned_session_date_change_authorizations'::regclass
         and c.conname='planned_session_date_change_difference_check' and c.contype='c'
         and regexp_replace(pg_get_expr(c.conbin,c.conrelid),
           '[[:space:]()]','','g')='new_date<>old_date')
     or (select count(*) from pg_constraint c
       where c.conrelid='public.planned_session_date_change_authorizations'::regclass
         and c.contype='f' and c.convalidated and c.confdeltype='r'
         and ((c.conname='planned_04b_date_session_fkey'
           and c.confrelid='public.planned_training_sessions'::regclass
           and c.confkey=array[(select a.attnum from pg_attribute a
             where a.attrelid=c.confrelid and a.attname='id')]::smallint[]
           and c.conkey=array[(select a.attnum from pg_attribute a
             where a.attrelid=c.conrelid and a.attname='session_id')]::smallint[])
          or (c.conname='planned_04b_date_actor_fkey'
           and c.confrelid='public.club_memberships'::regclass
           and c.confkey=array[(select a.attnum from pg_attribute a
             where a.attrelid=c.confrelid and a.attname='id')]::smallint[]
           and c.conkey=array[(select a.attnum from pg_attribute a
             where a.attrelid=c.conrelid and a.attname='actor_membership_id')]::smallint[])))<>2
     or has_table_privilege('authenticated',
       'public.planned_session_date_change_authorizations','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('anon',
       'public.planned_session_date_change_authorizations','SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('service_role',
       'public.planned_session_date_change_authorizations','SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'Sesiones 04B: token, guard o privilegios incompatibles';
  end if;
  foreach v_signature in array array[
    'planned_session_04b_lock(uuid,integer)',
    'planned_session_04b_state(uuid)',
    'guard_planned_session_04b_date()',
    'freeze_planned_session_roster_04b(uuid,integer,uuid[],boolean,boolean)',
    'save_planned_session_availability_04b(uuid,integer,jsonb)',
    'reconcile_planned_session_date_04b(uuid,integer,date,uuid[],boolean)'] loop
    if not exists(select 1 from pg_proc p
      where p.oid=to_regprocedure('public.'||v_signature)
        and p.prosecdef and p.proowner='postgres'::regrole::oid
        and p.proconfig@>array['search_path=pg_catalog'])
       or has_function_privilege('anon','public.'||v_signature,'EXECUTE')
       or exists (select 1 from pg_proc p,
           lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
           where p.oid=to_regprocedure('public.'||v_signature)
             and acl.grantee=0 and acl.privilege_type='EXECUTE') then
      raise exception 'Sesiones 04B: firma o seguridad de funcion incompatible: %',v_signature;
    end if;
  end loop;
  if not has_function_privilege('authenticated',
    'public.freeze_planned_session_roster_04b(uuid,integer,uuid[],boolean,boolean)','EXECUTE')
     or not has_function_privilege('authenticated',
       'public.save_planned_session_availability_04b(uuid,integer,jsonb)','EXECUTE')
     or not has_function_privilege('authenticated',
       'public.reconcile_planned_session_date_04b(uuid,integer,date,uuid[],boolean)','EXECUTE')
     or has_function_privilege('authenticated',
       'public.planned_session_04b_lock(uuid,integer)','EXECUTE')
     or has_function_privilege('authenticated',
       'public.planned_session_04b_state(uuid)','EXECUTE') then
    raise exception 'Sesiones 04B: EXECUTE no coincide con contrato';
  end if;
end $post$;
commit;
