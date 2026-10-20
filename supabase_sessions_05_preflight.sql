-- APPCAUDAL Sesiones 05: preflight exclusivamente de lectura.
-- Ejecutar completo en SQL Editor y revisar la fila GLOBAL antes de instalar 05.
with checks as (
  select 'PostgreSQL 17 o posterior'::text as check_name,
    current_setting('server_version_num')::integer >= 170000 as ok,
    current_setting('server_version')::text as detail
  union all
  select 'Tablas 03A/04A y posiciones',
    to_regclass('public.planned_training_sessions') is not null
    and to_regclass('public.planned_session_slots') is not null
    and to_regclass('public.planned_session_player_roster') is not null
    and to_regclass('public.planned_session_audit_events') is not null
    and to_regclass('public.player_positions') is not null,
    'Deben existir las cinco tablas sin crear datos nuevos'
  union all
  select 'Helpers 04B y lectura CTS',
    to_regprocedure('public.planned_session_04b_lock(uuid,integer)') is not null
    and to_regprocedure('public.planned_session_04b_state(uuid)') is not null
    and to_regprocedure('public.can_read_club_team_season(uuid)') is not null,
    'La RPC 05 reutiliza el bloqueo CAS y la autorización 04B'
  union all
  select 'Seguridad del bloqueo 04B',
    exists (select 1 from pg_proc p where p.oid=
      to_regprocedure('public.planned_session_04b_lock(uuid,integer)')
      and p.prosecdef and p.proconfig @> array['search_path=pg_catalog']::text[]),
    'SECURITY DEFINER y search_path=pg_catalog'
  union all
  select 'RLS de plantilla 04A',
    exists (select 1 from pg_class c where c.oid=
      to_regclass('public.planned_session_player_roster') and c.relrowsecurity),
    'La plantilla congelada debe mantener RLS'
  union all
  select 'Columnas UUID de plantilla y ejercicios',
    (select count(*) from pg_attribute a where a.attrelid=
      to_regclass('public.planned_session_player_roster') and not a.attisdropped
      and a.attname in ('session_id','player_id') and a.atttypid='uuid'::regtype)=2
    and (select count(*) from pg_attribute a where a.attrelid=
      to_regclass('public.planned_session_slots') and not a.attisdropped
      and a.attname in ('id','session_id') and a.atttypid='uuid'::regtype)=2,
    'Identidades estables para validar jugadores y zonas'
  union all
  select 'Columnas de posiciones específicas',
    (select count(*) from pg_attribute a where a.attrelid=
      to_regclass('public.player_positions') and not a.attisdropped
      and ((a.attname='player_id' and a.atttypid='uuid'::regtype)
       or (a.attname in ('position_type','position_key') and a.atttypid='text'::regtype)
       or (a.attname='is_primary' and a.atttypid='boolean'::regtype)))=4,
    'La posición específica principal se captura del servidor'
  union all
  select 'Nombre de tabla 05 libre o reconocido',
    to_regclass('public.planned_session_distributions') is null
    or obj_description(to_regclass('public.planned_session_distributions'),'pg_class')=
      'APPCAUDAL Sesiones 05: session distributions v1',
    'Un objeto preexistente ajeno bloquea la migración'
  union all
  select 'Nombre de RPC 05 libre o reconocido',
    to_regprocedure('public.save_planned_session_distributions_05(uuid,integer,text,jsonb,jsonb)') is null
    or obj_description(to_regprocedure(
      'public.save_planned_session_distributions_05(uuid,integer,text,jsonb,jsonb)'),
      'pg_proc')='APPCAUDAL Sesiones 05: save_planned_session_distributions_05',
    'Una función preexistente ajena bloquea la migración'
  union all
  select 'Sin sobrecargas RPC 05',
    not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='save_planned_session_distributions_05'
        and p.oid is distinct from to_regprocedure(
          'public.save_planned_session_distributions_05(uuid,integer,text,jsonb,jsonb)')::oid),
    'La llamada PostgREST no debe ser ambigua'
), rows as (
  select check_name,case when ok then 'PASS' else 'FAIL' end as result,detail from checks
)
select check_name,result,detail from rows
union all
select 'GLOBAL',case when bool_and(result='PASS') then 'READY_TO_APPLY' else 'BLOCKED' end,
  count(*) filter (where result='PASS')::text||'/'||count(*)::text||' comprobaciones superadas'
from rows;
