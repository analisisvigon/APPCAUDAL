-- PROPUESTA MANUAL. NO EJECUTADA.
-- Sesiones realizadas: reutiliza disponibilidad; la confirmacion es conjunta por sesion.
-- Requiere 04A/04B, first_team y la estructura 2C instalada.
-- No requiere pruebas funcionales del RPC de ciclo de vida: confirma su estado
-- directamente bajo el bloqueo y las comprobaciones autorizadas de 04B.
begin;
set local search_path = pg_catalog;
set local lock_timeout = '5s';

do $pre$
begin
  if to_regclass('public.planned_training_sessions') is null
     or to_regclass('public.planned_session_player_roster') is null
     or to_regclass('public.planned_session_player_availability') is null
     or to_regclass('public.planned_session_audit_events') is null
     or to_regclass('public.club_team_seasons') is null
     or to_regclass('public.club_seasons') is null
     or to_regclass('public.club_memberships') is null
     or to_regprocedure('public.planned_session_04b_lock(uuid,integer)') is null
     or to_regprocedure('public.save_planned_session_availability_04b(uuid,integer,jsonb)') is null
     or to_regprocedure('public.can_write_club_team_season(uuid)') is null
     or to_regprocedure('public.can_read_club_team_season(uuid)') is null then
    raise exception 'Sesiones realizadas: faltan prerrequisitos 04A/04B';
  end if;
  if not exists (select 1 from pg_attribute where attrelid='public.planned_training_sessions'::regclass
       and attname='cancelled_at' and atttypid='timestamptz'::regtype and not attisdropped)
     or not exists (select 1 from pg_attribute where attrelid='public.planned_training_sessions'::regclass
       and attname='retired_at' and atttypid='timestamptz'::regtype and not attisdropped)
     or to_regprocedure('public.guard_planned_session_lifecycle_2c()') is null
     or not exists (select 1 from pg_constraint where conrelid='public.planned_training_sessions'::regclass
       and conname='planned_sessions_cancellation_check' and contype='c' and convalidated)
     or not exists (select 1 from pg_constraint where conrelid='public.planned_training_sessions'::regclass
       and conname='planned_sessions_retirement_check' and contype='c' and convalidated)
     or not exists (select 1 from pg_trigger where tgrelid='public.planned_training_sessions'::regclass
       and tgname='planned_sessions_lifecycle_2c_guard' and tgenabled='O'
       and tgfoid=to_regprocedure('public.guard_planned_session_lifecycle_2c()')) then
    raise exception 'Sesiones realizadas: faltan las columnas o el guard estructural 2C';
  end if;
  if not exists (select 1 from pg_constraint where conrelid=
       'public.planned_session_player_availability'::regclass
       and conname='planned_session_player_availability_status_check'
       and contype='c' and pg_get_constraintdef(oid) like '%first_team%')
     or position('first_team' in pg_get_functiondef(to_regprocedure(
       'public.save_planned_session_availability_04b(uuid,integer,jsonb)')::oid))=0 then
    raise exception 'Sesiones realizadas: instalar y verificar el estado first_team antes';
  end if;
  if to_regclass('public.planned_session_realizations') is not null
     and obj_description(to_regclass('public.planned_session_realizations'),'pg_class')
       is distinct from 'NEXO Sesiones 07: explicit session realization' then
    raise exception 'Sesiones realizadas: objeto preexistente incompatible';
  end if;
  if to_regclass('public.planned_session_realized_player_statuses') is not null
     and obj_description(to_regclass('public.planned_session_realized_player_statuses'),'pg_class')
       is distinct from 'NEXO Sesiones 07: reviewed final player status snapshot' then
    raise exception 'Sesiones realizadas: objeto preexistente incompatible';
  end if;
  if to_regclass('public.planned_session_realization_audit') is not null
     and obj_description(to_regclass('public.planned_session_realization_audit'),'pg_class')
       is distinct from 'NEXO Sesiones 07: immutable realization and correction audit' then
    raise exception 'Sesiones realizadas: objeto preexistente incompatible';
  end if;
end
$pre$;

create table if not exists public.planned_session_realizations (
  session_id uuid primary key references public.planned_training_sessions(id) on delete restrict,
  realized_at timestamptz not null default now(),
  realized_by_membership_id uuid not null references public.club_memberships(id) on delete restrict,
  roster_count integer not null,
  default_available_count integer not null,
  constraint planned_session_realization_roster_count_check
    check (roster_count>0 and default_available_count between 0 and roster_count)
);
comment on table public.planned_session_realizations is
  'NEXO Sesiones 07: explicit session realization';

