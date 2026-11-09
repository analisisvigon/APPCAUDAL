-- SOLO LECTURA. No instala ni invoca recuperaciones, altas o borrados.
-- Ejecutar manualmente en SQL Editor y compartir los resultados para acreditar
-- el estado instalado. auth.uid() puede ser NULL en SQL Editor: esto no simula STAFF.

select signature, to_regprocedure(signature) is not null as installed,
  p.prosecdef as security_definer, p.proconfig, md5(p.prosrc) as definition_hash
from (values
  ('public.my_access_contexts_v1()'),
  ('public.can_read_club_team_season(uuid)'),
  ('public.can_write_club_team_season(uuid)'),
  ('public.my_cts_jugadores_v1(uuid)'),
  ('public.my_cts_roster_links_v1(uuid)'),
  ('public.create_own_player_atomic_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb)'),
  ('public.create_operational_player_v1(uuid,uuid,jsonb,jsonb)'),
  ('public.can_write_operational_cts_v1(uuid)'),
  ('public.recover_nexo_test_player_cts_link_v1(uuid,uuid)')
) required(signature)
left join pg_proc p on p.oid = to_regprocedure(signature);

select cts.id as cts_id, cts.club_id, cts.team_id,
  team.code, legacy_team.name, season.label, season.status,
  count(roster.id) as total_memberships,
  count(roster.id) filter (where roster.has_departed and roster.voided_at is null) as departed_preserved,
  count(roster.id) filter (where not roster.has_departed and roster.voided_at is null
    and roster.left_on is null) as active_memberships,
  count(roster.id) filter (where not roster.has_departed and roster.voided_at is null
    and roster.left_on is null and exists (
      select 1 from public.legacy_jugador_cts_links_v1 binding
      join public.jugadores ficha on ficha.id = binding.jugador_id
        and ficha.global_player_id = roster.player_id and ficha.active_in_squad
      join public.player_team_memberships stage on stage.id = ficha.membership_id
        and stage.player_id = roster.player_id and stage.team_id = cts.team_id
      where binding.club_team_season_player_id = roster.id
    )) as active_linked_memberships
from public.club_team_seasons cts
join public.club_teams team on team.id = cts.team_id and team.club_id = cts.club_id
join public.club_seasons season on season.id = cts.season_id and season.club_id = cts.club_id
join public.equipos_rivales legacy_team on legacy_team.id = team.id
left join public.club_team_season_players roster on roster.club_team_season_id = cts.id
where cts.id = '961970c8-0fcf-4c45-94d6-787647619c61'::uuid
  and cts.club_id = 'ca0da100-0000-4000-8000-000000000001'::uuid
  and cts.team_id = '85a16f33-9fe5-44d4-b85d-37d73651ebf6'::uuid
group by cts.id, cts.club_id, cts.team_id, team.code, legacy_team.name, season.label, season.status;

-- Inventario: no concede membresías ni permisos. STAFF debe tener asignación.
select member.id as membership_id, member.user_id, member.role, member.is_active,
  exists (select 1 from public.club_team_season_permissions permission
    where permission.membership_id = member.id and permission.club_id = member.club_id
      and permission.club_team_season_id = '961970c8-0fcf-4c45-94d6-787647619c61'::uuid
  ) as explicitly_assigned_to_target
from public.club_memberships member
where member.club_id = 'ca0da100-0000-4000-8000-000000000001'::uuid
order by member.role, member.id;

-- Permite contrastar las definiciones reales con las versiones del repositorio.
select p.oid::regprocedure as signature, pg_get_functiondef(p.oid) as definition
from pg_proc p
where p.oid in (
  to_regprocedure('public.can_read_club_team_season(uuid)'),
  to_regprocedure('public.can_write_club_team_season(uuid)'),
  to_regprocedure('public.my_cts_roster_links_v1(uuid)'),
  to_regprocedure('public.my_cts_jugadores_v1(uuid)'),
  to_regprocedure('public.create_own_player_atomic_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb)'),
  to_regprocedure('public.create_operational_player_v1(uuid,uuid,jsonb,jsonb)')
);
