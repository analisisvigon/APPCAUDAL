-- APPCAUDAL · Sesiones 03A. PREPARADO PARA REVISION; NO EJECUTADO.
-- Solo objetos planned_* nuevos. Aplicar manualmente solo tras preflight aprobado.
begin;

do $pre$
declare
  v_name text;
  v_marker text;
  v_type text;
begin
  if auth.uid() is not null then
    raise exception 'Sesiones 03A exige contexto administrativo sin JWT de aplicación';
  end if;
  if current_user <> 'postgres' then
    raise exception 'Sesiones 03A exige ejecutarse como postgres en Supabase SQL Editor';
  end if;
  foreach v_name in array array[
    'club_seasons','club_team_seasons','club_memberships',
    'club_team_season_permissions','club_teams','equipos_rivales'
  ] loop
    if to_regclass('public.' || v_name) is null then
      raise exception 'Sesiones 03A: falta tabla fuente public.%', v_name;
    end if;
  end loop;
  for v_name,v_marker,v_type in
    select * from (values
      ('club_seasons','id','uuid'),('club_seasons','club_id','uuid'),
      ('club_seasons','label','text'),('club_seasons','starts_on','date'),
      ('club_seasons','ends_on','date'),('club_seasons','status','text'),
      ('club_team_seasons','id','uuid'),('club_team_seasons','club_id','uuid'),
      ('club_team_seasons','team_id','uuid'),('club_team_seasons','season_id','uuid'),
      ('club_memberships','id','uuid'),('club_memberships','club_id','uuid'),
      ('club_memberships','user_id','uuid'),('club_memberships','role','text'),
      ('club_memberships','is_active','bool'),
      ('club_team_season_permissions','club_id','uuid'),
      ('club_team_season_permissions','membership_id','uuid'),
      ('club_team_season_permissions','club_team_season_id','uuid'),
      ('equipos_rivales','id','uuid'),('equipos_rivales','name','text')
    ) as required(table_name,column_name,type_name)
  loop
    if not exists(select 1 from pg_attribute a
      where a.attrelid=to_regclass('public.'||v_name)
        and a.attname=v_marker and not a.attisdropped and a.attnotnull
        and a.atttypid=to_regtype('pg_catalog.'||v_type)) then
      raise exception 'Sesiones 03A: columna fuente incompatible %.%',v_name,v_marker;
    end if;
  end loop;
  if to_regprocedure('public.can_read_club_team_season(uuid)') is null
     or to_regprocedure('public.can_write_club_team_season(uuid)') is null
     or to_regprocedure('public.has_club_role(uuid,text[])') is null then
    raise exception 'Sesiones 03A: faltan helpers de autorización 35/39B';
  end if;
  if not has_function_privilege('authenticated','public.can_read_club_team_season(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.can_write_club_team_season(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.has_club_role(uuid,text[])','EXECUTE')
     or has_function_privilege('anon','public.can_read_club_team_season(uuid)','EXECUTE')
     or has_function_privilege('anon','public.can_write_club_team_season(uuid)','EXECUTE')
     or has_function_privilege('anon','public.has_club_role(uuid,text[])','EXECUTE') then
    raise exception 'Sesiones 03A: EXECUTE de helpers 35/39B incompatible';
  end if;
  if not exists (
    select 1 from pg_attribute a
    where a.attrelid='public.club_seasons'::regclass and a.attname='status'
      and a.atttypid='text'::regtype and a.attnotnull and not a.attisdropped
  ) or not exists (
    select 1 from pg_attribute a
    where a.attrelid='public.club_seasons'::regclass and a.attname='starts_on'
      and a.atttypid='date'::regtype and a.attnotnull and not a.attisdropped
  ) or not exists (
    select 1 from pg_attribute a
    where a.attrelid='public.club_seasons'::regclass and a.attname='ends_on'
      and a.atttypid='date'::regtype and a.attnotnull and not a.attisdropped
  ) then
    raise exception 'Sesiones 03A: contrato de fechas/estado de club_seasons incompatible';
  end if;
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid='public.club_team_seasons'::regclass
      and c.contype='f' and c.convalidated
      and c.confrelid='public.club_seasons'::regclass
  ) then
    raise exception 'Sesiones 03A: no consta FK validada CTS a club_seasons';
  end if;
  if (select count(*) from pg_constraint c
      where c.conrelid='public.club_seasons'::regclass
        and c.conname in ('club_seasons_status_check',
          'club_seasons_lifecycle_consistency_check')
        and c.contype='c' and c.convalidated)<>2 then
    raise exception 'Sesiones 03A: ciclo de vida de temporada incompleto';
  end if;
  if not exists(select 1 from pg_constraint c
      where c.conrelid='public.club_memberships'::regclass
        and c.conname='club_memberships_club_user_key'
        and c.contype='u' and c.convalidated)
     or not exists(select 1 from pg_constraint c
       where c.conrelid='public.club_team_season_permissions'::regclass
         and c.confrelid='public.club_memberships'::regclass
         and c.contype='f' and c.convalidated and c.confdeltype='c'
         and c.conkey=array[
           (select a.attnum from pg_attribute a where a.attrelid=c.conrelid
             and a.attname='membership_id' and not a.attisdropped),
           (select a.attnum from pg_attribute a where a.attrelid=c.conrelid
             and a.attname='club_id' and not a.attisdropped)]
         and c.confkey=array[
           (select a.attnum from pg_attribute a where a.attrelid=c.confrelid
             and a.attname='id' and not a.attisdropped),
           (select a.attnum from pg_attribute a where a.attrelid=c.confrelid
             and a.attname='club_id' and not a.attisdropped)])
     or not exists(select 1 from pg_constraint c
       where c.conrelid='public.club_team_season_permissions'::regclass
         and c.confrelid='public.club_team_seasons'::regclass
         and c.contype='f' and c.convalidated and c.confdeltype='r'
         and c.conkey=array[
           (select a.attnum from pg_attribute a where a.attrelid=c.conrelid
             and a.attname='club_team_season_id' and not a.attisdropped),
           (select a.attnum from pg_attribute a where a.attrelid=c.conrelid
             and a.attname='club_id' and not a.attisdropped)]
         and c.confkey=array[
           (select a.attnum from pg_attribute a where a.attrelid=c.confrelid
             and a.attname='id' and not a.attisdropped),
           (select a.attnum from pg_attribute a where a.attrelid=c.confrelid
             and a.attname='club_id' and not a.attisdropped)]) then
    raise exception 'Sesiones 03A: identidad/asignación staff incompatible';
  end if;
  foreach v_name in array array[
    'planned_training_sessions','planned_session_number_state','planned_session_slots',
    'planned_session_items','planned_session_audit_events'
  ] loop
    if to_regclass('public.' || v_name) is not null then
      select obj_description(to_regclass('public.' || v_name)::oid,'pg_class') into v_marker;
      if v_marker is distinct from 'APPCAUDAL Sesiones 03A: ' || v_name
         or not exists(select 1 from pg_class c
           where c.oid=to_regclass('public.'||v_name)
             and c.relkind='r' and pg_get_userbyid(c.relowner)='postgres') then
        raise exception 'Sesiones 03A: public.% preexiste sin marca compatible', v_name;
      end if;
    end if;
  end loop;
  foreach v_name in array array[
    'planned_session_state','guard_planned_session_row','guard_planned_session_child',
    'guard_planned_session_number','guard_planned_session_audit',
    'create_planned_session_draft','save_planned_session','confirm_planned_session'
  ] loop
    if exists (
      select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=v_name
        and (obj_description(p.oid,'pg_proc') is distinct from
          'APPCAUDAL Sesiones 03A: ' || v_name
          or pg_get_userbyid(p.proowner)<>'postgres'
          or not exists(select 1 from (values
            ('public.planned_session_state(uuid)'),
            ('public.guard_planned_session_row()'),
            ('public.guard_planned_session_child()'),
            ('public.guard_planned_session_number()'),
            ('public.guard_planned_session_audit()'),
            ('public.create_planned_session_draft(uuid,date)'),
            ('public.save_planned_session(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])'),
            ('public.confirm_planned_session(uuid,integer)')
          ) as sig(signature) where p.oid=to_regprocedure(sig.signature)))
    ) then
      raise exception 'Sesiones 03A: función public.% preexiste sin marca compatible', v_name;
    end if;
  end loop;
