-- NEXO CLUB: impedir que el DELETE de una tarea elimine aportaciones ajenas.
-- Instalación manual. No borra tareas ni modifica sesiones o políticas RLS.
begin;

do $preflight$
declare
  v_function oid := to_regprocedure('public.guard_training_task_delete_v1()');
begin
  if to_regclass('public.training_tasks') is null
     or to_regclass('public.training_task_shares') is null
     or to_regclass('public.training_task_feedback') is null
     or to_regclass('public.training_task_media') is null
     or to_regclass('public.planned_session_items') is null
     or to_regclass('public.club_memberships') is null
     or to_regclass('storage.objects') is null
     or to_regprocedure('public.training_task_authorized(uuid,text)') is null
     or to_regprocedure('auth.uid()') is null then
    raise exception 'Tareas: falta una dependencia conocida; no se instala el guard';
  end if;

  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='guard_training_task_delete_v1')
      <> case when v_function is null then 0 else 1 end then
    raise exception 'Tareas: existe una sobrecarga inesperada del guard';
  end if;
  if v_function is not null and
     obj_description(v_function,'pg_proc') is distinct from
       'NEXO CLUB: guard de borrado de tareas sin aportaciones ajenas' then
    raise exception 'Tareas: guard_training_task_delete_v1 existe con otro contrato';
  end if;
  if to_regprocedure('public.training_task_orphan_storage_allowed(text)') is not null
     and obj_description(
       to_regprocedure('public.training_task_orphan_storage_allowed(text)'),
       'pg_proc') is distinct from
       'NEXO CLUB: limpieza privada de archivos de tareas ya eliminadas' then
    raise exception 'Tareas: helper de limpieza de Storage existe con otro contrato';
  end if;
  if to_regprocedure('public.training_task_delete_ready_v1()') is not null
     and obj_description(to_regprocedure('public.training_task_delete_ready_v1()'),
       'pg_proc') is distinct from
       'NEXO CLUB: disponibilidad del guard de borrado de tareas' then
    raise exception 'Tareas: helper de disponibilidad existe con otro contrato';
  end if;
  if exists (
    select 1 from pg_policies p
    where p.schemaname='storage' and p.tablename='objects'
      and p.policyname in ('training_task_orphan_select_v1',
                           'training_task_orphan_delete_v1')
      and (p.roles<>array['authenticated']::name[]
        or p.cmd<>case when p.policyname='training_task_orphan_select_v1'
          then 'SELECT' else 'DELETE' end)
  ) then
    raise exception 'Tareas: nombre de política de limpieza ya ocupado';
  end if;
  if exists (
    select 1 from pg_trigger t
    where t.tgrelid=to_regclass('public.training_tasks')
      and t.tgname='training_task_delete_guard_v1'
      and not t.tgisinternal
      and (v_function is null or t.tgfoid<>v_function)
  ) then
    raise exception 'Tareas: el nombre del trigger ya está ocupado';
  end if;
  if (select count(*) from pg_constraint c
      where c.contype='f' and c.confrelid=to_regclass('public.training_tasks'))<>3
     or exists (
       select 1 from (values
         (to_regclass('public.training_task_shares')),
         (to_regclass('public.training_task_feedback')),
         (to_regclass('public.training_task_media'))
       ) expected(child_table)
       where (select count(*) from pg_constraint c
         where c.contype='f' and c.confrelid=to_regclass('public.training_tasks')
           and c.conrelid=expected.child_table)<>1
     )
     or exists (
       select 1 from pg_constraint c
       where c.contype='f' and c.confrelid=to_regclass('public.training_tasks')
         and (c.conrelid not in (
           to_regclass('public.training_task_shares'),
           to_regclass('public.training_task_feedback'),
           to_regclass('public.training_task_media'))
           or c.confdeltype<>'c' or not c.convalidated)
     ) then
    raise exception 'Tareas: dependencias FK distintas de las tres conocidas; revisar antes de borrar';
  end if;
  if exists (
    select 1 from pg_constraint c
    where c.contype='f' and c.conrelid=to_regclass('public.planned_session_items')
      and c.confrelid=to_regclass('public.training_tasks')
  ) then
    raise exception 'Tareas: Sesiones ya no conserva snapshots independientes';
  end if;
end;
$preflight$;

create or replace function public.guard_training_task_delete_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog as $function$
begin
  if tg_op <> 'DELETE' or auth.uid() is null
     or old.author_user_id is distinct from auth.uid()
     or public.training_task_authorized(old.id,'write') is not true then
    raise exception 'No tienes permiso para eliminar esta tarea'
      using errcode='42501';
  end if;
  if exists (
    select 1 from public.training_task_feedback f
    where f.task_id=old.id and f.author_user_id is distinct from old.author_user_id
  ) or exists (
    select 1 from public.training_task_media m
    where m.task_id=old.id and m.author_user_id is distinct from old.author_user_id
  ) or exists (
    select 1 from public.training_task_shares s
    where s.task_id=old.id and s.shared_by_user_id is distinct from old.author_user_id
  ) then
    raise exception 'La tarea tiene aportaciones de otros usuarios; no se ha eliminado'
      using errcode='23503';
  end if;
  return old;
end;
$function$;
comment on function public.guard_training_task_delete_v1() is
  'NEXO CLUB: guard de borrado de tareas sin aportaciones ajenas';
alter function public.guard_training_task_delete_v1() owner to postgres;
revoke all on function public.guard_training_task_delete_v1()
  from public, anon, authenticated, service_role;

