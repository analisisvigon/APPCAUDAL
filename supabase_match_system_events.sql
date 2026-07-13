create table if not exists public.partido_eventos_sistema (
  id uuid primary key default gen_random_uuid(),
  partido_id uuid not null references public.partidos(id) on delete cascade,
  minute text not null,
  period text,
  from_system text,
  to_system text not null,
  note text,
  second integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists partido_eventos_sistema_partido_minute_idx
on public.partido_eventos_sistema (partido_id, minute);

alter table public.partido_eventos_sistema enable row level security;

drop policy if exists "Authenticated staff can read system events" on public.partido_eventos_sistema;
create policy "Authenticated staff can read system events"
on public.partido_eventos_sistema
for select
to authenticated
using (true);

drop policy if exists "Authenticated staff can write system events" on public.partido_eventos_sistema;
create policy "Authenticated staff can write system events"
on public.partido_eventos_sistema
for insert
to authenticated
with check (true);

drop policy if exists "Authenticated staff can update system events" on public.partido_eventos_sistema;
create policy "Authenticated staff can update system events"
on public.partido_eventos_sistema
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated staff can delete system events" on public.partido_eventos_sistema;
create policy "Authenticated staff can delete system events"
on public.partido_eventos_sistema
for delete
to authenticated
using (true);

comment on table public.partido_eventos_sistema is
'Cambios de sistema tactico durante un partido. No sustituye el sistema inicial guardado en partidos.stats_system.';

comment on column public.partido_eventos_sistema.from_system is
'Sistema vigente inmediatamente antes del cambio. La app lo recalcula al crear o editar desde los eventos anteriores.';

comment on column public.partido_eventos_sistema.to_system is
'Nuevo sistema tactico que entra en vigor desde el minuto indicado.';
