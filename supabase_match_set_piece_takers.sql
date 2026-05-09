create table if not exists public.match_set_piece_takers (
  id uuid primary key default gen_random_uuid(),
  partido_id uuid not null references public.partidos(id) on delete cascade,
  tipo text not null,
  orden integer not null check (orden between 1 and 3),
  jugador_id uuid null references public.jugadores(id) on delete set null,
  nombre_manual text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partido_id, tipo, orden)
);

create index if not exists match_set_piece_takers_partido_idx
on public.match_set_piece_takers(partido_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_match_set_piece_takers_updated_at on public.match_set_piece_takers;
create trigger set_match_set_piece_takers_updated_at
before update on public.match_set_piece_takers
for each row execute function public.set_updated_at();

alter table public.match_set_piece_takers enable row level security;

drop policy if exists "Authenticated staff can read match set piece takers" on public.match_set_piece_takers;
create policy "Authenticated staff can read match set piece takers"
on public.match_set_piece_takers for select
to authenticated
using (true);

drop policy if exists "Authenticated staff can write match set piece takers" on public.match_set_piece_takers;
create policy "Authenticated staff can write match set piece takers"
on public.match_set_piece_takers for all
to authenticated
using (true)
with check (true);
