-- APPCAUDAL - Verificador transaccional de estadisticas PLAYER partido a partido.
-- Ejecutar el archivo completo despues de Club Core 26. Termina siempre en ROLLBACK.

begin;

create temporary table player_match_stats_results (
  seq integer generated always as identity,
  test_name text not null,
  test_ok boolean not null,
  details text not null
) on commit drop;

create or replace function pg_temp.add_player_match_stats_check(
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
  insert into pg_temp.player_match_stats_results (test_name, test_ok, details)
  values (p_name, coalesce(p_ok, false), coalesce(p_details, ''));
$function$;

select pg_temp.add_player_match_stats_check(
  'CATALOG_prerequisites',
  pg_catalog.to_regclass('public.partidos') is not null
    and pg_catalog.to_regclass('public.match_quick_events') is not null
    and pg_catalog.to_regclass('public.partido_estadisticas_jugador') is not null
    and pg_catalog.to_regprocedure('public.current_membership()') is not null
    and pg_catalog.to_regprocedure('public.current_jugador_id()') is not null
    and pg_catalog.to_regprocedure('public.is_player()') is not null
    and pg_catalog.to_regprocedure(
      'public.get_my_player_analysis_live_stats(text,text,text)'
    ) is not null,
  'fuentes, identidad y live_stats de referencia disponibles'
);

with procedure_row as (
  select procedure.*
  from pg_catalog.pg_proc procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.get_my_player_analysis_match_stats(text,text,text)'
  )
)
select pg_temp.add_player_match_stats_check(
  'CONTRACT_signature_defaults_return',
  procedure_row.oid is not null
    and procedure_row.pronargs = 3
    and procedure_row.pronargdefaults = 3
    and pg_catalog.pg_get_function_identity_arguments(procedure_row.oid) =
      'p_competition_scope text, p_venue text, p_window text'
    and pg_catalog.replace(
      pg_catalog.pg_get_function_result(procedure_row.oid), '"', ''
    ) = 'TABLE(match_id uuid, match_date date, opponent text, opponent_crest text, competition_key text, competition_name text, is_home boolean, minutes integer, event_count integer, goals integer, shots integer, shots_on_target integer, shot_accuracy_percentage numeric, crosses integer, turnovers integer, steals integer, fouls_committed integer, fouls_received integer)',
  'firma (text,text,text), tres defaults y DTO exacto'
)
from procedure_row;

with procedure_row as (
  select procedure.*
  from pg_catalog.pg_proc procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.get_my_player_analysis_match_stats(text,text,text)'
  )
)
select pg_temp.add_player_match_stats_check(
  'SECURITY_owner_definer_search_path',
  pg_catalog.pg_get_userbyid(procedure_row.proowner) = 'postgres'
    and procedure_row.prolang = (
      select language.oid
      from pg_catalog.pg_language language
      where language.lanname = 'plpgsql'
    )
    and procedure_row.prosecdef
    and procedure_row.provolatile = 's'
    and procedure_row.proconfig = array['search_path=pg_catalog']::text[],
  'owner postgres; PL/pgSQL STABLE SECURITY DEFINER; search_path=pg_catalog'
)
from procedure_row;

with procedure_row as (
  select procedure.*
  from pg_catalog.pg_proc procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.get_my_player_analysis_match_stats(text,text,text)'
  )
)
select pg_temp.add_player_match_stats_check(
  'SECURITY_acl_exact',
  not pg_catalog.has_function_privilege('anon', procedure_row.oid, 'EXECUTE')
    and pg_catalog.has_function_privilege(
      'authenticated', procedure_row.oid, 'EXECUTE'
    )
    and pg_catalog.has_function_privilege(
      'service_role', procedure_row.oid, 'EXECUTE'
    )
    and not exists (
      select 1
      from pg_catalog.aclexplode(coalesce(
        procedure_row.proacl,
        pg_catalog.acldefault('f', procedure_row.proowner)
      )) acl
      where acl.privilege_type = 'EXECUTE'
        and acl.grantee not in (
          procedure_row.proowner,
          'authenticated'::regrole::oid,
          'service_role'::regrole::oid
        )
    ),
  'PUBLIC/anon sin EXECUTE; authenticated y service_role; sin grants extra'
)
from procedure_row;

with procedure_row as (
  select procedure.*
  from pg_catalog.pg_proc procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.get_my_player_analysis_match_stats(text,text,text)'
  )
)
select pg_temp.add_player_match_stats_check(
  'PRIVACY_dto_sports_only',
  pg_catalog.pg_get_function_result(procedure_row.oid)
    !~* '(club_id|membership_id|user_id|subject_id|actor_id|created_by|reviewer)'
    and pg_catalog.pg_get_function_identity_arguments(procedure_row.oid)
    !~* '(jugador_id|player_id|user_id|membership_id|club_id|match_id)',
  'sin IDs Auth/club/membership ni selector de jugador; solo match_id deportivo'
)
from procedure_row;

