-- APPCAUDAL - Verify transaccional del publication gate de PLAYER match stats.
-- Ejecutar completo despues de Club Core 27. Termina siempre en ROLLBACK.

begin;

create temporary table player_match_stats_gate_results (
  seq integer generated always as identity,
  test_name text not null,
  test_ok boolean not null,
  details text not null
) on commit drop;

create or replace function pg_temp.add_player_match_stats_gate_check(
  p_name text,
  p_ok boolean,
  p_details text
)
returns void
language sql
volatile
security definer
set search_path = pg_catalog
as $function$
  insert into pg_temp.player_match_stats_gate_results (test_name, test_ok, details)
  values (p_name, coalesce(p_ok, false), coalesce(p_details, ''));
$function$;

with target as (
  select procedure.*
  from pg_catalog.pg_proc procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.get_my_player_analysis_match_stats(text,text,text)'
  )
)
select pg_temp.add_player_match_stats_gate_check(
  'CONTRACT_signature_security_acl',
  target.oid is not null
    and target.pronargs = 3
    and target.pronargdefaults = 3
    and pg_catalog.pg_get_function_identity_arguments(target.oid) =
      'p_competition_scope text, p_venue text, p_window text'
    and pg_catalog.replace(pg_catalog.pg_get_function_result(target.oid), '"', '') =
      'TABLE(match_id uuid, match_date date, opponent text, opponent_crest text, competition_key text, competition_name text, is_home boolean, minutes integer, event_count integer, goals integer, shots integer, shots_on_target integer, shot_accuracy_percentage numeric, crosses integer, turnovers integer, steals integer, fouls_committed integer, fouls_received integer)'
    and pg_catalog.pg_get_userbyid(target.proowner) = 'postgres'
    and target.prosecdef
    and target.provolatile = 's'
    and target.proconfig = array['search_path=pg_catalog']::text[]
    and not pg_catalog.has_function_privilege('anon', target.oid, 'EXECUTE')
    and pg_catalog.has_function_privilege('authenticated', target.oid, 'EXECUTE')
    and pg_catalog.has_function_privilege('service_role', target.oid, 'EXECUTE'),
  'firma, DTO, owner, SECURITY DEFINER, STABLE, search_path y ACL intactos'
)
from target;

with helper as (
  select procedure.*
  from pg_catalog.pg_proc procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.is_player_match_publishable(text,text,timestamp with time zone)'
  )
)
select pg_temp.add_player_match_stats_gate_check(
  'GATE_helper_contract',
  helper.oid is not null
    and helper.prorettype = 'pg_catalog.bool'::regtype
    and helper.provolatile = 's'
    and not helper.prosecdef
    and helper.pronargs = 3
    and helper.pronargdefaults = 1
    and helper.proconfig = array['search_path=pg_catalog']::text[]
    and pg_catalog.strpos(
      helper.prosrc, 'at time zone ''Europe/Madrid'''
    ) > 0
    and pg_catalog.strpos(
      helper.prosrc, 'return madrid_today > match_day'
    ) > 0
    and helper.prosrc ~ '''aplazado'', ''postponed'', ''suspendido'', ''suspended'''
    and helper.prosrc ~ '''cancelado'', ''cancelled'', ''canceled'''
    and not pg_catalog.has_function_privilege('anon', helper.oid, 'EXECUTE')
    and not pg_catalog.has_function_privilege('authenticated', helper.oid, 'EXECUTE')
    and not pg_catalog.has_function_privilege('service_role', helper.oid, 'EXECUTE'),
  'helper interno: Madrid, siguiente dia estricto y estados especiales cerrados'
)
from helper;

