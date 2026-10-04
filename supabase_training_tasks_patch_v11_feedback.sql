-- APPCAUDAL · Tareas V1.1 · etapas, variantes e historial de uso/feedback.
-- Aplicar después de la instalación de Tareas V1 y sus patches anteriores.
-- No modifica las policies existentes de tareas, shares ni Storage.
begin;

do $$
begin
  if to_regclass('public.training_tasks') is null then
    raise exception 'Tareas V1.1: falta public.training_tasks';
  end if;
  if to_regprocedure('public.training_task_authorized(uuid,text)') is null
     or to_regprocedure('public.can_edit_club_data(uuid)') is null
     or to_regprocedure('public.training_task_touch()') is null then
    raise exception 'Tareas V1.1: faltan helpers requeridos';
  end if;
end;
$$;

alter table public.training_tasks
  add column if not exists stage_keys text[] not null default '{}'::text[],
  add column if not exists variants text;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'training_tasks'
      and column_name = 'stage_keys' and udt_name = '_text'
      and is_nullable = 'NO' and column_default like '%{}%'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'training_tasks'
      and column_name = 'variants' and data_type = 'text' and is_nullable = 'YES'
  ) then
    raise exception 'Tareas V1.1: stage_keys o variants tienen un contrato incompatible';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.training_tasks'::regclass
      and conname = 'training_tasks_stage_keys_canonical'
      and contype = 'c'
  ) then
    alter table public.training_tasks
      add constraint training_tasks_stage_keys_canonical check (
        stage_keys <@ array[
          'prebenjamin', 'benjamin', 'alevin', 'infantil',
          'cadete', 'juvenil', 'senior'
        ]::text[]
        and array_position(stage_keys, null) is null
        and cardinality(stage_keys) =
          (case when 'prebenjamin' = any(stage_keys) then 1 else 0 end)
          + (case when 'benjamin' = any(stage_keys) then 1 else 0 end)
          + (case when 'alevin' = any(stage_keys) then 1 else 0 end)
          + (case when 'infantil' = any(stage_keys) then 1 else 0 end)
          + (case when 'cadete' = any(stage_keys) then 1 else 0 end)
          + (case when 'juvenil' = any(stage_keys) then 1 else 0 end)
          + (case when 'senior' = any(stage_keys) then 1 else 0 end)
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.training_tasks'::regclass
      and conname = 'training_tasks_variants_format'
      and contype = 'c'
  ) then
    alter table public.training_tasks
      add constraint training_tasks_variants_format check (
        variants is null
        or (
          variants = btrim(variants)
          and char_length(variants) between 1 and 10000
        )
      );
  end if;
end;
$$;