with procedure_row as (
  select procedure.*
  from pg_catalog.pg_proc procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.get_my_player_analysis_match_stats(text,text,text)'
  )
)
select pg_temp.add_player_match_stats_check(
  'IDENTITY_own_player_fail_closed',
  procedure_row.prosrc ~ 'auth[.]uid[(][)]'
    and procedure_row.prosrc ~ 'public[.]current_membership[(][)]'
    and procedure_row.prosrc ~ 'public[.]current_jugador_id[(][)]'
    and procedure_row.prosrc ~ 'public[.]is_player[(][)]'
    and procedure_row.prosrc ~ 'event[.]jugador_id = own_jugador_id'
    and procedure_row.prosrc !~* 'where[^;]*player_name[[:space:]]*=',
  'identidad derivada y eventos unidos por jugador_id real'
)
from procedure_row;

with procedure_row as (
  select procedure.*
  from pg_catalog.pg_proc procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.get_my_player_analysis_match_stats(text,text,text)'
  )
)
select pg_temp.add_player_match_stats_check(
  'SOURCE_real_match_ids_and_canonical_visuals',
  procedure_row.prosrc ~ 'scoped[.]id = event[.]partido_id'
    and procedure_row.prosrc ~ 'stats[.]partido_id = match_stats[.]partido_id'
    and procedure_row.prosrc ~ 'stats[.]jugador_id = own_jugador_id'
    and procedure_row.prosrc ~ 'opponent_crest'
    and procedure_row.prosrc !~* 'opponent[^;]{0,80}[=][^;]{0,80}event'
    and procedure_row.prosrc !~* 'match_date[^;]{0,80}[=][^;]{0,80}event',
  'eventos y minutos por IDs; rival/escudo salen del mismo public.partidos'
)
from procedure_row;

with procedure_row as (
  select procedure.*
  from pg_catalog.pg_proc procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.get_my_player_analysis_match_stats(text,text,text)'
  )
)
select pg_temp.add_player_match_stats_check(
  'GATES_publication_delegated_reviewed',
  procedure_row.prosrc ~ 'match_row[.]player_visible'
    and procedure_row.prosrc ~ 'match_row[.]delegated_data_status = ''Validado'''
    and procedure_row.prosrc ~ 'event[.]reviewed is true'
    and procedure_row.prosrc ~ 'event[.]equipo = ''caudal'''
    and procedure_row.prosrc ~ '''finalizado'', ''jugado'', ''played'', ''finished'''
    and procedure_row.prosrc ~ '''cerrado'', ''closed'', ''revisado'', ''reviewed''',
  'mismo publication gate, Validado y reviewed=true de live_stats'
)
from procedure_row;

with procedure_row as (
  select procedure.*
  from pg_catalog.pg_proc procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.get_my_player_analysis_match_stats(text,text,text)'
  )
)
select pg_temp.add_player_match_stats_check(
  'FILTERS_scope_venue_window',
  procedure_row.prosrc ~ '''season'', ''all'', ''league'', ''copa_rfef'', ''playoff'', ''friendly'''
    and procedure_row.prosrc ~ '''all'', ''home'', ''away'''
    and procedure_row.prosrc ~ '''last_3_event_matches'', ''last_5_event_matches'', ''full_scope'''
    and procedure_row.prosrc ~ 'row_number[(][)] over'
    and procedure_row.prosrc ~ 'raw_match_date desc nulls last'
    and procedure_row.prosrc ~ 'raw_match_date::date'
    and procedure_row.prosrc ~ 'match_stats[.]partido_id asc',
  'allowlists y seleccion DESC/presentacion ASC determinista'
)
from procedure_row;

with procedure_row as (
  select procedure.*
  from pg_catalog.pg_proc procedure
  where procedure.oid = pg_catalog.to_regprocedure(
    'public.get_my_player_analysis_match_stats(text,text,text)'
  )
)
select pg_temp.add_player_match_stats_check(
  'SOURCE_metrics_match_live_stats',
  procedure_row.prosrc ~ 'event[.]tipo_evento = ''gol'''
    and procedure_row.prosrc ~ 'event[.]tipo_evento in [(]''gol'', ''tiro'', ''tiro_puerta''[)]'
    and procedure_row.prosrc ~ 'event[.]tipo_evento in [(]''gol'', ''tiro_puerta''[)]'
    and procedure_row.prosrc ~ 'event[.]tipo_evento = ''centro'''
    and procedure_row.prosrc ~ 'event[.]tipo_evento = ''perdida'''
    and procedure_row.prosrc ~ 'event[.]tipo_evento = ''robo'''
    and procedure_row.prosrc ~ 'event[.]tipo_evento = ''falta_realizada'''
    and procedure_row.prosrc ~ 'event[.]tipo_evento = ''falta_recibida''',
  'conteos definidos sobre match_quick_events igual que live_stats'
)
from procedure_row;

