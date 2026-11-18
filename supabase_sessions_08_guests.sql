-- PROPUESTA MANUAL. NO EJECUTAR AUTOMATICAMENTE.
-- Sesiones 08: participantes invitados ligados a una sola sesion y snapshot
-- independiente de la plantilla. Requiere 04A/04B y Sesiones 07 verificadas.
begin;
set local search_path = pg_catalog;
set local lock_timeout = '5s';

do $pre$
begin
  if to_regclass('public.planned_training_sessions') is null
     or to_regclass('public.planned_session_player_roster') is null
     or to_regclass('public.planned_session_realizations') is null
     or to_regclass('public.planned_session_realization_audit') is null
     or to_regprocedure('public.planned_session_04b_lock(uuid,integer)') is null
     or to_regprocedure('public.planned_session_realization_ready_v1()') is null
     or to_regprocedure('public.confirm_planned_training_session_realized_v1(uuid,integer,boolean)') is null
     or to_regprocedure('public.can_read_club_team_season(uuid)') is null
     or to_regprocedure('public.can_write_club_team_season(uuid)') is null then
    raise exception 'Sesiones 08: faltan prerrequisitos 04A/04B/07';
  end if;
  if public.planned_session_realization_ready_v1() is not true then
    raise exception 'Sesiones 08: el backend de realizacion 07 no esta verificado';
  end if;
  if to_regclass('public.planned_session_guests_v1') is not null
     and obj_description(to_regclass('public.planned_session_guests_v1'),'pg_class')
       is distinct from 'NEXO Sesiones 08: session-only guest participants' then
    raise exception 'Sesiones 08: nombre de tabla de invitados ocupado';
  end if;
  if to_regclass('public.planned_session_realized_guest_snapshots_v1') is not null
     and obj_description(to_regclass('public.planned_session_realized_guest_snapshots_v1'),'pg_class')
       is distinct from 'NEXO Sesiones 08: immutable realized guest snapshot' then
    raise exception 'Sesiones 08: nombre de tabla de snapshots invitados ocupado';
  end if;
  if to_regprocedure('public.save_planned_session_guests_v1(uuid,integer,jsonb)') is not null
     and obj_description(to_regprocedure('public.save_planned_session_guests_v1(uuid,integer,jsonb)'),'pg_proc')
       is distinct from 'NEXO Sesiones 08: save session guest participants' then
    raise exception 'Sesiones 08: funcion de guardado de invitados incompatible';
  end if;
  if to_regprocedure('public.planned_session_guests_ready_v1()') is not null
     and obj_description(to_regprocedure('public.planned_session_guests_ready_v1()'),'pg_proc')
       is distinct from 'NEXO Sesiones 08: guest storage and realization integration readiness' then
    raise exception 'Sesiones 08: funcion de disponibilidad de invitados incompatible';
  end if;
  if to_regprocedure('public.guard_planned_session_guest_v1()') is not null
     and obj_description(to_regprocedure('public.guard_planned_session_guest_v1()'),'pg_proc')
       is distinct from 'NEXO Sesiones 08: protect guest identity and realized history' then
    raise exception 'Sesiones 08: guard de invitados incompatible';
  end if;
  if exists(select 1 from pg_trigger where tgrelid=to_regclass('public.planned_session_guests_v1')
      and tgname='planned_session_guests_v1_guard'
      and tgfoid is distinct from to_regprocedure('public.guard_planned_session_guest_v1()'))
     or exists(select 1 from pg_trigger
      where tgrelid=to_regclass('public.planned_session_realized_guest_snapshots_v1')
        and tgname='planned_session_realized_guest_snapshots_v1_immutable'
        and tgfoid is distinct from
          to_regprocedure('public.guard_planned_session_realization_immutable_v1()')) then
    raise exception 'Sesiones 08: trigger preexistente incompatible';
  end if;
end
$pre$;

create table if not exists public.planned_session_guests_v1 (
  id uuid primary key,
  session_id uuid not null references public.planned_training_sessions(id) on delete cascade,
  player_name text not null,
  origin_team text,
  position_group text not null,
  status text not null default 'available',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planned_session_guests_v1_session_id_key unique (session_id,id),
  constraint planned_session_guests_v1_name_check
    check (nullif(btrim(player_name),'') is not null and char_length(player_name)<=300),
  constraint planned_session_guests_v1_origin_check
    check (origin_team is null or char_length(origin_team)<=120),
  constraint planned_session_guests_v1_position_check
    check (position_group in ('goalkeeper','central','lateral','midfielder','winger','forward')),
  constraint planned_session_guests_v1_status_check
    check (status in ('available','absent','injured','adapted','first_team'))
);
comment on table public.planned_session_guests_v1 is
  'NEXO Sesiones 08: session-only guest participants';
