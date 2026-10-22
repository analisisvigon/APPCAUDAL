-- Multiclub 03, fases A/B: SOLO LECTURA. Ejecutar manualmente tras instalar.
-- Tras fase A se esperan 7 funciones de la primera consulta; tras fase B, 8.
select to_regprocedure('public.my_cts_jugadores_v1(uuid)') is not null
         as phase_a_roster_present,
       to_regprocedure('public.create_own_player_atomic_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb)')
         is not null as phase_b_create_present;

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
  to_regprocedure('public.create_own_player_atomic_v2(uuid,uuid,jsonb,jsonb,jsonb,jsonb)')
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

-- Antes del corte deben seguir vigentes las cuatro politicas legacy por tabla.
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('jugadores', 'partidos')
order by tablename, policyname;