do $verify$
declare
  supported_club_id constant uuid :=
    'ca0da100-0000-4000-8000-000000000001'::uuid;
  player_user_id uuid;
  player_membership_id uuid;
  player_id uuid;
  player_name text;
  other_player_id uuid;
  owner_user_id uuid;
  staff_user_id uuid;
  viewer_user_id constant uuid :=
    'b4260000-0000-4000-8000-000000000026'::uuid;
  viewer_membership_id uuid;
  no_membership_user_id constant uuid :=
    'b4260000-0000-4000-8000-000000000027'::uuid;
  fixture_ids constant uuid[] := array[
    'b4260000-0000-4000-8000-000000000001'::uuid,
    'b4260000-0000-4000-8000-000000000002'::uuid,
    'b4260000-0000-4000-8000-000000000003'::uuid,
    'b4260000-0000-4000-8000-000000000004'::uuid,
    'b4260000-0000-4000-8000-000000000005'::uuid,
    'b4260000-0000-4000-8000-000000000006'::uuid,
    'b4260000-0000-4000-8000-000000000007'::uuid,
    'b4260000-0000-4000-8000-000000000008'::uuid,
    'b4260000-0000-4000-8000-000000000009'::uuid,
    'b4260000-0000-4000-8000-000000000010'::uuid,
    'b4260000-0000-4000-8000-000000000011'::uuid,
    'b4260000-0000-4000-8000-000000000012'::uuid
  ];
  row_count integer;
  distinct_count integer;
  mismatch_count integer;
  denied_count integer;
  invalid_count integer := 0;
  fixture_count integer;
  expected_ids uuid[];
  actual_ids uuid[];
  all_coherent boolean;