create index if not exists planned_session_guests_v1_session_idx
  on public.planned_session_guests_v1(session_id,position_group,player_name);

create table if not exists public.planned_session_realized_guest_snapshots_v1 (
  session_id uuid not null,
  guest_id uuid not null,
  player_name text not null,
  origin_team text,
  position_group text not null,
  status text not null,
  snapshotted_at timestamptz not null default now(),
  constraint planned_session_realized_guest_snapshots_v1_pkey
    primary key (session_id,guest_id),
  constraint planned_session_realized_guest_snapshots_v1_realization_fkey
    foreign key (session_id) references public.planned_session_realizations(session_id) on delete restrict,
  constraint planned_session_realized_guest_snapshots_v1_guest_fkey
    foreign key (session_id,guest_id)
    references public.planned_session_guests_v1(session_id,id) on delete restrict,
  constraint planned_session_realized_guest_snapshots_v1_name_check
    check (nullif(btrim(player_name),'') is not null and char_length(player_name)<=300),
  constraint planned_session_realized_guest_snapshots_v1_origin_check
    check (origin_team is null or char_length(origin_team)<=120),
  constraint planned_session_realized_guest_snapshots_v1_position_check
    check (position_group in ('goalkeeper','central','lateral','midfielder','winger','forward')),
  constraint planned_session_realized_guest_snapshots_v1_status_check
    check (status in ('available','absent','injured','adapted','first_team'))
);
comment on table public.planned_session_realized_guest_snapshots_v1 is
  'NEXO Sesiones 08: immutable realized guest snapshot';
create index if not exists planned_session_realized_guest_snapshots_v1_status_idx
  on public.planned_session_realized_guest_snapshots_v1(session_id,status);

alter table public.planned_session_guests_v1 enable row level security;
alter table public.planned_session_realized_guest_snapshots_v1 enable row level security;
revoke all on table public.planned_session_guests_v1,
  public.planned_session_realized_guest_snapshots_v1
  from public,anon,authenticated,service_role;
grant select on table public.planned_session_guests_v1,
  public.planned_session_realized_guest_snapshots_v1 to authenticated,service_role;

do $pol$
begin
  if not exists(select 1 from pg_policy where polrelid=
      'public.planned_session_guests_v1'::regclass
      and polname='planned_session_guests_v1_read') then
    create policy planned_session_guests_v1_read on public.planned_session_guests_v1
      for select to authenticated using (exists(select 1
        from public.planned_training_sessions s
        where s.id=session_id
          and public.can_read_club_team_season(s.club_team_season_id)));
  end if;
  if not exists(select 1 from pg_policy where polrelid=
      'public.planned_session_realized_guest_snapshots_v1'::regclass
      and polname='planned_session_realized_guest_snapshots_v1_read') then
    create policy planned_session_realized_guest_snapshots_v1_read
      on public.planned_session_realized_guest_snapshots_v1
      for select to authenticated using (exists(select 1
        from public.planned_training_sessions s
        where s.id=session_id
          and public.can_read_club_team_season(s.club_team_season_id)));
  end if;
end
$pol$;
alter policy planned_session_guests_v1_read on public.planned_session_guests_v1
  to authenticated using (exists(select 1 from public.planned_training_sessions s
    where s.id=session_id and public.can_read_club_team_season(s.club_team_season_id)));
alter policy planned_session_realized_guest_snapshots_v1_read
  on public.planned_session_realized_guest_snapshots_v1
  to authenticated using (exists(select 1 from public.planned_training_sessions s
    where s.id=session_id and public.can_read_club_team_season(s.club_team_season_id)));

create or replace function public.guard_planned_session_guest_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
declare
  v_session_id uuid;
begin
  if tg_op='UPDATE' and
     (new.id is distinct from old.id or new.session_id is distinct from old.session_id
       or new.created_at is distinct from old.created_at) then
    raise exception 'La identidad del invitado es inmutable' using errcode='42501';
  end if;
  if tg_op='DELETE' then v_session_id:=old.session_id;
  else v_session_id:=new.session_id; end if;
  if auth.uid() is null then
    raise exception 'Invitado de sesion no autorizado' using errcode='42501';
  end if;
  if exists(select 1 from public.planned_session_realizations r
      where r.session_id=v_session_id) then
    raise exception 'Los invitados de una sesion realizada son inmutables' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  new.player_name:=btrim(new.player_name);
  new.origin_team:=nullif(btrim(new.origin_team),'');
  new.updated_at:=now();
  return new;
