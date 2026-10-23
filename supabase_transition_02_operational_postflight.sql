-- TRANSICION 02. SOLO LECTURA; ejecutar manualmente tras instalar PREPARE.
-- El registro debe permanecer VACIO. No designar Libia con este postflight.
select count(*) as operational_cts_rows,
       count(*) = 0 as safe_preparation_only,
       count(*) filter (where writes_enabled) = 0 as no_writes_enabled
from public.operational_cts_v1;

-- Sin JWT, ni el CTS preferido ni el permiso de escritura deben existir.
select public.my_operational_cts_v1() is null as no_anonymous_preference,
       public.can_write_operational_cts_v1(null::uuid) is false
         as null_cts_write_denied,
       public.can_open_historical_cts_v1(null::uuid) is false
         as null_archive_open_denied;

select p.oid::regprocedure as routine, p.prosecdef as security_definer,
       p.proowner = 'postgres'::regrole as owned_by_postgres,
       'search_path=pg_catalog' = any(p.proconfig) as fixed_search_path,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_executes,
       not has_function_privilege('anon',p.oid,'EXECUTE') as anon_cannot_execute
from pg_proc p where p.oid in (
  to_regprocedure('public.can_write_operational_cts_v1(uuid)'),
  to_regprocedure('public.my_operational_cts_v1()'),
  to_regprocedure('public.can_open_historical_cts_v1(uuid)'),
  to_regprocedure('public.create_operational_player_v1(uuid,uuid,jsonb,jsonb)'),
  to_regprocedure('public.edit_operational_player_v1(uuid,uuid,jsonb)'),
  to_regprocedure('public.create_operational_match_v1(uuid,jsonb)'),
  to_regprocedure('public.edit_operational_match_v1(uuid,uuid,jsonb)'))
order by p.oid::regprocedure::text;

select c.relrowsecurity as registry_rls_enabled,
       not has_table_privilege('anon',c.oid,'SELECT') as anon_cannot_read,
       not has_table_privilege('authenticated',c.oid,'INSERT') as authenticated_cannot_designate,
       not has_table_privilege('service_role',c.oid,'UPDATE') as service_role_cannot_move
from pg_class c where c.oid = to_regclass('public.operational_cts_v1');

-- 03C no se instala en este bloque. Revisar las rutas restantes antes de
-- permitir cualquier fila en operational_cts_v1.
select tablename, policyname, permissive, cmd, qual, with_check
from pg_policies where schemaname = 'public'
  and tablename in ('jugadores','partidos','club_team_season_players')
order by tablename, policyname;
