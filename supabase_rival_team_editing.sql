alter table if exists public.jugadores_rivales
  add column if not exists specific_position text,
  add column if not exists dob date,
  add column if not exists foot text,
  add column if not exists height text,
  add column if not exists notes text,
  add column if not exists captain boolean not null default false,
  add column if not exists observed boolean not null default false,
  add column if not exists source_profile_url text,
  add column if not exists image_source text,
  add column if not exists yellow_cards_count integer,
  add column if not exists card_alert boolean not null default false,
  add column if not exists sent_off_alert boolean not null default false,
  add column if not exists suspended_alert boolean not null default false,
  add column if not exists injured_alert boolean not null default false,
  add column if not exists alert_since date,
  add column if not exists alert_match text,
  add column if not exists alert_note text;

comment on column public.jugadores_rivales.position is
'Posicion natural estable del jugador. La posicion tactica de partido se guarda en equipo_rival_alineacion/equipo_rival_banquillo.';

comment on column public.jugadores_rivales.specific_position is
'Detalle manual de la posicion natural, sin afectar a la ubicacion tactica en una alineacion.';

comment on column public.jugadores_rivales.image is
'URL de retrato del jugador rival. Las subidas de la app se guardan en Storage bucket rival-player-assets.';

comment on column public.jugadores_rivales.source_profile_url is
'URL externa del perfil del jugador usada para conciliacion de importaciones.';

comment on column public.jugadores_rivales.yellow_cards_count is
'Amonestaciones conocidas introducidas o aceptadas manualmente. No se calcula automaticamente si la fuente no lo indica.';

comment on column public.jugadores_rivales.card_alert is
'Alerta manual por amonestaciones para el proximo partido.';

comment on column public.jugadores_rivales.sent_off_alert is
'Alerta manual de expulsion registrada en un partido observado.';

comment on column public.jugadores_rivales.suspended_alert is
'Alerta manual de sancion o no disponibilidad actual.';

comment on column public.jugadores_rivales.injured_alert is
'Alerta manual de lesion actual.';

comment on column public.jugadores_rivales.alert_note is
'Observacion contextual de las alertas actuales del jugador rival.';

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
