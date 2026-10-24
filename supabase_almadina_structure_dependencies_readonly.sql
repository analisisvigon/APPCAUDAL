-- ALMADINA / SOLO LECTURA DE CATALOGOS. Ejecutar MANUALMENTE solo en
-- APPCAUDAL, despues de revisar el archivo public_schema. No lee filas de
-- auth.users, storage.objects, jugadores, partidos ni ninguna otra tabla.
-- Compartir solo metadatos estructurales revisados; las expresiones de
-- politicas pueden contener literales que convenga redactar.

-- Extensiones: el dump limitado a public no acredita su configuracion.
select e.extname, e.extversion, n.nspname as installed_schema
from pg_extension e join pg_namespace n on n.oid = e.extnamespace
order by e.extname;

-- FK de tablas public hacia estructuras gestionadas por Auth/Storage.
select c.conrelid::regclass as source_table, c.conname,
       c.confrelid::regclass as referenced_table,
       pg_get_constraintdef(c.oid, true) as definition
from pg_constraint c
join pg_namespace source_ns on source_ns.oid = c.connamespace
join pg_class referenced on referenced.oid = c.confrelid
join pg_namespace referenced_ns on referenced_ns.oid = referenced.relnamespace
where source_ns.nspname = 'public'
  and referenced_ns.nspname in ('auth', 'storage')
order by c.conrelid::regclass::text, c.conname;

-- Triggers no internos sobre tablas gestionadas. Solo firma y hash de
-- funcion: el cuerpo requeriria revision antes de compartirlo.
select n.nspname as schema_name, relation.relname as table_name,
       trigger_row.tgname, trigger_row.tgenabled,
       pg_get_triggerdef(trigger_row.oid, true) as trigger_definition,
       trigger_row.tgfoid::regprocedure as function_signature,
       md5(pg_get_functiondef(trigger_row.tgfoid)) as function_hash
from pg_trigger trigger_row
join pg_class relation on relation.oid = trigger_row.tgrelid
join pg_namespace n on n.oid = relation.relnamespace
where n.nspname in ('auth', 'storage') and not trigger_row.tgisinternal
order by n.nspname, relation.relname, trigger_row.tgname;

-- Politicas Auth/Storage: definiciones, nunca filas ni archivos.
select schemaname, tablename, policyname, permissive, roles, cmd,
       qual, with_check
from pg_policies
where schemaname in ('auth', 'storage')
order by schemaname, tablename, policyname;

-- Funciones public que mencionan Auth, Storage o identidad Caudal. Solo
-- indicadores; sus cuerpos ya figuran en el dump estructural para revision.
select p.oid::regprocedure as function_signature,
       p.prosrc ilike '%auth.%' as mentions_auth,
       p.prosrc ilike '%storage.%' as mentions_storage,
       p.prosrc ilike '%caudal%' as mentions_caudal
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (p.prosrc ilike '%auth.%' or p.prosrc ilike '%storage.%'
       or p.prosrc ilike '%caudal%')
order by p.oid::regprocedure::text;