create table if not exists public.planned_session_realized_player_statuses (
  session_id uuid not null,
  player_id uuid not null,
  status text not null,
  status_source text not null,
  constraint planned_session_realized_player_statuses_pkey primary key (session_id,player_id),
  constraint planned_session_realized_player_statuses_session_fkey
    foreign key (session_id) references public.planned_session_realizations(session_id) on delete restrict,
  constraint planned_session_realized_player_statuses_roster_fkey
    foreign key (session_id,player_id)
    references public.planned_session_player_roster(session_id,player_id) on delete restrict,
  constraint planned_session_realized_player_statuses_status_check
    check (status in ('available','absent','injured','adapted','first_team')),
  constraint planned_session_realized_player_statuses_source_check
    check (status_source in ('explicit','default'))
);
comment on table public.planned_session_realized_player_statuses is
  'NEXO Sesiones 07: reviewed final player status snapshot';
create index if not exists planned_session_realized_player_statuses_player_idx
  on public.planned_session_realized_player_statuses(player_id,session_id);

create table if not exists public.planned_session_realization_audit (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.planned_session_realizations(session_id) on delete restrict,
  player_id uuid,
  actor_membership_id uuid not null references public.club_memberships(id) on delete restrict,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  before_status text,
  after_status text,
  before_source text,
  after_source text,
  metadata jsonb not null default '{}'::jsonb,
  constraint planned_session_realization_audit_event_check
    check (event_type in ('session_confirmed','player_status_corrected')),
  constraint planned_session_realization_audit_values_check check (
    (event_type='session_confirmed' and player_id is null
      and before_status is null and after_status is null
      and before_source is null and after_source is null)
    or (event_type='player_status_corrected' and player_id is not null
      and before_status is not null and after_status is not null
      and before_status in ('available','absent','injured','adapted','first_team')
      and after_status in ('available','absent','injured','adapted','first_team')
      and before_source is not null and after_source is not null
      and before_source in ('explicit','default') and after_source in ('explicit','default'))
  ),
  constraint planned_session_realization_audit_metadata_check
    check (jsonb_typeof(metadata)='object' and octet_length(metadata::text)<=4096)
);
comment on table public.planned_session_realization_audit is
  'NEXO Sesiones 07: immutable realization and correction audit';
create index if not exists planned_session_realization_audit_session_time_idx
  on public.planned_session_realization_audit(session_id,occurred_at desc);

alter table public.planned_session_realizations enable row level security;
alter table public.planned_session_realized_player_statuses enable row level security;
alter table public.planned_session_realization_audit enable row level security;
revoke all on table public.planned_session_realizations,
  public.planned_session_realized_player_statuses,public.planned_session_realization_audit
  from public,anon,authenticated,service_role;
grant select on table public.planned_session_realizations,
  public.planned_session_realized_player_statuses,public.planned_session_realization_audit
  to authenticated,service_role;

do $pol$
begin
  if not exists(select 1 from pg_policy where polrelid=
      'public.planned_session_realizations'::regclass and polname='planned_session_realizations_read') then
    create policy planned_session_realizations_read on public.planned_session_realizations
      for select to authenticated using (exists(select 1 from public.planned_training_sessions s
        where s.id=session_id and public.can_read_club_team_season(s.club_team_season_id)));
  end if;
  if not exists(select 1 from pg_policy where polrelid=
      'public.planned_session_realized_player_statuses'::regclass
      and polname='planned_session_realized_player_statuses_read') then
    create policy planned_session_realized_player_statuses_read
      on public.planned_session_realized_player_statuses for select to authenticated
      using (exists(select 1 from public.planned_training_sessions s
        where s.id=session_id and public.can_read_club_team_season(s.club_team_season_id)));
  end if;
  if not exists(select 1 from pg_policy where polrelid=
      'public.planned_session_realization_audit'::regclass
      and polname='planned_session_realization_audit_read') then
    create policy planned_session_realization_audit_read
      on public.planned_session_realization_audit for select to authenticated
      using (exists(select 1 from public.planned_training_sessions s
        where s.id=session_id and public.can_read_club_team_season(s.club_team_season_id)));
  end if;
