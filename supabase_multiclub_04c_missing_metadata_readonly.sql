-- SOLO LECTURA. Ejecutar MANUALMENTE en produccion SOLO si falta en el
-- paquete 04C el contrato de competitions o partido_estadisticas_jugador.
-- No consulta filas de estas tablas, jugadores, partidos ni auth.users.
with target(name) as (values ('competitions'),('partido_estadisticas_jugador'))
select name,to_regclass(format('public.%I',name)) is not null as present
from target order by name;

select c.relname as table_name,a.attnum,a.attname as column_name,
 format_type(a.atttypid,a.atttypmod) as data_type,a.attnotnull as not_null,
 a.attidentity as identity_kind,a.attgenerated as generated_kind,
 pg_get_expr(d.adbin,d.adrelid) as default_expression
from pg_class c join pg_namespace n on n.oid=c.relnamespace
join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
where n.nspname='public' and c.relname in
 ('competitions','partido_estadisticas_jugador')
order by c.relname,a.attnum;

select c.relname as table_name,k.conname,k.contype,k.convalidated,
 pg_get_constraintdef(k.oid,true) as definition
from pg_constraint k join pg_class c on c.oid=k.conrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
 ('competitions','partido_estadisticas_jugador')
order by c.relname,k.conname;

select tablename,indexname,indexdef from pg_indexes
where schemaname='public' and tablename in
 ('competitions','partido_estadisticas_jugador')
order by tablename,indexname;

select c.relname as table_name,c.relrowsecurity as rls_enabled,
 c.relforcerowsecurity as force_rls,
 has_table_privilege('anon',c.oid,'SELECT') as anon_select,
 has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_select,
 has_table_privilege('authenticated',c.oid,'INSERT') as authenticated_insert,
 has_table_privilege('authenticated',c.oid,'UPDATE') as authenticated_update,
 has_table_privilege('authenticated',c.oid,'DELETE') as authenticated_delete
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
 ('competitions','partido_estadisticas_jugador')
order by c.relname;

select tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies where schemaname='public' and tablename in
 ('competitions','partido_estadisticas_jugador')
order by tablename,policyname;

select c.relname as table_name,t.tgname,pg_get_triggerdef(t.oid,true) as definition,
 t.tgfoid::regprocedure as function_signature,
 md5(pg_get_functiondef(t.tgfoid)) as function_definition_hash
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
 ('competitions','partido_estadisticas_jugador') and not t.tgisinternal
order by c.relname,t.tgname;
