create table if not exists public.match_quick_events (
  id uuid primary key default gen_random_uuid(),
  partido_id uuid not null references public.partidos(id) on delete cascade,
  jugador_id uuid null references public.jugadores(id) on delete set null,
  equipo text not null check (equipo in ('caudal', 'rival')),
  tipo_evento text not null check (
    tipo_evento in (
      'gol',
      'tiro',
      'tiro_puerta',
      'regate',
      'centro',
      'perdida',
      'robo',
      'recuperacion',
      'falta_realizada',
      'falta_recibida',
      'corner',
      'falta',
      'tiro_rival',
      'tiro_puerta_rival',
      'corner_rival',
      'falta_rival'
    )
  ),
  minuto integer not null default 0,
  reviewed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.match_quick_events
add column if not exists reviewed boolean not null default false;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'match_quick_events_tipo_evento_check'
      and conrelid = 'public.match_quick_events'::regclass
  ) then
    alter table public.match_quick_events drop constraint match_quick_events_tipo_evento_check;
  end if;
end $$;

alter table public.match_quick_events
add constraint match_quick_events_tipo_evento_check
check (
  tipo_evento in (
    'gol',
    'tiro',
    'tiro_puerta',
    'regate',
    'centro',
    'perdida',
    'robo',
    'recuperacion',
    'falta_realizada',
    'falta_recibida',
    'corner',
    'falta',
    'tiro_rival',
    'tiro_puerta_rival',
    'corner_rival',
    'falta_rival'
  )
);

create index if not exists match_quick_events_partido_idx on public.match_quick_events(partido_id);
create index if not exists match_quick_events_jugador_idx on public.match_quick_events(jugador_id);
create index if not exists match_quick_events_tipo_idx on public.match_quick_events(tipo_evento);
create index if not exists match_quick_events_equipo_idx on public.match_quick_events(equipo);
create index if not exists match_quick_events_partido_tipo_idx on public.match_quick_events(partido_id, tipo_evento);

alter table public.match_quick_events enable row level security;

drop policy if exists "Authenticated staff can read quick events" on public.match_quick_events;
create policy "Authenticated staff can read quick events"
on public.match_quick_events for select
to authenticated
using (true);

drop policy if exists "Authenticated staff can write quick events" on public.match_quick_events;
create policy "Authenticated staff can write quick events"
on public.match_quick_events for all
to authenticated
using (true)
with check (true);

comment on table public.match_quick_events is
'Eventos rápidos del Modo Delegado para alimentar Análisis Grupal y estadísticas individuales. V1: acceso staff authenticated.';