end $fn$;
comment on function public.guard_planned_session_guest_v1() is
  'NEXO Sesiones 08: protect guest identity and realized history';
alter function public.guard_planned_session_guest_v1() owner to postgres;
revoke all on function public.guard_planned_session_guest_v1()
  from public,anon,authenticated,service_role;
drop trigger if exists planned_session_guests_v1_guard
  on public.planned_session_guests_v1;
create trigger planned_session_guests_v1_guard
  before insert or update or delete on public.planned_session_guests_v1
  for each row execute function public.guard_planned_session_guest_v1();

drop trigger if exists planned_session_realized_guest_snapshots_v1_immutable
  on public.planned_session_realized_guest_snapshots_v1;
create trigger planned_session_realized_guest_snapshots_v1_immutable
  before update or delete on public.planned_session_realized_guest_snapshots_v1
  for each row execute function public.guard_planned_session_realization_immutable_v1();

create or replace function public.save_planned_session_guests_v1(
  p_session_id uuid,p_expected_revision integer,p_guests jsonb)
returns integer language plpgsql security definer set search_path=pg_catalog as $fn$
declare
  v_ctx record;
  v_item jsonb;
  v_id uuid;
  v_ids uuid[]:=array[]::uuid[];
  v_name text;
  v_origin text;
  v_position text;
  v_status text;
  v_revision integer;
  v_before_guests jsonb;
  v_desired_guests jsonb;
  v_after_guests jsonb;
  v_before_hash text;
  v_after_hash text;
  v_cancelled_at timestamptz;
  v_retired_at timestamptz;
begin
  if p_guests is null or jsonb_typeof(p_guests)<>'array' then
    raise exception 'La lista de invitados debe ser una matriz'
      using errcode='22023';
  end if;
  if jsonb_array_length(p_guests)>100 then
    raise exception 'La lista de invitados supera los 100 registros' using errcode='22023';
  end if;
  select * into v_ctx from public.planned_session_04b_lock(
    p_session_id,p_expected_revision);
  select s.cancelled_at,s.retired_at into v_cancelled_at,v_retired_at
    from public.planned_training_sessions s
    where s.id=p_session_id and s.club_team_season_id=v_ctx.cts_id;
  if not found or v_cancelled_at is not null or v_retired_at is not null then
    raise exception 'La sesion anulada o retirada no admite cambios de invitados'
      using errcode='42501';
  end if;
  if exists(select 1 from public.planned_session_realizations r
      where r.session_id=p_session_id) then
    raise exception 'No se pueden cambiar invitados de una sesion realizada'
      using errcode='42501';
  end if;
  for v_item in select value from jsonb_array_elements(p_guests)
  loop
    if jsonb_typeof(v_item)<>'object' then
      raise exception 'Cada invitado debe ser un objeto' using errcode='22023';
    end if;
    begin
      v_id:=(v_item->>'id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Identificador de invitado no valido' using errcode='22023';
    end;
    v_name:=btrim(coalesce(v_item->>'player_name',''));
    v_origin:=nullif(btrim(v_item->>'origin_team'),'');
    v_position:=v_item->>'position_group';
    v_status:=coalesce(v_item->>'status','available');
    if v_id is null or v_id=any(v_ids) then
      raise exception 'Identificador de invitado ausente o duplicado' using errcode='22023';
    end if;
    if nullif(v_name,'') is null or char_length(v_name)>300
       or char_length(coalesce(v_origin,''))>120
       or v_position is null
       or v_position not in ('goalkeeper','central','lateral','midfielder','winger','forward')
       or v_status not in ('available','absent','injured','adapted','first_team') then
      raise exception 'Datos de invitado no validos' using errcode='22023';
    end if;
    v_ids:=array_append(v_ids,v_id);
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id',(guest.item->>'id')::uuid,
      'player_name',btrim(guest.item->>'player_name'),
      'origin_team',nullif(btrim(guest.item->>'origin_team'),''),
      'position_group',guest.item->>'position_group',
      'status',coalesce(guest.item->>'status','available')
    ) order by (guest.item->>'id')::uuid),'[]'::jsonb)
    into v_desired_guests
    from jsonb_array_elements(p_guests) as guest(item);
  select coalesce(jsonb_agg(jsonb_build_object(
      'id',g.id,'player_name',g.player_name,'origin_team',g.origin_team,
      'position_group',g.position_group,'status',g.status
    ) order by g.id),'[]'::jsonb)
    into v_before_guests
    from public.planned_session_guests_v1 g
    where g.session_id=p_session_id;
  if v_before_guests is not distinct from v_desired_guests then
    return p_expected_revision;
  end if;
  v_before_hash:=md5(jsonb_build_object(
    'session',public.planned_session_04b_state(p_session_id),
    'guests',v_before_guests)::text);

  delete from public.planned_session_guests_v1 g
    where g.session_id=p_session_id and not (g.id=any(v_ids));
  for v_item in select value from jsonb_array_elements(p_guests)
  loop
    v_id:=(v_item->>'id')::uuid;
    v_name:=btrim(v_item->>'player_name');
    v_origin:=nullif(btrim(v_item->>'origin_team'),'');
    v_position:=v_item->>'position_group';
    v_status:=coalesce(v_item->>'status','available');
    insert into public.planned_session_guests_v1
      (id,session_id,player_name,origin_team,position_group,status)
    values (v_id,p_session_id,v_name,v_origin,v_position,v_status)
    on conflict (id) do update set
      player_name=excluded.player_name,
      origin_team=excluded.origin_team,
      position_group=excluded.position_group,
      status=excluded.status,
      updated_at=now()
    where planned_session_guests_v1.session_id=excluded.session_id;
    if not found then
      raise exception 'El identificador del invitado pertenece a otra sesion'
        using errcode='23505';
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id',g.id,'player_name',g.player_name,'origin_team',g.origin_team,
      'position_group',g.position_group,'status',g.status
    ) order by g.id),'[]'::jsonb)
    into v_after_guests
    from public.planned_session_guests_v1 g
    where g.session_id=p_session_id;
  update public.planned_training_sessions set revision=revision+1
    where id=p_session_id returning revision into v_revision;
  v_after_hash:=md5(jsonb_build_object(
    'session',public.planned_session_04b_state(p_session_id),
    'guests',v_after_guests)::text);
  insert into public.planned_session_audit_events
    (session_id,revision,actor_membership_id,event_type,changed_sections,
     before_hash,after_hash,metadata)
    values (p_session_id,v_revision,v_ctx.actor_id,
      case when v_ctx.planning_state='draft' then 'draft_saved' else 'confirmed_saved' end,
      array['guests'],v_before_hash,v_after_hash,
      jsonb_build_object('operation','save_session_guests_08',
        'guest_count',jsonb_array_length(v_after_guests)));
  return v_revision;
