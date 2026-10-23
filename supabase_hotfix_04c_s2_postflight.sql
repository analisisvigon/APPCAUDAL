-- 04C-S2 SOLO LECTURA. Ejecutar manualmente despues del COMMIT.
-- Cada fila debe mostrar anon_effective=false y public_grants=0.
-- authenticated/service_role: comparar exactamente con preflight.
with target(name) as (values ('jugadores'),('jugadores_rivales'),
 ('equipo_rival_alineacion'),('equipo_rival_banquillo')),
operation(privilege) as (values ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN'))
select t.name as table_name,o.privilege,
 case when o.privilege='MAINTAIN' and current_setting('server_version_num')::integer<170000
      then null else has_table_privilege('anon',c.oid,o.privilege) end as anon_effective,
 case when o.privilege='MAINTAIN' and current_setting('server_version_num')::integer<170000
      then null else has_table_privilege('authenticated',c.oid,o.privilege) end
      as authenticated_effective,
 case when o.privilege='MAINTAIN' and current_setting('server_version_num')::integer<170000
      then null else has_table_privilege('service_role',c.oid,o.privilege) end
      as service_role_effective,
 (select count(*) from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
  where acl.grantee=0 and acl.privilege_type=o.privilege) as public_grants
from target t join pg_namespace n on n.nspname='public'
join pg_class c on c.relnamespace=n.oid and c.relname=t.name
cross join operation o order by t.name,o.privilege;

-- S1 y RLS siguen siendo independientes: anon DML false, RLS true.
select c.relname as table_name,c.relrowsecurity as rls_enabled,
 has_table_privilege('anon',c.oid,'SELECT') as anon_select,
 has_table_privilege('anon',c.oid,'INSERT') as anon_insert,
 has_table_privilege('anon',c.oid,'UPDATE') as anon_update,
 has_table_privilege('anon',c.oid,'DELETE') as anon_delete
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
 ('jugadores','jugadores_rivales','equipo_rival_alineacion','equipo_rival_banquillo')
order by c.relname;