end
$pol$;
alter policy planned_session_realizations_read on public.planned_session_realizations
  to authenticated using (exists(select 1 from public.planned_training_sessions s
    where s.id=session_id and public.can_read_club_team_season(s.club_team_season_id)));
alter policy planned_session_realized_player_statuses_read on public.planned_session_realized_player_statuses
  to authenticated using (exists(select 1 from public.planned_training_sessions s
    where s.id=session_id and public.can_read_club_team_season(s.club_team_season_id)));
alter policy planned_session_realization_audit_read on public.planned_session_realization_audit
  to authenticated using (exists(select 1 from public.planned_training_sessions s
    where s.id=session_id and public.can_read_club_team_season(s.club_team_season_id)));

create or replace function public.planned_session_realization_ready_v1()
returns boolean language sql stable security definer set search_path=pg_catalog as $fn$
  select to_regclass('public.planned_session_realizations') is not null
      and to_regclass('public.planned_session_realized_player_statuses') is not null
      and to_regclass('public.planned_session_realization_audit') is not null
      and to_regprocedure('public.confirm_planned_training_session_realized_v1(uuid,integer,boolean)') is not null
      and to_regprocedure('public.planned_session_04b_lock(uuid,integer)') is not null
      and exists(select 1 from pg_attribute a
        where a.attrelid=to_regclass('public.planned_training_sessions')
          and a.attname='cancelled_at' and a.atttypid='timestamptz'::regtype and not a.attisdropped)
      and exists(select 1 from pg_attribute a
        where a.attrelid=to_regclass('public.planned_training_sessions')
          and a.attname='retired_at' and a.atttypid='timestamptz'::regtype and not a.attisdropped)
      and exists(select 1 from pg_trigger t where t.tgrelid=
        to_regclass('public.planned_training_sessions')
        and t.tgname='planned_sessions_lifecycle_2c_guard' and t.tgenabled='O'
        and t.tgfoid=to_regprocedure('public.guard_planned_session_lifecycle_2c()'))
      and exists(select 1 from pg_constraint c where c.conrelid=
        to_regclass('public.planned_training_sessions')
        and c.conname='planned_sessions_cancellation_check' and c.contype='c' and c.convalidated)
      and exists(select 1 from pg_constraint c where c.conrelid=
        to_regclass('public.planned_training_sessions')
        and c.conname='planned_sessions_retirement_check' and c.contype='c' and c.convalidated)
      and exists(select 1 from pg_trigger t where t.tgrelid=
        to_regclass('public.planned_session_player_availability')
        and t.tgname='planned_session_realized_availability_sync' and t.tgenabled='O')
      and exists(select 1 from pg_trigger t where t.tgrelid=
        to_regclass('public.planned_session_realizations')
        and t.tgname='planned_session_realizations_immutable' and t.tgenabled='O')
      and exists(select 1 from pg_trigger t where t.tgrelid=
        to_regclass('public.planned_session_realization_audit')
        and t.tgname='planned_session_realization_audit_immutable' and t.tgenabled='O');
$fn$;
comment on function public.planned_session_realization_ready_v1() is
  'NEXO Sesiones 07: readiness requires realization objects and lifecycle structure';
alter function public.planned_session_realization_ready_v1() owner to postgres;
revoke all on function public.planned_session_realization_ready_v1()
  from public,anon,authenticated,service_role;
grant execute on function public.planned_session_realization_ready_v1()
  to authenticated,service_role;

create or replace function public.guard_planned_session_realization_immutable_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
begin
  raise exception 'El registro de realización es inmutable; corrige la disponibilidad mediante su RPC autorizada'
    using errcode='42501';
end $fn$;
comment on function public.guard_planned_session_realization_immutable_v1() is
  'NEXO Sesiones 07: protect realization and audit rows';
alter function public.guard_planned_session_realization_immutable_v1() owner to postgres;
revoke all on function public.guard_planned_session_realization_immutable_v1()
  from public,anon,authenticated,service_role;
drop trigger if exists planned_session_realizations_immutable
  on public.planned_session_realizations;
create trigger planned_session_realizations_immutable before update or delete
  on public.planned_session_realizations for each row
  execute function public.guard_planned_session_realization_immutable_v1();
drop trigger if exists planned_session_realization_audit_immutable
  on public.planned_session_realization_audit;
create trigger planned_session_realization_audit_immutable before update or delete
  on public.planned_session_realization_audit for each row
  execute function public.guard_planned_session_realization_immutable_v1();

