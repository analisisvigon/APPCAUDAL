-- APPCAUDAL - Verificador transaccional Club Core 31.
-- Ejecutar completo tras la migracion. Termina siempre en ROLLBACK.

begin;

create temporary table core31_results (
  seq integer generated always as identity,
  test_name text not null,
  test_ok boolean not null,
  details text not null
) on commit drop;

create or replace function pg_temp.add_core31_check(
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
  insert into pg_temp.core31_results (test_name, test_ok, details)
  values (p_name, coalesce(p_ok, false), coalesce(p_details, ''));
$function$;

select pg_temp.add_core31_check(
  'CATALOG_prerequisites',
  pg_catalog.to_regclass('public.partido_eventos_sustitucion') is not null
    and pg_catalog.to_regclass('public.partido_estadisticas_jugador') is not null
    and pg_catalog.to_regclass('public.partido_alineacion_slots') is not null
    and pg_catalog.to_regprocedure('public.is_app_staff()') is not null,
  'tabla canonica, proyeccion legacy, XI e identidad STAFF disponibles'
);

select pg_temp.add_core31_check(
  'SCHEMA_exact_columns',
  (
    select pg_catalog.array_agg(attribute.attname order by attribute.attnum)
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.partido_eventos_sustitucion'::regclass
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) = array[
    'id','partido_id','minute','event_order','outgoing_jugador_id',
    'incoming_jugador_id','outgoing_name_snapshot','incoming_name_snapshot',
    'reason','created_at','updated_at'
  ]::name[],
  '11 columnas aditivas y sin payload medico'
);

select pg_temp.add_core31_check(
  'SCHEMA_checks_and_unique_order',
  (
    select pg_catalog.count(*)
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.partido_eventos_sustitucion'::regclass
      and constraint_row.conname in (
        'partido_eventos_sustitucion_minute_check',
        'partido_eventos_sustitucion_event_order_check',
        'partido_eventos_sustitucion_players_check',
        'partido_eventos_sustitucion_outgoing_name_check',
        'partido_eventos_sustitucion_incoming_name_check',
        'partido_eventos_sustitucion_reason_check',
        'partido_eventos_sustitucion_match_order_key'
      )
  ) = 7,
  'minuto/orden, jugadores distintos, snapshots, reason y clave de orden'
);

select pg_temp.add_core31_check(
  'SCHEMA_indexes',
  (
    select pg_catalog.count(*)
    from pg_catalog.pg_index index_row
    join pg_catalog.pg_class relation on relation.oid = index_row.indexrelid
    where index_row.indrelid = 'public.partido_eventos_sustitucion'::regclass
      and relation.relname in (
        'partido_eventos_sustitucion_pkey',
        'partido_eventos_sustitucion_match_order_key',
        'partido_eventos_sustitucion_outgoing_idx',
        'partido_eventos_sustitucion_incoming_idx'
      )
  ) = 4,
  'PK, orden unico y busquedas por saliente/entrante'
);

select pg_temp.add_core31_check(
  'SECURITY_rls_staff_select_only',
  (select relation.relrowsecurity
   from pg_catalog.pg_class relation
   where relation.oid = 'public.partido_eventos_sustitucion'::regclass)
    and (
      select pg_catalog.count(*)
      from pg_catalog.pg_policy policy
      where policy.polrelid = 'public.partido_eventos_sustitucion'::regclass
    ) = 1
    and exists (
      select 1
      from pg_catalog.pg_policy policy
      where policy.polrelid = 'public.partido_eventos_sustitucion'::regclass
        and policy.polname = 'substitution_staff_select'
        and policy.polcmd = 'r'
        and pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) ~ 'is_app_staff'
    ),
  'RLS activo; unica policy SELECT limitada a STAFF'
);

select pg_temp.add_core31_check(
  'SECURITY_table_acl_read_only_authenticated',
  pg_catalog.has_table_privilege('authenticated', 'public.partido_eventos_sustitucion', 'SELECT')
    and not pg_catalog.has_table_privilege('authenticated', 'public.partido_eventos_sustitucion', 'INSERT')
    and not pg_catalog.has_table_privilege('authenticated', 'public.partido_eventos_sustitucion', 'UPDATE')
    and not pg_catalog.has_table_privilege('authenticated', 'public.partido_eventos_sustitucion', 'DELETE')
    and not pg_catalog.has_table_privilege('anon', 'public.partido_eventos_sustitucion', 'SELECT'),
  'authenticated solo puede leer bajo RLS; ninguna mutacion directa; anon sin acceso'
);