end $fn$;
comment on function public.save_planned_session_guests_v1(uuid,integer,jsonb) is
  'NEXO Sesiones 08: save session guest participants';
alter function public.save_planned_session_guests_v1(uuid,integer,jsonb) owner to postgres;
revoke all on function public.save_planned_session_guests_v1(uuid,integer,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.save_planned_session_guests_v1(uuid,integer,jsonb)
  to authenticated;

create or replace function public.planned_session_guests_ready_v1()
returns boolean language sql stable security definer set search_path=pg_catalog as $fn$
  select to_regclass('public.planned_session_guests_v1') is not null
    and to_regclass('public.planned_session_realized_guest_snapshots_v1') is not null
    and to_regprocedure('public.save_planned_session_guests_v1(uuid,integer,jsonb)') is not null
    and to_regprocedure('public.confirm_planned_training_session_realized_v1(uuid,integer,boolean)') is not null
    and exists(select 1 from pg_trigger where tgrelid=
      to_regclass('public.planned_session_guests_v1')
      and tgname='planned_session_guests_v1_guard' and tgenabled='O')
    and exists(select 1 from pg_trigger where tgrelid=
      to_regclass('public.planned_session_realized_guest_snapshots_v1')
      and tgname='planned_session_realized_guest_snapshots_v1_immutable' and tgenabled='O')
    and exists(select 1 from pg_class where oid=
      to_regclass('public.planned_session_guests_v1') and relrowsecurity)
    and exists(select 1 from pg_class where oid=
      to_regclass('public.planned_session_realized_guest_snapshots_v1') and relrowsecurity)
    and not has_table_privilege('authenticated',
      'public.planned_session_guests_v1','INSERT,UPDATE,DELETE')
    and not has_table_privilege('authenticated',
      'public.planned_session_realized_guest_snapshots_v1','INSERT,UPDATE,DELETE')
    and public.planned_session_realization_ready_v1() is true;
$fn$;
comment on function public.planned_session_guests_ready_v1() is
  'NEXO Sesiones 08: guest storage and realization integration readiness';
alter function public.planned_session_guests_ready_v1() owner to postgres;
revoke all on function public.planned_session_guests_ready_v1()
  from public,anon,authenticated,service_role;
grant execute on function public.planned_session_guests_ready_v1()
  to authenticated,service_role;

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
  v_guest_count integer;
  v_status_hash text;
  v_guest_hash text;
  v_realized_at timestamptz;
begin
  if p_review_acknowledged is not true then
    raise exception 'Revisa la lista completa y confirma su revision conjunta'
      using errcode='22023';
  end if;
  if public.planned_session_guests_ready_v1() is not true then
    raise exception 'El backend de invitados o la estructura de realizacion no esta instalado'
      using errcode='55000';
  end if;
  select * into v_ctx from public.planned_session_04b_lock(
    p_session_id,p_expected_revision);
  select s.session_date,s.planning_state,s.cancelled_at,s.retired_at
    into v_session_date,v_planning_state,v_cancelled_at,v_retired_at
    from public.planned_training_sessions s
    where s.id=p_session_id and s.club_team_season_id=v_ctx.cts_id;
  if not found or v_planning_state<>'confirmed' then
    raise exception 'Solo se puede marcar como realizada una sesion confirmada'
      using errcode='23514';
  end if;
  if v_session_date>current_date then
    raise exception 'No se puede marcar como realizada una sesion futura' using errcode='23514';
  end if;
  if v_cancelled_at is not null or v_retired_at is not null then
    raise exception 'Una sesion anulada o retirada no se puede marcar como realizada'
      using errcode='23514';
  end if;
  if exists(select 1 from public.planned_session_realizations r
      where r.session_id=p_session_id) then
    select r.realized_at into v_realized_at
      from public.planned_session_realizations r where r.session_id=p_session_id;
    select count(*)::integer into v_guest_count
      from public.planned_session_realized_guest_snapshots_v1 g
      where g.session_id=p_session_id;
    return jsonb_build_object('session_id',p_session_id,'already_realized',true,
      'realized_at',v_realized_at,'guest_count',v_guest_count);
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

  select count(*)::integer,
    md5(coalesce(jsonb_agg(jsonb_build_object('guest_id',g.id,
      'name',g.player_name,'origin_team',g.origin_team,
      'position_group',g.position_group,'status',g.status)
      order by g.id),'[]'::jsonb)::text)
    into v_guest_count,v_guest_hash
    from public.planned_session_guests_v1 g
    where g.session_id=p_session_id;

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
  insert into public.planned_session_realized_guest_snapshots_v1
    (session_id,guest_id,player_name,origin_team,position_group,status)
  select p_session_id,g.id,g.player_name,g.origin_team,g.position_group,g.status
    from public.planned_session_guests_v1 g
    where g.session_id=p_session_id;
  insert into public.planned_session_realization_audit
    (session_id,actor_membership_id,event_type,metadata)
  values (p_session_id,v_ctx.actor_id,'session_confirmed',
    jsonb_build_object('roster_count',v_roster_count,
      'default_available_count',v_default_count,'initial_status_hash',v_status_hash,
      'guest_count',v_guest_count,'guest_hash',v_guest_hash,
      'review_acknowledged',true));
  return jsonb_build_object('session_id',p_session_id,'already_realized',false,
    'realized_at',v_realized_at,'roster_count',v_roster_count,
    'default_available_count',v_default_count,'guest_count',v_guest_count);
end $fn$;
comment on function public.confirm_planned_training_session_realized_v1(uuid,integer,boolean) is
  'NEXO Sesiones 08: confirm reviewed players and immutable guest snapshots';
alter function public.confirm_planned_training_session_realized_v1(uuid,integer,boolean)
  owner to postgres;
revoke all on function public.confirm_planned_training_session_realized_v1(uuid,integer,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.confirm_planned_training_session_realized_v1(uuid,integer,boolean)
  to authenticated,service_role;

do $post$
begin
  if public.planned_session_guests_ready_v1() is not true
     or has_table_privilege('authenticated',
       'public.planned_session_guests_v1','INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated',
       'public.planned_session_realized_guest_snapshots_v1','INSERT,UPDATE,DELETE')
     or has_function_privilege('anon',
       'public.save_planned_session_guests_v1(uuid,integer,jsonb)','EXECUTE')
     or not has_function_privilege('authenticated',
       'public.save_planned_session_guests_v1(uuid,integer,jsonb)','EXECUTE')
     or has_function_privilege('anon',
       'public.confirm_planned_training_session_realized_v1(uuid,integer,boolean)','EXECUTE')
     or not has_function_privilege('authenticated',
       'public.confirm_planned_training_session_realized_v1(uuid,integer,boolean)','EXECUTE') then
    raise exception 'Sesiones 08: verificacion de permisos o estructura fallida';
  end if;
end
$post$;

commit;
