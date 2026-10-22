-- Solo lectura. Ejecutar manualmente tras instalar Multiclub 01.
-- Comparar legacy_identity_definition_hash con el preflight: debe ser igual.

select
  to_regprocedure('public.my_access_contexts_v1()') is not null as new_function_present,
  md5(pg_get_functiondef(to_regprocedure('public.current_membership()'))) as legacy_identity_definition_hash;

select
  procedure_row.prosecdef as security_definer,
  procedure_row.proowner = 'postgres'::regrole as owned_by_postgres,
  'search_path=pg_catalog' = any(procedure_row.proconfig) as fixed_search_path,
  has_function_privilege('authenticated', procedure_row.oid, 'EXECUTE') as authenticated_can_execute,
  not has_function_privilege('anon', procedure_row.oid, 'EXECUTE') as anon_cannot_execute,
  not exists (
    select 1
    from aclexplode(coalesce(procedure_row.proacl, acldefault('f', procedure_row.proowner))) acl
    where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ) as public_cannot_execute
from pg_proc procedure_row
where procedure_row.oid = to_regprocedure('public.my_access_contexts_v1()');

-- Ejecutar con una sesion autenticada de prueba desde la aplicacion o un
-- cliente de prueba, nunca con service_role: confirmar que cada club procede
-- de auth.uid() y cada contexto devuelve can_read_club_team_season = true.