end
$pre$;

create table if not exists public.planned_training_sessions (
  id uuid primary key default gen_random_uuid(),
  club_team_season_id uuid not null references public.club_team_seasons(id) on delete restrict,
  session_date date not null,
  starts_at time,
  location text,
  period_label text,
  morphology_pattern text,
  next_opponent_label text,
  objectives text,
  notes text,
  material text,
  staff_observations text,
  planning_state text not null default 'draft',
  session_number integer,
  revision integer not null default 1,
  created_by_membership_id uuid not null references public.club_memberships(id) on delete restrict,
  confirmed_at timestamptz,
  team_name_snapshot text,
  season_label_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planned_sessions_state_check check (
    (planning_state='draft' and session_number is null and confirmed_at is null)
    or (planning_state='confirmed' and session_number is not null and confirmed_at is not null
        and nullif(btrim(team_name_snapshot),'') is not null
        and nullif(btrim(season_label_snapshot),'') is not null)
  ),
  constraint planned_sessions_number_check check (session_number is null or session_number > 0),
  constraint planned_sessions_revision_check check (revision > 0),
  constraint planned_sessions_text_check check (
    (location is null or char_length(location)<=300)
    and (period_label is null or char_length(period_label)<=160)
    and (morphology_pattern is null or char_length(morphology_pattern)<=160)
    and (next_opponent_label is null or char_length(next_opponent_label)<=300)
    and (objectives is null or char_length(objectives)<=10000)
    and (notes is null or char_length(notes)<=10000)
    and (material is null or char_length(material)<=5000)
    and (staff_observations is null or char_length(staff_observations)<=10000)
  )
);
comment on table public.planned_training_sessions is
  'APPCAUDAL Sesiones 03A: planned_training_sessions';
create unique index if not exists planned_sessions_number_uidx
  on public.planned_training_sessions(club_team_season_id,session_number)
  where session_number is not null;
create index if not exists planned_sessions_date_idx
  on public.planned_training_sessions(club_team_season_id,session_date,id);

create table if not exists public.planned_session_number_state (
  club_team_season_id uuid primary key references public.club_team_seasons(id) on delete restrict,
  highest_ever_assigned integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint planned_number_state_nonnegative check (highest_ever_assigned>=0)
);
comment on table public.planned_session_number_state is
  'APPCAUDAL Sesiones 03A: planned_session_number_state';

create table if not exists public.planned_session_slots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.planned_training_sessions(id) on delete restrict,
  phase text not null,
  sort_order integer not null,
  duration_minutes integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planned_slots_phase_check check (phase in ('activation','main','cooldown')),
  constraint planned_slots_order_check check (sort_order>=0),
  constraint planned_slots_duration_check check (duration_minutes>0),
  constraint planned_slots_session_order_key unique (session_id,phase,sort_order)
    deferrable initially deferred,
  constraint planned_slots_id_session_key unique (id,session_id)
);
comment on table public.planned_session_slots is
  'APPCAUDAL Sesiones 03A: planned_session_slots';

create table if not exists public.planned_session_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.planned_training_sessions(id) on delete restrict,
  slot_id uuid not null,
  sort_order integer not null,
  kind text not null,
  source_task_uuid_snapshot uuid,
  task_snapshot jsonb,
  free_title text,
  free_description text,
  free_comments text,
  free_url text,
  activity_minutes integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planned_items_slot_fkey foreign key (slot_id,session_id)
    references public.planned_session_slots(id,session_id) on delete restrict,
  constraint planned_items_order_check check (sort_order>=0),
  constraint planned_items_duration_check check (activity_minutes is null or activity_minutes>0),
  constraint planned_items_kind_check check (
    (kind='free' and nullif(btrim(free_title),'') is not null
      and source_task_uuid_snapshot is null and task_snapshot is null)
    or (kind='library_task' and source_task_uuid_snapshot is not null
      and jsonb_typeof(task_snapshot) is not distinct from 'object'
      and free_title is null)
  ),
  constraint planned_items_text_check check (
    (free_title is null or char_length(free_title)<=160)
    and (free_description is null or char_length(free_description)<=10000)
    and (free_comments is null or char_length(free_comments)<=5000)
    and (free_url is null or (char_length(free_url)<=2048 and free_url ~ '^https://[^[:space:]<>]+$'))
    and (task_snapshot is null or octet_length(task_snapshot::text)<=262144)
  ),
  constraint planned_items_slot_order_key unique (slot_id,sort_order)
    deferrable initially deferred,
  constraint planned_items_id_session_key unique (id,session_id)
);
comment on table public.planned_session_items is
  'APPCAUDAL Sesiones 03A: planned_session_items';
create index if not exists planned_items_session_slot_idx
  on public.planned_session_items(session_id,slot_id);

