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
  add column if not exists external_source text,
  add column if not exists external_player_id text,
  add column if not exists yellow_cards_count integer,
  add column if not exists card_alert boolean not null default false,
  add column if not exists sent_off_alert boolean not null default false,
  add column if not exists suspended_alert boolean not null default false,
  add column if not exists injured_alert boolean not null default false,
  add column if not exists alert_since date,
  add column if not exists alert_match text,
  add column if not exists alert_note text,
  add column if not exists doubtful boolean not null default false,
  add column if not exists active_in_squad boolean not null default true,
  add column if not exists field_sources jsonb not null default '{}'::jsonb,
  add column if not exists tactical_role text,
  add column if not exists tactical_slot integer,
  add column if not exists tactical_reserve_slot integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'jugadores_rivales_tactical_role_check') then
    alter table public.jugadores_rivales add constraint jugadores_rivales_tactical_role_check
      check (tactical_role is null or tactical_role in ('Titular', 'Reserva'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'jugadores_rivales_tactical_slot_check') then
    alter table public.jugadores_rivales add constraint jugadores_rivales_tactical_slot_check
      check (tactical_slot is null or tactical_slot between 0 and 10);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'jugadores_rivales_tactical_reserve_slot_check') then
    alter table public.jugadores_rivales add constraint jugadores_rivales_tactical_reserve_slot_check
      check (tactical_reserve_slot is null or tactical_reserve_slot between 0 and 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'jugadores_rivales_tactical_placement_check') then
    alter table public.jugadores_rivales add constraint jugadores_rivales_tactical_placement_check
      check (
        (tactical_role is null and tactical_slot is null and tactical_reserve_slot is null)
        or (tactical_role = 'Titular' and tactical_slot is not null and tactical_reserve_slot is null)
        or (tactical_role = 'Reserva' and tactical_slot is not null and tactical_reserve_slot is not null)
      );
  end if;
end $$;

alter table if exists public.equipos_rivales
  add column if not exists field_sources jsonb not null default '{}'::jsonb;

create unique index if not exists jugadores_rivales_external_identity_uidx
on public.jugadores_rivales (equipo_rival_id, external_source, external_player_id)
where external_source is not null and external_player_id is not null;

create unique index if not exists jugadores_rivales_tactical_starter_slot_uidx
on public.jugadores_rivales (equipo_rival_id, tactical_slot)
where tactical_role = 'Titular' and tactical_slot is not null;

create unique index if not exists jugadores_rivales_tactical_reserve_slot_uidx
on public.jugadores_rivales (equipo_rival_id, tactical_slot, tactical_reserve_slot)
where tactical_role = 'Reserva' and tactical_slot is not null and tactical_reserve_slot is not null;

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

comment on column public.jugadores_rivales.active_in_squad is
'True si pertenece a la plantilla actual. False conserva la fila y sus relaciones en el historico.';

comment on column public.jugadores_rivales.field_sources is
'Origen y fecha de actualizacion por campo. Ejemplo: {"position":{"source":"manual","updatedAt":"..."}}.';

comment on column public.jugadores_rivales.tactical_role is
'Ubicacion actual en el editor tactico: Titular, Reserva o null si esta sin colocar.';

comment on column public.jugadores_rivales.tactical_slot is
'Indice estable del puesto dentro del sistema tactico actual, entre 0 y 10.';

comment on column public.jugadores_rivales.tactical_reserve_slot is
'Hueco de reserva del puesto tactico: 0 o 1. Nunca se admite una tercera reserva.';

comment on column public.equipos_rivales.field_sources is
'Origen y fecha de actualizacion por campo de identidad del rival: nombre, estadio, sistema, color y escudo.';

create table if not exists public.rival_sync_history (
  id bigint generated by default as identity primary key,
  equipo_rival_id uuid not null references public.equipos_rivales(id) on delete cascade,
  source text not null,
  source_url text,
  players_found integer not null default 0,
  new_players integer not null default 0,
  updated_players integer not null default 0,
  missing_players integer not null default 0,
  conflicts integer not null default 0,
  manual_overwrites integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists rival_sync_history_team_created_idx
on public.rival_sync_history (equipo_rival_id, created_at desc);

alter table public.rival_sync_history enable row level security;

drop policy if exists "Authenticated staff can read rival sync history" on public.rival_sync_history;
create policy "Authenticated staff can read rival sync history"
on public.rival_sync_history for select to authenticated using (true);

drop policy if exists "Authenticated staff can create rival sync history" on public.rival_sync_history;
create policy "Authenticated staff can create rival sync history"
on public.rival_sync_history for insert to authenticated with check (true);

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
