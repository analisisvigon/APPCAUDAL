-- SOLO LECTURA. Ejecutar manualmente antes de considerar la migración 2B.
-- READY significa que las dependencias mínimas existen; no acredita identidades ni RLS efectivo.
with required(name,kind,oid) as (
  values
    ('club_team_seasons','table',to_regclass('public.club_team_seasons')::oid),
    ('club_seasons','table',to_regclass('public.club_seasons')::oid),
    ('club_teams','table',to_regclass('public.club_teams')::oid),
    ('club_memberships','table',to_regclass('public.club_memberships')::oid),
    ('can_read_club_team_season(uuid)','function',to_regprocedure('public.can_read_club_team_season(uuid)')::oid),
    ('can_write_club_team_season(uuid)','function',to_regprocedure('public.can_write_club_team_season(uuid)')::oid)
), required_columns(table_name,column_name,type_name) as (
  values
    ('club_team_seasons','id','uuid'),('club_team_seasons','club_id','uuid'),
    ('club_team_seasons','season_id','uuid'),('club_team_seasons','team_id','uuid'),
    ('club_seasons','id','uuid'),('club_seasons','club_id','uuid'),
    ('club_seasons','starts_on','date'),('club_seasons','ends_on','date'),
    ('club_seasons','status','text'),
    ('club_memberships','id','uuid'),('club_memberships','club_id','uuid'),
    ('club_memberships','user_id','uuid'),('club_memberships','role','text'),
    ('club_memberships','is_active','bool')
), checks as (
  select 'Dependencia: '||name as check_name,
    case when oid is not null then 'PASS' else 'BLOCKED' end as result,
    kind||' requerido' as detail from required
  union all
  select 'Columna: '||table_name||'.'||column_name,
    case when exists(select 1 from pg_attribute a join pg_type t on t.oid=a.atttypid
      where a.attrelid=to_regclass('public.'||table_name) and a.attname=column_name
        and not a.attisdropped and t.typname=type_name) then 'PASS' else 'BLOCKED' end,
    'Tipo esperado: '||type_name from required_columns
  union all
  select 'CTS: FKs canónicas validadas',
    case when (select count(distinct confrelid) from pg_constraint
      where conrelid=to_regclass('public.club_team_seasons') and contype='f'
        and convalidated and confdeltype='r' and confrelid in
          (to_regclass('public.club_seasons'),to_regclass('public.club_teams')))=2
      then 'PASS' else 'BLOCKED' end,
    'Relaciones validadas a club_seasons y club_teams, ON DELETE RESTRICT'
  union all
  select 'Helpers CTS: SECURITY DEFINER y search_path',
    case when (select count(*) from pg_proc p where p.oid in
      (to_regprocedure('public.can_read_club_team_season(uuid)'),
       to_regprocedure('public.can_write_club_team_season(uuid)'))
      and p.prosecdef and p.proconfig @> array['search_path=pg_catalog']::text[])=2
      then 'PASS' else 'BLOCKED' end,
    'No sustituir ni ampliar los helpers de autorización existentes'
  union all
  select 'Tabla planned_microcycles',
    case when to_regclass('public.planned_microcycles') is null then 'READY'
      when obj_description(to_regclass('public.planned_microcycles'),'pg_class')=
        'NEXO CLUB Microciclos 2B: planificación por CTS y lunes' then 'PASS'
      else 'BLOCKED' end,
    'Ausente o identificada con el comentario de esta migración'
  union all
  select 'RPC save_planned_microcycle_2b',
    case when to_regprocedure('public.save_planned_microcycle_2b(uuid,date,integer,jsonb,jsonb)') is null then 'READY'
      when obj_description(to_regprocedure('public.save_planned_microcycle_2b(uuid,date,integer,jsonb,jsonb)'),'pg_proc')=
        'NEXO CLUB Microciclos 2B: escritura CAS de planificación semanal' then 'PASS'
      else 'BLOCKED' end,
    'Ausente o identificada con el comentario de esta migración'
), report as (
  select check_name,result,detail from checks
  union all
  select 'GLOBAL',case when bool_and(result<>'BLOCKED') then 'READY' else 'BLOCKED' end,
    'Revisar además catálogo de columnas, privilegios e identidades reales antes de instalar'
  from checks
)
select * from report order by case when check_name='GLOBAL' then 1 else 0 end,check_name;
