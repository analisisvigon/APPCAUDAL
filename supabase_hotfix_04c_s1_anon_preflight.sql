-- 04C-S1: SOLO LECTURA. Ejecutar manualmente ANTES del hotfix y conservar
-- el resultado para comparar. No devuelve filas deportivas ni datos de Auth.
with target(name) as (values
 ('jugadores'), ('jugadores_rivales'),
 ('equipo_rival_alineacion'), ('equipo_rival_banquillo')
), operation(privilege) as (values
 ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')
), actor(role_name) as (values
 ('anon'), ('authenticated'), ('service_role')
)
select t.name as table_name, c.relkind, c.relrowsecurity as rls_enabled,
       a.role_name, o.privilege,
       case when c.oid is null then null
         else has_table_privilege(a.role_name, c.oid, o.privilege) end
         as effective_table_privilege,
       case when c.oid is null or o.privilege = 'DELETE' then null
         else has_any_column_privilege(a.role_name, c.oid, o.privilege) end
         as effective_any_column_privilege
from target t
left join pg_namespace n on n.nspname = 'public'
left join pg_class c on c.relnamespace = n.oid and c.relname = t.name
cross join actor a cross join operation o
order by t.name, a.role_name, o.privilege;

-- Origen de los grants de tabla y columna: PUBLIC aparece con grantee=0.
select c.relname as table_name, 'table'::text as grant_scope,
       null::text as column_name,
       case when acl.grantee = 0 then 'PUBLIC'
            else pg_get_userbyid(acl.grantee) end as grantee,
       acl.privilege_type, acl.is_grantable,
       case when acl.grantee = 0 then true
            else pg_has_role('anon'::regrole::oid, acl.grantee, 'USAGE') end
         as anon_inherits_grant
from pg_class c join pg_namespace n on n.oid = c.relnamespace
cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
where n.nspname = 'public' and c.relname in (
 'jugadores','jugadores_rivales','equipo_rival_alineacion','equipo_rival_banquillo')
union all
select c.relname, 'column', a.attname,
       case when acl.grantee = 0 then 'PUBLIC'
            else pg_get_userbyid(acl.grantee) end,
       acl.privilege_type, acl.is_grantable,
       case when acl.grantee = 0 then true
            else pg_has_role('anon'::regrole::oid, acl.grantee, 'USAGE') end
from pg_class c join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
cross join lateral aclexplode(a.attacl) acl
where n.nspname = 'public' and c.relname in (
 'jugadores','jugadores_rivales','equipo_rival_alineacion','equipo_rival_banquillo')
order by table_name, grant_scope, column_name, grantee, privilege_type;

-- RLS se deja intacto. Una policy para PUBLIC puede aplicar tambien a anon.
select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename in (
 'jugadores','jugadores_rivales','equipo_rival_alineacion','equipo_rival_banquillo')
order by tablename, policyname;

-- Posibles rutas indirectas: vistas SELECT anon y funciones SECURITY DEFINER
-- ejecutables por anon cuyo codigo menciona alguna tabla objetivo.
-- La busqueda textual no detecta SQL dinamico; revisar cada resultado.
select 'view'::text as object_kind, c.oid::regclass::text as object_name,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_can_select,
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
