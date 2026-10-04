-- APPCAUDAL · Tareas V1 · campo funcional task_code.
-- Aplicar sobre una instalación existente; no sustituye la migración inicial.
begin;

do $$
begin
  if to_regclass('public.training_tasks') is null then
    raise exception 'Tareas task_code: falta public.training_tasks';
  end if;
end;
$$;

alter table public.training_tasks
add column if not exists task_code text;

do $$
declare
  column_type text;
  column_nullable text;
  column_default text;
begin
  select columns.data_type, columns.is_nullable, columns.column_default
  into column_type, column_nullable, column_default
  from information_schema.columns
  where columns.table_schema = 'public'
    and columns.table_name = 'training_tasks'
    and columns.column_name = 'task_code';

  if column_type is distinct from 'text'
     or column_nullable is distinct from 'YES'
     or column_default is not null then
    raise exception 'Tareas task_code: contrato incompatible (tipo %, nullable %, default %)',
      column_type, column_nullable, column_default;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.training_tasks'::regclass
      and constraint_row.conname = 'training_tasks_task_code_format'
      and constraint_row.contype = 'c'
  ) then
    alter table public.training_tasks
    add constraint training_tasks_task_code_format check (
      task_code is null
      or (
        task_code = btrim(task_code)
        and char_length(task_code) between 1 and 40
      )
    );
  end if;
end;
$$;

comment on column public.training_tasks.task_code is
  'Código funcional opcional, no único, conservado con mayúsculas y tildes; máximo 40 caracteres sin espacios exteriores.';

commit;
