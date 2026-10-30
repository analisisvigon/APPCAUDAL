-- NEXO CLUB / Microciclos 4A. Preparacion de lectura fisica por CTS.
-- REVISAR ANTES DE EJECUTAR. No atribuye ni modifica ninguna sesion historica.
-- Los vinculos se incorporaran solo mediante una conciliacion explicita posterior.
begin;

do $preflight$
declare
  required_column record;
begin
  if auth.uid() is not null then
    raise exception '4A requiere ejecucion administrativa sin JWT de usuario';
  end if;
  if to_regclass('public.training_sessions') is null
     or to_regclass('public.training_session_load_metrics') is null
     or to_regclass('public.club_team_seasons') is null
     or to_regclass('public.club_seasons') is null
     or to_regprocedure('public.can_read_club_team_season(uuid)') is null then
    raise exception '4A: falta una relacion o el helper CTS requerido';
  end if;
  for required_column in
    select * from (values
      ('training_sessions','id','uuid'),
      ('training_sessions','session_date','date'),
      ('training_sessions','session_type','text'),
      ('training_sessions','actual_duration_minutes','integer'),
      ('training_session_load_metrics','session_id','uuid'),
      ('training_session_load_metrics','scope','text'),
      ('training_session_load_metrics','jugador_id','uuid'),
      ('training_session_load_metrics','aggregation_method','text'),
      ('training_session_load_metrics','load_units','numeric'),
      ('training_session_load_metrics','distance_m','numeric'),
      ('training_session_load_metrics','hsr_m','numeric'),
      ('training_session_load_metrics','accelerations','integer'),
      ('training_session_load_metrics','decelerations','integer'),
      ('training_session_load_metrics','sprints','integer'),
      ('training_session_load_metrics','meters_per_minute','numeric'),
      ('club_team_seasons','id','uuid'),
      ('club_team_seasons','season_id','uuid'),
      ('club_team_seasons','club_id','uuid'),
      ('club_seasons','id','uuid'),
      ('club_seasons','club_id','uuid'),
      ('club_seasons','starts_on','date'),
      ('club_seasons','ends_on','date')
    ) as required(table_name, column_name, type_name)
  loop
    if not exists (
      select 1 from pg_catalog.pg_attribute a
      where a.attrelid = pg_catalog.to_regclass('public.' || required_column.table_name)
        and a.attname = required_column.column_name and not a.attisdropped
        and pg_catalog.format_type(a.atttypid, null) = required_column.type_name
    ) then
      raise exception '4A: columna incompatible %.%',
        required_column.table_name, required_column.column_name;
    end if;
  end loop;
  if not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.training_session_load_metrics'::regclass
      and c.confrelid = 'public.training_sessions'::regclass
      and c.contype = 'f' and c.convalidated
  ) then
    raise exception '4A: FK validada de metricas a sesiones no acreditada';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_index i
    where i.indexrelid = pg_catalog.to_regclass(
        'public.training_session_load_metrics_team_session_key')
      and i.indrelid = 'public.training_session_load_metrics'::regclass
      and i.indisunique and i.indisvalid and i.indpred is not null
      and i.indnkeyatts = 1
      and i.indkey[0] = (select a.attnum from pg_catalog.pg_attribute a
        where a.attrelid = i.indrelid and a.attname = 'session_id'
          and not a.attisdropped)
      and pg_catalog.replace(pg_catalog.regexp_replace(
        pg_catalog.lower(pg_catalog.pg_get_expr(i.indpred, i.indrelid)),
        '[[:space:]()]', '', 'g'), '::text', '') = 'scope=''team'''
  ) then
    raise exception '4A: unicidad de metricas colectivas por sesion no acreditada';
  end if;
  if to_regclass('public.microcycle_physical_session_links') is not null
     and obj_description(to_regclass('public.microcycle_physical_session_links'), 'pg_class')
       is distinct from 'NEXO CLUB Microciclos 4A: explicit attested CTS links for physical sessions' then
    raise exception '4A: existe una tabla de vinculos incompatible';
  end if;
  if to_regprocedure('public.get_microcycle_team_loads_4a(uuid,date)') is not null
     and obj_description(to_regprocedure('public.get_microcycle_team_loads_4a(uuid,date)'), 'pg_proc')
       is distinct from 'NEXO CLUB Microciclos 4A: authorized collective physical loads only' then
    raise exception '4A: existe una funcion incompatible';
  end if;
end $preflight$;

create table if not exists public.microcycle_physical_session_links (
  training_session_id uuid primary key
    references public.training_sessions(id) on delete restrict,
  club_team_season_id uuid not null
    references public.club_team_seasons(id) on delete restrict,
  linked_at timestamptz not null default now()
);
comment on table public.microcycle_physical_session_links is
  'NEXO CLUB Microciclos 4A: explicit attested CTS links for physical sessions';
create index if not exists microcycle_physical_session_links_cts_idx
  on public.microcycle_physical_session_links(club_team_season_id, training_session_id);
alter table public.microcycle_physical_session_links enable row level security;
revoke all on public.microcycle_physical_session_links from public, anon, authenticated;
-- Sin politicas ni GRANT para clientes: la atribucion requiere revision manual.

