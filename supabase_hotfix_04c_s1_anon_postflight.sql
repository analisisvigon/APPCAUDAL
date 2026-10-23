-- 04C-S1: SOLO LECTURA. Ejecutar manualmente DESPUES del COMMIT.
-- Comparar authenticated/service_role y las policies con el preflight.
with target(name) as (values
 ('jugadores'), ('jugadores_rivales'),
 ('equipo_rival_alineacion'), ('equipo_rival_banquillo')
), operation(privilege) as (values
 ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')
)
select t.name as table_name, o.privilege,
       has_table_privilege('anon', format('public.%I', t.name), o.privilege)
         as anon_effective_table_grant,
       case when o.privilege = 'DELETE' then false
         else has_any_column_privilege('anon', format('public.%I', t.name), o.privilege)
       end as anon_effective_column_grant,
       has_table_privilege('authenticated', format('public.%I', t.name), o.privilege)
         as authenticated_effective_grant,
       has_table_privilege('service_role', format('public.%I', t.name), o.privilege)
         as service_role_effective_grant
from target t cross join operation o
order by t.name, o.privilege;

-- Debe devolver cuatro filas con anon_closed=true y public_dml_grants=0.
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       not (has_table_privilege('anon', c.oid, 'SELECT')
         or has_table_privilege('anon', c.oid, 'INSERT')
         or has_table_privilege('anon', c.oid, 'UPDATE')
         or has_table_privilege('anon', c.oid, 'DELETE')
         or has_any_column_privilege('anon', c.oid, 'SELECT')
         or has_any_column_privilege('anon', c.oid, 'INSERT')
         or has_any_column_privilege('anon', c.oid, 'UPDATE')) as anon_closed,
       (select count(*) from aclexplode(coalesce(c.relacl, acldefault('r',c.relowner))) acl
         where acl.grantee = 0
           and acl.privilege_type in ('SELECT','INSERT','UPDATE','DELETE'))
         as public_dml_grants
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in (
 'jugadores','jugadores_rivales','equipo_rival_alineacion','equipo_rival_banquillo')
order by c.relname;

-- Las policies no se modifican; comparar con preflight.
select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename in (
 'jugadores','jugadores_rivales','equipo_rival_alineacion','equipo_rival_banquillo')
order by tablename, policyname;

-- Vias indirectas que este hotfix NO cambia. Revisar manualmente cualquier
-- fila con anon_can_access=true; una RPC SECURITY DEFINER puede ignorar RLS.
select 'view'::text as object_kind, c.oid::regclass::text as object_name,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_can_access,
       coalesce('security_invoker=true' = any(c.reloptions), false) as security_invoker
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('v','m')
  and pg_get_viewdef(c.oid) ~* '(jugadores_rivales|equipo_rival_alineacion|equipo_rival_banquillo|jugadores)'
union all
select 'security_definer', p.oid::regprocedure::text,
       has_function_privilege('anon', p.oid, 'EXECUTE'), null::boolean
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and p.prosrc ~* '(jugadores_rivales|equipo_rival_alineacion|equipo_rival_banquillo|jugadores)'
order by object_kind, object_name;