with function_row as (
  select procedure.*
  from pg_catalog.pg_proc procedure
  where procedure.oid = 'public.get_match_substitution_events(uuid)'::regprocedure
)
select pg_temp.add_core31_check(
  'RPC_read_contract',
  function_row.prosecdef
    and function_row.provolatile = 's'
    and function_row.proconfig = array['search_path=pg_catalog']::text[]
    and function_row.prosrc ~ 'public[.]is_app_staff[(][)]'
    and function_row.prosrc ~ 'order by event_row[.]minute, event_row[.]event_order',
  'lectura JSON canonica, SECURITY DEFINER STABLE y orden determinista'
)
from function_row;

with function_row as (
  select procedure.*
  from pg_catalog.pg_proc procedure
  where procedure.oid = 'public.mutate_match_substitution_atomic(text,uuid,uuid,jsonb,integer)'::regprocedure
)
select pg_temp.add_core31_check(
  'RPC_mutation_contract',
  function_row.prosecdef
    and function_row.provolatile = 'v'
    and function_row.proconfig = array['search_path=pg_catalog']::text[]
    and function_row.prosrc ~ 'for update'
    and function_row.prosrc ~ 'LEGACY_SUBSTITUTION_AMBIGUOUS'
    and function_row.prosrc ~ 'played_minutes'
    and function_row.prosrc ~ 'replacement_name',
  'mutacion atomica, lock, materializacion, validacion y proyeccion'
)
from function_row;

select pg_temp.add_core31_check(
  'SECURITY_rpc_acl',
  not pg_catalog.has_function_privilege('anon', 'public.get_match_substitution_events(uuid)', 'EXECUTE')
    and pg_catalog.has_function_privilege('authenticated', 'public.get_match_substitution_events(uuid)', 'EXECUTE')
    and not pg_catalog.has_function_privilege('anon', 'public.mutate_match_substitution_atomic(text,uuid,uuid,jsonb,integer)', 'EXECUTE')
    and pg_catalog.has_function_privilege('authenticated', 'public.mutate_match_substitution_atomic(text,uuid,uuid,jsonb,integer)', 'EXECUTE'),
  'solo authenticated/service_role reciben EXECUTE; la RPC vuelve a exigir STAFF'
);

select pg_temp.add_core31_check(
  'SCHEMA_updated_at_trigger',
  exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.partido_eventos_sustitucion'::regclass
      and trigger_row.tgname = 'partido_eventos_sustitucion_updated_at'
      and not trigger_row.tgisinternal
  ),
  'updated_at automatico mediante el helper canonico Club Core'
);

do $runtime$
declare
  supported_club_id constant uuid := 'ca0da100-0000-4000-8000-000000000001'::uuid;
  match_chain constant uuid := 'b4310000-0000-4000-8000-000000000001'::uuid;
  match_legacy constant uuid := 'b4310000-0000-4000-8000-000000000002'::uuid;
  match_ambiguous constant uuid := 'b4310000-0000-4000-8000-000000000003'::uuid;
  viewer_user_id constant uuid := 'b4310000-0000-4000-8000-000000000004'::uuid;
  staff_user_id uuid;
  player_user_id uuid;
  player_ids uuid[];
  player_names text[];
  result jsonb;
  first_event_id uuid;
  second_event_id uuid;
  same_event_one uuid;
  same_event_two uuid;
  denied boolean;
  error_text text;
  row_count integer;
  loop_index integer;
