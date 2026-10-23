-- Multiclub 03, fases A/B: SOLO LECTURA. Ejecutar manualmente tras instalar.
-- Tras fase A se esperan 7 funciones de la primera consulta; tras fase B, 9.
select to_regprocedure('public.my_cts_jugadores_v1(uuid)') is not null
         as phase_a_roster_present,
       to_regprocedure('public.create_own_player_atomic_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb)')
         is not null as phase_b_create_present,
       to_regprocedure('public.link_existing_global_player_to_cts_v1(uuid,uuid)')
         is not null as phase_b_existing_profile_link_present;

select md5(pg_get_functiondef(
  to_regprocedure('public.create_own_player_atomic(uuid,jsonb,jsonb,jsonb,jsonb)')))
  as legacy_own_player_create_definition_hash;

select p.oid::regprocedure as function_name, p.prosecdef as security_definer,
       p.proowner = 'postgres'::regrole as owned_by_postgres,
       'search_path=pg_catalog' = any(p.proconfig) as fixed_search_path,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
       not has_function_privilege('anon', p.oid, 'EXECUTE') as anon_cannot_execute,
       not exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) acl
         where acl.grantee = 0 and acl.privilege_type = 'EXECUTE') as public_cannot_execute
from pg_proc p
where p.oid in (
  to_regprocedure('public.my_cts_jugadores_v1(uuid)'),
  to_regprocedure('public.my_cts_roster_links_v1(uuid)'),
  to_regprocedure('public.legacy_jugador_in_match_cts_v1(uuid,uuid)'),
  to_regprocedure('public.legacy_jugador_in_cts_v1(uuid,uuid)'),
  to_regprocedure('public.can_read_match_snapshot_v1(uuid)'),
  to_regprocedure('public.can_write_match_snapshot_v1(uuid)'),
  to_regprocedure('public.legacy_jugador_in_snapshot_cts_v1(uuid,uuid)'),
  to_regprocedure('public.create_own_player_atomic_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb)'),
  to_regprocedure('public.link_existing_global_player_to_cts_v1(uuid,uuid)')
)
order by p.oid::regprocedure::text;

select position('legacy_jugador_cts_links_v1' in p.prosrc) > 0
    as roster_rpc_uses_exact_links,
  position('stage.team_id = cts.team_id' in p.prosrc) > 0
    as roster_rpc_checks_team
from pg_proc p where p.oid =
  to_regprocedure('public.my_cts_roster_links_v1(uuid)');

select position('legacy_jugador_cts_links_v1' in p.prosrc) > 0
         as roster_rows_use_exact_links,
       position('public.can_read_club_team_season(cts.id)' in p.prosrc) > 0
         as roster_rows_check_cts_permission
from pg_proc p where p.oid =
  to_regprocedure('public.my_cts_jugadores_v1(uuid)');

select p.oid::regprocedure as substitution_rpc,
       p.prosecdef as security_definer,
       p.proowner = 'postgres'::regrole as owned_by_postgres,
       'search_path=pg_catalog' = any(p.proconfig) as fixed_search_path,
       position('is_app_staff()' in p.prosrc) = 0 as legacy_guard_removed,
       position(case when p.proname = 'get_match_substitution_events'
         then 'public.can_read_match(p_partido_id)'
         else 'public.can_write_match(p_partido_id)' end in p.prosrc) > 0
         as cts_guard_present
from pg_proc p
where p.oid in (
  to_regprocedure('public.get_match_substitution_events(uuid)'),
  to_regprocedure('public.mutate_match_substitution_atomic(text,uuid,uuid,jsonb,integer)')
);

-- Contratos concretos de fase B. Tras instalar B todas deben ser true.
select
  (select a.atttypid = 'pg_catalog.text'::regtype from pg_attribute a
   where a.attrelid = 'public.player_team_memberships'::regclass
     and a.attname = 'season' and not a.attisdropped) as stage_season_is_text,
  (select a.atttypid = 'pg_catalog.text'::regtype from pg_attribute a
   where a.attrelid = 'public.club_seasons'::regclass
     and a.attname = 'label' and not a.attisdropped) as canonical_season_label_is_text,
  (select p.prosecdef and p.proowner = 'postgres'::regrole
      and 'search_path=pg_catalog' = any(p.proconfig)
      and position('public.can_read_club_team_season(target_club_team_season_id)' in p.prosrc) > 0
      and position('season.status = ''open''' in p.prosrc) > 0
   from pg_proc p where p.oid =
     to_regprocedure('public.can_write_club_team_season(uuid)'))
     as write_helper_checks_permission_and_open_season,
  (select not p.prosecdef
      and position('global_id := nullif(p_player ->> ''id''' in p.prosrc) > 0
      and position('if p_membership is not null' in p.prosrc) > 0
   from pg_proc p where p.oid =
     to_regprocedure('public.save_global_player_profile(jsonb,jsonb,jsonb,jsonb,jsonb)'))
     as global_save_uses_new_id_and_optional_membership,
  (select position('target_season_label' in p.prosrc) > 0
      and position('target_season_label, requested_start_date' in p.prosrc) > 0
      and position('CTS_START_DATE_OUTSIDE_SEASON' in p.prosrc) > 0
      and position('insert into public.players_database' in p.prosrc) > 0
      and position('returning id into created_global_id' in p.prosrc) > 0
      and position('insert into public.player_positions' in p.prosrc) > 0
      and position('insert into public.player_sources' in p.prosrc) > 0
      and position('insert into public.player_scouting_traits' in p.prosrc) > 0
      and position('save_global_player_profile(' in p.prosrc) = 0
      and position('update public.players_database' in p.prosrc) = 0
   from pg_proc p where p.oid =
     to_regprocedure('public.create_own_player_atomic_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb)'))
     as new_profile_uses_cts_label_and_cannot_update_global_id,
  (select position('public.can_write_club_team_season(p_club_team_season_id)' in p.prosrc) > 0
      and position('public.has_club_role(source_cts.club_id' in p.prosrc) > 0
      and position('roster.voided_at is null' in p.prosrc) > 0
      and position('left join public.legacy_jugador_cts_links_v1' in p.prosrc) > 0
      and position('source_team.id is null' in p.prosrc) > 0
      and position('GLOBAL_PLAYER_HAS_CURRENT_STAGE_REVIEW_REQUIRED' in p.prosrc) > 0
      and position('insert into public.club_team_season_players' in p.prosrc) > 0
      and position('insert into public.jugadores' in p.prosrc) = 0
      and position('save_global_player_profile' in p.prosrc) = 0
   from pg_proc p where p.oid =
     to_regprocedure('public.link_existing_global_player_to_cts_v1(uuid,uuid)'))
     as existing_profile_link_is_canonical_only;

-- Antes del corte deben seguir vigentes las cuatro politicas legacy por tabla.
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in (
  'jugadores', 'partidos', 'players_database', 'player_team_memberships',
  'club_team_season_players', 'legacy_jugador_cts_links_v1'
)
order by tablename, policyname;

-- Pruebas funcionales pendientes con sesiones authenticated en ensayo:
-- alta nueva en CTS abierto; CTS cerrado/ajeno denegado; nombre global ya
-- existente denegado sin duplicar; enlace existente por owner/admin con acceso
-- tambien al club de origen; staff, origen ajeno y etapa actual denegados.
-- Confirmar que la RPC de enlace NO crea ficha legacy y que un error en la
-- insercion CTSP revierte la nueva etapa. Nunca probar como postgres/service_role.