create table if not exists public.planned_session_audit_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.planned_training_sessions(id) on delete restrict,
  revision integer not null,
  actor_membership_id uuid not null references public.club_memberships(id) on delete restrict,
  event_type text not null,
  changed_sections text[] not null,
  occurred_at timestamptz not null default now(),
  before_hash text,
  after_hash text,
  metadata jsonb not null default '{}'::jsonb,
  constraint planned_audit_revision_check check (revision>0),
  constraint planned_audit_event_check check (event_type in
    ('created','draft_saved','confirmed','confirmed_saved','renumbered')),
  constraint planned_audit_sections_check check (cardinality(changed_sections)>0),
  constraint planned_audit_metadata_check check (
    jsonb_typeof(metadata)='object' and octet_length(metadata::text)<=4096),
  constraint planned_audit_hash_check check (
    (before_hash is null or before_hash ~ '^[0-9a-f]{32}$')
    and (after_hash is null or after_hash ~ '^[0-9a-f]{32}$')
  ),
  constraint planned_audit_session_revision_key unique (session_id,revision)
);
comment on table public.planned_session_audit_events is
  'APPCAUDAL Sesiones 03A: planned_session_audit_events';
create index if not exists planned_audit_session_date_idx
  on public.planned_session_audit_events(session_id,occurred_at);

-- Huella del estado actual (sin columnas temporales ni datos ajenos al planificador).
create or replace function public.planned_session_state(p_session_id uuid)
returns jsonb language sql volatile security definer set search_path=pg_catalog as $fn$
  select pg_catalog.jsonb_build_object(
    'session_date',s.session_date,'starts_at',s.starts_at,
    'location',s.location,'period_label',s.period_label,
    'morphology_pattern',s.morphology_pattern,'next_opponent_label',s.next_opponent_label,
    'objectives',s.objectives,'notes',s.notes,'material',s.material,
    'staff_observations',s.staff_observations,'planning_state',s.planning_state,
    'session_number',s.session_number,
    'slots',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',sl.id,'phase',sl.phase,'sort_order',sl.sort_order,
      'duration_minutes',sl.duration_minutes,
      'items',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',i.id,'sort_order',i.sort_order,'kind',i.kind,
        'source_task_uuid_snapshot',i.source_task_uuid_snapshot,
        'task_snapshot',i.task_snapshot,
        'free_title',i.free_title,'free_description',i.free_description,
        'free_comments',i.free_comments,'free_url',i.free_url,
        'activity_minutes',i.activity_minutes) order by i.sort_order,i.id)
        from public.planned_session_items i where i.slot_id=sl.id),'[]'::jsonb)
      ) order by sl.phase,sl.sort_order,sl.id)
      from public.planned_session_slots sl where sl.session_id=s.id),'[]'::jsonb))
  from public.planned_training_sessions s where s.id=p_session_id;
$fn$;
comment on function public.planned_session_state(uuid) is
  'APPCAUDAL Sesiones 03A: planned_session_state';

-- Defensa adicional: toda mutación, incluso si un grant administrativo cambia, debe
-- llevar JWT real autorizado y serializar con UPDATE de la temporada canónica.
create or replace function public.guard_planned_session_row()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_club uuid; v_start date; v_end date; v_status text; v_actor uuid;
begin
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
comment on function public.guard_planned_session_row() is
  'APPCAUDAL Sesiones 03A: guard_planned_session_row';

create or replace function public.guard_planned_session_child()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_cts uuid; v_session_id uuid; v_season_status text; v_slot_minutes integer;
begin
  if tg_op='UPDATE' then
    if new.id<>old.id or new.session_id<>old.session_id or
       new.created_at<>old.created_at then
      raise exception 'Identidad hija inmutable' using errcode='42501';
    end if;
  end if;
  if tg_op='DELETE' then v_session_id:=old.session_id;
  else v_session_id:=new.session_id; end if;
  select s.club_team_season_id into v_cts
  from public.planned_training_sessions s
  where s.id=v_session_id;
  if auth.uid() is null or v_cts is null or
     public.can_write_club_team_season(v_cts) is not true then
    raise exception 'Edición de franja/actividad no autorizada' using errcode='42501';
  end if;
  select se.status into v_season_status
  from public.club_team_seasons cts
  join public.club_seasons se on se.id=cts.season_id and se.club_id=cts.club_id
  where cts.id=v_cts for update of se;
  if v_season_status is distinct from 'open' or
     public.can_write_club_team_season(v_cts) is not true then
    raise exception 'Temporada cerrada o acceso revocado' using errcode='42501';
  end if;
  if tg_table_name='planned_session_items' and tg_op<>'DELETE' then
    if new.kind<>'free' then
      raise exception 'Biblioteca no habilitada en 03A' using errcode='42501';
    end if;
    select sl.duration_minutes into v_slot_minutes
    from public.planned_session_slots sl
    where sl.id=new.slot_id and sl.session_id=new.session_id;
    if v_slot_minutes is null or
       (new.activity_minutes is not null and new.activity_minutes>v_slot_minutes) then
      raise exception 'Actividad incompatible con franja' using errcode='23514';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  if tg_op='UPDATE' then new.updated_at:=now(); end if;
  return new;
end $fn$;
comment on function public.guard_planned_session_child() is
  'APPCAUDAL Sesiones 03A: guard_planned_session_child';

create or replace function public.guard_planned_session_number()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_status text;
begin
  if tg_op='DELETE' then raise exception 'Contador histórico inmutable' using errcode='42501'; end if;
  if auth.uid() is null or
     public.can_write_club_team_season(new.club_team_season_id) is not true then
    raise exception 'Contador no autorizado' using errcode='42501';
  end if;
  select se.status into v_status from public.club_team_seasons cts
  join public.club_seasons se on se.id=cts.season_id and se.club_id=cts.club_id
  where cts.id=new.club_team_season_id for update of se;
  if v_status is distinct from 'open' or
     public.can_write_club_team_season(new.club_team_season_id) is not true then
    raise exception 'Temporada cerrada' using errcode='42501';
  end if;
  if tg_op='UPDATE' then
    if new.club_team_season_id<>old.club_team_season_id or
       new.highest_ever_assigned<old.highest_ever_assigned then
      raise exception 'Contador no puede retroceder' using errcode='42501';
    end if;
  end if;
  new.updated_at:=now(); return new;
end $fn$;
comment on function public.guard_planned_session_number() is
  'APPCAUDAL Sesiones 03A: guard_planned_session_number';

create or replace function public.guard_planned_session_audit()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_cts uuid; v_club uuid; v_revision integer; v_status text;
begin
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
comment on function public.guard_planned_session_audit() is
  'APPCAUDAL Sesiones 03A: guard_planned_session_audit';

drop trigger if exists planned_sessions_guard on public.planned_training_sessions;
create trigger planned_sessions_guard before insert or update or delete
  on public.planned_training_sessions for each row
  execute function public.guard_planned_session_row();
drop trigger if exists planned_slots_guard on public.planned_session_slots;
create trigger planned_slots_guard before insert or update or delete
  on public.planned_session_slots for each row
  execute function public.guard_planned_session_child();
