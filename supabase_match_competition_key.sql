alter table public.partidos
add column if not exists competition_key text;

create table if not exists public.competitions (
  id uuid primary key default gen_random_uuid(),
  club_id uuid,
  key text not null unique,
  name text not null,
  short_name text,
  logo_url text,
  fallback_icon text,
  competition_type text,
  season text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'competitions_key_check'
      and conrelid = 'public.competitions'::regclass
  ) then
    alter table public.competitions drop constraint competitions_key_check;
  end if;
end $$;

alter table public.competitions
add constraint competitions_key_check
check (key in ('league', 'copa_rfef', 'playoff', 'friendly'));

insert into public.competitions (key, name, short_name, fallback_icon, competition_type, is_active)
values
  ('league', 'Liga', 'Liga', 'LG', 'official', true),
  ('copa_rfef', 'Copa RFEF', 'Copa RFEF', 'CR', 'official', true),
  ('playoff', 'Play Off', 'Play Off', 'PO', 'official', true),
  ('friendly', 'Amistoso', 'Amistoso', 'AM', 'friendly', true)
on conflict (key) do update
set
  name = excluded.name,
  short_name = excluded.short_name,
  fallback_icon = coalesce(public.competitions.fallback_icon, excluded.fallback_icon),
  competition_type = coalesce(public.competitions.competition_type, excluded.competition_type),
  is_active = true,
  updated_at = now();

alter table public.partidos
add column if not exists competition_id uuid references public.competitions(id);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'partidos_competition_key_check'
      and conrelid = 'public.partidos'::regclass
  ) then
    alter table public.partidos drop constraint partidos_competition_key_check;
  end if;
end $$;

alter table public.partidos
add constraint partidos_competition_key_check
check (
  competition_key is null
  or competition_key in ('league', 'copa_rfef', 'playoff', 'friendly')
);

update public.partidos
set competition_key = case
  when lower(coalesce(type, '')) in ('liga', 'liga 1', 'league') then 'league'
  when lower(coalesce(type, '')) in ('copa', 'copa rfef') then 'copa_rfef'
  when lower(coalesce(type, '')) in ('play off', 'playoff', 'play-off') then 'playoff'
  when lower(coalesce(type, '')) in ('amistoso', 'amistosos', 'friendly') then 'friendly'
  else competition_key
end
where competition_key is null
  and lower(coalesce(type, '')) in (
    'liga',
    'liga 1',
    'league',
    'copa',
    'copa rfef',
    'play off',
    'playoff',
    'play-off',
    'amistoso',
    'amistosos',
    'friendly'
  );

update public.partidos p
set competition_id = c.id
from public.competitions c
where p.competition_id is null
  and p.competition_key = c.key;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'competition-assets',
  'competition-assets',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on column public.partidos.competition_key is
'Clave estable de competicion del partido: league, copa_rfef, playoff o friendly. Fuente de verdad para filtros y acumulados.';

comment on column public.partidos.competition_id is
'Referencia opcional al catalogo persistente public.competitions. El logo pertenece a la competicion, no al partido.';

comment on table public.competitions is
'Catalogo persistente de competiciones usado por partidos, filtros, acumulados e iconos/logos.';

comment on column public.competitions.logo_url is
'URL publica del icono/logo guardado en Supabase Storage bucket competition-assets.';
