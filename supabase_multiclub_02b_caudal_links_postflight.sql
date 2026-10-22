-- Multiclub 02B: SOLO LECTURA. Ejecutar manualmente despues del COMMIT.
-- Compara los mismos 24 pares UUID aprobados, sin usar nombres ni inferencias.
-- Fuente CSV SHA-256: CC5E6C5AE04BB8FE849B1A98CD2FB25B469EEA0E7FEA2B97AA1108304E2924D5

with approved(jugador_id, club_team_season_player_id) as (
  values
    ('b0216a5d-4317-4ec8-b791-3d7d7924da12'::uuid, '42493002-8c26-49d7-a40e-853e268ccfc4'::uuid),
    ('00406430-d43b-46c5-96ab-ba1ade89f862'::uuid, '49936f79-9f54-4270-b83d-74ac4ea53047'::uuid),
    ('2e0146e9-e9fc-45ad-b055-edc138a85f7e'::uuid, 'c9c8a2c2-95ea-42a8-b9ab-b288a999da0b'::uuid),
    ('513adcde-7df1-4d04-89da-be2a55a25a3c'::uuid, 'df52835e-a140-47df-896c-ca591d31baab'::uuid),
    ('14bc2739-7afe-453a-ad11-0a47141ca8d8'::uuid, '7766a52a-012b-4dc0-a49d-25ebd5c6cdae'::uuid),
    ('af4060e4-b54a-4e43-94b8-ccd600e7e784'::uuid, 'e34ef1d4-da91-4f3e-a7c1-958542b5873c'::uuid),
    ('405e20ed-6648-4843-b223-54f7a6f3838f'::uuid, 'e2cecc26-2849-49b8-8956-274c017b1b1e'::uuid),
    ('b78a67b1-47d5-40aa-8528-77d1ec487284'::uuid, '1eed88e8-899c-403c-8ce5-37356c079eb3'::uuid),
    ('faffde7c-33a9-446c-99ce-c76aefba5a0d'::uuid, '70ec7379-2abe-4072-8874-f7c913e0c366'::uuid),
    ('31f6f2fb-15fb-4ba9-8557-97e57f37841a'::uuid, '49f82504-8bf5-4562-abdd-b4b768f257d5'::uuid),
    ('778c4e89-d806-4b7f-b7e5-072b1269fcb4'::uuid, 'e1c1ddc8-0fa9-4498-90db-b68757bebacf'::uuid),
    ('f7f5aaeb-e82b-4e6b-8920-694bc32cb6c7'::uuid, '616c52aa-a4b7-40ef-b8fc-b332063dc1fd'::uuid),
    ('237e4872-1be0-432e-965a-2262c110c7e0'::uuid, '5eef8265-1c0e-41ae-9367-9505ca1945f6'::uuid),
    ('52b68efa-2087-44a0-8f9f-96ed0f612a82'::uuid, '45b5e7af-6934-4f22-826e-3dfa004e4e72'::uuid),
    ('c5029ff1-5668-4efd-b91c-ccd4d2836232'::uuid, '45c8c207-9218-4d9a-9f3e-25a542178964'::uuid),
    ('e65fe80b-db97-4192-9bf9-9aba36c70de2'::uuid, '8e451cec-1e9f-4699-b1c9-6bfdd96d12d7'::uuid),
    ('b812a22a-2e3d-4a70-9e4c-c78c661db6e8'::uuid, '8bfb8969-c530-44bd-836a-c3ace47da11f'::uuid),
    ('4712860e-8578-47b8-8505-5127b16a3231'::uuid, 'be1b9bd0-833b-49eb-84c6-19cecbbd8d09'::uuid),
    ('a9c06993-8bc6-4a84-b947-19a0fbc0bec1'::uuid, 'abb063fc-c4ef-4645-992d-1424ce267562'::uuid),
    ('2aa728c2-828b-4d20-916b-03f6b43bd906'::uuid, '3964d0b5-060a-4c1e-bb14-08f14ef93659'::uuid),
    ('2e9baa0d-4a7a-4127-b2f5-6da7644c20e2'::uuid, '0df271d7-74b6-40e7-b7ec-5a41982f3d0e'::uuid),
    ('f742956d-2c46-4334-9c0c-e80d0498c45d'::uuid, 'e9f9bf5a-79e2-4c82-afff-37d4806a2de5'::uuid),
    ('1b1906d7-a97c-4184-ad20-17f7a021cbbd'::uuid, 'd67fe9e5-ccfb-43b7-8553-a25bba2e5377'::uuid),
    ('912a4e7b-c472-4a06-8ee7-ccdcacd82bc8'::uuid, 'dddf3715-df36-47b7-ac87-faefed916228'::uuid)
), checked as (
  select approved.jugador_id,
         approved.club_team_season_player_id as expected_ctsp_id,
         binding.club_team_season_player_id as actual_ctsp_id,
         binding.club_team_season_player_id
           = approved.club_team_season_player_id as exact_pair,
         coalesce(
           global_player.id is not null
           and ficha.global_player_id = stage.player_id
           and ficha.global_player_id = roster.player_id
           and roster.voided_at is null
           and stage.team_id = relation.team_id
           and team.club_id = relation.club_id
           and season.club_id = relation.club_id
           and relation.id = '961970c8-0fcf-4c45-94d6-787647619c61'::uuid
           and relation.club_id = 'ca0da100-0000-4000-8000-000000000001'::uuid
           and relation.team_id = '85a16f33-9fe5-44d4-b85d-37d73651ebf6'::uuid
           and relation.season_id = 'a858d03b-aa54-49f5-bdb1-8c8b3b533dae'::uuid
           and (
             select count(*)
             from public.club_team_season_players other_roster
             join public.club_team_seasons other_cts
               on other_cts.id = other_roster.club_team_season_id
             where other_roster.voided_at is null
               and other_roster.player_id = ficha.global_player_id
               and other_cts.team_id = stage.team_id
           ) = 1
           and (
             select count(*)
             from public.jugadores other_ficha
             join public.player_team_memberships other_stage
               on other_stage.id = other_ficha.membership_id
             where other_ficha.global_player_id = roster.player_id
               and other_stage.team_id = relation.team_id
           ) = 1,
           false
         ) as identity_and_cts_valid
  from approved
  left join public.legacy_jugador_cts_links_v1 binding
    on binding.jugador_id = approved.jugador_id
  left join public.jugadores ficha on ficha.id = approved.jugador_id
  left join public.players_database global_player
    on global_player.id = ficha.global_player_id
  left join public.player_team_memberships stage
    on stage.id = ficha.membership_id
  left join public.club_team_season_players roster
    on roster.id = binding.club_team_season_player_id
  left join public.club_team_seasons relation
    on relation.id = roster.club_team_season_id
  left join public.club_teams team on team.id = relation.team_id
  left join public.club_seasons season on season.id = relation.season_id
), duplicate_ctsp as (
  select club_team_season_player_id
  from public.legacy_jugador_cts_links_v1
  group by club_team_season_player_id having count(*) > 1
), unexpected_ctsp_use as (
  select binding.jugador_id
  from public.legacy_jugador_cts_links_v1 binding
  join approved
    on approved.club_team_season_player_id
     = binding.club_team_season_player_id
  where binding.jugador_id <> approved.jugador_id
), unapproved_cauda_links as (
  select binding.jugador_id
  from public.legacy_jugador_cts_links_v1 binding
  join public.club_team_season_players roster
    on roster.id = binding.club_team_season_player_id
  where roster.club_team_season_id
    = '961970c8-0fcf-4c45-94d6-787647619c61'::uuid
    and not exists (
      select 1 from approved
      where approved.jugador_id = binding.jugador_id
        and approved.club_team_season_player_id
            = binding.club_team_season_player_id
    )
)
select count(*) as approved_pair_count,
       count(*) filter (where exact_pair is true) as exact_link_count,
       count(*) filter (where exact_pair is not true) as missing_or_wrong_links,
       count(*) filter (where not identity_and_cts_valid)
         as identity_or_cts_errors,
       (select count(*) from duplicate_ctsp) as duplicate_ctsp_links,
       (select count(*) from unexpected_ctsp_use) as ctsp_used_by_other_ficha,
       (select count(*) from unapproved_cauda_links)
         as unapproved_links_in_caudal_cts,
       coalesce(
         jsonb_agg(jsonb_build_object(
           'jugador_id', jugador_id,
           'expected_ctsp_id', expected_ctsp_id,
           'actual_ctsp_id', actual_ctsp_id
         ) order by jugador_id)
           filter (where exact_pair is not true
                     or not identity_and_cts_valid),
         '[]'::jsonb
       ) as pairs_requiring_review,
       (count(*) = 24
        and count(*) filter (where exact_pair is true) = 24
        and count(*) filter (where not identity_and_cts_valid) = 0
        and (select count(*) from duplicate_ctsp) = 0
        and (select count(*) from unexpected_ctsp_use) = 0
        and (select count(*) from unapproved_cauda_links) = 0)
         as installation_verified
from checked;

-- Comparar con el postflight anterior: la transaccion no toca politicas RLS.
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('jugadores', 'partidos')
order by tablename, policyname;