drop trigger if exists planned_items_guard on public.planned_session_items;
create trigger planned_items_guard before insert or update or delete
  on public.planned_session_items for each row
  execute function public.guard_planned_session_child();
drop trigger if exists planned_number_guard on public.planned_session_number_state;
create trigger planned_number_guard before insert or update or delete
  on public.planned_session_number_state for each row
  execute function public.guard_planned_session_number();
drop trigger if exists planned_audit_guard on public.planned_session_audit_events;
create trigger planned_audit_guard before insert or update or delete
  on public.planned_session_audit_events for each row
  execute function public.guard_planned_session_audit();

create or replace function public.create_planned_session_draft(
  p_club_team_season_id uuid,p_session_date date)
returns uuid language plpgsql security definer set search_path=pg_catalog as $fn$
declare v_id uuid; v_actor uuid; v_club uuid; v_start date; v_end date; v_status text;
begin
  if auth.uid() is null or p_club_team_season_id is null or p_session_date is null or
     public.can_write_club_team_season(p_club_team_season_id) is not true then
    raise exception 'Creación no autorizada' using errcode='42501';
  end if;
  select cts.club_id,se.starts_on,se.ends_on,se.status
    into v_club,v_start,v_end,v_status from public.club_team_seasons cts
  join public.club_seasons se on se.id=cts.season_id and se.club_id=cts.club_id
  where cts.id=p_club_team_season_id for update of se;
  if not found or v_status<>'open' or
     public.can_write_club_team_season(p_club_team_season_id) is not true then
    raise exception 'Temporada cerrada o acceso revocado' using errcode='42501';
  end if;
  if p_session_date<v_start or p_session_date>v_end then
    raise exception 'Fecha fuera de temporada' using errcode='23514';
  end if;
  select m.id into v_actor from public.club_memberships m
  where m.club_id=v_club and m.user_id=auth.uid() and m.is_active
    and m.role in ('owner','admin','staff') order by m.id limit 1 for share of m;
  if v_actor is null then raise exception 'Membresía no autorizada' using errcode='42501'; end if;
  if exists(select 1 from public.club_memberships m
      where m.id=v_actor and m.role='staff') then
    perform 1 from public.club_team_season_permissions p
      where p.club_id=v_club and p.membership_id=v_actor
        and p.club_team_season_id=p_club_team_season_id for share of p;
    if not found then raise exception 'Asignación revocada' using errcode='42501'; end if;
  end if;
  insert into public.planned_training_sessions
    (club_team_season_id,session_date,created_by_membership_id)
  values (p_club_team_season_id,p_session_date,v_actor) returning id into v_id;
  insert into public.planned_session_audit_events
    (session_id,revision,actor_membership_id,event_type,changed_sections,after_hash)
  values (v_id,1,v_actor,'created',array['session'],
    md5(public.planned_session_state(v_id)::text));
  return v_id;
end $fn$;
comment on function public.create_planned_session_draft(uuid,date) is
  'APPCAUDAL Sesiones 03A: create_planned_session_draft';

-- p_header: PATCH parcial. Clave omitida=conservar; JSON null=borrar; valor=reemplazar.
-- p_slots: array COMPLETO de {id,phase,sort_order,duration_minutes,items:[{id,
-- sort_order,kind,free_title,free_description,free_comments,free_url,activity_minutes}]}.
-- Los UUID de slots/items se generan en cliente y permanecen estables entre guardados.
-- Una omisión en p_slots solo retira una fila si su UUID está también en la lista
-- explícita p_removed_slot_ids/p_removed_item_ids. Las listas deben ser exactas.
-- NULL en p_requested_number conserva el número actual; en borrador no numera.
create or replace function public.save_planned_session(
  p_session_id uuid,p_expected_revision integer,p_session_date date,
  p_header jsonb,p_slots jsonb,p_requested_number integer default null,
  p_removed_slot_ids uuid[] default '{}'::uuid[],
  p_removed_item_ids uuid[] default '{}'::uuid[])
returns integer language plpgsql security definer set search_path=pg_catalog as $fn$
declare
  v_s public.planned_training_sessions%rowtype;
  v_cts uuid; v_club uuid; v_start date; v_end date; v_status text; v_actor uuid;
  v_header jsonb; v_slot jsonb; v_item jsonb; v_key text;
  v_slot_id uuid; v_item_id uuid; v_seen_slots uuid[]:='{}'; v_seen_items uuid[]:='{}';
  v_number integer; v_high integer; v_before jsonb; v_after jsonb; v_desired jsonb;
  v_sections text[]:='{}'; v_revision integer;
