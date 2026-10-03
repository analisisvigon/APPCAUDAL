-- APPCAUDAL · Tareas V1. Migración local: revisar y ejecutar manualmente.
begin;

create table if not exists public.training_tasks (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
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
  editor_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_tasks_players_range check (players_min is null or players_max is null or players_min <= players_max)
);

create table if not exists public.training_task_shares (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.training_tasks(id) on delete cascade,
  membership_id uuid not null references public.club_memberships(id) on delete cascade,
  shared_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (task_id, membership_id)
);

create index if not exists training_tasks_club_updated_idx on public.training_tasks(club_id, updated_at desc);
create index if not exists training_tasks_author_idx on public.training_tasks(author_user_id);
create index if not exists training_task_shares_membership_idx on public.training_task_shares(membership_id);

create or replace function public.set_training_tasks_updated_at()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists set_training_tasks_updated_at on public.training_tasks;
create trigger set_training_tasks_updated_at before update on public.training_tasks
for each row execute function public.set_training_tasks_updated_at();

alter table public.training_tasks enable row level security;
alter table public.training_task_shares enable row level security;

drop policy if exists training_tasks_select on public.training_tasks;
create policy training_tasks_select on public.training_tasks for select to authenticated using (
  author_user_id = auth.uid()
  or exists (select 1 from public.training_task_shares share join public.club_memberships membership on membership.id = share.membership_id where share.task_id = training_tasks.id and membership.user_id = auth.uid() and membership.is_active and membership.role in ('owner','admin','staff'))
);
drop policy if exists training_tasks_insert on public.training_tasks;
create policy training_tasks_insert on public.training_tasks for insert to authenticated with check (
  author_user_id = auth.uid() and exists (select 1 from public.club_memberships membership where membership.club_id = training_tasks.club_id and membership.user_id = auth.uid() and membership.is_active and membership.role in ('owner','admin','staff'))
);
drop policy if exists training_tasks_update on public.training_tasks;
create policy training_tasks_update on public.training_tasks for update to authenticated using (author_user_id = auth.uid()) with check (author_user_id = auth.uid());
drop policy if exists training_tasks_delete on public.training_tasks;
create policy training_tasks_delete on public.training_tasks for delete to authenticated using (author_user_id = auth.uid());

drop policy if exists training_task_shares_select on public.training_task_shares;
create policy training_task_shares_select on public.training_task_shares for select to authenticated using (
  exists (select 1 from public.training_tasks task where task.id = training_task_shares.task_id and task.author_user_id = auth.uid())
  or exists (select 1 from public.club_memberships membership where membership.id = training_task_shares.membership_id and membership.user_id = auth.uid() and membership.is_active)
);
drop policy if exists training_task_shares_insert on public.training_task_shares;
create policy training_task_shares_insert on public.training_task_shares for insert to authenticated with check (
  exists (select 1 from public.training_tasks task where task.id = training_task_shares.task_id and task.author_user_id = auth.uid())
  and exists (select 1 from public.club_memberships membership where membership.id = training_task_shares.membership_id and membership.club_id = (select club_id from public.training_tasks where id = training_task_shares.task_id) and membership.is_active and membership.role in ('owner','admin','staff'))
);
drop policy if exists training_task_shares_delete on public.training_task_shares;
create policy training_task_shares_delete on public.training_task_shares for delete to authenticated using (exists (select 1 from public.training_tasks task where task.id = training_task_shares.task_id and task.author_user_id = auth.uid()));

revoke all on table public.training_tasks, public.training_task_shares from public, anon;
grant select, insert, update, delete on table public.training_tasks, public.training_task_shares to authenticated;

-- Storage: bucket privado. No se crea automáticamente desde la app.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('training-task-files', 'training-task-files', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf']::text[])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists training_task_files_select on storage.objects;
create policy training_task_files_select on storage.objects for select to authenticated using (
  bucket_id = 'training-task-files' and exists (select 1 from public.training_tasks task where (task.preview_path = name or task.attachment_path = name) and (task.author_user_id = auth.uid() or exists (select 1 from public.training_task_shares share join public.club_memberships membership on membership.id = share.membership_id where share.task_id = task.id and membership.user_id = auth.uid() and membership.is_active)))
);
drop policy if exists training_task_files_insert on storage.objects;
create policy training_task_files_insert on storage.objects for insert to authenticated with check (bucket_id = 'training-task-files' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists training_task_files_update on storage.objects;
create policy training_task_files_update on storage.objects for update to authenticated using (bucket_id = 'training-task-files' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists training_task_files_delete on storage.objects;
create policy training_task_files_delete on storage.objects for delete to authenticated using (bucket_id = 'training-task-files' and (storage.foldername(name))[1] = auth.uid()::text);

commit;
