-- APPCAUDAL Sesiones 05: postflight exclusivamente de lectura.
-- GLOBAL PASS verifica estructura, no sustituye las pruebas reales de identidad.
with expected_columns(name,type_name,required) as (
  values ('session_id','uuid',true),('formation_key','text',false),
    ('specific_positions_snapshot','jsonb',true),('player_layout','jsonb',true),
    ('space_zones','jsonb',true),('created_at','timestamp with time zone',true),
    ('updated_at','timestamp with time zone',true)
), checks as (
  select 'Tabla y propietario'::text as check_name,
    exists(select 1 from pg_class c where c.oid=
      to_regclass('public.planned_session_distributions') and c.relkind='r'
      and c.relowner='postgres'::regrole and c.relrowsecurity) as ok,
    'Tabla de Sesiones 05 con RLS activo'::text as detail
  union all
  select 'Columnas exactas y tipos',
    (select count(*) from pg_attribute a where a.attrelid=
      to_regclass('public.planned_session_distributions') and a.attnum>0
      and not a.attisdropped)=7
    and (select count(*) from expected_columns e join pg_attribute a
      on a.attrelid=to_regclass('public.planned_session_distributions')
      and a.attname=e.name and a.atttypid=to_regtype(e.type_name)
      and a.attnotnull=e.required and not a.attisdropped)=7,
    'Ninguna columna nueva o incompatible'
  union all
  select 'PK y FK validada RESTRICT',
    exists(select 1 from pg_constraint c where c.conrelid=
      to_regclass('public.planned_session_distributions') and c.contype='p'
      and c.convalidated and cardinality(c.conkey)=1
      and c.conkey[1]=(select a.attnum from pg_attribute a where a.attrelid=c.conrelid
        and a.attname='session_id' and not a.attisdropped))
    and exists(select 1 from pg_constraint c where c.conrelid=
      to_regclass('public.planned_session_distributions') and c.contype='f'
      and c.convalidated and c.confrelid=to_regclass('public.planned_training_sessions')
      and c.confdeltype='r' and cardinality(c.conkey)=1
      and c.conkey[1]=(select a.attnum from pg_attribute a where a.attrelid=c.conrelid
        and a.attname='session_id' and not a.attisdropped)),
    'La distribución pertenece a una sesión y no se elimina en cascada'
  union all
  select 'Restricciones de payload',
    (select count(*) from pg_constraint c where c.conrelid=
      to_regclass('public.planned_session_distributions') and c.convalidated
      and c.contype='c' and c.conname in
       ('planned_distributions_formation_check','planned_distributions_json_check',
        'planned_distributions_empty_formation_check'))=3
    and (select count(*) from pg_constraint c where c.conrelid=
      to_regclass('public.planned_session_distributions'))=5,
    'Tres CHECK más PK y FK; sin restricciones extra incompatibles'
  union all
  select 'Solo política SELECT autorizada',
    (select count(*) from pg_policy p where p.polrelid=
      to_regclass('public.planned_session_distributions'))=1
    and exists(select 1 from pg_policy p where p.polrelid=
      to_regclass('public.planned_session_distributions')
      and p.polname='planned_distributions_read' and p.polcmd='r'
      and p.polpermissive and p.polroles=array['authenticated'::regrole::oid]
      and position('can_read_club_team_season' in pg_get_expr(p.polqual,p.polrelid))>0),
    'La lectura pasa por el helper CTS; no hay políticas de escritura'
  union all
  select 'Privilegios de tabla',
    coalesce(has_table_privilege('authenticated',
      to_regclass('public.planned_session_distributions'),'SELECT'),false)
    and coalesce(has_table_privilege('service_role',
      to_regclass('public.planned_session_distributions'),'SELECT'),false)
    and not coalesce(has_table_privilege('authenticated',
      to_regclass('public.planned_session_distributions'),
      'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),true)
    and not coalesce(has_table_privilege('anon',
      to_regclass('public.planned_session_distributions'),
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),true),
    'authenticated y service_role consultan; anon sin privilegios efectivos'
  union all
  select 'RPC firma, dueño y search_path',
    exists(select 1 from pg_proc p where p.oid=to_regprocedure(
      'public.save_planned_session_distributions_05(uuid,integer,text,jsonb,jsonb)')
      and p.prosecdef and p.proowner='postgres'::regrole
      and p.provolatile='v' and p.proconfig @> array['search_path=pg_catalog']::text[]
      and p.prorettype='integer'::regtype),
    'SECURITY DEFINER y resolución segura de nombres'
  union all
  select 'Sin sobrecargas RPC',
    (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='save_planned_session_distributions_05')=1,
    'PostgREST no debe resolver firmas ambiguas'
  union all
  select 'EXECUTE solo para authenticated',
    coalesce(has_function_privilege('authenticated',
      to_regprocedure('public.save_planned_session_distributions_05(uuid,integer,text,jsonb,jsonb)'),
      'EXECUTE'),false)
    and not coalesce(has_function_privilege('anon',
      to_regprocedure('public.save_planned_session_distributions_05(uuid,integer,text,jsonb,jsonb)'),
      'EXECUTE'),true)
    and not exists(select 1 from pg_proc p cross join lateral aclexplode(
      coalesce(p.proacl,acldefault('f',p.proowner))) x where p.oid=to_regprocedure(
      'public.save_planned_session_distributions_05(uuid,integer,text,jsonb,jsonb)')
      and x.grantee=0 and x.privilege_type='EXECUTE'),
    'Sin EXECUTE anónimo ni PUBLIC; la RPC comprueba auth.uid()'
), rows as (
  select check_name,case when ok then 'PASS' else 'FAIL' end as result,detail from checks
)
select check_name,result,detail from rows
union all
select 'GLOBAL',case when bool_and(result='PASS') then 'PASS' else 'FAIL' end,
  count(*) filter (where result='PASS')::text||'/'||count(*)::text||
    ' comprobaciones estructurales; pruebas con identidades reales PENDING'
from rows;
