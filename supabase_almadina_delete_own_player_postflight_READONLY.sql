-- SOLO LECTURA. Ejecutar manualmente despues de instalar la RPC.
select to_regprocedure('public.delete_own_player_atomic_v1(uuid)') is not null
  as rpc_present,
  has_function_privilege('authenticated',
    to_regprocedure('public.delete_own_player_atomic_v1(uuid)'), 'EXECUTE')
    as authenticated_can_call_rpc,
  not has_function_privilege('anon',
    to_regprocedure('public.delete_own_player_atomic_v1(uuid)'), 'EXECUTE')
    as anon_cannot_call_rpc,
  not has_table_privilege('authenticated','public.jugadores','DELETE')
    as authenticated_cannot_direct_delete,
  not has_table_privilege('anon','public.jugadores','DELETE')
    as anon_cannot_direct_delete,
  has_table_privilege('service_role','public.jugadores','DELETE')
    as service_role_effective_delete;

select p.prosecdef as security_definer,
       p.proowner = 'postgres'::regrole as owned_by_postgres,
       'search_path=pg_catalog' = any(p.proconfig) as fixed_search_path
from pg_proc p
where p.oid = to_regprocedure('public.delete_own_player_atomic_v1(uuid)');
