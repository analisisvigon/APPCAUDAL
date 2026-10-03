-- APPCAUDAL · Tareas V1 · primera instalación local, todavía no aplicada.
-- Requiere Club Core (clubs, club_memberships y can_edit_club_data).
-- No contiene datos médicos, secretos ni binarios en editor_payload.
begin;

do $$
begin
  if to_regprocedure('public.can_edit_club_data(uuid)') is null then
    raise exception 'Tareas V1 requiere Club Core: public.can_edit_club_data(uuid)';
  end if;
  if to_regclass('public.training_tasks') is not null
    or to_regclass('public.training_task_shares') is not null
    or to_regprocedure('public.training_task_authorized(uuid,text)') is not null
    or to_regprocedure('public.training_task_storage_allowed(text,text)') is not null
    or to_regprocedure('public.training_task_path_matches(text,uuid,uuid,uuid)') is not null
    or to_regprocedure('public.training_task_row_guard()') is not null
    or to_regprocedure('public.training_task_touch()') is not null
    or exists (
      select 1 from pg_proc function_entry
      join pg_namespace namespace_entry on namespace_entry.oid = function_entry.pronamespace
      where namespace_entry.nspname = 'public' and function_entry.proname like 'training_task_%'
    )
    or exists (select 1 from storage.buckets where id = 'training-task-files')
    or exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'training_task_files_%') then
    raise exception 'Tareas V1: contrato previo detectado; inspeccionar antes de instalar';
  end if;
end;
$$;

create table public.training_tasks (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  author_user_id uuid not null references auth.users(id) on delete restrict,
  name text not null check (char_length(trim(name)) > 0),
  description text,
  objective text not null check (char_length(trim(objective)) > 0),
  task_type text not null default 'Otro',
  players_spec text,
  players_min integer check (players_min is null or players_min >= 0),
  players_max integer check (players_max is null or players_max >= 0),
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  space_width_m numeric(7,2) check (space_width_m is null or space_width_m > 0),
  space_length_m numeric(7,2) check (space_length_m is null or space_length_m > 0),
  material text,
  technical_content text,
  tactical_content text,
  game_phase text check (game_phase is null or game_phase in ('offensive', 'defensive', 'transition', 'set_piece')),
  game_moment text,
  observations text,
  preview_path text,
  attachment_path text,
  attachment_name text,
  attachment_mime text,
  attachment_size bigint check (attachment_size is null or attachment_size > 0),
  editor_payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(editor_payload) = 'object' and octet_length(editor_payload::text) <= 262144),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_tasks_players_range check (players_min is null or players_max is null or players_min <= players_max),
  constraint training_tasks_phase_moment check (
    (game_phase is null and game_moment is null)
    or (game_phase = 'offensive' and (game_moment is null or game_moment in ('build_up','creation','finishing')))
    or (game_phase = 'defensive' and (game_moment is null or game_moment in ('high_block','mid_block','low_block')))
    or (game_phase = 'transition' and (game_moment is null or game_moment in ('offensive_transition','defensive_transition')))
    or (game_phase = 'set_piece' and (game_moment is null or game_moment in ('offensive_set_piece','defensive_set_piece')))
  )
);

create table public.training_task_shares (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.training_tasks(id) on delete cascade,
  membership_id uuid not null references public.club_memberships(id) on delete cascade,
  shared_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (task_id, membership_id)
);

create index training_tasks_club_updated_idx on public.training_tasks(club_id, updated_at desc);
create index training_tasks_author_idx on public.training_tasks(author_user_id);
create index training_task_shares_membership_idx on public.training_task_shares(membership_id);

-- Permisos acíclicos: este helper solo lee tablas base con propietario postgres.
-- Devuelve un booleano; nunca expone filas ni modifica datos.
create function public.training_task_authorized(p_task_id uuid, p_action text)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select exists (
    select 1 from public.training_tasks task
    where task.id = p_task_id
      and auth.uid() is not null
      and public.can_edit_club_data(task.club_id)
      and (
        task.author_user_id = auth.uid()
        or (p_action = 'read' and exists (
          select 1 from public.training_task_shares share
          join public.club_memberships recipient on recipient.id = share.membership_id
          where share.task_id = task.id
            and recipient.club_id = task.club_id
            and recipient.user_id = auth.uid()
            and recipient.is_active
            and recipient.role in ('owner','admin','staff')
        ))
      )
      and p_action in ('read','write','share')
  );
$$;
alter function public.training_task_authorized(uuid,text) owner to postgres;

-- {club_id}/{task_id}/{author_id}/{attachment|preview}-{file_uuid}-{safe_name}
create function public.training_task_path_matches(p_path text, p_club_id uuid, p_task_id uuid, p_author_id uuid)
returns boolean language sql immutable security invoker set search_path = pg_catalog as $$
  select p_path is not null
    and split_part(p_path, '/', 1) = p_club_id::text
    and split_part(p_path, '/', 2) = p_task_id::text
    and split_part(p_path, '/', 3) = p_author_id::text
    and split_part(p_path, '/', 4) ~ '^(attachment|preview)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[a-z0-9][a-z0-9._-]*$'
    and split_part(p_path, '/', 5) = '';
$$;

