-- Multiclub 02B. Instalacion MANUAL tras revisar este archivo.
-- Fuente: nexoclub_02b_24_pares_uuid_aprobados.csv
-- SHA-256: CC5E6C5AE04BB8FE849B1A98CD2FB25B469EEA0E7FEA2B97AA1108304E2924D5
-- Solo persiste vinculos en legacy_jugador_cts_links_v1. El manifiesto es
-- TEMPORAL y desaparece al terminar la transaccion. No copia fechas.
-- Si cualquier comprobacion falla, la transaccion aborta; ejecutar ROLLBACK.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local search_path = pg_catalog;

create temporary table nexoclub_02b_approved_pairs (
  jugador_id uuid primary key,
  club_team_season_player_id uuid not null unique
) on commit drop;

-- Pares EXACTOS del CSV aprobado; ni nombres ni JOIN generan nuevos pares.
insert into pg_temp.nexoclub_02b_approved_pairs
  (jugador_id, club_team_season_player_id)
values
  ('b0216a5d-4317-4ec8-b791-3d7d7924da12', '42493002-8c26-49d7-a40e-853e268ccfc4'),
  ('00406430-d43b-46c5-96ab-ba1ade89f862', '49936f79-9f54-4270-b83d-74ac4ea53047'),
  ('2e0146e9-e9fc-45ad-b055-edc138a85f7e', 'c9c8a2c2-95ea-42a8-b9ab-b288a999da0b'),
  ('513adcde-7df1-4d04-89da-be2a55a25a3c', 'df52835e-a140-47df-896c-ca591d31baab'),
  ('14bc2739-7afe-453a-ad11-0a47141ca8d8', '7766a52a-012b-4dc0-a49d-25ebd5c6cdae'),
  ('af4060e4-b54a-4e43-94b8-ccd600e7e784', 'e34ef1d4-da91-4f3e-a7c1-958542b5873c'),
  ('405e20ed-6648-4843-b223-54f7a6f3838f', 'e2cecc26-2849-49b8-8956-274c017b1b1e'),
  ('b78a67b1-47d5-40aa-8528-77d1ec487284', '1eed88e8-899c-403c-8ce5-37356c079eb3'),
  ('faffde7c-33a9-446c-99ce-c76aefba5a0d', '70ec7379-2abe-4072-8874-f7c913e0c366'),
  ('31f6f2fb-15fb-4ba9-8557-97e57f37841a', '49f82504-8bf5-4562-abdd-b4b768f257d5'),
  ('778c4e89-d806-4b7f-b7e5-072b1269fcb4', 'e1c1ddc8-0fa9-4498-90db-b68757bebacf'),
  ('f7f5aaeb-e82b-4e6b-8920-694bc32cb6c7', '616c52aa-a4b7-40ef-b8fc-b332063dc1fd'),
  ('237e4872-1be0-432e-965a-2262c110c7e0', '5eef8265-1c0e-41ae-9367-9505ca1945f6'),
  ('52b68efa-2087-44a0-8f9f-96ed0f612a82', '45b5e7af-6934-4f22-826e-3dfa004e4e72'),
  ('c5029ff1-5668-4efd-b91c-ccd4d2836232', '45c8c207-9218-4d9a-9f3e-25a542178964'),
  ('e65fe80b-db97-4192-9bf9-9aba36c70de2', '8e451cec-1e9f-4699-b1c9-6bfdd96d12d7'),
  ('b812a22a-2e3d-4a70-9e4c-c78c661db6e8', '8bfb8969-c530-44bd-836a-c3ace47da11f'),
  ('4712860e-8578-47b8-8505-5127b16a3231', 'be1b9bd0-833b-49eb-84c6-19cecbbd8d09'),
  ('a9c06993-8bc6-4a84-b947-19a0fbc0bec1', 'abb063fc-c4ef-4645-992d-1424ce267562'),
  ('2aa728c2-828b-4d20-916b-03f6b43bd906', '3964d0b5-060a-4c1e-bb14-08f14ef93659'),
  ('2e9baa0d-4a7a-4127-b2f5-6da7644c20e2', '0df271d7-74b6-40e7-b7ec-5a41982f3d0e'),
  ('f742956d-2c46-4334-9c0c-e80d0498c45d', 'e9f9bf5a-79e2-4c82-afff-37d4806a2de5'),
  ('1b1906d7-a97c-4184-ad20-17f7a021cbbd', 'd67fe9e5-ccfb-43b7-8553-a25bba2e5377'),
  ('912a4e7b-c472-4a06-8ee7-ccdcacd82bc8', 'dddf3715-df36-47b7-ac87-faefed916228');

do $link$
declare
  v_cts constant uuid := '961970c8-0fcf-4c45-94d6-787647619c61';
  v_club constant uuid := 'ca0da100-0000-4000-8000-000000000001';
  v_team constant uuid := '85a16f33-9fe5-44d4-b85d-37d73651ebf6';
  v_season constant uuid := 'a858d03b-aa54-49f5-bdb1-8c8b3b533dae';
  v_count bigint;
  v_inserted bigint;
