alter table public.partidos
add column if not exists competition_key text,
add column if not exists competition_logo_url text;

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

comment on column public.partidos.competition_key is
'Clave estable de competicion del partido: league, copa_rfef, playoff o friendly. Fuente de verdad para filtros y acumulados.';

comment on column public.partidos.competition_logo_url is
'URL opcional del logo de la competicion. Si no existe, la app muestra un fallback neutro.';