create table if not exists public.training_task_feedback (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.training_tasks(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete restrict,
  author_user_id uuid not null references auth.users(id) on delete restrict,
  -- Reserva nullable para enlazar más adelante una ejecución real de una sesión.
  -- No existe FK porque Sesiones todavía no forma parte de este alcance.
  session_occurrence_id uuid,
  used_on date not null default current_date,
  rating numeric check (
    rating is null
    or (rating = trunc(rating) and rating between 1 and 5)
  ),
  post_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_task_feedback_content check (
    (rating is not null or post_text is not null)
    and (
      post_text is null
      or (
        post_text = btrim(post_text)
        and char_length(post_text) between 1 and 4000
      )
    )
  )
);

do $$
declare
  incompatible boolean;
begin
  select count(*) <> 10
    or bool_or(column_name = 'id' and udt_name <> 'uuid')
    or bool_or(column_name = 'task_id' and udt_name <> 'uuid')
    or bool_or(column_name = 'club_id' and udt_name <> 'uuid')
    or bool_or(column_name = 'author_user_id' and udt_name <> 'uuid')
    or bool_or(column_name = 'session_occurrence_id' and udt_name <> 'uuid')
    or bool_or(column_name = 'used_on' and data_type <> 'date')
    or bool_or(column_name = 'rating' and data_type <> 'numeric')
    or bool_or(column_name = 'post_text' and data_type <> 'text')
    or bool_or(column_name = 'created_at' and data_type <> 'timestamp with time zone')
    or bool_or(column_name = 'updated_at' and data_type <> 'timestamp with time zone')
  into incompatible
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'training_task_feedback'
    and column_name in (
      'id', 'task_id', 'club_id', 'author_user_id', 'session_occurrence_id',
      'used_on', 'rating', 'post_text', 'created_at', 'updated_at'
    );

  if incompatible then
    raise exception 'Tareas V1.1: public.training_task_feedback tiene un contrato incompatible';
  end if;
end;
$$;

create index if not exists training_task_feedback_task_used_idx
  on public.training_task_feedback(task_id, used_on desc, created_at desc);
create index if not exists training_task_feedback_club_task_idx
  on public.training_task_feedback(club_id, task_id);

create or replace function public.training_task_feedback_guard()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare
  task_club_id uuid;
begin
  select task.club_id into task_club_id
  from public.training_tasks task
  where task.id = new.task_id;

  if not found then
    raise exception 'Feedback de tarea: task_id no existe';
  end if;

  if tg_op = 'INSERT' then
    new.id := gen_random_uuid();
    new.club_id := task_club_id;
    new.author_user_id := auth.uid();
    new.created_at := now();
    new.updated_at := new.created_at;
  elsif (
    new.id is distinct from old.id
    or new.task_id is distinct from old.task_id
    or new.club_id is distinct from old.club_id
    or new.author_user_id is distinct from old.author_user_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Feedback de tarea: id, task_id, club_id, author_user_id y created_at son inmutables';
  end if;

  if new.club_id is distinct from task_club_id then
    raise exception 'Feedback de tarea: task_id y club_id no corresponden';
  end if;
  return new;
end;
$$;
alter function public.training_task_feedback_guard() owner to postgres;
revoke all on function public.training_task_feedback_guard() from public, anon, authenticated;

drop trigger if exists training_task_feedback_guard on public.training_task_feedback;
create trigger training_task_feedback_guard
before insert or update on public.training_task_feedback
for each row execute function public.training_task_feedback_guard();

drop trigger if exists training_task_feedback_touch on public.training_task_feedback;
create trigger training_task_feedback_touch
before update on public.training_task_feedback
for each row execute function public.training_task_touch();

alter table public.training_task_feedback enable row level security;

drop policy if exists training_task_feedback_select on public.training_task_feedback;
create policy training_task_feedback_select
on public.training_task_feedback for select to authenticated
using (public.training_task_authorized(task_id, 'read'));

drop policy if exists training_task_feedback_insert on public.training_task_feedback;
create policy training_task_feedback_insert
on public.training_task_feedback for insert to authenticated
with check (
  author_user_id = auth.uid()
  and public.can_edit_club_data(club_id)
  and public.training_task_authorized(task_id, 'read')
);

drop policy if exists training_task_feedback_update on public.training_task_feedback;
create policy training_task_feedback_update
on public.training_task_feedback for update to authenticated
using (
  author_user_id = auth.uid()
  and public.training_task_authorized(task_id, 'read')
)
with check (
  author_user_id = auth.uid()
  and public.training_task_authorized(task_id, 'read')
);

drop policy if exists training_task_feedback_delete on public.training_task_feedback;
create policy training_task_feedback_delete
on public.training_task_feedback for delete to authenticated
using (
  author_user_id = auth.uid()
  and public.training_task_authorized(task_id, 'read')
);

revoke all on table public.training_task_feedback from public, anon, authenticated;
grant select, insert, update, delete on table public.training_task_feedback to authenticated;
grant select, insert, update, delete on table public.training_task_feedback to service_role;

comment on column public.training_tasks.stage_keys is
  'Claves canónicas de etapas aplicables; una tarea admite varias etapas.';
comment on column public.training_tasks.variants is
  'Variantes previstas de la ficha maestra, texto plano y máximo 10000 caracteres.';
comment on table public.training_task_feedback is
  'Historial por uso de una tarea; rating opcional 1-5 y/o POST, nunca sobrescribe otros usos.';
comment on column public.training_task_feedback.used_on is
  'Fecha funcional editable en la que se utilizó la tarea; distinta de created_at.';
comment on column public.training_task_feedback.session_occurrence_id is
  'Reserva nullable para una futura ejecución de sesión; deliberadamente sin FK en V1.1.';

commit;