create or replace function public.sync_planned_session_realized_status_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
declare
  v_session_id uuid;
  v_player_id uuid;
  v_cts uuid;
  v_actor uuid;
  v_before_status text;
  v_after_status text;
  v_before_source text;
  v_after_source text;
begin
  if tg_op='DELETE' then
    v_session_id:=old.session_id; v_player_id:=old.player_id;
    v_before_status:=old.status; v_before_source:='explicit';
    v_after_status:='available'; v_after_source:='default';
  elsif tg_op='INSERT' then
    v_session_id:=new.session_id; v_player_id:=new.player_id;
    v_before_status:='available'; v_before_source:='default';
    v_after_status:=new.status; v_after_source:='explicit';
  else
    v_session_id:=new.session_id; v_player_id:=new.player_id;
    v_before_status:=old.status; v_before_source:='explicit';
    v_after_status:=new.status; v_after_source:='explicit';
  end if;

  if not exists(select 1 from public.planned_session_realizations r
      where r.session_id=v_session_id) then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if v_before_status is not distinct from v_after_status
     and v_before_source is not distinct from v_after_source then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;

  select s.club_team_season_id into v_cts
    from public.planned_training_sessions s where s.id=v_session_id;
  if auth.uid() is null or v_cts is null
     or public.can_write_club_team_season(v_cts) is not true then
    raise exception 'Corrección de disponibilidad realizada no autorizada' using errcode='42501';
  end if;
  select m.id into v_actor
    from public.planned_training_sessions s
    join public.club_team_seasons cts on cts.id=s.club_team_season_id
    join public.club_memberships m on m.club_id=cts.club_id
    where s.id=v_session_id and m.user_id=auth.uid() and m.is_active
      and m.role in ('owner','admin','staff')
    order by m.id limit 1;
  if v_actor is null then
    raise exception 'Membresía no autorizada para registrar la corrección' using errcode='42501';
  end if;
  update public.planned_session_realized_player_statuses
    set status=v_after_status,status_source=v_after_source
    where session_id=v_session_id and player_id=v_player_id;
  if not found then
    raise exception 'El jugador no pertenece a la plantilla realizada' using errcode='23514';
  end if;
  insert into public.planned_session_realization_audit
    (session_id,player_id,actor_membership_id,event_type,before_status,after_status,
     before_source,after_source)
  values (v_session_id,v_player_id,v_actor,'player_status_corrected',
    v_before_status,v_after_status,v_before_source,v_after_source);
  if tg_op='DELETE' then return old; end if;
  return new;
end $fn$;
comment on function public.sync_planned_session_realized_status_v1() is
  'NEXO Sesiones 07: sync availability corrections to realized snapshots';
alter function public.sync_planned_session_realized_status_v1() owner to postgres;
revoke all on function public.sync_planned_session_realized_status_v1()
  from public,anon,authenticated,service_role;
drop trigger if exists planned_session_realized_availability_sync
  on public.planned_session_player_availability;
create trigger planned_session_realized_availability_sync
  after insert or update or delete on public.planned_session_player_availability
  for each row execute function public.sync_planned_session_realized_status_v1();