begin
  if auth.uid() is null or p_session_id is null or p_expected_revision is null or
     p_session_date is null or jsonb_typeof(p_header) is distinct from 'object' or
     jsonb_typeof(p_slots) is distinct from 'array' or octet_length(p_slots::text)>1048576 or
     octet_length(p_header::text)>40000 or
     p_removed_slot_ids is null or p_removed_item_ids is null or
     array_position(p_removed_slot_ids,null) is not null or
     array_position(p_removed_item_ids,null) is not null then
    raise exception 'Guardado inválido' using errcode='22023';
  end if;
  -- Resolver sin lock y adquirir siempre season -> session -> counter.
  select s.club_team_season_id into v_cts
  from public.planned_training_sessions s where s.id=p_session_id;
  if v_cts is null or public.can_write_club_team_season(v_cts) is not true then
    raise exception 'Sesión no autorizada' using errcode='42501';
  end if;
  select cts.club_id,se.starts_on,se.ends_on,se.status
    into v_club,v_start,v_end,v_status from public.club_team_seasons cts
  join public.club_seasons se on se.id=cts.season_id and se.club_id=cts.club_id
  where cts.id=v_cts for update of se;
  if not found or v_status<>'open' or
     public.can_write_club_team_season(v_cts) is not true then
    raise exception 'Temporada cerrada o acceso revocado' using errcode='42501';
  end if;
  select * into v_s from public.planned_training_sessions s
  where s.id=p_session_id for update;
  if not found or v_s.revision<>p_expected_revision then
    raise exception 'Revisión obsoleta' using errcode='40001';
  end if;
  if exists(select 1 from public.planned_session_items it
      where it.session_id=p_session_id and it.kind<>'free') then
    raise exception 'Este contrato 03A no edita snapshots de Biblioteca'
      using errcode='42501';
  end if;
  if p_session_date<v_start or p_session_date>v_end then
    raise exception 'Fecha fuera de temporada' using errcode='23514';
  end if;
  select m.id into v_actor from public.club_memberships m
  where m.club_id=v_club and m.user_id=auth.uid() and m.is_active
    and m.role in ('owner','admin','staff') order by m.id limit 1 for share of m;
  if v_actor is null then raise exception 'Membresía no autorizada' using errcode='42501'; end if;
  if exists(select 1 from public.club_memberships m
      where m.id=v_actor and m.role='staff') then
    perform 1 from public.club_team_season_permissions p
      where p.club_id=v_club and p.membership_id=v_actor
        and p.club_team_season_id=v_s.club_team_season_id for share of p;
    if not found then raise exception 'Asignación revocada' using errcode='42501'; end if;
  end if;
  for v_key in select jsonb_object_keys(p_header) loop
    if v_key<>all(array['starts_at','location','period_label','morphology_pattern',
      'next_opponent_label','objectives','notes','material','staff_observations']) then
      raise exception 'Campo de cabecera no admitido' using errcode='22023';
    end if;
    if jsonb_typeof(p_header->v_key) not in ('string','null') then
      raise exception 'Valor de cabecera no admitido' using errcode='22023';
    end if;
  end loop;
  v_header:=jsonb_build_object(
    'starts_at',v_s.starts_at,'location',v_s.location,
    'period_label',v_s.period_label,'morphology_pattern',v_s.morphology_pattern,
    'next_opponent_label',v_s.next_opponent_label,
    'objectives',v_s.objectives,'notes',v_s.notes,
    'material',v_s.material,'staff_observations',v_s.staff_observations)
    || p_header;
  if p_requested_number is not null then
    if v_s.planning_state<>'confirmed' or p_requested_number<=0 then
      raise exception 'Numeración manual no permitida' using errcode='22023';
    end if;
  end if;
  v_number:=coalesce(p_requested_number,v_s.session_number);
  for v_slot in select value from jsonb_array_elements(p_slots) loop
    if jsonb_typeof(v_slot) is distinct from 'object' or
       jsonb_typeof(v_slot->'items') is distinct from 'array' or
       (v_slot ?& array['id','phase','sort_order','duration_minutes','items']) is not true then
      raise exception 'Franja inválida' using errcode='22023';
    end if;
    for v_key in select jsonb_object_keys(v_slot) loop
      if v_key<>all(array['id','phase','sort_order','duration_minutes','items']) then
        raise exception 'Campo de franja no admitido' using errcode='22023';
      end if;
    end loop;
    v_slot_id:=(v_slot->>'id')::uuid;
    if v_slot_id is null or v_slot_id=any(v_seen_slots) then
      raise exception 'UUID de franja ausente o duplicado' using errcode='22023';
    end if;
    v_seen_slots:=array_append(v_seen_slots,v_slot_id);
    if v_s.planning_state='confirmed' and jsonb_array_length(v_slot->'items')=0 then
      raise exception 'Franja confirmada sin actividad' using errcode='23514';
    end if;
    for v_item in select value from jsonb_array_elements(v_slot->'items') loop
      if jsonb_typeof(v_item) is distinct from 'object' or
         v_item->>'kind' is distinct from 'free' or
         (v_item ?& array['id','sort_order','kind','free_title',
           'free_description','free_comments','free_url','activity_minutes']) is not true then
        raise exception 'Solo actividades libres en 03A' using errcode='22023';
      end if;
      for v_key in select jsonb_object_keys(v_item) loop
        if v_key<>all(array['id','sort_order','kind','free_title',
          'free_description','free_comments','free_url','activity_minutes']) then
          raise exception 'Campo de actividad no admitido' using errcode='22023';
        end if;
      end loop;
      v_item_id:=(v_item->>'id')::uuid;
      if v_item_id is null or v_item_id=any(v_seen_items) then
        raise exception 'UUID de actividad ausente o duplicado' using errcode='22023';
      end if;
      v_seen_items:=array_append(v_seen_items,v_item_id);
      if (v_item->>'activity_minutes')::integer>
         (v_slot->>'duration_minutes')::integer then
        raise exception 'Actividad supera franja' using errcode='23514';
      end if;
    end loop;
  end loop;
  if cardinality(p_removed_slot_ids)<>
       (select count(distinct removed.id) from unnest(p_removed_slot_ids) removed(id))
     or cardinality(p_removed_item_ids)<>
       (select count(distinct removed.id) from unnest(p_removed_item_ids) removed(id)) then
    raise exception 'UUID de retirada duplicado' using errcode='22023';
  end if;
  if exists(select 1 from public.planned_session_slots sl
       where sl.id=any(v_seen_slots) and sl.session_id<>p_session_id)
     or exists(select 1 from public.planned_session_items it
       where it.id=any(v_seen_items) and it.session_id<>p_session_id) then
    raise exception 'Elemento pertenece a otra sesión' using errcode='42501';
  end if;
  -- Documento completo + lista de retiradas exacta: una omisión accidental
  -- no puede borrar una actividad o franja existente.
  if exists(select 1 from public.planned_session_slots sl
       where sl.session_id=p_session_id and sl.id<>all(v_seen_slots)
         and sl.id<>all(p_removed_slot_ids))
     or exists(select 1 from unnest(p_removed_slot_ids) removed(id)
       where removed.id=any(v_seen_slots) or not exists(
         select 1 from public.planned_session_slots sl
         where sl.id=removed.id and sl.session_id=p_session_id))
     or exists(select 1 from public.planned_session_items it
       where it.session_id=p_session_id and it.id<>all(v_seen_items)
         and it.id<>all(p_removed_item_ids))
     or exists(select 1 from unnest(p_removed_item_ids) removed(id)
       where removed.id=any(v_seen_items) or not exists(
         select 1 from public.planned_session_items it
         where it.id=removed.id and it.session_id=p_session_id)) then
    raise exception 'Las retiradas explícitas no coinciden con el documento completo'
      using errcode='22023';
  end if;
  -- Canonizar el payload para distinguir un guardado idéntico de un cambio real.
  select jsonb_build_object(
    'session_date',p_session_date,
    'starts_at',(v_header->>'starts_at')::time,
    'location',v_header->'location','period_label',v_header->'period_label',
    'morphology_pattern',v_header->'morphology_pattern',
    'next_opponent_label',v_header->'next_opponent_label',
    'objectives',v_header->'objectives','notes',v_header->'notes',
    'material',v_header->'material','staff_observations',v_header->'staff_observations',
    'planning_state',v_s.planning_state,'session_number',v_number,
    'slots',coalesce((select jsonb_agg(jsonb_build_object(
      'id',(sl.x->>'id')::uuid,'phase',sl.x->>'phase',
      'sort_order',(sl.x->>'sort_order')::integer,
      'duration_minutes',(sl.x->>'duration_minutes')::integer,
      'items',coalesce((select jsonb_agg(jsonb_build_object(
        'id',(it.y->>'id')::uuid,'sort_order',(it.y->>'sort_order')::integer,
        'kind',it.y->>'kind','source_task_uuid_snapshot',null,
        'task_snapshot',null,'free_title',it.y->>'free_title',
        'free_description',it.y->>'free_description',
        'free_comments',it.y->>'free_comments','free_url',it.y->>'free_url',
        'activity_minutes',(it.y->>'activity_minutes')::integer)
        order by (it.y->>'sort_order')::integer,(it.y->>'id')::uuid)
        from jsonb_array_elements(sl.x->'items') it(y)),'[]'::jsonb))
      order by sl.x->>'phase',(sl.x->>'sort_order')::integer,(sl.x->>'id')::uuid)
      from jsonb_array_elements(p_slots) sl(x)),'[]'::jsonb)) into v_desired;
  v_before:=public.planned_session_state(p_session_id);
  if v_before=v_desired then return v_s.revision; end if;
  if v_number is distinct from v_s.session_number then
    insert into public.planned_session_number_state(club_team_season_id)
      values (v_s.club_team_season_id) on conflict do nothing;
    select highest_ever_assigned into v_high from public.planned_session_number_state
      where club_team_season_id=v_s.club_team_season_id for update;
    if exists(select 1 from public.planned_training_sessions other
      where other.club_team_season_id=v_s.club_team_season_id
        and other.session_number=v_number and other.id<>p_session_id) then
      raise exception 'Número ya ocupado' using errcode='23505';
    end if;
    update public.planned_session_number_state
      set highest_ever_assigned=greatest(highest_ever_assigned,v_number)
      where club_team_season_id=v_s.club_team_season_id;
  end if;
  update public.planned_training_sessions set
    session_date=p_session_date,starts_at=(v_header->>'starts_at')::time,
    location=v_header->>'location',period_label=v_header->>'period_label',
    morphology_pattern=v_header->>'morphology_pattern',
    next_opponent_label=v_header->>'next_opponent_label',
    objectives=v_header->>'objectives',notes=v_header->>'notes',
    material=v_header->>'material',staff_observations=v_header->>'staff_observations',
    session_number=v_number,revision=revision+1
  where id=p_session_id returning revision into v_revision;
  if v_before->'slots' is distinct from v_desired->'slots' then
    -- 1. Franjas existentes: UPDATE solo si cambia; nuevas: INSERT.
    -- Unicidades de orden diferidas permiten intercambiar posiciones.
    for v_slot in select value from jsonb_array_elements(p_slots) loop
      v_slot_id:=(v_slot->>'id')::uuid;
      if exists(select 1 from public.planned_session_slots sl
          where sl.id=v_slot_id and sl.session_id=p_session_id) then
        update public.planned_session_slots sl set
          phase=v_slot->>'phase',sort_order=(v_slot->>'sort_order')::integer,
          duration_minutes=(v_slot->>'duration_minutes')::integer
        where sl.id=v_slot_id and sl.session_id=p_session_id
          and row(sl.phase,sl.sort_order,sl.duration_minutes) is distinct from
              row(v_slot->>'phase',(v_slot->>'sort_order')::integer,
                  (v_slot->>'duration_minutes')::integer);
      else
        insert into public.planned_session_slots
          (id,session_id,phase,sort_order,duration_minutes)
        values (v_slot_id,p_session_id,v_slot->>'phase',
          (v_slot->>'sort_order')::integer,(v_slot->>'duration_minutes')::integer);
      end if;
    end loop;
    -- 2. Actividades existentes conservan UUID/created_at y pueden moverse
    -- entre franjas de esta sesión; no se tocan las que no cambian.
    for v_slot in select value from jsonb_array_elements(p_slots) loop
      v_slot_id:=(v_slot->>'id')::uuid;
      for v_item in select value from jsonb_array_elements(v_slot->'items') loop
        v_item_id:=(v_item->>'id')::uuid;
        if exists(select 1 from public.planned_session_items it
            where it.id=v_item_id and it.session_id=p_session_id) then
          update public.planned_session_items it set
            slot_id=v_slot_id,sort_order=(v_item->>'sort_order')::integer,
            free_title=v_item->>'free_title',
            free_description=v_item->>'free_description',
            free_comments=v_item->>'free_comments',free_url=v_item->>'free_url',
            activity_minutes=(v_item->>'activity_minutes')::integer
          where it.id=v_item_id and it.session_id=p_session_id
            and row(it.slot_id,it.sort_order,it.free_title,it.free_description,
                    it.free_comments,it.free_url,it.activity_minutes) is distinct from
                row(v_slot_id,(v_item->>'sort_order')::integer,
                    v_item->>'free_title',v_item->>'free_description',
                    v_item->>'free_comments',v_item->>'free_url',
                    (v_item->>'activity_minutes')::integer);
        else
          insert into public.planned_session_items
            (id,session_id,slot_id,sort_order,kind,free_title,
             free_description,free_comments,free_url,activity_minutes)
          values (v_item_id,p_session_id,v_slot_id,
            (v_item->>'sort_order')::integer,'free',v_item->>'free_title',
            v_item->>'free_description',v_item->>'free_comments',
            v_item->>'free_url',(v_item->>'activity_minutes')::integer);
        end if;
      end loop;
    end loop;
    -- 3. Retirada expresa: primero actividades, después franjas. FKs RESTRICT
    -- futuras impedirán eliminar un elemento aún referenciado; jamás CASCADE.
    delete from public.planned_session_items it
      where it.session_id=p_session_id and it.id=any(p_removed_item_ids);
    delete from public.planned_session_slots sl
      where sl.session_id=p_session_id and sl.id=any(p_removed_slot_ids);
  end if;
  if v_s.planning_state='confirmed' and exists(
       select 1 from public.planned_session_slots sl
       where sl.session_id=p_session_id and not exists(
         select 1 from public.planned_session_items it where it.slot_id=sl.id)) then
    raise exception 'Franja confirmada sin actividad' using errcode='23514';
  end if;
  if exists(select 1 from public.planned_session_items it
      join public.planned_session_slots sl on sl.id=it.slot_id
      where it.session_id=p_session_id and it.activity_minutes>sl.duration_minutes) then
    raise exception 'Actividad supera franja' using errcode='23514';
  end if;
  v_after:=public.planned_session_state(p_session_id);
  if v_after is distinct from v_desired then
    raise exception 'El estado guardado difiere de la solicitud' using errcode='23514';
  end if;
  if v_before->'session_date' is distinct from v_after->'session_date' then
    v_sections:=array_append(v_sections,'date'); end if;
  if v_before->'session_number' is distinct from v_after->'session_number' then
    v_sections:=array_append(v_sections,'number'); end if;
  if v_before->'slots' is distinct from v_after->'slots' then
    v_sections:=array_append(v_sections,'slots'); end if;
  if (v_before - 'session_date' - 'session_number' - 'slots') is distinct from
     (v_after - 'session_date' - 'session_number' - 'slots') then
    v_sections:=array_append(v_sections,'header'); end if;
  insert into public.planned_session_audit_events
    (session_id,revision,actor_membership_id,event_type,changed_sections,
     before_hash,after_hash)
  values (p_session_id,v_revision,v_actor,
    case when v_number is distinct from v_s.session_number then 'renumbered'
      when v_s.planning_state='draft' then 'draft_saved' else 'confirmed_saved' end,
    v_sections,md5(v_before::text),md5(v_after::text));
  return v_revision;