begin
  select
    membership.user_id,
    membership.id,
    membership.jugador_id,
    player.name
  into
    player_user_id,
    player_membership_id,
    player_id,
    player_name
  from public.club_memberships membership
  join public.jugadores player on player.id = membership.jugador_id
  where membership.club_id = supported_club_id
    and membership.role = 'player'
    and membership.is_active
    and membership.jugador_id is not null
    and (
      select pg_catalog.count(*)
      from public.club_memberships sibling
      where sibling.user_id = membership.user_id
        and sibling.is_active
    ) = 1
  order by membership.id
  limit 1;

  select player.id into other_player_id
  from public.jugadores player
  where player.id is distinct from player_id
  order by player.id
  limit 1;

  select membership.user_id into owner_user_id
  from public.club_memberships membership
  where membership.club_id = supported_club_id
    and membership.role = 'owner'
    and membership.is_active
  order by membership.id
  limit 1;

  select membership.user_id into staff_user_id
  from public.club_memberships membership
  where membership.club_id = supported_club_id
    and membership.role = 'staff'
    and membership.is_active
  order by membership.id
  limit 1;

  perform pg_temp.add_player_match_stats_check(
    'FIXTURE_identity_inventory',
    player_user_id is not null
      and player_membership_id is not null
      and player_id is not null
      and nullif(pg_catalog.btrim(player_name), '') is not null
      and other_player_id is not null
      and owner_user_id is not null
      and staff_user_id is not null,
    'PLAYER propio, segundo jugador, OWNER y STAFF activos del club soportado'
  );

  if exists (
    select 1 from public.partidos match_row where match_row.id = any(fixture_ids)
  ) or exists (
    select 1 from auth.users account
    where account.id in (viewer_user_id, no_membership_user_id)
  ) then
    raise exception 'Verify 26: colision de IDs reservados para fixtures';
  end if;

  insert into public.partidos (
    id, date, opponent, opponent_crest, is_home, status,
    competition_id, competition_key, player_visible, delegated_data_status
  ) values
    (fixture_ids[1],  '2099-01-01', 'VERIFY26 Rival 1',  'https://verify26.invalid/crest-1.png',  true,  'Finalizado', null, 'league',   true,  'Validado'),
    (fixture_ids[2],  '2099-01-02', 'VERIFY26 Rival 2',  'https://verify26.invalid/crest-2.png',  false, 'Finalizado', null, 'league',   true,  'Validado'),
    (fixture_ids[3],  '2099-01-03', 'VERIFY26 Rival 3',  'https://verify26.invalid/crest-3.png',  true,  'Finalizado', null, 'league',   true,  'Validado'),
    (fixture_ids[4],  '2099-01-04', 'VERIFY26 Rival 4',  'https://verify26.invalid/crest-4.png',  false, 'Finalizado', null, 'league',   true,  'Validado'),
    (fixture_ids[5],  '2099-01-05', 'VERIFY26 Rival 5',  'https://verify26.invalid/crest-5.png',  true,  'Finalizado', null, 'league',   true,  'Validado'),
    (fixture_ids[6],  '2099-01-06', 'VERIFY26 Rival 6',  'https://verify26.invalid/crest-6.png',  false, 'Finalizado', null, 'league',   true,  'Validado'),
    (fixture_ids[7],  '2099-01-07', 'VERIFY26 Rival 7',  'https://verify26.invalid/crest-7.png',  true,  'Finalizado', null, 'league',   true,  'Validado'),
    (fixture_ids[8],  '2098-12-31', 'VERIFY26 Friendly', 'https://verify26.invalid/friendly.png', true,  'Finalizado', null, 'friendly', true,  'Validado'),
    (fixture_ids[9],  '2099-01-10', 'VERIFY26 Hidden',   'https://verify26.invalid/hidden.png',   true,  'Finalizado', null, 'league',   false, 'Validado'),
    (fixture_ids[10], '2099-01-11', 'VERIFY26 Invalid',  'https://verify26.invalid/invalid.png',  true,  'Finalizado', null, 'league',   true,  'Sin revisar'),
    (fixture_ids[11], '2099-01-12', 'VERIFY26 Pending',  'https://verify26.invalid/pending.png',  true,  'Finalizado', null, 'league',   true,  'Validado'),
    (fixture_ids[12], '2099-01-13', 'VERIFY26 Other',    'https://verify26.invalid/other.png',    true,  'Finalizado', null, 'league',   true,  'Validado');

  insert into public.match_quick_events (
    partido_id, jugador_id, equipo, tipo_evento, minuto, reviewed
  ) values
    (fixture_ids[1], player_id, 'caudal', 'gol',              1, true),
    (fixture_ids[1], player_id, 'caudal', 'tiro',             2, true),
    (fixture_ids[1], player_id, 'caudal', 'centro',           3, true),
    (fixture_ids[1], player_id, 'caudal', 'perdida',          4, true),
    (fixture_ids[1], player_id, 'caudal', 'robo',             5, true),
    (fixture_ids[1], player_id, 'caudal', 'falta_realizada',  6, true),
    (fixture_ids[1], player_id, 'caudal', 'falta_recibida',   7, true),
    (fixture_ids[1], player_id, 'caudal', 'regate',           8, true),
    (fixture_ids[2], player_id, 'caudal', 'tiro_puerta',      9, true),
    (fixture_ids[2], player_id, 'caudal', 'tiro',            10, true),
    (fixture_ids[2], player_id, 'caudal', 'centro',          11, true),
    (fixture_ids[2], player_id, 'caudal', 'centro',          12, true),
    (fixture_ids[3], player_id, 'caudal', 'recuperacion',    13, true),
    (fixture_ids[4], player_id, 'caudal', 'gol',             14, true),
    (fixture_ids[5], player_id, 'caudal', 'perdida',         15, true),
    (fixture_ids[5], player_id, 'caudal', 'perdida',         16, true),
    (fixture_ids[5], player_id, 'caudal', 'robo',            17, true),
    (fixture_ids[6], player_id, 'caudal', 'tiro',            18, true),
    (fixture_ids[6], player_id, 'caudal', 'tiro',            19, true),
    (fixture_ids[6], player_id, 'caudal', 'tiro',            20, true),
    (fixture_ids[6], player_id, 'caudal', 'falta_realizada', 21, true),
    (fixture_ids[7], player_id, 'caudal', 'tiro_puerta',     22, true),
    (fixture_ids[7], player_id, 'caudal', 'centro',          23, true),
    (fixture_ids[7], player_id, 'caudal', 'falta_recibida',  24, true),
    (fixture_ids[7], other_player_id, 'caudal', 'gol',       25, true),
    (fixture_ids[8], player_id, 'caudal', 'centro',          26, true),
    (fixture_ids[9], player_id, 'caudal', 'gol',             27, true),
    (fixture_ids[10], player_id, 'caudal', 'gol',            28, true),
    (fixture_ids[11], player_id, 'caudal', 'gol',            29, false),
    (fixture_ids[12], other_player_id, 'caudal', 'gol',      30, true);

  insert into public.partido_estadisticas_jugador (
    partido_id, jugador_id, player_name, role, minutes,
    yellow, yellow_count, red
  ) values
    (fixture_ids[1], player_id, player_name, 'Titular',  '90', false, 0, false),
    (fixture_ids[2], player_id, player_name, 'Suplente', '45', false, 0, false),
    (fixture_ids[4], player_id, player_name, 'Titular',  '75', false, 0, false),
    (fixture_ids[5], player_id, player_name, 'Suplente',  '0', false, 0, false),
    (fixture_ids[6], player_id, player_name, 'Titular',  '60', false, 0, false),
    (fixture_ids[7], player_id, player_name, 'Titular',  '88', false, 0, false),
    (fixture_ids[8], player_id, player_name, 'Titular',  '50', false, 0, false);

  perform pg_temp.add_player_match_stats_check(
    'FIXTURE_transactional_rows_created',
    (select pg_catalog.count(*) from public.partidos match_row
      where match_row.id = any(fixture_ids)) = 12
      and (select pg_catalog.count(*) from public.match_quick_events event
        where event.partido_id = any(fixture_ids)) = 30
      and (select pg_catalog.count(*)
        from public.partido_estadisticas_jugador stats
        where stats.partido_id = any(fixture_ids)) = 7,
    '12 partidos, 30 eventos y 7 filas de minutos dentro de la transaccion'
  );

  -- La membership VIEWER tambien es transaccional y se crea usando el flujo
  -- autorizado del OWNER; no se muta ninguna membership real.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  )
  select
    account.instance_id,
    viewer_user_id,
    'authenticated',
    'authenticated',
    pg_catalog.format('verify26.viewer.%s@appcaudal.invalid', viewer_user_id),
    '',
    pg_catalog.now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    pg_catalog.now(),
    pg_catalog.now()
  from auth.users account
  where account.id = owner_user_id;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', owner_user_id, 'role', 'authenticated'
    )::text,
    true
  );
  perform pg_catalog.set_config('request.jwt.claim.sub', owner_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  insert into public.club_memberships (
    club_id, user_id, role, jugador_id, is_active
  ) values (
    supported_club_id, viewer_user_id, 'viewer', null, true
  ) returning id into viewer_membership_id;
  execute 'reset role';

  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', player_user_id, 'role', 'authenticated'
    )::text,
    true
  );
  perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);

  select pg_catalog.count(*), pg_catalog.count(distinct result.match_id)
  into row_count, distinct_count
  from public.get_my_player_analysis_match_stats(
    'season', 'all', 'last_5_event_matches'
  ) result;
  perform pg_temp.add_player_match_stats_check(
    'RUNTIME_one_row_per_match',
    row_count = 5 and distinct_count = 5,
    pg_catalog.format('last5 rows=%s; distinct match_id=%s', row_count, distinct_count)
  );

  select pg_catalog.count(*) into mismatch_count
  from public.get_my_player_analysis_match_stats(
    'season', 'all', 'last_5_event_matches'
  ) result
  where result.match_id = fixture_ids[7]
    and (
      result.opponent is distinct from 'VERIFY26 Rival 7'
      or result.opponent_crest is distinct from
        'https://verify26.invalid/crest-7.png'
    );
  select pg_catalog.count(*) into row_count
  from public.get_my_player_analysis_match_stats(
    'season', 'all', 'last_5_event_matches'
  ) result
  where result.match_id = fixture_ids[7];
  perform pg_temp.add_player_match_stats_check(
    'RUNTIME_opponent_and_crest_same_match',
    row_count = 1 and mismatch_count = 0,
    'rival y escudo fixture resueltos desde el mismo match_id, sin join por nombre'
  );

  select pg_catalog.count(*) into mismatch_count
  from public.get_my_player_analysis_match_stats(
    'season', 'all', 'last_5_event_matches'
  ) result
  where result.match_id = fixture_ids[7]
    and (
      result.match_date is distinct from '2099-01-07'::date
      or result.competition_key is distinct from 'league'
      or result.competition_name is distinct from (
        select competition.name
        from public.competitions competition
        where competition.key = 'league'
          and (
            competition.club_id is null
            or competition.club_id = supported_club_id
          )
        order by competition.key
        limit 1
      )
      or result.is_home is distinct from true
    );
  perform pg_temp.add_player_match_stats_check(
    'RUNTIME_date_competition_venue',
    mismatch_count = 0,
    'fecha, competition_key e is_home coinciden con public.partidos'
  );

  with expected(
    match_id, event_count, goals, shots, shots_on_target,
    crosses, turnovers, steals, fouls_committed, fouls_received
  ) as (
    values
      (fixture_ids[3], 1, 0, 0, 0, 0, 0, 0, 0, 0),
      (fixture_ids[4], 1, 1, 1, 1, 0, 0, 0, 0, 0),
      (fixture_ids[5], 3, 0, 0, 0, 0, 2, 1, 0, 0),
      (fixture_ids[6], 4, 0, 3, 0, 0, 0, 0, 1, 0),
      (fixture_ids[7], 3, 0, 1, 1, 1, 0, 0, 0, 1)
  ), actual as (
    select result.*
    from public.get_my_player_analysis_match_stats(
      'season', 'all', 'last_5_event_matches'
    ) result
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
  perform pg_temp.add_player_match_stats_check(
    'RUNTIME_metrics_exact',
    mismatch_count = 0,
    pg_catalog.format('metric rows with mismatch=%s', mismatch_count)
  );

  select pg_catalog.count(*) into mismatch_count
  from public.get_my_player_analysis_match_stats(
    'season', 'all', 'last_5_event_matches'
  ) result
  where (result.match_id = fixture_ids[3] and result.minutes is not null)
     or (result.match_id = fixture_ids[5] and result.minutes is distinct from 0);
  perform pg_temp.add_player_match_stats_check(
    'RUNTIME_minutes_null_vs_real_zero',
    mismatch_count = 0,
    'sin fila/valor valido => NULL; minutes almacenado como 0 => 0'
  );

  select pg_catalog.array_agg(result.match_id order by result.ordinality)
  into actual_ids
  from public.get_my_player_analysis_match_stats(
    'season', 'all', 'last_5_event_matches'
  ) with ordinality result;
  expected_ids := array[
    fixture_ids[3], fixture_ids[4], fixture_ids[5],
    fixture_ids[6], fixture_ids[7]
  ];
  perform pg_temp.add_player_match_stats_check(
    'RUNTIME_order_asc_stable',
    actual_ids = expected_ids,
    'last5 seleccionado por recencia y devuelto date ASC, match_id ASC'
  );

  select pg_catalog.array_agg(result.match_id order by result.ordinality)
  into actual_ids
  from public.get_my_player_analysis_match_stats(
    'season', 'all', 'last_3_event_matches'
  ) with ordinality result;
  expected_ids := array[fixture_ids[5], fixture_ids[6], fixture_ids[7]];
  perform pg_temp.add_player_match_stats_check(
    'FILTER_last3_exact',
    actual_ids = expected_ids,
    'ultimos tres validos seleccionados DESC y presentados ASC'
  );

  select pg_catalog.array_agg(result.match_id order by result.ordinality)
  into actual_ids
  from public.get_my_player_analysis_match_stats(
    'season', 'all', 'last_5_event_matches'
  ) with ordinality result;
  expected_ids := array[
    fixture_ids[3], fixture_ids[4], fixture_ids[5],
    fixture_ids[6], fixture_ids[7]
  ];
  perform pg_temp.add_player_match_stats_check(
    'FILTER_last5_exact', actual_ids = expected_ids,
    'ultimos cinco validos seleccionados DESC y presentados ASC'
  );

  select pg_catalog.count(*) into fixture_count
  from public.get_my_player_analysis_match_stats(
    'season', 'all', 'full_scope'
  ) result
  where result.match_id = any(fixture_ids);
  perform pg_temp.add_player_match_stats_check(
    'FILTER_season_official', fixture_count = 7,
    pg_catalog.format('fixtures oficiales visibles=%s; friendly excluido', fixture_count)
  );

  select pg_catalog.count(*) into fixture_count
  from public.get_my_player_analysis_match_stats(
    'league', 'all', 'full_scope'
  ) result
  where result.match_id = any(fixture_ids);
  perform pg_temp.add_player_match_stats_check(
    'FILTER_competition_league', fixture_count = 7,
    pg_catalog.format('fixtures league visibles=%s', fixture_count)
  );

  select pg_catalog.count(*) into fixture_count
  from public.get_my_player_analysis_match_stats(
    'season', 'home', 'full_scope'
  ) result
  where result.match_id = any(fixture_ids);
  perform pg_temp.add_player_match_stats_check(
    'FILTER_venue_home', fixture_count = 4,
    pg_catalog.format('fixtures home visibles=%s', fixture_count)
  );

  select pg_catalog.count(*) into fixture_count
  from public.get_my_player_analysis_match_stats(
    'season', 'away', 'full_scope'
  ) result
  where result.match_id = any(fixture_ids);
  perform pg_temp.add_player_match_stats_check(
    'FILTER_venue_away', fixture_count = 3,
    pg_catalog.format('fixtures away visibles=%s', fixture_count)
  );

  select pg_catalog.count(*) into row_count
  from public.get_my_player_analysis_match_stats('all', 'all', 'full_scope') result
  where result.match_id = fixture_ids[9];
  perform pg_temp.add_player_match_stats_check(
    'GATE_unpublished_excluded', row_count = 0,
    'player_visible=false no produce fila'
  );

  select pg_catalog.count(*) into row_count
  from public.get_my_player_analysis_match_stats('all', 'all', 'full_scope') result
  where result.match_id = fixture_ids[10];
  perform pg_temp.add_player_match_stats_check(
    'GATE_delegated_invalid_excluded', row_count = 0,
    'delegated_data_status distinto de Validado no produce fila'
  );

  select pg_catalog.count(*) into row_count
  from public.get_my_player_analysis_match_stats('all', 'all', 'full_scope') result
  where result.match_id = fixture_ids[11];
  perform pg_temp.add_player_match_stats_check(
    'GATE_unreviewed_excluded', row_count = 0,
    'evento reviewed=false no produce fila'
  );

  select pg_catalog.count(*) into row_count
  from public.get_my_player_analysis_match_stats('all', 'all', 'full_scope') result
  where result.match_id = fixture_ids[12];
  select pg_catalog.count(*) into mismatch_count
  from public.get_my_player_analysis_match_stats('season', 'all', 'last_5_event_matches') result
  where result.match_id = fixture_ids[7]
    and (result.goals <> 0 or result.event_count <> 3);
  perform pg_temp.add_player_match_stats_check(
    'IDENTITY_other_player_excluded',
    row_count = 0 and mismatch_count = 0,
    'partido solo ajeno ausente y gol ajeno no contamina el partido propio'
  );

  with combinations(scope_value, venue_value, window_value) as (
    values
      ('season', 'all',  'last_3_event_matches'),
      ('season', 'all',  'last_5_event_matches'),
      ('season', 'all',  'full_scope'),
      ('all',    'all',  'full_scope'),
      ('league', 'home', 'full_scope'),
      ('league', 'away', 'full_scope')
  ), comparison as (
    select
      combination.*,
      rows.matches_with_events,
      rows.event_count,
      rows.goals,
      rows.shots,
      rows.shots_on_target,
      rows.crosses,
      rows.turnovers,
      rows.steals,
      rows.fouls_committed,
      rows.fouls_received,
      live.matches_with_events as live_matches_with_events,
      live.event_count as live_event_count,
      live.goals as live_goals,
      live.shots as live_shots,
      live.shots_on_target as live_shots_on_target,
      live.crosses as live_crosses,
      live.turnovers as live_turnovers,
      live.steals as live_steals,
      live.fouls_committed as live_fouls_committed,
      live.fouls_received as live_fouls_received,
      live.shots_per_match,
      live.shots_on_target_per_match,
      live.crosses_per_match,
      live.turnovers_per_match,
      live.steals_per_match,
      live.fouls_committed_per_match,
      live.fouls_received_per_match
    from combinations combination
    cross join lateral (
      select
        pg_catalog.count(*)::integer as matches_with_events,
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
        combination.scope_value,
        combination.venue_value,
        combination.window_value
      ) result
    ) rows
    cross join lateral public.get_my_player_analysis_live_stats(
      combination.scope_value,
      combination.venue_value,
      combination.window_value
    ) live
  )
  select pg_catalog.bool_and(
    comparison.matches_with_events = comparison.live_matches_with_events
    and comparison.event_count = comparison.live_event_count
    and comparison.goals = comparison.live_goals
    and comparison.shots = comparison.live_shots
    and comparison.shots_on_target = comparison.live_shots_on_target
    and comparison.crosses = comparison.live_crosses
    and comparison.turnovers = comparison.live_turnovers
    and comparison.steals = comparison.live_steals
    and comparison.fouls_committed = comparison.live_fouls_committed
    and comparison.fouls_received = comparison.live_fouls_received
    and comparison.shots_per_match is not distinct from case
      when comparison.matches_with_events > 0 then pg_catalog.round(
        comparison.shots::numeric / comparison.matches_with_events, 2
      )
    end
    and comparison.shots_on_target_per_match is not distinct from case
      when comparison.matches_with_events > 0 then pg_catalog.round(
        comparison.shots_on_target::numeric / comparison.matches_with_events, 2
      )
    end
    and comparison.crosses_per_match is not distinct from case
      when comparison.matches_with_events > 0 then pg_catalog.round(
        comparison.crosses::numeric / comparison.matches_with_events, 2
      )
    end
    and comparison.turnovers_per_match is not distinct from case
      when comparison.matches_with_events > 0 then pg_catalog.round(
        comparison.turnovers::numeric / comparison.matches_with_events, 2
      )
    end
    and comparison.steals_per_match is not distinct from case
      when comparison.matches_with_events > 0 then pg_catalog.round(
        comparison.steals::numeric / comparison.matches_with_events, 2
      )
    end
    and comparison.fouls_committed_per_match is not distinct from case
      when comparison.matches_with_events > 0 then pg_catalog.round(
        comparison.fouls_committed::numeric / comparison.matches_with_events, 2
      )
    end
    and comparison.fouls_received_per_match is not distinct from case
      when comparison.matches_with_events > 0 then pg_catalog.round(
        comparison.fouls_received::numeric / comparison.matches_with_events, 2
      )
    end
  ) into all_coherent
  from comparison;
  perform pg_temp.add_player_match_stats_check(
    'RECONCILIATION_live_stats_exact',
    all_coherent,
    '6 combinaciones: conteos, SUM y medias numeric(2) coinciden con live_stats'
  );

  select pg_catalog.count(*) into mismatch_count
  from public.get_my_player_analysis_match_stats('all', 'all', 'full_scope') result
  where result.shot_accuracy_percentage is distinct from case
    when result.shots > 0 then pg_catalog.round(
      result.shots_on_target::numeric * 100 / result.shots, 2
    )
  end;
  perform pg_temp.add_player_match_stats_check(
    'RUNTIME_shot_accuracy_formula',
    mismatch_count = 0,
    'NULL sin tiros; porcentaje numeric con la misma formula que live_stats'
  );

  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', viewer_user_id, 'role', 'authenticated'
    )::text,
    true
  );
  perform pg_catalog.set_config('request.jwt.claim.sub', viewer_user_id::text, true);
  select pg_catalog.count(*) into denied_count
  from public.get_my_player_analysis_match_stats('all', 'all', 'full_scope');
  perform pg_temp.add_player_match_stats_check(
    'ROLE_viewer_denied', denied_count = 0,
    pg_catalog.format('VIEWER rows=%s', denied_count)
  );

  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', staff_user_id, 'role', 'authenticated'
    )::text,
    true
  );
  perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
  select pg_catalog.count(*) into denied_count
  from public.get_my_player_analysis_match_stats('all', 'all', 'full_scope');
  perform pg_temp.add_player_match_stats_check(
    'ROLE_staff_player_rpc_denied', denied_count = 0,
    pg_catalog.format('STAFF rows=%s', denied_count)
  );

  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', no_membership_user_id, 'role', 'authenticated'
    )::text,
    true
  );
  perform pg_catalog.set_config(
    'request.jwt.claim.sub', no_membership_user_id::text, true
  );
  select pg_catalog.count(*) into denied_count
  from public.get_my_player_analysis_match_stats('all', 'all', 'full_scope');
  perform pg_temp.add_player_match_stats_check(
    'ROLE_no_membership_denied', denied_count = 0,
    pg_catalog.format('authenticated sin membership rows=%s', denied_count)
  );

  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('role', 'anon')::text,
    true
  );
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'anon', true);
  execute 'set local role anon';
  denied_count := 0;
  begin
    execute 'select 1 from public.get_my_player_analysis_match_stats(''all'',''all'',''full_scope'')';
  exception when insufficient_privilege then
    denied_count := 1;
  end;
  execute 'reset role';
  perform pg_temp.add_player_match_stats_check(
    'ROLE_anon_denied', denied_count = 1,
    'anon recibe insufficient_privilege por ACL'
  );

  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object(
      'sub', player_user_id, 'role', 'authenticated'
    )::text,
    true
  );
  perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  begin
    perform * from public.get_my_player_analysis_match_stats(
      'other', 'all', 'full_scope'
    );
  exception when sqlstate '22023' then
    invalid_count := invalid_count + 1;
  end;
  begin
    perform * from public.get_my_player_analysis_match_stats(
      'season', 'neutral', 'full_scope'
    );
  exception when sqlstate '22023' then
    invalid_count := invalid_count + 1;
  end;
  begin
    perform * from public.get_my_player_analysis_match_stats(
      'season', 'all', 'last_10'
    );
  exception when sqlstate '22023' then
    invalid_count := invalid_count + 1;
  end;
  perform pg_temp.add_player_match_stats_check(
    'FILTER_invalid_values_22023', invalid_count = 3,
    pg_catalog.format('controlled errors=%s/3', invalid_count)
  );

  perform pg_temp.add_player_match_stats_check(
    'TRANSACTION_fixtures_scoped',
    exists (
      select 1 from public.club_memberships membership
      where membership.id = viewer_membership_id
        and membership.user_id = viewer_user_id
        and membership.role = 'viewer'
    )
      and exists (
        select 1 from public.partidos match_row
        where match_row.id = fixture_ids[1]
      ),
    'VIEWER, partidos, eventos y minutos desaparecen con el ROLLBACK final'
  );

  perform pg_catalog.set_config('request.jwt.claims', '{}'::jsonb::text, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', '', true);
end;
$verify$;

select pg_temp.add_player_match_stats_check(
  'VERIFY_expected_check_count',
  (select pg_catalog.count(*) = 36
   from pg_temp.player_match_stats_results),
  pg_catalog.format(
    'checks_before_counter=%s; expected=36; total_output=37',
    (select pg_catalog.count(*) from pg_temp.player_match_stats_results)
  )
);

select test_name, test_ok, details
from pg_temp.player_match_stats_results
order by seq;

rollback;
