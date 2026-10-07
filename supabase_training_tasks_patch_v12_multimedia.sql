-- APPCAUDAL · Tareas / Multimedia V1 · contrato de datos, RLS y Storage.
-- Aplicar después de Tareas V1, sus patches de autor/código y Tareas V1.1.
-- No migra ni elimina preview_path/attachment_* legacy.
begin;

do $$
begin
  if to_regclass('public.training_tasks') is null
     or to_regprocedure('public.training_task_authorized(uuid,text)') is null
     or to_regprocedure('public.training_task_storage_allowed(text,text)') is null then
    raise exception 'Multimedia V1 requiere la instalación completa de Tareas V1';
  end if;
  if not exists (
    select 1 from storage.buckets
    where id = 'training-task-files' and name = 'training-task-files'
      and public = false and file_size_limit = 10485760
      and allowed_mime_types @> array['image/jpeg','image/png','image/webp','application/pdf']::text[]
      and allowed_mime_types <@ array['image/jpeg','image/png','image/webp','application/pdf']::text[]
  ) then
    raise exception 'Multimedia V1: el bucket training-task-files no conserva el contrato privado de 10 MiB y MIME vigente';
  end if;
end;
$$;

create table if not exists public.training_task_media (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.training_tasks(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete restrict,
  author_user_id uuid not null references auth.users(id) on delete restrict,
  kind text not null,
  source text not null,
  storage_path text,
  original_url text,
  provider text,
  provider_key text,
  original_name text,
  mime_type text,
  size_bytes bigint,
  title text,
  caption text,
  sort_order integer not null default 10,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_task_media_kind check (kind in ('image','document','video','link')),
  constraint training_task_media_source check (source in ('upload','url')),
  constraint training_task_media_provider check (provider is null or provider in ('youtube','vimeo','direct','external')),
  constraint training_task_media_sort_order check (sort_order >= 0),
  constraint training_task_media_text_lengths check (
    (title is null or (title = btrim(title) and char_length(title) between 1 and 160))
    and (caption is null or (caption = btrim(caption) and char_length(caption) between 1 and 2000))
  ),
  constraint training_task_media_source_contract check (
    (
      source = 'upload'
      and storage_path is not null and char_length(storage_path) between 1 and 1024
      and original_url is null and provider is null and provider_key is null
      and original_name is not null and original_name = btrim(original_name)
      and char_length(original_name) between 1 and 255
      and mime_type is not null
      and mime_type in ('image/jpeg','image/png','image/webp','application/pdf')
      and size_bytes is not null and size_bytes between 1 and 10485760
      and (
        (kind = 'image' and mime_type in ('image/jpeg','image/png','image/webp'))
        or (kind = 'document' and mime_type = 'application/pdf')
      )
    )
    or (
      source = 'url'
      and storage_path is null and original_name is null and mime_type is null and size_bytes is null
      and original_url is not null and char_length(original_url) between 9 and 2048
      and original_url ~ '^https://[^[:space:]<>]+$'
      and original_url !~ '["'']'
      and lower(original_url) !~ '/embed/'
      and lower(original_url) !~ '^https://player\.vimeo\.com/'
      and provider is not null
      and (
        (provider = 'youtube' and kind = 'video'
          and lower(original_url) ~ '^https://([a-z0-9-]+\.)?(youtube\.com|youtu\.be)/'
          and provider_key is not null and provider_key ~ '^[A-Za-z0-9_-]{6,64}$')
        or (provider = 'vimeo' and kind = 'video'
          and lower(original_url) ~ '^https://([a-z0-9-]+\.)?vimeo\.com/'
          and provider_key is not null and provider_key ~ '^[0-9]{1,32}$')
        or (provider = 'direct' and kind = 'video'
          and lower(original_url) ~ '\.(mp4|webm|m3u8)([?#].*)?$'
          and provider_key is null)
        or (provider = 'external' and kind = 'link' and provider_key is null
          and lower(original_url) !~ '^https://([a-z0-9-]+\.)?(youtube\.com|youtu\.be|vimeo\.com)/'
          and lower(original_url) !~ '\.(mp4|webm|m3u8)([?#].*)?$')
      )
    )
  )
);

do $$
declare
  incompatible boolean;
begin
  select count(*) <> 19
    or bool_or(column_name = 'id' and udt_name <> 'uuid')
    or bool_or(column_name = 'task_id' and udt_name <> 'uuid')
    or bool_or(column_name = 'club_id' and udt_name <> 'uuid')
    or bool_or(column_name = 'author_user_id' and udt_name <> 'uuid')
    or bool_or(column_name in ('kind','source','storage_path','original_url','provider','provider_key','original_name','mime_type','title','caption') and data_type <> 'text')
    or bool_or(column_name = 'size_bytes' and data_type <> 'bigint')
    or bool_or(column_name = 'sort_order' and data_type <> 'integer')
    or bool_or(column_name = 'is_primary' and data_type <> 'boolean')
    or bool_or(column_name in ('created_at','updated_at') and data_type <> 'timestamp with time zone')
  into incompatible
  from information_schema.columns
  where table_schema = 'public' and table_name = 'training_task_media';

  if incompatible or exists (
    select 1 from (values
      ('training_task_media_kind'), ('training_task_media_source'),
      ('training_task_media_provider'), ('training_task_media_sort_order'),
      ('training_task_media_text_lengths'), ('training_task_media_source_contract')
    ) required(name)
    where not exists (
      select 1 from pg_catalog.pg_constraint constraint_entry
      where constraint_entry.conrelid = 'public.training_task_media'::regclass
        and constraint_entry.conname = required.name and constraint_entry.contype = 'c'
    )
  ) then
    raise exception 'Multimedia V1: public.training_task_media tiene un contrato incompatible';
  end if;
end;
$$;

create index if not exists training_task_media_task_order_idx
  on public.training_task_media(task_id, sort_order, created_at, id);
create unique index if not exists training_task_media_one_primary_idx
  on public.training_task_media(task_id) where is_primary;

-- {club_id}/{task_id}/{author_id}/media-{media_id}-{safe_name}
create or replace function public.training_task_media_path_matches(
  p_path text, p_club_id uuid, p_task_id uuid, p_author_id uuid, p_media_id uuid
)
returns boolean language sql immutable security invoker set search_path = pg_catalog as $$
  select p_path is not null
    and split_part(p_path, '/', 1) = p_club_id::text
    and split_part(p_path, '/', 2) = p_task_id::text
    and split_part(p_path, '/', 3) = p_author_id::text
    and split_part(p_path, '/', 4) = 'media-' || p_media_id::text || '-' ||
      regexp_replace(split_part(p_path, '/', 4), '^media-[0-9a-f-]{36}-', '')
    and split_part(p_path, '/', 4) ~ ('^media-' || p_media_id::text || '-[a-z0-9][a-z0-9._-]*$')
    and split_part(p_path, '/', 5) = '';
$$;
alter function public.training_task_media_path_matches(text,uuid,uuid,uuid,uuid) owner to postgres;

create or replace function public.training_task_media_guard()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare
  task_club_id uuid;
  task_author_user_id uuid;
begin
  select task.club_id, task.author_user_id
  into task_club_id, task_author_user_id
  from public.training_tasks task
  where task.id = new.task_id;

  if not found then
    raise exception 'Multimedia de tarea: task_id no existe';
  end if;
  if auth.uid() is null or task_author_user_id is distinct from auth.uid()
     or not public.training_task_authorized(new.task_id, 'write') then
    raise exception 'Multimedia de tarea: solo el autor STAFF activo puede modificarla';
  end if;

  if tg_op = 'INSERT' then
    new.club_id := task_club_id;
    new.author_user_id := task_author_user_id;
    new.created_at := now();
    new.updated_at := new.created_at;
  elsif new.id is distinct from old.id
    or new.task_id is distinct from old.task_id
    or new.club_id is distinct from old.club_id
    or new.author_user_id is distinct from old.author_user_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Multimedia de tarea: id, task_id, club_id, author_user_id y created_at son inmutables';
  else
    new.updated_at := now();
  end if;

  if new.club_id is distinct from task_club_id or new.author_user_id is distinct from task_author_user_id then
    raise exception 'Multimedia de tarea: identidad no corresponde con la tarea';
  end if;
  if new.source = 'upload' and not public.training_task_media_path_matches(
    new.storage_path, new.club_id, new.task_id, new.author_user_id, new.id
  ) then
    raise exception 'Multimedia de tarea: storage_path no corresponde con su fila';
  end if;
  return new;
end;
$$;
alter function public.training_task_media_guard() owner to postgres;

drop trigger if exists training_task_media_guard on public.training_task_media;
create trigger training_task_media_guard
before insert or update on public.training_task_media
for each row execute function public.training_task_media_guard();

alter table public.training_task_media enable row level security;

drop policy if exists training_task_media_select on public.training_task_media;
create policy training_task_media_select on public.training_task_media for select to authenticated
using (public.training_task_authorized(task_id, 'read'));
drop policy if exists training_task_media_insert on public.training_task_media;
create policy training_task_media_insert on public.training_task_media for insert to authenticated
with check (author_user_id = auth.uid() and public.training_task_authorized(task_id, 'write'));
drop policy if exists training_task_media_update on public.training_task_media;
create policy training_task_media_update on public.training_task_media for update to authenticated
using (author_user_id = auth.uid() and public.training_task_authorized(task_id, 'write'))
with check (author_user_id = auth.uid() and public.training_task_authorized(task_id, 'write'));
drop policy if exists training_task_media_delete on public.training_task_media;
create policy training_task_media_delete on public.training_task_media for delete to authenticated
using (author_user_id = auth.uid() and public.training_task_authorized(task_id, 'write'));

-- Conserva exactamente la rama legacy y añade media solo contra una fila exacta.
create or replace function public.training_task_storage_allowed(p_path text, p_action text)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select
    exists (
      select 1 from public.training_tasks task
      where public.training_task_path_matches(p_path, task.club_id, task.id, task.author_user_id)
        and auth.uid() is not null
        and public.can_edit_club_data(task.club_id)
        and (
          (p_action = 'read' and (task.preview_path = p_path or task.attachment_path = p_path)
            and public.training_task_authorized(task.id, 'read'))
          or (p_action = 'write' and task.author_user_id = auth.uid())
        )
    )
    or exists (
      select 1
      from public.training_task_media media
      where media.source = 'upload'
        and media.storage_path = p_path
        and public.training_task_media_path_matches(
          p_path, media.club_id, media.task_id, media.author_user_id, media.id
        )
        and (
          (p_action = 'read' and public.training_task_authorized(media.task_id, 'read'))
          or (p_action = 'write' and media.author_user_id = auth.uid()
            and public.training_task_authorized(media.task_id, 'write'))
        )
    );
$$;
alter function public.training_task_storage_allowed(text,text) owner to postgres;

revoke all on function public.training_task_media_path_matches(text,uuid,uuid,uuid,uuid),
  public.training_task_media_guard() from public, anon, authenticated;
grant execute on function public.training_task_media_path_matches(text,uuid,uuid,uuid,uuid) to authenticated;
revoke all on table public.training_task_media from public, anon, authenticated;
grant select, insert, update, delete on table public.training_task_media to authenticated;
grant select, insert, update, delete on table public.training_task_media to service_role;

comment on table public.training_task_media is
  'Multimedia múltiple de Tareas V1: uploads privados o URLs HTTPS; fuera de editor_payload.';
comment on column public.training_task_media.storage_path is
  'Ruta privada exacta. El objeto Storage se borra antes de la fila; ON DELETE CASCADE no borra bytes.';
comment on column public.training_task_media.provider is
  'youtube, vimeo, direct (MP4/WEBM/M3U8) o external; nunca una URL embed o signed URL.';

commit;