create or replace function public.confirm_planned_training_session_realized_v1(
  p_session_id uuid,p_expected_revision integer,p_review_acknowledged boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare
  v_ctx record;
  v_session_date date;
  v_planning_state text;
  v_cancelled_at timestamptz;
  v_retired_at timestamptz;
  v_roster_count integer;
  v_default_count integer;
  v_status_hash text;
  v_realized_at timestamptz;
begin
  if p_review_acknowledged is not true then
    raise exception 'Revisa la lista completa y confirma su revisión conjunta'
      using errcode='22023';
  end if;
  if public.planned_session_realization_ready_v1() is not true then
    raise exception 'El backend de realización o la estructura de ciclo de vida no está instalado'
      using errcode='55000';
  end if;
  select * into v_ctx
    from public.planned_session_04b_lock(p_session_id,p_expected_revision);
  select s.session_date,s.planning_state,s.cancelled_at,s.retired_at
    into v_session_date,v_planning_state,v_cancelled_at,v_retired_at
    from public.planned_training_sessions s
    where s.id=p_session_id and s.club_team_season_id=v_ctx.cts_id;
  if not found or v_planning_state<>'confirmed' then
    raise exception 'Solo se puede marcar como realizada una sesión confirmada'
      using errcode='23514';
  end if;
  if v_session_date>current_date then
    raise exception 'No se puede marcar como realizada una sesión futura' using errcode='23514';
  end if;
  if v_cancelled_at is not null or v_retired_at is not null then
    raise exception 'Una sesión anulada o retirada no se puede marcar como realizada'
      using errcode='23514';
  end if;
  if exists(select 1 from public.planned_session_realizations r
      where r.session_id=p_session_id) then
    select r.realized_at into v_realized_at
      from public.planned_session_realizations r where r.session_id=p_session_id;
    return jsonb_build_object('session_id',p_session_id,'already_realized',true,
      'realized_at',v_realized_at);
  end if;

  select count(*)::integer,
    count(*) filter (where a.session_id is null)::integer,
    md5(coalesce(jsonb_agg(jsonb_build_object('player_id',r.player_id,
      'status',coalesce(a.status,'available'),
      'source',case when a.session_id is null then 'default' else 'explicit' end)
      order by r.player_id),'[]'::jsonb)::text)
    into v_roster_count,v_default_count,v_status_hash
    from public.planned_session_player_roster r
    left join public.planned_session_player_availability a
      on a.session_id=r.session_id and a.player_id=r.player_id
    where r.session_id=p_session_id;
  if v_roster_count=0 then
    raise exception 'Congela primero una plantilla con jugadores' using errcode='23514';
  end if;

  insert into public.planned_session_realizations
    (session_id,realized_by_membership_id,roster_count,default_available_count)
  values (p_session_id,v_ctx.actor_id,v_roster_count,v_default_count)
  returning realized_at into v_realized_at;
  insert into public.planned_session_realized_player_statuses
    (session_id,player_id,status,status_source)
  select r.session_id,r.player_id,coalesce(a.status,'available'),
    case when a.session_id is null then 'default' else 'explicit' end
    from public.planned_session_player_roster r
    left join public.planned_session_player_availability a
      on a.session_id=r.session_id and a.player_id=r.player_id
    where r.session_id=p_session_id;
  insert into public.planned_session_realization_audit
    (session_id,actor_membership_id,event_type,metadata)
  values (p_session_id,v_ctx.actor_id,'session_confirmed',
    jsonb_build_object('roster_count',v_roster_count,
      'default_available_count',v_default_count,'initial_status_hash',v_status_hash,
      'review_acknowledged',true));
  return jsonb_build_object('session_id',p_session_id,'already_realized',false,
    'realized_at',v_realized_at,'roster_count',v_roster_count,
    'default_available_count',v_default_count);
end $fn$;
comment on function public.confirm_planned_training_session_realized_v1(uuid,integer,boolean) is
  'NEXO Sesiones 07: confirm a past session and snapshot reviewed availability';
alter function public.confirm_planned_training_session_realized_v1(uuid,integer,boolean)
  owner to postgres;
revoke all on function public.confirm_planned_training_session_realized_v1(uuid,integer,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.confirm_planned_training_session_realized_v1(uuid,integer,boolean)
  to authenticated,service_role;

do $post$
begin
  if not exists(select 1 from pg_trigger where tgrelid=
      'public.planned_session_player_availability'::regclass
      and tgname='planned_session_realized_availability_sync' and tgenabled='O'
      and tgfoid=to_regprocedure('public.sync_planned_session_realized_status_v1()'))
     or not exists(select 1 from pg_trigger where tgrelid=
      'public.planned_session_realizations'::regclass
      and tgname='planned_session_realizations_immutable' and tgenabled='O')
     or not exists(select 1 from pg_trigger where tgrelid=
      'public.planned_session_realization_audit'::regclass
      and tgname='planned_session_realization_audit_immutable' and tgenabled='O')
     or has_table_privilege('authenticated',
      'public.planned_session_realizations','INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated',
      'public.planned_session_realized_player_statuses','INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated',
      'public.planned_session_realization_audit','INSERT,UPDATE,DELETE')
     or has_function_privilege('anon',
      'public.confirm_planned_training_session_realized_v1(uuid,integer,boolean)','EXECUTE')
     or not has_function_privilege('authenticated',
      'public.confirm_planned_training_session_realized_v1(uuid,integer,boolean)','EXECUTE')
     or public.planned_session_realization_ready_v1() is not true then
    raise exception 'Sesiones realizadas: verificación de permisos o triggers fallida';
  end if;
end
$post$;

commit;
