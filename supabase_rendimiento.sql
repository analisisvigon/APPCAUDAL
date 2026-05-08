create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  session_date date not null,
  microcycle_label text,
  md_label text,
  title text,
  session_type text not null default 'Entrenamiento',
  planned_duration int,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.wellness_entries (
  id uuid primary key default gen_random_uuid(),
  jugador_id uuid not null references public.jugadores(id) on delete cascade,
  entry_date date not null,
  sleep_hours numeric,
  sleep_quality int check (sleep_quality between 1 and 10),
  fatigue int check (fatigue between 1 and 10),
  muscle_soreness int check (muscle_soreness between 1 and 10),
  stress int check (stress between 1 and 10),
  mood int check (mood between 1 and 10),
  weight numeric,
  discomfort text,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (jugador_id, entry_date)
);

create table if not exists public.rpe_entries (
  id uuid primary key default gen_random_uuid(),
  jugador_id uuid not null references public.jugadores(id) on delete cascade,
  session_id uuid not null references public.training_sessions(id) on delete cascade,
  entry_date date not null,
  duration_minutes int not null default 0,
  rpe int not null check (rpe between 1 and 10),
  load int generated always as (duration_minutes * rpe) stored,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (jugador_id, session_id)
);

create index if not exists training_sessions_date_idx on public.training_sessions(session_date);
create index if not exists training_sessions_microcycle_idx on public.training_sessions(microcycle_label);
create index if not exists wellness_entries_date_idx on public.wellness_entries(entry_date);
create index if not exists wellness_entries_jugador_date_idx on public.wellness_entries(jugador_id, entry_date);
create index if not exists rpe_entries_date_idx on public.rpe_entries(entry_date);
create index if not exists rpe_entries_jugador_date_idx on public.rpe_entries(jugador_id, entry_date);
create index if not exists rpe_entries_session_idx on public.rpe_entries(session_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_wellness_entries_updated_at on public.wellness_entries;
create trigger set_wellness_entries_updated_at
before update on public.wellness_entries
for each row execute function public.set_updated_at();

drop trigger if exists set_rpe_entries_updated_at on public.rpe_entries;
create trigger set_rpe_entries_updated_at
before update on public.rpe_entries
for each row execute function public.set_updated_at();

alter table public.training_sessions enable row level security;
alter table public.wellness_entries enable row level security;
alter table public.rpe_entries enable row level security;

drop policy if exists "Authenticated staff can read training sessions" on public.training_sessions;
create policy "Authenticated staff can read training sessions"
on public.training_sessions for select
to authenticated
using (true);

drop policy if exists "Authenticated staff can write training sessions" on public.training_sessions;
create policy "Authenticated staff can write training sessions"
on public.training_sessions for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated staff can read wellness entries" on public.wellness_entries;
create policy "Authenticated staff can read wellness entries"
on public.wellness_entries for select
to authenticated
using (true);

drop policy if exists "Authenticated staff can write wellness entries" on public.wellness_entries;
create policy "Authenticated staff can write wellness entries"
on public.wellness_entries for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated staff can read rpe entries" on public.rpe_entries;
create policy "Authenticated staff can read rpe entries"
on public.rpe_entries for select
to authenticated
using (true);

drop policy if exists "Authenticated staff can write rpe entries" on public.rpe_entries;
create policy "Authenticated staff can write rpe entries"
on public.rpe_entries for all
to authenticated
using (true)
with check (true);

comment on policy "Authenticated staff can write training sessions" on public.training_sessions is
'V1: private staff app. V2: restrict writes by role or staff profile.';
comment on policy "Authenticated staff can write wellness entries" on public.wellness_entries is
'V1: private staff app. V2: players should only write their own wellness entries.';
comment on policy "Authenticated staff can write rpe entries" on public.rpe_entries is
'V1: private staff app. V2: players should only write their own RPE entries.';
