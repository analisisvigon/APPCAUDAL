alter table if exists public.jugadores_rivales
  add column if not exists specific_position text,
  add column if not exists dob date,
  add column if not exists foot text,
  add column if not exists height text,
  add column if not exists notes text,
  add column if not exists captain boolean not null default false,
  add column if not exists observed boolean not null default false;

comment on column public.jugadores_rivales.position is
'Posicion natural estable del jugador. La posicion tactica de partido se guarda en equipo_rival_alineacion/equipo_rival_banquillo.';

comment on column public.jugadores_rivales.specific_position is
'Detalle manual de la posicion natural, sin afectar a la ubicacion tactica en una alineacion.';

comment on column public.jugadores_rivales.image is
'URL de retrato del jugador rival. Las subidas de la app se guardan en Storage bucket rival-player-assets.';

insert into storage.buckets (id, name, public)
values ('rival-player-assets', 'rival-player-assets', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "Authenticated staff can read rival player assets" on storage.objects;
create policy "Authenticated staff can read rival player assets"
on storage.objects
for select
to authenticated
using (bucket_id = 'rival-player-assets');

drop policy if exists "Authenticated staff can upload rival player assets" on storage.objects;
create policy "Authenticated staff can upload rival player assets"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'rival-player-assets');

drop policy if exists "Authenticated staff can update rival player assets" on storage.objects;
create policy "Authenticated staff can update rival player assets"
on storage.objects
for update
to authenticated
using (bucket_id = 'rival-player-assets')
with check (bucket_id = 'rival-player-assets');

drop policy if exists "Authenticated staff can delete rival player assets" on storage.objects;
create policy "Authenticated staff can delete rival player assets"
on storage.objects
for delete
to authenticated
using (bucket_id = 'rival-player-assets');
