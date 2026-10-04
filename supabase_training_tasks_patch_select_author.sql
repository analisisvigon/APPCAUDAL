-- APPCAUDAL · Tareas V1 · permite INSERT ... RETURNING al autor autorizado.
-- Aplicar sobre una instalación existente de supabase_training_tasks.sql.
-- Es idempotente: repetirlo conserva la misma definición de policy.
begin;

do $$
begin
  if to_regclass('public.training_tasks') is null then
    raise exception 'Tareas SELECT autor: falta public.training_tasks';
  end if;
  if to_regprocedure('public.training_task_authorized(uuid,text)') is null
     or to_regprocedure('public.can_edit_club_data(uuid)') is null then
    raise exception 'Tareas SELECT autor: faltan helpers requeridos';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_policy policy_row
    where policy_row.polrelid = 'public.training_tasks'::regclass
      and policy_row.polname = 'training_tasks_select'
      and policy_row.polcmd = 'r'
  ) then
    raise exception 'Tareas SELECT autor: falta policy training_tasks_select FOR SELECT';
  end if;
end;
$$;

alter policy training_tasks_select on public.training_tasks
to authenticated
using (
  (
    author_user_id = auth.uid()
    and public.can_edit_club_data(club_id)
  )
  or public.training_task_authorized(id, 'read')
);

commit;