begin
  -- Impide que cambien identidades, pertenencias o vinculos entre el control
  -- y el INSERT. Si hay actividad concurrente, lock_timeout aborta sin cambios.
  lock table public.club_team_seasons, public.club_team_season_players,
    public.player_team_memberships, public.jugadores,
    public.legacy_jugador_cts_links_v1 in share row exclusive mode;

  select count(*) into v_count from pg_temp.nexoclub_02b_approved_pairs;
  if v_count <> 24 then
    raise exception '02B: el manifiesto no contiene exactamente 24 pares';
  end if;

  if not exists (
    select 1 from public.club_team_seasons cts
    join public.club_teams team
      on team.id = cts.team_id and team.club_id = cts.club_id
    join public.club_seasons season
      on season.id = cts.season_id and season.club_id = cts.club_id
    where cts.id = v_cts and cts.club_id = v_club
      and cts.team_id = v_team and cts.season_id = v_season
  ) then
    raise exception '02B: el CTS Caudal 2026/2027 no coincide con lo aprobado';
  end if;

  -- Cada par debe existir y conservar global_player_id, etapa, equipo,
  -- club, temporada y una pertenencia CTSP no anulada.
  select count(*) into v_count
  from pg_temp.nexoclub_02b_approved_pairs approved
  join public.jugadores ficha on ficha.id = approved.jugador_id
  join public.players_database global_player
    on global_player.id = ficha.global_player_id
  join public.player_team_memberships stage
    on stage.id = ficha.membership_id
   and stage.player_id = ficha.global_player_id
  join public.club_team_season_players roster
    on roster.id = approved.club_team_season_player_id
   and roster.player_id = ficha.global_player_id
   and roster.voided_at is null
  join public.club_team_seasons cts
    on cts.id = roster.club_team_season_id
   and cts.team_id = stage.team_id
  join public.club_teams team
    on team.id = cts.team_id and team.club_id = cts.club_id
  join public.club_seasons season
    on season.id = cts.season_id and season.club_id = cts.club_id
  where cts.id = v_cts and cts.club_id = v_club
    and cts.team_id = v_team and cts.season_id = v_season;
  if v_count <> 24 then
    raise exception '02B: uno o mas pares ya no acreditan la misma identidad, equipo o CTS';
  end if;

  -- La exportacion aprobada tenia UNA pertenencia CTSP candidata por ficha.
  -- Si aparecio otra fila para el mismo jugador/equipo, detenerse y revisar.
  if exists (
    select 1
    from pg_temp.nexoclub_02b_approved_pairs approved
    join public.jugadores ficha on ficha.id = approved.jugador_id
    join public.player_team_memberships stage on stage.id = ficha.membership_id
    where (
      select count(*)
      from public.club_team_season_players roster
      join public.club_team_seasons cts
        on cts.id = roster.club_team_season_id
      where roster.voided_at is null
        and roster.player_id = ficha.global_player_id
        and cts.team_id = stage.team_id
    ) <> 1
  ) then
    raise exception '02B: aparecio una pertenencia CTSP adicional o falta una candidata';
  end if;

  -- La revision tambien acreditaba una sola ficha por pertenencia CTSP.
  if exists (
    select 1
    from pg_temp.nexoclub_02b_approved_pairs approved
    join public.club_team_season_players roster
      on roster.id = approved.club_team_season_player_id
    join public.club_team_seasons cts
      on cts.id = roster.club_team_season_id
    where (
      select count(*)
      from public.jugadores other_ficha
      join public.player_team_memberships other_stage
        on other_stage.id = other_ficha.membership_id
      where other_ficha.global_player_id = roster.player_id
        and other_stage.team_id = cts.team_id
    ) <> 1
  ) then
    raise exception '02B: una pertenencia CTSP tiene otra ficha candidata';
  end if;

  if exists (
    select 1 from public.legacy_jugador_cts_links_v1 existing
    join pg_temp.nexoclub_02b_approved_pairs approved
      on approved.jugador_id = existing.jugador_id
    where existing.club_team_season_player_id
      <> approved.club_team_season_player_id
  ) or exists (
    select 1 from public.legacy_jugador_cts_links_v1 existing
    join pg_temp.nexoclub_02b_approved_pairs approved
      on approved.club_team_season_player_id
       = existing.club_team_season_player_id
    where existing.jugador_id <> approved.jugador_id
  ) then
    raise exception '02B: vinculo previo incompatible; no sustituir ni duplicar';
  end if;

  -- Primera ejecucion: inserta los ausentes. Segunda: inserta cero.
  insert into public.legacy_jugador_cts_links_v1
    (jugador_id, club_team_season_player_id)
  select approved.jugador_id, approved.club_team_season_player_id
  from pg_temp.nexoclub_02b_approved_pairs approved
  where not exists (
    select 1 from public.legacy_jugador_cts_links_v1 existing
    where existing.jugador_id = approved.jugador_id
  );
  get diagnostics v_inserted = row_count;

  select count(*) into v_count
  from pg_temp.nexoclub_02b_approved_pairs approved
  join public.legacy_jugador_cts_links_v1 binding
    on binding.jugador_id = approved.jugador_id
   and binding.club_team_season_player_id
       = approved.club_team_season_player_id;
  if v_count <> 24 then
    raise exception '02B: comprobacion final incompleta; transaccion abortada';
  end if;

  raise notice '02B: 24 pares comprobados; nuevos vinculos insertados: %',
    v_inserted;
end
$link$;

commit;
