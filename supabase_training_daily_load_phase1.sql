begin;

alter table public.training_sessions
  add column if not exists actual_duration_minutes integer;

alter table public.training_sessions
  add column if not exists record_kind text;

alter table public.training_sessions
  add column if not exists updated_at timestamptz;

alter table public.training_sessions
  alter column updated_at set default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.training_sessions'::regclass
      and conname = 'training_sessions_actual_duration_minutes_check'
  ) then
    alter table public.training_sessions
      add constraint training_sessions_actual_duration_minutes_check
      check (actual_duration_minutes is null or actual_duration_minutes > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.training_sessions'::regclass
      and conname = 'training_sessions_record_kind_check'
  ) then
    alter table public.training_sessions
      add constraint training_sessions_record_kind_check
      check (record_kind is null or record_kind in ('legacy', 'daily_team_load'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.training_sessions'::regclass
      and conname = 'training_sessions_daily_team_load_type_check'
  ) then
    alter table public.training_sessions
      add constraint training_sessions_daily_team_load_type_check
      check (
        record_kind is distinct from 'daily_team_load'
        or session_type in ('training', 'match', 'recovery', 'activation', 'rest', 'other')
      );
  end if;
end;
$$;

-- Fase multiclub futura: este indice debera evolucionar a
-- UNIQUE (club_id, session_date) WHERE record_kind = 'daily_team_load'.
create unique index if not exists training_sessions_daily_team_load_date_key
  on public.training_sessions(session_date)
  where record_kind = 'daily_team_load';

create table if not exists public.training_session_load_metrics (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions(id) on delete cascade,
  scope text not null,
  jugador_id uuid references public.jugadores(id),
  aggregation_method text,
  distance_m numeric(10,2),
  hsr_m numeric(10,2),
  accelerations integer,
  decelerations integer,
  sprints integer,
  meters_per_minute numeric(8,2),
  load_units numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_session_load_metrics_scope_check
    check (scope in ('team', 'player')),
  constraint training_session_load_metrics_scope_player_check
    check (
      (
        scope = 'team'
        and jugador_id is null
        and aggregation_method = 'team_average'
      )
      or (
        scope = 'player'
        and jugador_id is not null
      )
    ),
  constraint training_session_load_metrics_distance_check
    check (distance_m is null or distance_m >= 0),
  constraint training_session_load_metrics_hsr_check
    check (hsr_m is null or hsr_m >= 0),
  constraint training_session_load_metrics_accelerations_check
    check (accelerations is null or accelerations >= 0),
  constraint training_session_load_metrics_decelerations_check
    check (decelerations is null or decelerations >= 0),
  constraint training_session_load_metrics_sprints_check
    check (sprints is null or sprints >= 0),
  constraint training_session_load_metrics_meters_per_minute_check
    check (meters_per_minute is null or meters_per_minute >= 0),
  constraint training_session_load_metrics_load_units_check
    check (load_units is null or load_units >= 0)
);

alter table public.training_session_load_metrics
  add column if not exists load_units numeric(10,2);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.training_session_load_metrics'::regclass
      and conname = 'training_session_load_metrics_load_units_check'
  ) then
    alter table public.training_session_load_metrics
      add constraint training_session_load_metrics_load_units_check
      check (load_units is null or load_units >= 0);
  end if;
end;
$$;

alter table public.training_session_load_metrics
  add column if not exists load_units numeric(10,2);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.training_session_load_metrics'::regclass
      and conname = 'training_session_load_metrics_load_units_check'
  ) then
    alter table public.training_session_load_metrics
      add constraint training_session_load_metrics_load_units_check
      check (load_units is null or load_units >= 0);
  end if;
end;
$$;

create unique index if not exists training_session_load_metrics_team_session_key
  on public.training_session_load_metrics(session_id)
  where scope = 'team';

create unique index if not exists training_session_load_metrics_player_session_key
  on public.training_session_load_metrics(session_id, jugador_id)
  where scope = 'player';

create index if not exists training_session_load_metrics_player_idx
  on public.training_session_load_metrics(jugador_id)
  where jugador_id is not null;

create or replace function public.set_training_load_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_training_sessions_load_updated_at on public.training_sessions;
create trigger set_training_sessions_load_updated_at
before update on public.training_sessions
for each row execute function public.set_training_load_updated_at();

drop trigger if exists set_training_session_load_metrics_updated_at on public.training_session_load_metrics;
create trigger set_training_session_load_metrics_updated_at
before update on public.training_session_load_metrics
for each row execute function public.set_training_load_updated_at();