end $fn$;
comment on function public.save_planned_session(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[]) is
  'APPCAUDAL Sesiones 03A: save_planned_session';

create or replace function public.confirm_planned_session(
  p_session_id uuid,p_expected_revision integer)
returns integer language plpgsql security definer set search_path=pg_catalog as $fn$
declare
  v_s public.planned_training_sessions%rowtype;
  v_cts uuid; v_club uuid; v_start date; v_end date; v_status text;
  v_team text; v_label text; v_actor uuid; v_high integer;
  v_before jsonb; v_after jsonb; v_revision integer;
begin
  if auth.uid() is null or p_session_id is null or p_expected_revision is null then
    raise exception 'Confirmación no autorizada' using errcode='42501';
  end if;
  select s.club_team_season_id into v_cts
    from public.planned_training_sessions s where s.id=p_session_id;
  if v_cts is null or public.can_write_club_team_season(v_cts) is not true then
    raise exception 'Sesión no autorizada' using errcode='42501';
  end if;
  select cts.club_id,se.starts_on,se.ends_on,se.status,team.name,se.label
    into v_club,v_start,v_end,v_status,v_team,v_label
  from public.club_team_seasons cts
  join public.club_seasons se on se.id=cts.season_id and se.club_id=cts.club_id
  join public.equipos_rivales team on team.id=cts.team_id
  where cts.id=v_cts for update of se;
  if not found or v_status<>'open' or
     public.can_write_club_team_season(v_cts) is not true then
    raise exception 'Temporada cerrada o acceso revocado' using errcode='42501';
  end if;
  select * into v_s from public.planned_training_sessions s
    where s.id=p_session_id for update;
  if not found or v_s.revision<>p_expected_revision then
    raise exception 'Revisión obsoleta' using errcode='40001';
  end if;
  if v_s.planning_state='confirmed' then return v_s.revision; end if;
  if v_s.session_date<v_start or v_s.session_date>v_end or
     nullif(btrim(v_team),'') is null or nullif(btrim(v_label),'') is null then
    raise exception 'Fecha o identidad canónica inválida' using errcode='23514';
  end if;
  if exists(select 1 from public.planned_session_slots sl
    where sl.session_id=p_session_id and not exists(
      select 1 from public.planned_session_items it where it.slot_id=sl.id)) then
    raise exception 'Franja sin actividad' using errcode='23514';
  end if;
  if exists(select 1 from public.planned_session_items it
      join public.planned_session_slots sl on sl.id=it.slot_id
      where it.session_id=p_session_id
        and (it.kind<>'free' or it.activity_minutes>sl.duration_minutes)) then
    raise exception 'Actividad incompatible con 03A o con su franja'
      using errcode='23514';
  end if;
  select m.id into v_actor from public.club_memberships m
  where m.club_id=v_club and m.user_id=auth.uid() and m.is_active
    and m.role in ('owner','admin','staff') order by m.id limit 1 for share of m;
  if v_actor is null then raise exception 'Membresía no autorizada' using errcode='42501'; end if;
  if exists(select 1 from public.club_memberships m
      where m.id=v_actor and m.role='staff') then
    perform 1 from public.club_team_season_permissions p
      where p.club_id=v_club and p.membership_id=v_actor
        and p.club_team_season_id=v_s.club_team_season_id for share of p;
    if not found then raise exception 'Asignación revocada' using errcode='42501'; end if;
  end if;
  insert into public.planned_session_number_state(club_team_season_id)
    values (v_s.club_team_season_id) on conflict do nothing;
  select highest_ever_assigned into v_high
    from public.planned_session_number_state
    where club_team_season_id=v_s.club_team_season_id for update;
  if v_high>=2147483647 then
    raise exception 'Secuencia de sesiones agotada' using errcode='22003';
  end if;
  if exists(select 1 from public.planned_training_sessions other
    where other.club_team_season_id=v_s.club_team_season_id
      and other.session_number=v_high+1) then
    raise exception 'Contador de sesiones incoherente' using errcode='23505';
  end if;
  v_before:=public.planned_session_state(p_session_id);
  update public.planned_session_number_state
    set highest_ever_assigned=v_high+1
    where club_team_season_id=v_s.club_team_season_id;
  update public.planned_training_sessions set
    planning_state='confirmed',session_number=v_high+1,
    confirmed_at=now(),team_name_snapshot=v_team,season_label_snapshot=v_label,
    revision=revision+1 where id=p_session_id returning revision into v_revision;
  v_after:=public.planned_session_state(p_session_id);
  insert into public.planned_session_audit_events
    (session_id,revision,actor_membership_id,event_type,changed_sections,
     before_hash,after_hash)
  values (p_session_id,v_revision,v_actor,'confirmed',array['state','number'],
    md5(v_before::text),md5(v_after::text));
  return v_revision;