with target as (
  select procedure.*
  from pg_catalog.pg_proc procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.get_my_player_analysis_match_stats(text,text,text)'
  )
)
select pg_temp.add_player_match_stats_gate_check(
  'GATE_canonical_only',
  (
    select pg_catalog.count(*) = 1
    from pg_catalog.regexp_matches(
      target.prosrc,
      $regex$public[.]is_player_match_publishable[[:space:]]*[(][[:space:]]*serialized[.]payload[[:space:]]*->>[[:space:]]*'status'[[:space:]]*,[[:space:]]*serialized[.]payload[[:space:]]*->>[[:space:]]*'date'[[:space:]]*[)]$regex$,
      'g'
    )
  )
    and pg_catalog.strpos(target.prosrc, 'player_visible') = 0
    and target.prosrc !~
      $legacy$pg_catalog[.]lower[[:space:]]*[(][[:space:]]*pg_catalog[.]btrim[[:space:]]*[(][[:space:]]*coalesce[[:space:]]*[(][[:space:]]*serialized[.]payload[[:space:]]*->>[[:space:]]*'status'[[:space:]]*,[[:space:]]*''[[:space:]]*[)][[:space:]]*[)][[:space:]]*[)][[:space:]]+in[[:space:]]*[(][[:space:]]*'finalizado'[[:space:]]*,[[:space:]]*'jugado'[[:space:]]*,[[:space:]]*'played'[[:space:]]*,[[:space:]]*'finished'$legacy$,
  'una llamada canonica; cero player_visible y cero allowlist legacy'
)
from target;

with functions as (
  select match_stats.prosrc as match_source, live_stats.prosrc as live_source
  from pg_catalog.pg_proc match_stats
  cross join pg_catalog.pg_proc live_stats
  where match_stats.oid = pg_catalog.to_regprocedure(
      'public.get_my_player_analysis_match_stats(text,text,text)'
    )
    and live_stats.oid = pg_catalog.to_regprocedure(
      'public.get_my_player_analysis_live_stats(text,text,text)'
    )
)
select pg_temp.add_player_match_stats_gate_check(
  'GATE_live_stats_parity',
  functions.match_source ~ 'public[.]is_player_match_publishable'
    and functions.live_source ~ 'public[.]is_player_match_publishable'
    and pg_catalog.strpos(functions.match_source, 'player_visible') = 0
    and pg_catalog.strpos(functions.live_source, 'player_visible') = 0
    and pg_catalog.strpos(functions.match_source, 'match_row.delegated_data_status = ''Validado''') > 0
    and pg_catalog.strpos(functions.live_source, 'match_row.delegated_data_status = ''Validado''') > 0
    and pg_catalog.strpos(functions.match_source, 'event.reviewed is true') > 0
    and pg_catalog.strpos(functions.live_source, 'event.reviewed is true') > 0,
  'publication, Validado y reviewed efectivos iguales en ambas RPC'
)
from functions;

do $verify$
declare
  club_id_value constant uuid := 'ca0da100-0000-4000-8000-000000000001'::uuid;
  player_user_id uuid;
  player_id uuid;
  player_name text;
  other_player_id uuid;
  owner_user_id uuid;
  staff_user_id uuid;
  viewer_user_id constant uuid := 'b4270000-0000-4000-8000-000000000026'::uuid;
  viewer_membership_id uuid;
  no_membership_user_id constant uuid := 'b4270000-0000-4000-8000-000000000027'::uuid;
  fixture_ids constant uuid[] := array[
    'b4270000-0000-4000-8000-000000000001'::uuid,
    'b4270000-0000-4000-8000-000000000002'::uuid,
    'b4270000-0000-4000-8000-000000000003'::uuid,
    'b4270000-0000-4000-8000-000000000004'::uuid,
    'b4270000-0000-4000-8000-000000000005'::uuid,
    'b4270000-0000-4000-8000-000000000006'::uuid,
    'b4270000-0000-4000-8000-000000000007'::uuid,
    'b4270000-0000-4000-8000-000000000008'::uuid,
    'b4270000-0000-4000-8000-000000000009'::uuid,
    'b4270000-0000-4000-8000-000000000010'::uuid,
    'b4270000-0000-4000-8000-000000000011'::uuid,
    'b4270000-0000-4000-8000-000000000012'::uuid,
    'b4270000-0000-4000-8000-000000000013'::uuid
  ];
  row_count integer;
  mismatch_count integer;
  fixture_count integer;
  home_count integer;
  away_count integer;
  denied_count integer;
  all_coherent boolean;
  reconciliation_details text;
  natural_order uuid[];
  sorted_order uuid[];
begin
  select membership.user_id, membership.jugador_id, player.name
  into player_user_id, player_id, player_name
  from public.club_memberships membership
  join public.jugadores player on player.id = membership.jugador_id
  where membership.club_id = club_id_value
    and membership.role = 'player'
    and membership.is_active
    and membership.jugador_id is not null
    and (select pg_catalog.count(*) from public.club_memberships sibling
      where sibling.user_id = membership.user_id and sibling.is_active) = 1
  order by membership.id
  limit 1;

  select player.id into other_player_id
  from public.jugadores player
  where player.id is distinct from player_id
  order by player.id limit 1;
  select membership.user_id into owner_user_id
  from public.club_memberships membership
  where membership.club_id = club_id_value and membership.role = 'owner'
    and membership.is_active order by membership.id limit 1;
  select membership.user_id into staff_user_id
  from public.club_memberships membership
  where membership.club_id = club_id_value and membership.role = 'staff'
    and membership.is_active order by membership.id limit 1;

  perform pg_temp.add_player_match_stats_gate_check(
    'FIXTURE_identity_inventory',
    player_user_id is not null and player_id is not null
      and nullif(pg_catalog.btrim(player_name), '') is not null
      and other_player_id is not null and owner_user_id is not null
      and staff_user_id is not null,
    'PLAYER, segundo jugador, OWNER y STAFF disponibles'
  );

  if exists (select 1 from public.partidos where id = any(fixture_ids))
     or exists (select 1 from auth.users where id = viewer_user_id) then
    raise exception 'Verify 27: colision de IDs de fixtures';
  end if;

  insert into public.partidos (
    id, date, opponent, opponent_crest, is_home, status,
    competition_id, competition_key, player_visible, delegated_data_status
  ) values
    (fixture_ids[1], '2020-01-01', 'VERIFY27 Rival 1', 'https://verify27.invalid/crest-1.png', true, 'Finalizado', null, 'league', false, 'Validado'),
    (fixture_ids[2], '2020-01-02', 'VERIFY27 Rival 2', 'https://verify27.invalid/crest-2.png', false, 'Finalizado', null, 'league', true, 'Validado'),
    (fixture_ids[3], '2020-01-03', 'VERIFY27 Rival 3', 'https://verify27.invalid/crest-3.png', true, 'Finalizado', null, 'league', true, 'Validado'),
    (fixture_ids[4], '2020-01-04', 'VERIFY27 Rival 4', 'https://verify27.invalid/crest-4.png', false, 'Finalizado', null, 'league', true, 'Validado'),
    (fixture_ids[5], '2020-01-05', 'VERIFY27 Rival 5', 'https://verify27.invalid/crest-5.png', true, 'Finalizado', null, 'league', true, 'Validado'),
    (fixture_ids[6], '2020-01-06', 'VERIFY27 Rival 6', 'https://verify27.invalid/crest-6.png', false, 'Finalizado', null, 'league', true, 'Validado'),
    (fixture_ids[7], '2020-01-07', 'VERIFY27 Rival 7', 'https://verify27.invalid/crest-7.png', true, 'Finalizado', null, 'league', true, 'Validado'),
    (fixture_ids[8], '2019-12-31', 'VERIFY27 Friendly', 'https://verify27.invalid/friendly.png', true, 'Finalizado', null, 'friendly', true, 'Validado'),
    (fixture_ids[9], '2099-01-10', 'VERIFY27 Future', 'https://verify27.invalid/future.png', true, 'Finalizado', null, 'league', true, 'Validado'),
    (fixture_ids[10], '2020-01-10', 'VERIFY27 Invalid', 'https://verify27.invalid/invalid.png', true, 'Finalizado', null, 'league', true, 'Sin revisar'),
    (fixture_ids[11], '2020-01-11', 'VERIFY27 Pending', 'https://verify27.invalid/pending.png', true, 'Finalizado', null, 'league', true, 'Validado'),
    (fixture_ids[12], '2020-01-12', 'VERIFY27 Other', 'https://verify27.invalid/other.png', true, 'Finalizado', null, 'league', true, 'Validado'),
    (fixture_ids[13], '2020-01-13', 'VERIFY27 Suspended', 'https://verify27.invalid/suspended.png', true, 'Suspendido', null, 'league', true, 'Validado');

  insert into public.match_quick_events (
    partido_id, jugador_id, equipo, tipo_evento, minuto, reviewed
  ) values
    (fixture_ids[1], player_id, 'caudal', 'gol', 1, true),
    (fixture_ids[1], player_id, 'caudal', 'tiro', 2, true),
    (fixture_ids[1], player_id, 'caudal', 'centro', 3, true),
    (fixture_ids[1], player_id, 'caudal', 'perdida', 4, true),
    (fixture_ids[1], player_id, 'caudal', 'robo', 5, true),
    (fixture_ids[1], player_id, 'caudal', 'falta_realizada', 6, true),
    (fixture_ids[1], player_id, 'caudal', 'falta_recibida', 7, true),
    (fixture_ids[1], player_id, 'caudal', 'regate', 8, true),
    (fixture_ids[2], player_id, 'caudal', 'tiro_puerta', 9, true),
    (fixture_ids[2], player_id, 'caudal', 'tiro', 10, true),
    (fixture_ids[2], player_id, 'caudal', 'centro', 11, true),
    (fixture_ids[2], player_id, 'caudal', 'centro', 12, true),
    (fixture_ids[3], player_id, 'caudal', 'recuperacion', 13, true),
    (fixture_ids[4], player_id, 'caudal', 'gol', 14, true),
    (fixture_ids[5], player_id, 'caudal', 'perdida', 15, true),
    (fixture_ids[5], player_id, 'caudal', 'perdida', 16, true),
    (fixture_ids[5], player_id, 'caudal', 'robo', 17, true),
    (fixture_ids[6], player_id, 'caudal', 'tiro', 18, true),
    (fixture_ids[6], player_id, 'caudal', 'tiro', 19, true),
    (fixture_ids[6], player_id, 'caudal', 'tiro', 20, true),
    (fixture_ids[6], player_id, 'caudal', 'falta_realizada', 21, true),
    (fixture_ids[7], player_id, 'caudal', 'tiro_puerta', 22, true),
    (fixture_ids[7], player_id, 'caudal', 'centro', 23, true),
    (fixture_ids[7], player_id, 'caudal', 'falta_recibida', 24, true),
    (fixture_ids[7], other_player_id, 'caudal', 'gol', 25, true),
    (fixture_ids[8], player_id, 'caudal', 'centro', 26, true),
    (fixture_ids[9], player_id, 'caudal', 'gol', 27, true),
    (fixture_ids[10], player_id, 'caudal', 'gol', 28, true),
    (fixture_ids[11], player_id, 'caudal', 'gol', 29, false),
    (fixture_ids[12], other_player_id, 'caudal', 'gol', 30, true),
    (fixture_ids[13], player_id, 'caudal', 'gol', 31, true);

  insert into public.partido_estadisticas_jugador (
    partido_id, jugador_id, player_name, role, minutes,
    yellow, yellow_count, red
  ) values
    (fixture_ids[1], player_id, player_name, 'Titular', '90', false, 0, false),
    (fixture_ids[2], player_id, player_name, 'Suplente', '45', false, 0, false),
    (fixture_ids[4], player_id, player_name, 'Titular', '75', false, 0, false),
    (fixture_ids[5], player_id, player_name, 'Suplente', '0', false, 0, false),
    (fixture_ids[6], player_id, player_name, 'Titular', '60', false, 0, false),
    (fixture_ids[7], player_id, player_name, 'Titular', '88', false, 0, false),
    (fixture_ids[8], player_id, player_name, 'Titular', '50', false, 0, false);

  perform pg_temp.add_player_match_stats_gate_check(
    'FIXTURE_transactional_rows_created',
    (select pg_catalog.count(*) from public.partidos where id = any(fixture_ids)) = 13
      and (select pg_catalog.count(*) from public.match_quick_events
        where partido_id = any(fixture_ids)) = 31
      and (select pg_catalog.count(*) from public.partido_estadisticas_jugador
        where partido_id = any(fixture_ids)) = 7,
    '13 partidos, 31 eventos y 7 filas de minutos dentro de la transaccion'
  );

  -- Marca la identidad PLAYER real para todas las llamadas funcionales.
  perform pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', player_user_id, 'role', 'authenticated')::text, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);

  select pg_catalog.count(*) into row_count
  from public.get_my_player_analysis_match_stats('all', 'all', 'full_scope') result
  where result.match_id = fixture_ids[1];
  perform pg_temp.add_player_match_stats_gate_check(
    'GATE_past_ignores_player_visible', row_count = 1,
    'partido 2020 publicable aunque player_visible=false'
  );

  select pg_catalog.count(*) into row_count
  from public.get_my_player_analysis_match_stats('all', 'all', 'full_scope') result
  where result.match_id = fixture_ids[9];
  perform pg_temp.add_player_match_stats_gate_check(
    'GATE_future_finalized_excluded', row_count = 0,
    'Finalizado con fecha 2099 sigue cerrado por el helper'
  );

  select pg_catalog.count(*) into row_count
  from public.get_my_player_analysis_match_stats('all', 'all', 'full_scope') result
  where result.match_id = fixture_ids[13];
  perform pg_temp.add_player_match_stats_gate_check(
    'GATE_suspended_excluded', row_count = 0,
    'Suspendido pasado sigue cerrado sin duplicar la allowlist en match_stats'
  );

  select pg_catalog.count(*) into row_count
  from public.get_my_player_analysis_match_stats('all', 'all', 'full_scope') result
  where result.match_id = fixture_ids[10];
  perform pg_temp.add_player_match_stats_gate_check(
    'GATE_delegated_invalid_excluded', row_count = 0,
    'delegated_data_status distinto de Validado no produce fila'
  );

  select pg_catalog.count(*) into row_count
  from public.get_my_player_analysis_match_stats('all', 'all', 'full_scope') result
  where result.match_id = fixture_ids[11];
  perform pg_temp.add_player_match_stats_gate_check(
    'GATE_unreviewed_excluded', row_count = 0,
    'reviewed=false no produce fila'
  );

  select pg_catalog.count(*) into row_count
  from public.get_my_player_analysis_match_stats('all', 'all', 'full_scope') result
  where result.match_id = fixture_ids[12];
  select pg_catalog.count(*) into mismatch_count
  from public.get_my_player_analysis_match_stats('all', 'all', 'full_scope') result
  where result.match_id = fixture_ids[7]
    and (result.goals <> 0 or result.event_count <> 3);
  perform pg_temp.add_player_match_stats_gate_check(
    'IDENTITY_other_player_excluded', row_count = 0 and mismatch_count = 0,
    'partido solo ajeno ausente y gol ajeno no contamina la fila propia'
  );

  with expected(
    match_id, event_count, goals, shots, shots_on_target,
    crosses, turnovers, steals, fouls_committed, fouls_received
  ) as (
    values
      (fixture_ids[1], 8, 1, 2, 1, 1, 1, 1, 1, 1),
      (fixture_ids[2], 4, 0, 2, 1, 2, 0, 0, 0, 0),
      (fixture_ids[3], 1, 0, 0, 0, 0, 0, 0, 0, 0),
      (fixture_ids[4], 1, 1, 1, 1, 0, 0, 0, 0, 0),
      (fixture_ids[5], 3, 0, 0, 0, 0, 2, 1, 0, 0),
      (fixture_ids[6], 4, 0, 3, 0, 0, 0, 0, 1, 0),
      (fixture_ids[7], 3, 0, 1, 1, 1, 0, 0, 0, 1),
      (fixture_ids[8], 1, 0, 0, 0, 1, 0, 0, 0, 0)
  ), actual as (
    select result.*
    from public.get_my_player_analysis_match_stats('all', 'all', 'full_scope') result
    where result.match_id = any(fixture_ids[1:8])
  )
  select pg_catalog.count(*) into mismatch_count
  from expected
  left join actual using (match_id)
  where actual.match_id is null
     or actual.event_count is distinct from expected.event_count
     or actual.goals is distinct from expected.goals
     or actual.shots is distinct from expected.shots
     or actual.shots_on_target is distinct from expected.shots_on_target
     or actual.crosses is distinct from expected.crosses
     or actual.turnovers is distinct from expected.turnovers
     or actual.steals is distinct from expected.steals
     or actual.fouls_committed is distinct from expected.fouls_committed
     or actual.fouls_received is distinct from expected.fouls_received;
  perform pg_temp.add_player_match_stats_gate_check(
    'RUNTIME_fixture_metrics_exact', mismatch_count = 0,
    pg_catalog.format('filas fixture con diferencias=%s', mismatch_count)
  );

  select pg_catalog.count(*) into mismatch_count
  from public.get_my_player_analysis_match_stats('all', 'all', 'full_scope') result
  where result.match_id = fixture_ids[7]
    and (result.match_date is distinct from '2020-01-07'::date
      or result.opponent is distinct from 'VERIFY27 Rival 7'
      or result.opponent_crest is distinct from 'https://verify27.invalid/crest-7.png'
      or result.competition_key is distinct from 'league'
      or result.is_home is distinct from true);
  perform pg_temp.add_player_match_stats_gate_check(
    'RUNTIME_visual_identity_same_match', mismatch_count = 0,
    'match_id, fecha, rival, escudo, competicion y localia coherentes'
  );

  select pg_catalog.count(*) into mismatch_count
  from public.get_my_player_analysis_match_stats('all', 'all', 'full_scope') result
  where (result.match_id = fixture_ids[3] and result.minutes is not null)
     or (result.match_id = fixture_ids[5] and result.minutes is distinct from 0);
  perform pg_temp.add_player_match_stats_gate_check(
    'RUNTIME_minutes_null_vs_zero', mismatch_count = 0,
    'sin dato de minutos => NULL; cero almacenado => 0'
  );

  select pg_catalog.count(*), pg_catalog.count(distinct result.match_id)
  into row_count, mismatch_count
  from public.get_my_player_analysis_match_stats('all', 'all', 'full_scope') result;
  perform pg_temp.add_player_match_stats_gate_check(
    'RUNTIME_one_row_per_match', row_count = mismatch_count,
    pg_catalog.format('rows=%s; distinct match_id=%s', row_count, mismatch_count)
  );

  select
    pg_catalog.array_agg(result.match_id order by result.ordinality),
    pg_catalog.array_agg(result.match_id order by result.match_date asc nulls last, result.match_id asc)
  into natural_order, sorted_order
  from public.get_my_player_analysis_match_stats(
    'all', 'all', 'full_scope'
  ) with ordinality result;
  perform pg_temp.add_player_match_stats_gate_check(
    'RUNTIME_chronological_order', natural_order = sorted_order,
    'salida match_date ASC, match_id ASC determinista'
  );

  select pg_catalog.count(*) into fixture_count
  from public.get_my_player_analysis_match_stats('season', 'all', 'full_scope') result
  where result.match_id = any(fixture_ids);
  perform pg_temp.add_player_match_stats_gate_check(
    'FILTER_season_fixture_scope', fixture_count = 7,
    pg_catalog.format('fixtures oficiales publicables=%s; friendly excluido', fixture_count)
  );

  select pg_catalog.count(*) into home_count
  from public.get_my_player_analysis_match_stats('league', 'home', 'full_scope') result
  where result.match_id = any(fixture_ids);
  select pg_catalog.count(*) into away_count
  from public.get_my_player_analysis_match_stats('league', 'away', 'full_scope') result
  where result.match_id = any(fixture_ids);
  perform pg_temp.add_player_match_stats_gate_check(
    'FILTER_competition_and_venue', home_count = 4 and away_count = 3,
    pg_catalog.format('league home=%s; league away=%s', home_count, away_count)
  );

  with combinations(seq, scope_value, venue_value, window_value) as (
    values
      (1, 'season', 'all',  'last_3_event_matches'),
      (2, 'season', 'all',  'last_5_event_matches'),
      (3, 'season', 'all',  'full_scope'),
      (4, 'all',    'all',  'full_scope'),
      (5, 'league', 'home', 'full_scope'),
      (6, 'league', 'away', 'full_scope')
  ), comparison as (
    select combination.*,
      rows.matches_with_events, rows.event_count, rows.goals,
      rows.shots, rows.shots_on_target, rows.crosses, rows.turnovers,
      rows.steals, rows.fouls_committed, rows.fouls_received,
      live.matches_with_events as live_matches,
      live.event_count as live_events, live.goals as live_goals,
      live.shots as live_shots, live.shots_on_target as live_shots_on_target,
      live.crosses as live_crosses, live.turnovers as live_turnovers,
      live.steals as live_steals,
      live.fouls_committed as live_fouls_committed,
      live.fouls_received as live_fouls_received,
      live.goals_per_match, live.shots_per_match,
      live.shots_on_target_per_match, live.crosses_per_match,
      live.turnovers_per_match, live.steals_per_match,
      live.fouls_committed_per_match, live.fouls_received_per_match,
      live.shot_accuracy_percentage
    from combinations combination
    cross join lateral (
      select pg_catalog.count(*)::integer as matches_with_events,
        coalesce(pg_catalog.sum(result.event_count), 0)::integer as event_count,
        coalesce(pg_catalog.sum(result.goals), 0)::integer as goals,
        coalesce(pg_catalog.sum(result.shots), 0)::integer as shots,
        coalesce(pg_catalog.sum(result.shots_on_target), 0)::integer as shots_on_target,
        coalesce(pg_catalog.sum(result.crosses), 0)::integer as crosses,
        coalesce(pg_catalog.sum(result.turnovers), 0)::integer as turnovers,
        coalesce(pg_catalog.sum(result.steals), 0)::integer as steals,
        coalesce(pg_catalog.sum(result.fouls_committed), 0)::integer as fouls_committed,
        coalesce(pg_catalog.sum(result.fouls_received), 0)::integer as fouls_received
      from public.get_my_player_analysis_match_stats(
        combination.scope_value, combination.venue_value, combination.window_value
      ) result
    ) rows
    cross join lateral public.get_my_player_analysis_live_stats(
      combination.scope_value, combination.venue_value, combination.window_value
    ) live
  ), evaluated as (
    select comparison.*,
      comparison.matches_with_events = comparison.live_matches
      and comparison.event_count = comparison.live_events
      and comparison.goals = comparison.live_goals
      and comparison.shots = comparison.live_shots
      and comparison.shots_on_target = comparison.live_shots_on_target
      and comparison.crosses = comparison.live_crosses
      and comparison.turnovers = comparison.live_turnovers
      and comparison.steals = comparison.live_steals
      and comparison.fouls_committed = comparison.live_fouls_committed
      and comparison.fouls_received = comparison.live_fouls_received
      and comparison.goals_per_match is not distinct from case when comparison.matches_with_events > 0
        then pg_catalog.round(comparison.goals::numeric / comparison.matches_with_events, 2) end
      and comparison.shots_per_match is not distinct from case when comparison.matches_with_events > 0
        then pg_catalog.round(comparison.shots::numeric / comparison.matches_with_events, 2) end
      and comparison.shots_on_target_per_match is not distinct from case when comparison.matches_with_events > 0
        then pg_catalog.round(comparison.shots_on_target::numeric / comparison.matches_with_events, 2) end
      and comparison.crosses_per_match is not distinct from case when comparison.matches_with_events > 0
        then pg_catalog.round(comparison.crosses::numeric / comparison.matches_with_events, 2) end
      and comparison.turnovers_per_match is not distinct from case when comparison.matches_with_events > 0
        then pg_catalog.round(comparison.turnovers::numeric / comparison.matches_with_events, 2) end
      and comparison.steals_per_match is not distinct from case when comparison.matches_with_events > 0
        then pg_catalog.round(comparison.steals::numeric / comparison.matches_with_events, 2) end
      and comparison.fouls_committed_per_match is not distinct from case when comparison.matches_with_events > 0
        then pg_catalog.round(comparison.fouls_committed::numeric / comparison.matches_with_events, 2) end
      and comparison.fouls_received_per_match is not distinct from case when comparison.matches_with_events > 0
        then pg_catalog.round(comparison.fouls_received::numeric / comparison.matches_with_events, 2) end
      and comparison.shot_accuracy_percentage is not distinct from case when comparison.shots > 0
        then pg_catalog.round(comparison.shots_on_target::numeric * 100 / comparison.shots, 2) end
      as is_ok
    from comparison
  )
  select pg_catalog.bool_and(evaluated.is_ok),
    pg_catalog.jsonb_pretty(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'scope', evaluated.scope_value,
      'venue', evaluated.venue_value,
      'window', evaluated.window_value,
      'ok', evaluated.is_ok,
      'match_stats', pg_catalog.jsonb_build_object(
        'matches', evaluated.matches_with_events, 'events', evaluated.event_count,
        'goals', evaluated.goals, 'shots', evaluated.shots,
        'shots_on_target', evaluated.shots_on_target, 'crosses', evaluated.crosses,
        'turnovers', evaluated.turnovers, 'steals', evaluated.steals,
        'fouls_committed', evaluated.fouls_committed,
        'fouls_received', evaluated.fouls_received
      ),
      'live_stats', pg_catalog.jsonb_build_object(
        'matches', evaluated.live_matches, 'events', evaluated.live_events,
        'goals', evaluated.live_goals, 'shots', evaluated.live_shots,
        'shots_on_target', evaluated.live_shots_on_target,
        'crosses', evaluated.live_crosses, 'turnovers', evaluated.live_turnovers,
        'steals', evaluated.live_steals,
        'fouls_committed', evaluated.live_fouls_committed,
        'fouls_received', evaluated.live_fouls_received,
        'goals_per_match', evaluated.goals_per_match,
        'shots_per_match', evaluated.shots_per_match,
        'shots_on_target_per_match', evaluated.shots_on_target_per_match,
        'crosses_per_match', evaluated.crosses_per_match,
        'turnovers_per_match', evaluated.turnovers_per_match,
        'steals_per_match', evaluated.steals_per_match,
        'fouls_committed_per_match', evaluated.fouls_committed_per_match,
        'fouls_received_per_match', evaluated.fouls_received_per_match,
        'shot_accuracy_percentage', evaluated.shot_accuracy_percentage
      )
    ) order by evaluated.seq))
  into all_coherent, reconciliation_details
  from evaluated;
  perform pg_temp.add_player_match_stats_gate_check(
    'RECONCILIATION_live_stats_exact', all_coherent, reconciliation_details
  );

  select pg_catalog.count(*) into mismatch_count
  from public.get_my_player_analysis_match_stats('all', 'all', 'full_scope') result
  where result.shot_accuracy_percentage is distinct from case when result.shots > 0
    then pg_catalog.round(result.shots_on_target::numeric * 100 / result.shots, 2) end;
  perform pg_temp.add_player_match_stats_gate_check(
    'RUNTIME_shot_accuracy_from_totals', mismatch_count = 0,
    'por fila y reconciliacion: SUM(on_target)/SUM(shots), nunca AVG porcentajes'
  );

  -- VIEWER transitorio: se crea por el flujo autorizado del OWNER y se revierte.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  )
  select account.instance_id, viewer_user_id, 'authenticated', 'authenticated',
    pg_catalog.format('verify27.viewer.%s@appcaudal.invalid', viewer_user_id), '',
    pg_catalog.now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb, pg_catalog.now(), pg_catalog.now()
  from auth.users account where account.id = owner_user_id;

  perform pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', owner_user_id, 'role', 'authenticated')::text, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', owner_user_id::text, true);
  execute 'set local role authenticated';
  insert into public.club_memberships (
    club_id, user_id, role, jugador_id, is_active
  ) values (club_id_value, viewer_user_id, 'viewer', null, true)
  returning id into viewer_membership_id;
  execute 'reset role';

  perform pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', viewer_user_id, 'role', 'authenticated')::text, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', viewer_user_id::text, true);
  select pg_catalog.count(*) into denied_count
  from public.get_my_player_analysis_match_stats('all', 'all', 'full_scope');
  perform pg_temp.add_player_match_stats_gate_check(
    'ROLE_viewer_denied', denied_count = 0,
    pg_catalog.format('VIEWER rows=%s', denied_count)
  );

  perform pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', staff_user_id, 'role', 'authenticated')::text, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
  select pg_catalog.count(*) into denied_count
  from public.get_my_player_analysis_match_stats('all', 'all', 'full_scope');
  perform pg_temp.add_player_match_stats_gate_check(
    'ROLE_staff_denied', denied_count = 0,
    pg_catalog.format('STAFF rows=%s', denied_count)
  );

  perform pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', no_membership_user_id, 'role', 'authenticated')::text, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', no_membership_user_id::text, true);
  select pg_catalog.count(*) into denied_count
  from public.get_my_player_analysis_match_stats('all', 'all', 'full_scope');
  perform pg_temp.add_player_match_stats_gate_check(
    'ROLE_no_membership_denied', denied_count = 0,
    pg_catalog.format('sin membership rows=%s', denied_count)
  );

  perform pg_catalog.set_config('request.jwt.claims',
    pg_catalog.jsonb_build_object('role', 'anon')::text, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  denied_count := 0;
  begin
    execute 'select 1 from public.get_my_player_analysis_match_stats(''all'',''all'',''full_scope'')';
  exception when insufficient_privilege then
    denied_count := 1;
  end;
  execute 'reset role';
  perform pg_temp.add_player_match_stats_gate_check(
    'ROLE_anon_denied', denied_count = 1,
    'anon recibe insufficient_privilege por ACL'
  );

  perform pg_temp.add_player_match_stats_gate_check(
    'TRANSACTION_fixtures_scoped',
    exists (select 1 from public.partidos where id = fixture_ids[1])
      and exists (select 1 from public.club_memberships
        where id = viewer_membership_id and user_id = viewer_user_id),
    'partidos, eventos, minutos, Auth y VIEWER desaparecen con ROLLBACK'
  );

  perform pg_catalog.set_config('request.jwt.claims', '{}'::jsonb::text, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', '', true);
end;
$verify$;

select pg_temp.add_player_match_stats_gate_check(
  'VERIFY_expected_check_count',
  (select pg_catalog.count(*) = 26
   from pg_temp.player_match_stats_gate_results),
  pg_catalog.format(
    'checks_before_counter=%s; expected=26; total_output=27',
    (select pg_catalog.count(*) from pg_temp.player_match_stats_gate_results)
  )
);

select test_name, test_ok, details
from pg_temp.player_match_stats_gate_results
order by seq;

rollback;