begin
  select membership.user_id into staff_user_id
  from public.club_memberships membership
  where membership.club_id = supported_club_id
    and membership.role in ('owner', 'admin', 'staff')
    and membership.is_active
    and (select pg_catalog.count(*) from public.club_memberships sibling
         where sibling.user_id = membership.user_id and sibling.is_active) = 1
  order by case membership.role when 'owner' then 0 when 'admin' then 1 else 2 end, membership.id
  limit 1;

  select membership.user_id into player_user_id
  from public.club_memberships membership
  where membership.club_id = supported_club_id
    and membership.role = 'player'
    and membership.is_active
    and membership.jugador_id is not null
    and (select pg_catalog.count(*) from public.club_memberships sibling
         where sibling.user_id = membership.user_id and sibling.is_active) = 1
  order by membership.id
  limit 1;

  select pg_catalog.array_agg(player.id order by player.id),
         pg_catalog.array_agg(player.name order by player.id)
  into player_ids, player_names
  from (
    select roster.id, roster.name
    from public.jugadores roster
    where nullif(pg_catalog.btrim(roster.name), '') is not null
    order by roster.id
    limit 16
  ) player;

  if staff_user_id is null or player_user_id is null
     or pg_catalog.cardinality(player_ids) < 16 then
    raise exception 'Verify 31 requiere STAFF, PLAYER y al menos 16 jugadores reales';
  end if;
  if exists (select 1 from public.partidos match_row where match_row.id in (match_chain, match_legacy, match_ambiguous))
     or exists (select 1 from auth.users account where account.id = viewer_user_id) then
    raise exception 'Verify 31: colision de IDs reservados';
  end if;

  insert into public.partidos (
    id, date, opponent, opponent_crest, is_home, status,
    competition_id, competition_key, player_visible, delegated_data_status
  ) values
    (match_chain, '2099-03-01', 'VERIFY31 Chain', '', true, 'Finalizado', null, 'league', true, 'Validado'),
    (match_legacy, '2099-03-02', 'VERIFY31 Legacy', '', true, 'Finalizado', null, 'league', true, 'Validado'),
    (match_ambiguous, '2099-03-03', 'VERIFY31 Ambiguous', '', true, 'Finalizado', null, 'league', true, 'Validado');

  for loop_index in 1..11 loop
    insert into public.partido_alineacion_slots (
      partido_id, scope, slot, jugador_id, player_name
    ) values
      (match_chain, 'stats', loop_index - 1, player_ids[loop_index], player_names[loop_index]),
      (match_legacy, 'stats', loop_index - 1, player_ids[loop_index], player_names[loop_index]),
      (match_ambiguous, 'stats', loop_index - 1, player_ids[loop_index], player_names[loop_index]);
  end loop;

  for loop_index in 1..16 loop
    insert into public.partido_estadisticas_jugador (
      partido_id, jugador_id, player_name, role, minutes,
      yellow, yellow_count, red, injured, rating, replacement_name
    ) values
      (match_chain, player_ids[loop_index], player_names[loop_index], case when loop_index <= 11 then 'Titular' else 'Suplente' end, '', false, 0, false, false, '', ''),
      (match_legacy, player_ids[loop_index], player_names[loop_index], case when loop_index <= 11 then 'Titular' else 'Suplente' end, '', false, 0, false, false, '', ''),
      (match_ambiguous, player_ids[loop_index], player_names[loop_index], case when loop_index <= 11 then 'Titular' else 'Suplente' end, '', false, 0, false, false, '', '');
  end loop;

  update public.partido_estadisticas_jugador
  set minutes = '60', replacement_name = player_names[12]
  where partido_id = match_legacy and jugador_id = player_ids[1];
  update public.partido_estadisticas_jugador
  set minutes = '30'
  where partido_id = match_legacy and jugador_id = player_ids[12];
  update public.partido_estadisticas_jugador
  set minutes = '15', replacement_name = player_names[13]
  where partido_id = match_ambiguous and jugador_id = player_ids[12];

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  )
  select account.instance_id, viewer_user_id, 'authenticated', 'authenticated',
    pg_catalog.format('verify31.viewer.%s@appcaudal.invalid', viewer_user_id), '',
    pg_catalog.now(), '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb, pg_catalog.now(), pg_catalog.now()
  from auth.users account
  where account.id = staff_user_id;

  insert into public.club_memberships (club_id, user_id, role, jugador_id, is_active)
  values (supported_club_id, viewer_user_id, 'viewer', null, true);

  perform pg_temp.add_core31_check(
    'FIXTURE_transactional_ready',
    (select pg_catalog.count(*) from public.partidos where id in (match_chain, match_legacy, match_ambiguous)) = 3
      and (select pg_catalog.count(*) from public.partido_alineacion_slots where partido_id in (match_chain, match_legacy, match_ambiguous)) = 33
      and (select pg_catalog.count(*) from public.partido_estadisticas_jugador where partido_id in (match_chain, match_legacy, match_ambiguous)) = 48,
    '3 partidos, tres XI y 48 filas stats; todo queda dentro del rollback'
  );

  perform pg_catalog.set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub', staff_user_id, 'role', 'authenticated')::text, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';

  result := public.mutate_match_substitution_atomic('create', match_chain, null,
    pg_catalog.jsonb_build_object('minute', 60, 'event_order', 0,
      'outgoing_jugador_id', player_ids[1], 'incoming_jugador_id', player_ids[12], 'reason', 'tactical'), 90);
  first_event_id := (result->'event'->>'id')::uuid;

  perform pg_temp.add_core31_check(
    'A_starter_90_without_exit',
    (select minutes from public.partido_estadisticas_jugador where partido_id = match_chain and jugador_id = player_ids[2]) = '90',
    'titular no sustituido recibe la duracion completa'
  );
  perform pg_temp.add_core31_check(
    'B_starter_exits_60',
    (select minutes from public.partido_estadisticas_jugador where partido_id = match_chain and jugador_id = player_ids[1]) = '60',
    'titular saliente conserva 60 minutos'
  );
  perform pg_temp.add_core31_check(
    'C_substitute_enters_60_finishes_30',
    (select minutes from public.partido_estadisticas_jugador where partido_id = match_chain and jugador_id = player_ids[12]) = '30',
    'antes del segundo cambio el suplente termina y suma 30'
  );

  result := public.mutate_match_substitution_atomic('create', match_chain, null,
    pg_catalog.jsonb_build_object('minute', 89, 'event_order', 0,
      'outgoing_jugador_id', player_ids[12], 'incoming_jugador_id', player_ids[13], 'reason', 'injury'), 90);
  second_event_id := (result->'event'->>'id')::uuid;

  perform pg_temp.add_core31_check(
    'D_substitute_enters_60_exits_89_29',
    (select minutes from public.partido_estadisticas_jugador where partido_id = match_chain and jugador_id = player_ids[12]) = '29',
    'el suplente encadenado usa salida menos entrada'
  );
  perform pg_temp.add_core31_check(
    'E_second_substitute_enters_89_1',
    (select minutes from public.partido_estadisticas_jugador where partido_id = match_chain and jugador_id = player_ids[13]) = '1',
    'el segundo suplente suma hasta el final'
  );
  perform pg_temp.add_core31_check(
    'F_full_chain_two_events',
    (select pg_catalog.count(*) from public.partido_eventos_sustitucion where partido_id = match_chain) = 2
      and (result->'events'->0->>'minute')::integer = 60
      and (result->'events'->1->>'minute')::integer = 89
      and (result->'events'->0->>'incoming_jugador_id')::uuid = player_ids[12]
      and (result->'events'->1->>'outgoing_jugador_id')::uuid = player_ids[12],
    'el suplente es primero entrante y despues saliente en dos eventos separados'
  );

  denied := false;
  begin
    perform public.mutate_match_substitution_atomic('create', match_chain, null,
      pg_catalog.jsonb_build_object('minute', 90, 'event_order', 0,
        'outgoing_jugador_id', player_ids[2], 'incoming_jugador_id', player_ids[12]), 90);
  exception when check_violation then denied := true; end;
  perform pg_temp.add_core31_check('T_reentry_rejected', denied, 'un jugador que ya salio no puede volver a entrar');

  result := public.mutate_match_substitution_atomic('create', match_chain, null,
    pg_catalog.jsonb_build_object('minute', 80, 'event_order', 0,
      'outgoing_jugador_id', player_ids[2], 'incoming_jugador_id', player_ids[14]), 90);
  same_event_one := (result->'event'->>'id')::uuid;
  result := public.mutate_match_substitution_atomic('create', match_chain, null,
    pg_catalog.jsonb_build_object('minute', 80, 'event_order', 1,
      'outgoing_jugador_id', player_ids[3], 'incoming_jugador_id', player_ids[15]), 90);
  same_event_two := (result->'event'->>'id')::uuid;
  perform pg_temp.add_core31_check(
    'G_same_minute_event_order',
    (select pg_catalog.array_agg(event.id order by event.minute, event.event_order)
     from public.partido_eventos_sustitucion event
     where event.id in (same_event_one, same_event_two)) = array[same_event_one, same_event_two],
    'dos cambios en 80 se ordenan por event_order 0 y 1'
  );

  denied := false;
  begin
    perform public.mutate_match_substitution_atomic('create', match_chain, null,
      pg_catalog.jsonb_build_object('minute', 81, 'event_order', 0,
        'outgoing_jugador_id', player_ids[16], 'incoming_jugador_id', player_ids[6]), 90);
  exception when check_violation then denied := true; end;
  perform pg_temp.add_core31_check('H_outgoing_out_rejected', denied, 'un jugador fuera no puede salir');

  denied := false;
  begin
    perform public.mutate_match_substitution_atomic('create', match_chain, null,
      pg_catalog.jsonb_build_object('minute', 81, 'event_order', 0,
        'outgoing_jugador_id', player_ids[4], 'incoming_jugador_id', player_ids[5]), 90);
  exception when check_violation then denied := true; end;
  perform pg_temp.add_core31_check('I_incoming_inside_rejected', denied, 'un jugador dentro no puede volver a entrar');

  denied := false;
  begin
    perform public.mutate_match_substitution_atomic('create', match_chain, null,
      pg_catalog.jsonb_build_object('minute', 91, 'event_order', 0,
        'outgoing_jugador_id', player_ids[4], 'incoming_jugador_id', player_ids[16]), 90);
  exception when invalid_parameter_value then denied := true; end;
  perform pg_temp.add_core31_check('J_minute_out_of_range_rejected', denied, '91 se rechaza para duracion 90');

  execute 'reset role';
  perform pg_catalog.set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub', player_user_id, 'role', 'authenticated')::text, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  denied := false;
  begin perform public.mutate_match_substitution_atomic('delete', match_chain, first_event_id, null, 90);
  exception when insufficient_privilege then denied := true; end;
  perform pg_temp.add_core31_check('K_player_denied', denied, 'PLAYER no puede mutar sustituciones');

  execute 'reset role';
  perform pg_catalog.set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub', viewer_user_id, 'role', 'authenticated')::text, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', viewer_user_id::text, true);
  execute 'set local role authenticated';
  denied := false;
  begin perform public.get_match_substitution_events(match_chain);
  exception when insufficient_privilege then denied := true; end;
  perform pg_temp.add_core31_check('L_viewer_denied', denied, 'VIEWER no puede leer ni gestionar por RPC');

  execute 'reset role';
  perform pg_catalog.set_config('request.jwt.claims', '{}'::jsonb::text, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'anon', true);
  execute 'set local role anon';
  denied := false;
  begin perform public.get_match_substitution_events(match_chain);
  exception when insufficient_privilege then denied := true; end;
  perform pg_temp.add_core31_check('M_anon_denied', denied, 'ANON no tiene EXECUTE ni acceso de tabla');

  execute 'reset role';
  perform pg_catalog.set_config('request.jwt.claims', pg_catalog.jsonb_build_object('sub', staff_user_id, 'role', 'authenticated')::text, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  result := public.get_match_substitution_events(match_chain);
  perform pg_temp.add_core31_check('N_staff_allowed', pg_catalog.jsonb_array_length(result->'events') = 4, 'STAFF obtiene los cuatro eventos actuales');

  result := public.mutate_match_substitution_atomic('create', match_legacy, null,
    pg_catalog.jsonb_build_object('minute', 70, 'event_order', 0,
      'outgoing_jugador_id', player_ids[2], 'incoming_jugador_id', player_ids[14]), 90);
  perform pg_temp.add_core31_check(
    'O_legacy_materializable',
    (result->>'materialized_legacy_events')::integer = 1
      and pg_catalog.jsonb_array_length(result->'events') = 2
      and (select minutes from public.partido_estadisticas_jugador where partido_id = match_legacy and jugador_id = player_ids[1]) = '60'
      and (select minutes from public.partido_estadisticas_jugador where partido_id = match_legacy and jugador_id = player_ids[12]) = '30',
    'el cambio legacy resoluble se materializa antes de la nueva escritura'
  );

  denied := false;
  error_text := '';
  begin
    perform public.mutate_match_substitution_atomic('create', match_ambiguous, null,
      pg_catalog.jsonb_build_object('minute', 50, 'event_order', 0,
        'outgoing_jugador_id', player_ids[1], 'incoming_jugador_id', player_ids[14]), 90);
  exception when others then
    denied := true;
    error_text := sqlerrm;
  end;
  perform pg_temp.add_core31_check(
    'P_legacy_ambiguous_controlled_error',
    denied and error_text like 'LEGACY_SUBSTITUTION_AMBIGUOUS:%'
      and not exists (select 1 from public.partido_eventos_sustitucion where partido_id = match_ambiguous),
    'un suplente legacy con replacement_name no inventa minuto absoluto ni deja escritura parcial'
  );

  result := public.mutate_match_substitution_atomic('delete', match_chain, second_event_id, null, 90);
  perform pg_temp.add_core31_check(
    'Q_delete_recalculates',
    (select minutes from public.partido_estadisticas_jugador where partido_id = match_chain and jugador_id = player_ids[12]) = '30'
      and (select minutes from public.partido_estadisticas_jugador where partido_id = match_chain and jugador_id = player_ids[13]) = '0',
    'borrar el segundo cambio prolonga al primer suplente y deja a Julio sin jugar'
  );

  result := public.mutate_match_substitution_atomic('create', match_chain, null,
    pg_catalog.jsonb_build_object('minute', 89, 'event_order', 0,
      'outgoing_jugador_id', player_ids[12], 'incoming_jugador_id', player_ids[13], 'reason', 'injury'), 90);
  second_event_id := (result->'event'->>'id')::uuid;
  result := public.mutate_match_substitution_atomic('update', match_chain, second_event_id,
    pg_catalog.jsonb_build_object('minute', 80, 'event_order', 2,
      'outgoing_jugador_id', player_ids[12], 'incoming_jugador_id', player_ids[13], 'reason', 'discomfort'), 90);
  perform pg_temp.add_core31_check(
    'R_update_recalculates',
    (select minutes from public.partido_estadisticas_jugador where partido_id = match_chain and jugador_id = player_ids[12]) = '20'
      and (select minutes from public.partido_estadisticas_jugador where partido_id = match_chain and jugador_id = player_ids[13]) = '10'
      and (result->'event'->>'reason') = 'discomfort',
    'editar minuto/orden/motivo revalida y recalcula la secuencia completa'
  );

  perform pg_temp.add_core31_check(
    'S_minutes_and_replacement_projection',
    (select replacement_name from public.partido_estadisticas_jugador where partido_id = match_chain and jugador_id = player_ids[1]) = player_names[12]
      and (select replacement_name from public.partido_estadisticas_jugador where partido_id = match_chain and jugador_id = player_ids[12]) = ''
      and (select minutes from public.partido_estadisticas_jugador where partido_id = match_chain and jugador_id = player_ids[1]) = '60'
      and (select minutes from public.partido_estadisticas_jugador where partido_id = match_chain and jugador_id = player_ids[12]) = '20',
    'starter simple conserva replacement_name; suplente encadenado solo proyecta minutos'
  );

  execute 'reset role';
end;
$runtime$;

do $assertions$
declare
  failed text;
  check_count integer;
begin
  select pg_catalog.count(*) into check_count from pg_temp.core31_results;
  select pg_catalog.string_agg(result.test_name || ': ' || result.details, E'\n' order by result.seq)
  into failed
  from pg_temp.core31_results result
  where not result.test_ok;
  if check_count <> 31 then
    raise exception 'Verify 31: se esperaban 31 checks y se registraron %', check_count;
  end if;
  if failed is not null then
    raise exception 'Verify 31 fallo:%', E'\n' || failed;
  end if;
end;
$assertions$;

select seq, test_name, test_ok, details
from pg_temp.core31_results
order by seq;

rollback;