alter table public.training_session_load_metrics enable row level security;

revoke all on table public.training_session_load_metrics from public, anon;
grant select, insert, update, delete on table public.training_session_load_metrics to authenticated;
grant all on table public.training_session_load_metrics to service_role;

drop policy if exists "Authenticated staff can read training load metrics"
  on public.training_session_load_metrics;
create policy "Authenticated staff can read training load metrics"
on public.training_session_load_metrics
for select
to authenticated
using (true);

drop policy if exists "Authenticated staff can write training load metrics"
  on public.training_session_load_metrics;
create policy "Authenticated staff can write training load metrics"
on public.training_session_load_metrics
for all
to authenticated
using (true)
with check (true);

create or replace function public.upsert_team_daily_training_load(
  p_session_date date,
  p_session_type text,
  p_actual_duration_minutes integer default null,
  p_distance_m numeric default null,
  p_hsr_m numeric default null,
  p_accelerations integer default null,
  p_decelerations integer default null,
  p_sprints integer default null,
  p_meters_per_minute numeric default null,
  p_load_units numeric default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  saved_session public.training_sessions%rowtype;
  saved_metrics public.training_session_load_metrics%rowtype;
begin
  if p_session_date is null then
    raise exception 'La fecha de la carga es obligatoria.' using errcode = '23502';
  end if;

  if p_session_type not in ('training', 'match', 'recovery', 'activation', 'rest', 'other') then
    raise exception 'Tipo de sesion no valido: %', p_session_type using errcode = '23514';
  end if;

  if p_session_type <> 'rest' and p_actual_duration_minutes is null then
    raise exception 'El volumen real es obligatorio cuando existe sesion.' using errcode = '23514';
  end if;

  if p_actual_duration_minutes is not null and p_actual_duration_minutes <= 0 then
    raise exception 'El volumen real debe ser mayor que cero.' using errcode = '23514';
  end if;

  if p_distance_m < 0
    or p_hsr_m < 0
    or p_accelerations < 0
    or p_decelerations < 0
    or p_sprints < 0
    or p_meters_per_minute < 0
    or p_load_units < 0 then
    raise exception 'Las metricas de carga no pueden ser negativas.' using errcode = '23514';
  end if;

  insert into public.training_sessions (
    session_date,
    title,
    session_type,
    actual_duration_minutes,
    notes,
    record_kind,
    updated_at
  )
  values (
    p_session_date,
    case p_session_type
      when 'training' then 'Entrenamiento'
      when 'match' then 'Partido'
      when 'recovery' then 'Recuperacion'
      when 'activation' then 'Activacion'
      when 'rest' then 'Descanso'
      else 'Otro'
    end,
    p_session_type,
    p_actual_duration_minutes,
    nullif(btrim(p_notes), ''),
    'daily_team_load',
    now()
  )
  on conflict (session_date) where record_kind = 'daily_team_load'
  do update set
    title = excluded.title,
    session_type = excluded.session_type,
    actual_duration_minutes = excluded.actual_duration_minutes,
    notes = excluded.notes,
    updated_at = now()
  returning * into saved_session;

  insert into public.training_session_load_metrics (
    session_id,
    scope,
    jugador_id,
    aggregation_method,
    distance_m,
    hsr_m,
    accelerations,
    decelerations,
    sprints,
    meters_per_minute,
    load_units
  )
  values (
    saved_session.id,
    'team',
    null,
    'team_average',
    p_distance_m,
    p_hsr_m,
    p_accelerations,
    p_decelerations,
    p_sprints,
    p_meters_per_minute,
    p_load_units
  )
  on conflict (session_id) where scope = 'team'
  do update set
    aggregation_method = 'team_average',
    distance_m = excluded.distance_m,
    hsr_m = excluded.hsr_m,
    accelerations = excluded.accelerations,
    decelerations = excluded.decelerations,
    sprints = excluded.sprints,
    meters_per_minute = excluded.meters_per_minute,
    load_units = excluded.load_units,
    updated_at = now()
  returning * into saved_metrics;

  return jsonb_build_object(
    'session', to_jsonb(saved_session),
    'metrics', to_jsonb(saved_metrics)
  );
end;
$$;

revoke all on function public.upsert_team_daily_training_load(
  date, text, integer, numeric, numeric, integer, integer, integer, numeric, numeric, text
) from public, anon;
grant execute on function public.upsert_team_daily_training_load(
  date, text, integer, numeric, numeric, integer, integer, integer, numeric, numeric, text
) to authenticated, service_role;

commit;