create or replace function public.get_microcycle_team_loads_4a(
  p_club_team_season_id uuid, p_week_starts_on date
)
returns table (
  training_session_id uuid, session_date date, session_type text,
  actual_duration_minutes integer, load_units numeric, distance_m numeric,
  hsr_m numeric, accelerations integer, decelerations integer, sprints integer,
  meters_per_minute numeric, has_team_metrics boolean
)
language plpgsql stable security definer
set search_path = pg_catalog
as $function$
begin
  if auth.uid() is null or p_club_team_season_id is null or p_week_starts_on is null
     or extract(isodow from p_week_starts_on) <> 1
     or public.can_read_club_team_season(p_club_team_season_id) is not true then
    return;
  end if;
  return query
  select s.id, s.session_date, s.session_type, s.actual_duration_minutes,
    m.load_units, m.distance_m, m.hsr_m, m.accelerations, m.decelerations,
    m.sprints, m.meters_per_minute, m.session_id is not null
  from public.microcycle_physical_session_links l
  join public.training_sessions s on s.id = l.training_session_id
  join public.club_team_seasons cts on cts.id = l.club_team_season_id
  join public.club_seasons season
    on season.id = cts.season_id and season.club_id = cts.club_id
  left join public.training_session_load_metrics m
    on m.session_id = s.id and m.scope = 'team'
   and m.jugador_id is null and m.aggregation_method = 'team_average'
  where l.club_team_season_id = p_club_team_season_id
    and s.session_date between p_week_starts_on and p_week_starts_on + 6
    and s.session_date between season.starts_on and season.ends_on
  order by s.session_date, s.id;
end;
$function$;
comment on function public.get_microcycle_team_loads_4a(uuid,date) is
  'NEXO CLUB Microciclos 4A: authorized collective physical loads only';
alter function public.get_microcycle_team_loads_4a(uuid,date) owner to postgres;
revoke all on function public.get_microcycle_team_loads_4a(uuid,date)
  from public, anon, authenticated, service_role;
grant execute on function public.get_microcycle_team_loads_4a(uuid,date)
  to authenticated;

do $postflight$
begin
  if not exists (select 1 from pg_catalog.pg_class c
    where c.oid = 'public.microcycle_physical_session_links'::regclass
      and c.relrowsecurity)
     or (select count(*) from pg_catalog.pg_constraint c
       where c.conrelid = 'public.microcycle_physical_session_links'::regclass
         and c.contype = 'p') <> 1
     or (select count(*) from pg_catalog.pg_policy p
       where p.polrelid = 'public.microcycle_physical_session_links'::regclass) <> 0
     or (select count(*) from pg_catalog.pg_constraint c
       where c.conrelid = 'public.microcycle_physical_session_links'::regclass
         and c.contype = 'f' and c.convalidated
         and c.confdeltype = 'r'
         and c.confrelid in ('public.training_sessions'::regclass,
                            'public.club_team_seasons'::regclass)) <> 2 then
    raise exception '4A: integridad o RLS del vinculo incompletos';
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint c
       where c.conrelid = 'public.microcycle_physical_session_links'::regclass
         and c.confrelid = 'public.training_sessions'::regclass
         and c.contype = 'f' and c.convalidated and c.confdeltype = 'r')
     or not exists (select 1 from pg_catalog.pg_constraint c
       where c.conrelid = 'public.microcycle_physical_session_links'::regclass
         and c.confrelid = 'public.club_team_seasons'::regclass
         and c.contype = 'f' and c.convalidated and c.confdeltype = 'r')
     or not exists (select 1 from pg_catalog.pg_index i
       where i.indexrelid = pg_catalog.to_regclass(
         'public.microcycle_physical_session_links_cts_idx')
         and i.indrelid = 'public.microcycle_physical_session_links'::regclass
         and i.indisvalid and i.indnkeyatts = 2
         and i.indkey[0] = (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid = i.indrelid and a.attname = 'club_team_season_id')
         and i.indkey[1] = (select a.attnum from pg_catalog.pg_attribute a
           where a.attrelid = i.indrelid and a.attname = 'training_session_id')) then
    raise exception '4A: FK o indice CTS incompatibles';
  end if;
  if pg_catalog.has_table_privilege('anon',
       'public.microcycle_physical_session_links',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES,MAINTAIN')
     or pg_catalog.has_table_privilege('authenticated',
       'public.microcycle_physical_session_links',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES,MAINTAIN')
     or not pg_catalog.has_function_privilege('authenticated',
       'public.get_microcycle_team_loads_4a(uuid,date)', 'EXECUTE')
     or pg_catalog.has_function_privilege('anon',
       'public.get_microcycle_team_loads_4a(uuid,date)', 'EXECUTE')
     or exists (select 1 from pg_catalog.pg_proc p,
                pg_catalog.aclexplode(p.proacl) acl
                where p.oid = 'public.get_microcycle_team_loads_4a(uuid,date)'::regprocedure
                  and acl.grantee = 0 and acl.privilege_type = 'EXECUTE') then
    raise exception '4A: privilegios de lectura o escritura incompatibles';
  end if;
  if not exists (select 1 from pg_catalog.pg_proc p
    where p.oid = 'public.get_microcycle_team_loads_4a(uuid,date)'::regprocedure
      and p.prosecdef and p.provolatile = 's'
      and p.proconfig = array['search_path=pg_catalog']::text[]
      and p.proowner = (select r.oid from pg_catalog.pg_roles r
        where r.rolname = 'postgres')) then
    raise exception '4A: contrato de seguridad de la RPC incompleto';
  end if;
  if (select count(*) from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_microcycle_team_loads_4a') <> 1 then
    raise exception '4A: sobrecarga conflictiva de la RPC';
  end if;
end $postflight$;
commit;
