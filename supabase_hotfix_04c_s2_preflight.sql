-- 04C-S2 SOLO LECTURA. Guardar resultado antes de instalar.
-- MAINTAIN existe como privilegio de tabla desde PostgreSQL 17.
select current_setting('server_version_num')::integer as server_version_num,
       current_setting('server_version_num')::integer >= 170000 as maintain_supported,
       exists(select 1 from pg_roles where rolname='pg_maintain') as pg_maintain_role_present;

with target(name) as (values
 ('jugadores'),('jugadores_rivales'),
 ('equipo_rival_alineacion'),('equipo_rival_banquillo')
), operation(privilege) as (values
 ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')
), actor(role_name) as (values ('anon'),('authenticated'),('service_role'))
select t.name as table_name, c.relrowsecurity as rls_enabled,
       a.role_name, o.privilege,
       case when c.oid is null then null
            when o.privilege='MAINTAIN' and current_setting('server_version_num')::integer < 170000 then null
            else has_table_privilege(a.role_name,c.oid,o.privilege) end as effective_grant
from target t left join pg_namespace n on n.nspname='public'
left join pg_class c on c.relnamespace=n.oid and c.relname=t.name
cross join operation o cross join actor a
order by t.name,o.privilege,a.role_name;

-- ACL directas y heredadas: PUBLIC alcanza a todos los roles.
select c.relname as table_name,
       case when acl.grantee=0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end as grantee,
       acl.privilege_type,acl.is_grantable,
       case when acl.grantee=0 then true
            else pg_has_role('anon'::regrole::oid,acl.grantee,'USAGE') end as anon_inherits
from pg_class c join pg_namespace n on n.oid=c.relnamespace
cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
where n.nspname='public' and c.relname in
 ('jugadores','jugadores_rivales','equipo_rival_alineacion','equipo_rival_banquillo')
 and acl.privilege_type in ('TRUNCATE','REFERENCES','TRIGGER','MAINTAIN')
order by c.relname,acl.privilege_type,grantee;

-- MAINTAIN puede llegar por la pertenencia a pg_maintain.
select role_name,case when to_regrole('pg_maintain') is null then null
  else pg_has_role(to_regrole(role_name)::oid,to_regrole('pg_maintain')::oid,'USAGE') end
  as inherits_pg_maintain
from (values ('anon'),('authenticated'),('service_role')) roles(role_name);