end $fn$;
comment on function public.confirm_planned_session(uuid,integer) is
  'APPCAUDAL Sesiones 03A: confirm_planned_session';

-- RLS de lectura; ninguna política de escritura directa para clientes.
alter table public.planned_training_sessions enable row level security;
alter table public.planned_session_number_state enable row level security;
alter table public.planned_session_slots enable row level security;
alter table public.planned_session_items enable row level security;
alter table public.planned_session_audit_events enable row level security;

drop policy if exists planned_sessions_read on public.planned_training_sessions;
create policy planned_sessions_read on public.planned_training_sessions
  for select to authenticated
  using (public.can_read_club_team_season(club_team_season_id));
drop policy if exists planned_number_read on public.planned_session_number_state;
create policy planned_number_read on public.planned_session_number_state
  for select to authenticated
  using (public.can_read_club_team_season(club_team_season_id));
drop policy if exists planned_slots_read on public.planned_session_slots;
create policy planned_slots_read on public.planned_session_slots
  for select to authenticated
  using (exists(select 1 from public.planned_training_sessions s
    where s.id=session_id and public.can_read_club_team_season(s.club_team_season_id)));
drop policy if exists planned_items_read on public.planned_session_items;
create policy planned_items_read on public.planned_session_items
  for select to authenticated
  using (exists(select 1 from public.planned_training_sessions s
    where s.id=session_id and public.can_read_club_team_season(s.club_team_season_id)));
drop policy if exists planned_audit_read on public.planned_session_audit_events;
create policy planned_audit_read on public.planned_session_audit_events
  for select to authenticated
  using (exists(select 1 from public.planned_training_sessions s
    join public.club_team_seasons cts on cts.id=s.club_team_season_id
    where s.id=session_id and public.can_read_club_team_season(cts.id)
      and public.has_club_role(cts.club_id,array['owner','admin']::text[])));

