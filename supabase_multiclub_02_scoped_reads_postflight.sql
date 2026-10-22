-- Solo lectura. Revisar tras la instalación manual de Multiclub 02.
-- El hash de current_membership() debe coincidir con el preflight.

select
  to_regprocedure('public.my_cts_matches_v1(uuid)') is not null as matches_rpc_present,
  to_regprocedure('public.my_cts_roster_links_v1(uuid)') is not null as roster_rpc_present,
  md5(pg_get_functiondef(to_regprocedure('public.current_membership()'))) as legacy_identity_definition_hash;

select procedure_row.proname,
  procedure_row.prosecdef as security_definer,
  procedure_row.proowner = 'postgres'::regrole as owned_by_postgres,
  'search_path=pg_catalog' = any(procedure_row.proconfig) as fixed_search_path,
  has_function_privilege('authenticated', procedure_row.oid, 'EXECUTE') as authenticated_can_execute,
  not has_function_privilege('anon', procedure_row.oid, 'EXECUTE') as anon_cannot_execute,
  not exists (
    select 1 from aclexplode(coalesce(procedure_row.proacl,
      acldefault('f', procedure_row.proowner))) acl
    where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ) as public_cannot_execute
from pg_proc procedure_row
where procedure_row.oid in (
  to_regprocedure('public.my_cts_matches_v1(uuid)'),
  to_regprocedure('public.my_cts_roster_links_v1(uuid)')
)
order by procedure_row.proname;

-- Con usuarios de prueba autenticados: verificar resultado vacío para CTS
-- ajenos o revocados, historial permitido, staff y temporada cerrada.
-- La autorización de escrituras y la cobertura de fichas legacy siguen
-- pendientes; estas RPC son de lectura y no habilitan el selector.
