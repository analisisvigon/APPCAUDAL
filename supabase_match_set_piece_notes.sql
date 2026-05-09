create table if not exists public.match_set_piece_notes (
  id uuid primary key default gen_random_uuid(),
  partido_id uuid not null references public.partidos(id) on delete cascade,
  tipo text not null,
  titulo text,
  descripcion text,
  roles jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partido_id, tipo)
);

create index if not exists match_set_piece_notes_partido_idx
on public.match_set_piece_notes(partido_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_match_set_piece_notes_updated_at on public.match_set_piece_notes;
create trigger set_match_set_piece_notes_updated_at
before update on public.match_set_piece_notes
for each row execute function public.set_updated_at();

alter table public.match_set_piece_notes enable row level security;

drop policy if exists "Authenticated staff can read match set piece notes" on public.match_set_piece_notes;
create policy "Authenticated staff can read match set piece notes"
on public.match_set_piece_notes for select
to authenticated
using (true);

drop policy if exists "Authenticated staff can write match set piece notes" on public.match_set_piece_notes;
create policy "Authenticated staff can write match set piece notes"
on public.match_set_piece_notes for all
to authenticated
using (true)
with check (true);
