-- Solo lectura. Ejecutar manualmente despues de instalar la fase A.
select to_regclass('public.legacy_jugador_cts_links_v1') is not null as link_table_present,
       to_regprocedure('public.can_read_legacy_jugador_v1(uuid,uuid,uuid)') is not null as read_helper_present,
       to_regprocedure('public.can_write_legacy_jugador_v1(uuid,uuid,uuid)') is not null as write_helper_present,
       md5(pg_get_functiondef(to_regprocedure('public.current_membership()')))
         as legacy_identity_definition_hash;

select p.oid::regprocedure as function_name, p.prosecdef as security_definer,
       p.proowner = 'postgres'::regrole as owned_by_postgres,
       'search_path=pg_catalog' = any(p.proconfig) as fixed_search_path,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
       not has_function_privilege('anon', p.oid, 'EXECUTE') as anon_cannot_execute,
       not exists (
         select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
         where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
       ) as public_cannot_execute
from pg_proc p
where p.oid in (
  to_regprocedure('public.can_read_legacy_jugador_v1(uuid,uuid,uuid)'),
  to_regprocedure('public.can_write_legacy_jugador_v1(uuid,uuid,uuid)')
);

select c.relrowsecurity as link_rls_enabled,
       not has_table_privilege('authenticated', c.oid, 'SELECT')
         as authenticated_cannot_read_links,
       not has_table_privilege('authenticated', c.oid, 'INSERT')
         as authenticated_cannot_insert_links
from pg_class c where c.oid = to_regclass('public.legacy_jugador_cts_links_v1');

-- La fase A debe dejar las politicas legacy tal como estaban.
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('jugadores', 'partidos')
order by tablename, policyname;
