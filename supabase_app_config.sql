create table if not exists public.app_config (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

create policy "Authenticated staff can read app config"
on public.app_config
for select
to authenticated
using (true);

create policy "Authenticated staff can write app config"
on public.app_config
for insert
to authenticated
with check (true);

create policy "Authenticated staff can update app config"
on public.app_config
for update
to authenticated
using (true)
with check (true);
