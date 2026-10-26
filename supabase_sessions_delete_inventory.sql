-- SOLO LECTURA. Inventario efectivo previo a decidir entre retirada lógica o borrado.
-- No devuelve nombres, contenidos, observaciones ni datos de jugadores.
with root as (
  select to_regclass('public.planned_training_sessions') as oid
), findings as (
  select 'TABLE'::text as kind,'public.planned_training_sessions'::text as object_name,
    case when oid is null then 'BLOCKED' else 'REVIEW_REQUIRED' end as result,
    'Tabla objetivo; el inventario de catálogo no acredita la seguridad de ningún borrado'::text as detail
  from root
  union all
  select 'FOREIGN_KEY',conrelid::regclass::text||'.'||conname,'REVIEW_REQUIRED',
    pg_get_constraintdef(c.oid,true)
  from pg_constraint c cross join root
  where c.contype='f' and c.confrelid=root.oid
  union all
  select 'TRIGGER',t.tgrelid::regclass::text||'.'||t.tgname,'REVIEW_REQUIRED',
    t.tgfoid::regprocedure::text||' · enabled='||t.tgenabled::text
  from pg_trigger t cross join root
  where not t.tgisinternal and (t.tgrelid=root.oid or t.tgrelid in
    (select c.conrelid from pg_constraint c where c.contype='f' and c.confrelid=root.oid))
  union all
  select 'DEPENDENT_VIEW',r.ev_class::regclass::text,'REVIEW_REQUIRED',
    'Vista o regla con dependencia de catálogo sobre planned_training_sessions'
  from pg_depend d join pg_rewrite r on r.oid=d.objid cross join root
  where d.refobjid=root.oid and d.classid='pg_rewrite'::regclass
), report as (
  select distinct kind,object_name,result,detail from findings
  union all
  select 'GLOBAL','Decisión de borrado','REVIEW_REQUIRED',
    'Faltan conteos por sesión, referencias indirectas, documentos y Storage; no habilitar DELETE'
)
select * from report order by kind,object_name;
