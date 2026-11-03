-- Solo lectura. Ejecutar antes y después de la migración en SQL Editor.
with facts as (
  select
    to_regclass('public.training_tasks') as task_table,
    to_regclass('public.training_task_shares') as shares_table,
    to_regclass('public.training_task_feedback') as feedback_table,
    to_regclass('public.training_task_media') as media_table,
    to_regclass('public.planned_session_items') as session_items_table,
    to_regprocedure('public.guard_training_task_delete_v1()') as guard_function,
    to_regprocedure('public.training_task_orphan_storage_allowed(text)')
      as orphan_function
), checks as (
  select 'Tablas conocidas'::text as check_name,
    task_table is not null and shares_table is not null
      and feedback_table is not null and media_table is not null
      and session_items_table is not null as passed,
    'Tarea, compartición, POST, multimedia y snapshots de Sesiones'::text as detail
  from facts
  union all
  select 'FK conocidas', count(*)=3 and coalesce(bool_and(
    c.conrelid in (f.shares_table,f.feedback_table,f.media_table)
      and c.confdeltype='c' and c.convalidated),false),
    'Tres FK validadas con CASCADE; ninguna relación adicional'
  from facts f left join pg_constraint c
    on c.contype='f' and c.confrelid=f.task_table
  group by f.task_table
  union all
  select 'Snapshot sin FK a Biblioteca', not exists (
    select 1 from pg_constraint c
    where c.contype='f' and c.conrelid=f.session_items_table
      and c.confrelid=f.task_table),
    'planned_session_items conserva source_task_uuid_snapshot y task_snapshot'
  from facts f
  union all
  select 'RLS de tareas', coalesce((select c.relrowsecurity
    from pg_class c where c.oid=f.task_table),false),
    'RLS permanece activo; la migración no cambia políticas'
  from facts f
  union all
  select 'Política DELETE del autor', exists (
    select 1 from pg_policy p
    where p.polrelid=f.task_table and p.polname='training_tasks_delete'
      and p.polcmd='d' and p.polpermissive
      and pg_get_expr(p.polqual,p.polrelid) ilike '%training_task_authorized%'
  ), 'Inspeccionar la expresión completa si hay cambios de políticas'
  from facts f
  union all
  select 'Función segura', coalesce((select p.prosecdef
      and p.proconfig=array['search_path=pg_catalog']::text[]
      and pg_get_userbyid(p.proowner)='postgres'
      and obj_description(p.oid,'pg_proc')=
        'NEXO CLUB: guard de borrado de tareas sin aportaciones ajenas'
    from pg_proc p where p.oid=f.guard_function),false),
    'SECURITY DEFINER, owner postgres y search_path pg_catalog'
  from facts f
  union all
  select 'Trigger DELETE activo', exists (
    select 1 from pg_trigger t
    where t.tgrelid=f.task_table and t.tgname='training_task_delete_guard_v1'
      and t.tgfoid=f.guard_function and (t.tgtype & 11)=11
      and t.tgenabled='O' and not t.tgisinternal
  ), 'BEFORE DELETE de cada tarea'
  from facts f
  union all
  select 'Sin EXECUTE público', f.guard_function is not null
      and not has_function_privilege('authenticated',f.guard_function,'EXECUTE')
      and not has_function_privilege('anon',f.guard_function,'EXECUTE')
      and not exists (
        select 1 from pg_proc p,
          aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
        where p.oid=f.guard_function and acl.grantee=0
          and acl.privilege_type='EXECUTE'
      ),
    'El trigger se ejecuta sin exponer la función como RPC'
  from facts f
  union all
  select 'Limpieza de Storage limitada', f.orphan_function is not null
      and has_function_privilege('authenticated',f.orphan_function,'EXECUTE')
      and not has_function_privilege('anon',f.orphan_function,'EXECUTE')
      and coalesce((select p.prosecdef
        and p.proconfig=array['search_path=pg_catalog']::text[]
        and pg_get_userbyid(p.proowner)='postgres'
        and obj_description(p.oid,'pg_proc')=
          'NEXO CLUB: limpieza privada de archivos de tareas ya eliminadas'
        from pg_proc p where p.oid=f.orphan_function),false),
    'El autor activo puede limpiar únicamente objetos huérfanos de su ruta privada'
  from facts f
  union all
  select 'Políticas de Storage', count(*)=2 and coalesce(bool_and(
      p.roles=array['authenticated']::name[]
      and p.cmd=case when p.policyname='training_task_orphan_select_v1'
        then 'SELECT' else 'DELETE' end
      and p.qual ilike '%training_task_orphan_storage_allowed%'
      and p.qual ilike '%training-task-files%'),false),
    'SELECT y DELETE solo en el bucket privado y con el helper de huérfanos'
  from facts f left join pg_policies p on p.schemaname='storage'
    and p.tablename='objects' and p.policyname in
      ('training_task_orphan_select_v1','training_task_orphan_delete_v1')
  group by f.task_table
), summary as (
  select case
    when bool_and(passed) then 'PASS'
    when bool_and(passed) filter (where check_name in
      ('Tablas conocidas','FK conocidas','Snapshot sin FK a Biblioteca',
       'RLS de tareas','Política DELETE del autor'))
       and not (select guard_function is not null or orphan_function is not null
                from facts)
      then 'READY_TO_APPLY'
    else 'BLOCKED' end as result
  from checks
)
select check_name, case when passed then 'PASS' else 'FAIL' end as result, detail
from checks
union all
select 'GLOBAL', result,
  case result when 'PASS' then 'Estructura instalada; faltan pruebas reales de identidad'
    when 'READY_TO_APPLY' then 'Precondiciones verificadas; guard todavía no instalado'
    else 'Revisar filas FAIL antes de instalar o utilizar Eliminar' end
from summary;