revoke all on table public.planned_training_sessions,
  public.planned_session_number_state,public.planned_session_slots,
  public.planned_session_items,public.planned_session_audit_events
  from public,anon,authenticated,service_role;
grant select on table public.planned_training_sessions,
  public.planned_session_number_state,public.planned_session_slots,
  public.planned_session_items,public.planned_session_audit_events
  to authenticated,service_role;

revoke all on function public.planned_session_state(uuid),
  public.guard_planned_session_row(),public.guard_planned_session_child(),
  public.guard_planned_session_number(),public.guard_planned_session_audit(),
  public.create_planned_session_draft(uuid,date),
  public.save_planned_session(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[]),
  public.confirm_planned_session(uuid,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.create_planned_session_draft(uuid,date),
  public.save_planned_session(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[]),
  public.confirm_planned_session(uuid,integer)
  to authenticated;

-- Verificación transaccional mínima. El postflight realiza el inventario completo.
do $post$
declare v_name text; v_signature text;
begin
  foreach v_name in array array[
    'planned_training_sessions','planned_session_number_state','planned_session_slots',
    'planned_session_items','planned_session_audit_events'] loop
    if not exists (select 1 from pg_class c where c.oid=to_regclass('public.'||v_name)
      and c.relkind='r' and c.relrowsecurity) then
      raise exception 'Sesiones 03A: tabla/RLS inválida %',v_name;
    end if;
    if has_table_privilege('anon','public.'||v_name,'SELECT') or
       has_table_privilege('anon','public.'||v_name,'INSERT') or
       has_table_privilege('anon','public.'||v_name,'UPDATE') or
       has_table_privilege('anon','public.'||v_name,'DELETE') or
       has_table_privilege('anon','public.'||v_name,'TRUNCATE') or
       has_table_privilege('anon','public.'||v_name,'TRIGGER') or
       has_table_privilege('anon','public.'||v_name,'MAINTAIN') or
       has_table_privilege('authenticated','public.'||v_name,'INSERT') or
       has_table_privilege('authenticated','public.'||v_name,'UPDATE') or
       has_table_privilege('authenticated','public.'||v_name,'DELETE') or
       has_table_privilege('authenticated','public.'||v_name,'TRUNCATE') or
       has_table_privilege('authenticated','public.'||v_name,'TRIGGER') or
       has_table_privilege('authenticated','public.'||v_name,'MAINTAIN') then
      raise exception 'Sesiones 03A: privilegios de cliente inválidos %',v_name;
    end if;
  end loop;
  if not exists(select 1 from pg_index ix
      where ix.indrelid='public.planned_training_sessions'::regclass
        and ix.indexrelid=to_regclass('public.planned_sessions_number_uidx')
        and ix.indisvalid and ix.indisunique and ix.indnkeyatts=2
        and ix.indkey::smallint[]=array[
          (select a.attnum from pg_attribute a
           where a.attrelid=ix.indrelid and a.attname='club_team_season_id'),
          (select a.attnum from pg_attribute a
           where a.attrelid=ix.indrelid and a.attname='session_number')]
        and regexp_replace(lower(pg_get_expr(ix.indpred,ix.indrelid)),
          '[[:space:]()]','','g')='session_numberisnotnull')
     or not exists(select 1 from pg_index ix
      where ix.indrelid='public.planned_training_sessions'::regclass
        and ix.indexrelid=to_regclass('public.planned_sessions_date_idx')
        and ix.indisvalid)
     or not exists(select 1 from pg_index ix
      where ix.indrelid='public.planned_session_items'::regclass
        and ix.indexrelid=to_regclass('public.planned_items_session_slot_idx')
        and ix.indisvalid)
     or not exists(select 1 from pg_index ix
      where ix.indrelid='public.planned_session_audit_events'::regclass
        and ix.indexrelid=to_regclass('public.planned_audit_session_date_idx')
        and ix.indisvalid) then
    raise exception 'Sesiones 03A: índice inexistente o incompatible';
  end if;
  foreach v_signature in array array[
    'public.planned_session_state(uuid)',
    'public.guard_planned_session_row()',
    'public.guard_planned_session_child()',
    'public.guard_planned_session_number()',
    'public.guard_planned_session_audit()',
    'public.create_planned_session_draft(uuid,date)',
    'public.save_planned_session(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])',
    'public.confirm_planned_session(uuid,integer)'
  ] loop
    if to_regprocedure(v_signature) is null or not exists(
      select 1 from pg_proc p where p.oid=to_regprocedure(v_signature)
        and p.prosecdef and pg_get_userbyid(p.proowner)='postgres'
        and p.proconfig @> array['search_path=pg_catalog']::text[]
        and not exists(select 1 from aclexplode(
          coalesce(p.proacl,acldefault('f',p.proowner))) acl
          where acl.grantee=0 and acl.privilege_type='EXECUTE')) then
      raise exception 'Sesiones 03A: función de seguridad incompatible %',v_signature;
    end if;
  end loop;
  foreach v_signature in array array[
    'public.planned_session_state(uuid)',
    'public.guard_planned_session_row()',
    'public.guard_planned_session_child()',
    'public.guard_planned_session_number()',
    'public.guard_planned_session_audit()'
  ] loop
    if has_function_privilege('authenticated',v_signature,'EXECUTE') or
       has_function_privilege('anon',v_signature,'EXECUTE') or
       has_function_privilege('service_role',v_signature,'EXECUTE') then
      raise exception 'Sesiones 03A: función interna expuesta %',v_signature;
    end if;
  end loop;
  if not has_function_privilege('authenticated',
      'public.create_planned_session_draft(uuid,date)','EXECUTE') or
     not has_function_privilege('authenticated',
      'public.save_planned_session(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])','EXECUTE') or
     not has_function_privilege('authenticated',
      'public.confirm_planned_session(uuid,integer)','EXECUTE') or
     has_function_privilege('anon',
      'public.create_planned_session_draft(uuid,date)','EXECUTE') or
     has_function_privilege('anon',
      'public.save_planned_session(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])','EXECUTE') or
     has_function_privilege('anon',
      'public.confirm_planned_session(uuid,integer)','EXECUTE') or
     has_function_privilege('service_role',
      'public.create_planned_session_draft(uuid,date)','EXECUTE') or
     has_function_privilege('service_role',
      'public.save_planned_session(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])','EXECUTE') or
     has_function_privilege('service_role',
      'public.confirm_planned_session(uuid,integer)','EXECUTE') then
    raise exception 'Sesiones 03A: EXECUTE de RPC incompatible';
  end if;
end $post$;
commit;
