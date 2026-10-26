-- SOLO LECTURA. NO instala retirada lógica ni altera sesiones.
-- Este informe NO acredita por sí solo que una sesión confirmada no se ejecutó:
-- las referencias sin FK (documentos, Storage, sistemas externos) requieren revisión.
with objects as (
  select to_regclass('public.planned_training_sessions') as session_oid
), checks as (
  select 'Sesiones planificadas'::text as object_name,
    case when session_oid is null then 'BLOCKED' else 'FOUND' end::text as result,
    'Tabla canónica de sesiones 03A'::text as detail from objects
  union all
  select 'Estado de ejecución acreditado',
    case when exists (
      select 1 from pg_attribute a cross join objects o
      where a.attrelid=o.session_oid and not a.attisdropped
        and a.attname in ('executed_at','performed_at','execution_state')
    ) then 'REVIEW_REQUIRED' else 'BLOCKED' end,
    'draft/confirmed no equivale a no ejecutada; examinar semántica real de cualquier campo detectado'
  union all
  select 'Columna de retirada previa',
    case when exists (
      select 1 from pg_attribute a cross join objects o
      where a.attrelid=o.session_oid and not a.attisdropped
        and a.attname in ('retired_at','cancelled_at','archived_at')
    ) then 'REVIEW_REQUIRED' else 'ABSENT' end,
    'No reutilizar una columna sin acreditar su significado y protección'
  union all
  select 'FK directa: ' || c.conrelid::regclass::text || '.' || c.conname,
    'REVIEW_REQUIRED',pg_get_constraintdef(c.oid,true)
  from pg_constraint c cross join objects o
  where c.contype='f' and c.confrelid=o.session_oid
  union all
  select 'FK indirecta: ' || c.conrelid::regclass::text || '.' || c.conname,
    'REVIEW_REQUIRED',pg_get_constraintdef(c.oid,true)
  from pg_constraint c cross join objects o
  where c.contype='f' and c.confrelid in (
    select d.conrelid from pg_constraint d
    where d.contype='f' and d.confrelid=o.session_oid)
  union all
  select 'GLOBAL: retirada lógica', 'BLOCKED',
    'Falta un criterio fiable de ejecución y un inventario de documentos/Storage/referencias sin FK. No habilitar la RPC ni el botón.'
)
select object_name,result,detail from checks order by
  case when object_name like 'GLOBAL:%' then 1 else 0 end,object_name;
