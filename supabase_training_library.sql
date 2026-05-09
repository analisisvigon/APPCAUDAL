create table if not exists public.training_library (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null,
  categoria text,
  descripcion text,
  objetivo text,
  variantes text,
  dimensiones text,
  jugadores text,
  duracion text,
  material text,
  elements jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists training_library_categoria_idx on public.training_library(categoria);
create index if not exists training_library_tipo_idx on public.training_library(tipo);
create index if not exists training_library_updated_at_idx on public.training_library(updated_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_training_library_updated_at on public.training_library;
create trigger set_training_library_updated_at
before update on public.training_library
for each row execute function public.set_updated_at();

alter table public.training_library enable row level security;

drop policy if exists "Authenticated staff can read training library" on public.training_library;
create policy "Authenticated staff can read training library"
on public.training_library for select
to authenticated
using (true);

drop policy if exists "Authenticated staff can write training library" on public.training_library;
create policy "Authenticated staff can write training library"
on public.training_library for all
to authenticated
using (true)
with check (true);