create function public.training_task_row_guard()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id or new.club_id is distinct from old.club_id
    or new.author_user_id is distinct from old.author_user_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Tareas: id, club_id, author_user_id y created_at son inmutables';
  end if;
  if new.preview_path is not null and not public.training_task_path_matches(new.preview_path, new.club_id, new.id, new.author_user_id) then
    raise exception 'Tareas: preview_path no pertenece a esta tarea';
  end if;
  if new.attachment_path is not null and not public.training_task_path_matches(new.attachment_path, new.club_id, new.id, new.author_user_id) then
    raise exception 'Tareas: attachment_path no pertenece a esta tarea';
  end if;
  return new;
end;
$$;

create function public.training_task_touch()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger training_task_row_guard before insert or update on public.training_tasks
for each row execute function public.training_task_row_guard();
create trigger training_task_touch before update on public.training_tasks
for each row execute function public.training_task_touch();

-- Storage se autoriza por identidad estructurada y por tarea existente.
-- READ compartido necesita referencia exacta. El autor puede leer y limpiar
-- su propio upload pendiente mientras la tarea exista y siga siendo STAFF.
create function public.training_task_storage_allowed(p_path text, p_action text)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select exists (
    select 1 from public.training_tasks task
    where public.training_task_path_matches(p_path, task.club_id, task.id, task.author_user_id)
      and auth.uid() is not null
      and public.can_edit_club_data(task.club_id)
      and (
        (p_action = 'read' and (task.preview_path = p_path or task.attachment_path = p_path)
          and public.training_task_authorized(task.id, 'read'))
        or (p_action = 'write' and task.author_user_id = auth.uid())
      )
  );
$$;
alter function public.training_task_storage_allowed(text,text) owner to postgres;

revoke all on function public.training_task_authorized(uuid,text), public.training_task_path_matches(text,uuid,uuid,uuid), public.training_task_row_guard(), public.training_task_touch(), public.training_task_storage_allowed(text,text) from public, anon;
grant execute on function public.training_task_authorized(uuid,text), public.training_task_path_matches(text,uuid,uuid,uuid), public.training_task_row_guard(), public.training_task_touch(), public.training_task_storage_allowed(text,text) to authenticated;

alter table public.training_tasks enable row level security;
alter table public.training_task_shares enable row level security;

create policy training_tasks_select on public.training_tasks for select to authenticated
using (public.training_task_authorized(id, 'read'));
create policy training_tasks_insert on public.training_tasks for insert to authenticated
with check (author_user_id = auth.uid() and public.can_edit_club_data(club_id));
create policy training_tasks_update on public.training_tasks for update to authenticated
using (public.training_task_authorized(id, 'write'))
with check (public.training_task_authorized(id, 'write'));
create policy training_tasks_delete on public.training_tasks for delete to authenticated
using (public.training_task_authorized(id, 'write'));

create policy training_task_shares_select on public.training_task_shares for select to authenticated
using (
  public.training_task_authorized(task_id, 'share')
  or (public.training_task_authorized(task_id, 'read') and exists (
    select 1 from public.club_memberships recipient
    where recipient.id = membership_id and recipient.user_id = auth.uid()
      and recipient.is_active and recipient.role in ('owner','admin','staff')
  ))
);
create policy training_task_shares_insert on public.training_task_shares for insert to authenticated
with check (
  public.training_task_authorized(task_id, 'share')
  and shared_by_user_id = auth.uid()
  and exists (
    select 1 from public.training_tasks task
    join public.club_memberships recipient on recipient.id = membership_id
    where task.id = task_id and task.author_user_id = auth.uid()
      and recipient.club_id = task.club_id and recipient.user_id <> auth.uid()
      and recipient.is_active and recipient.role in ('owner','admin','staff')
  )
);
create policy training_task_shares_delete on public.training_task_shares for delete to authenticated
using (public.training_task_authorized(task_id, 'share'));

revoke all on table public.training_tasks, public.training_task_shares from public, anon, authenticated;
grant select, insert, update, delete on table public.training_tasks to authenticated;
grant select, insert, delete on table public.training_task_shares to authenticated;
grant select, insert, update, delete on table public.training_tasks, public.training_task_shares to service_role;
-- service_role conserva acceso administrativo/BYPASSRLS según Supabase; nunca en cliente.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('training-task-files', 'training-task-files', false, 10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']::text[]);

create policy training_task_files_select on storage.objects for select to authenticated
using (bucket_id = 'training-task-files' and (
  public.training_task_storage_allowed(name, 'read')
  or public.training_task_storage_allowed(name, 'write')
));
create policy training_task_files_insert on storage.objects for insert to authenticated
with check (bucket_id = 'training-task-files' and public.training_task_storage_allowed(name, 'write'));
create policy training_task_files_update on storage.objects for update to authenticated
using (bucket_id = 'training-task-files' and public.training_task_storage_allowed(name, 'write'))
with check (bucket_id = 'training-task-files' and public.training_task_storage_allowed(name, 'write'));
create policy training_task_files_delete on storage.objects for delete to authenticated
using (bucket_id = 'training-task-files' and public.training_task_storage_allowed(name, 'write'));

comment on table public.training_tasks is 'Tareas reutilizables independientes de sesiones; solo STAFF activo del club y receptores explícitos.';
comment on column public.training_tasks.editor_payload is 'JSON futuro del editor, hasta 262144 bytes serializados; sin datos médicos, secretos ni binarios/base64.';
comment on table public.training_task_shares is 'Compartición individual mediante membership activa del mismo club.';

commit;