-- Después del DELETE de la fila, las políticas previas ya no pueden reconocer
-- sus archivos. Esta excepción solo permite al autor activo borrar objetos
-- huérfanos de su propio directorio en el bucket privado.
create or replace function public.training_task_orphan_storage_allowed(p_path text)
returns boolean language sql stable security definer set search_path=pg_catalog as $function$
  select auth.uid() is not null
    and split_part(p_path,'/',1) ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(p_path,'/',2) ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(p_path,'/',3)=auth.uid()::text
    and split_part(p_path,'/',4) ~
      '^(attachment|preview|media)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[a-z0-9][a-z0-9._-]*$'
    and split_part(p_path,'/',5)=''
    and exists (
      select 1 from public.club_memberships m
      where m.club_id::text=split_part(p_path,'/',1)
        and m.user_id=auth.uid() and m.is_active
        and m.role in ('owner','admin','staff')
    )
    and not exists (
      select 1 from public.training_tasks t
      where t.id::text=split_part(p_path,'/',2)
    );
$function$;
comment on function public.training_task_orphan_storage_allowed(text) is
  'NEXO CLUB: limpieza privada de archivos de tareas ya eliminadas';
alter function public.training_task_orphan_storage_allowed(text) owner to postgres;
revoke all on function public.training_task_orphan_storage_allowed(text)
  from public, anon, authenticated, service_role;
grant execute on function public.training_task_orphan_storage_allowed(text)
  to authenticated;

do $policies$
begin
  if not exists (select 1 from pg_policies p where p.schemaname='storage'
      and p.tablename='objects' and p.policyname='training_task_orphan_select_v1') then
    create policy training_task_orphan_select_v1 on storage.objects
      for select to authenticated
      using (bucket_id='training-task-files'
        and public.training_task_orphan_storage_allowed(name));
  end if;
  if not exists (select 1 from pg_policies p where p.schemaname='storage'
      and p.tablename='objects' and p.policyname='training_task_orphan_delete_v1') then
    create policy training_task_orphan_delete_v1 on storage.objects
      for delete to authenticated
      using (bucket_id='training-task-files'
        and public.training_task_orphan_storage_allowed(name));
  end if;
end;
$policies$;
alter policy training_task_orphan_select_v1 on storage.objects
  to authenticated using (bucket_id='training-task-files'
    and public.training_task_orphan_storage_allowed(name));
alter policy training_task_orphan_delete_v1 on storage.objects
  to authenticated using (bucket_id='training-task-files'
    and public.training_task_orphan_storage_allowed(name));

do $trigger$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid=to_regclass('public.training_tasks')
      and tgname='training_task_delete_guard_v1' and not tgisinternal
  ) then
    create trigger training_task_delete_guard_v1
      before delete on public.training_tasks for each row
      execute function public.guard_training_task_delete_v1();
  end if;
end;
$trigger$;

-- El cliente no habilita «Eliminar» hasta que este guard esté instalado.
create or replace function public.training_task_delete_ready_v1()
returns boolean language sql stable security definer set search_path=pg_catalog as $function$
  select auth.uid() is not null and exists (
    select 1 from pg_trigger t
    where t.tgrelid=to_regclass('public.training_tasks')
      and t.tgname='training_task_delete_guard_v1'
      and t.tgfoid=to_regprocedure('public.guard_training_task_delete_v1()')
      and (t.tgtype::integer & 11)=11 and t.tgenabled='O'
      and not t.tgisinternal
  );
$function$;
comment on function public.training_task_delete_ready_v1() is
  'NEXO CLUB: disponibilidad del guard de borrado de tareas';
alter function public.training_task_delete_ready_v1() owner to postgres;
revoke all on function public.training_task_delete_ready_v1()
  from public, anon, authenticated, service_role;
grant execute on function public.training_task_delete_ready_v1()
  to authenticated;

do $postflight$
begin
  if not exists (
    select 1 from pg_proc p
    where p.oid=to_regprocedure('public.guard_training_task_delete_v1()')
      and p.prosecdef and p.proconfig=array['search_path=pg_catalog']::text[]
      and pg_get_userbyid(p.proowner)='postgres'
  ) or not exists (
    select 1 from pg_trigger t
    where t.tgrelid=to_regclass('public.training_tasks')
      and t.tgname='training_task_delete_guard_v1'
      and t.tgfoid=to_regprocedure('public.guard_training_task_delete_v1()')
      and (t.tgtype::integer & 11)=11 and not t.tgisinternal and t.tgenabled='O'
  ) or has_function_privilege('authenticated',
       'public.guard_training_task_delete_v1()','EXECUTE')
     or has_function_privilege('anon',
       'public.guard_training_task_delete_v1()','EXECUTE')
     or not has_function_privilege('authenticated',
       'public.training_task_orphan_storage_allowed(text)','EXECUTE')
     or has_function_privilege('anon',
       'public.training_task_orphan_storage_allowed(text)','EXECUTE')
     or not has_function_privilege('authenticated',
       'public.training_task_delete_ready_v1()','EXECUTE')
     or has_function_privilege('anon',
       'public.training_task_delete_ready_v1()','EXECUTE')
     or (select count(*) from pg_policies p where p.schemaname='storage'
         and p.tablename='objects' and p.policyname in
           ('training_task_orphan_select_v1','training_task_orphan_delete_v1'))<>2 then
    raise exception 'Tareas: postflight del guard fallido; se revierte la transacción';
  end if;
end;
$postflight$;

commit;
