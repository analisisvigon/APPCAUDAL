-- NEXO CLUB / Videoanalisis 01A: autorizacion CTS de sustituciones.
-- PENDIENTE DE REVISION. NO EJECUTAR sin verificar la huella desplegada.
-- CREATE OR REPLACE conserva owner, firma, defaults y ACL existentes.

begin;
lock table public.partido_eventos_sustitucion in share row exclusive mode;
lock table public.partido_estadisticas_jugador in share row exclusive mode;

do $pre$
declare
  v_routine pg_catalog.pg_proc%rowtype;
  v_read pg_catalog.pg_proc%rowtype;
  v_policy record;
  v_helper record;
  v_stats_policy record;
  v_stats_old_count integer := 0;
  v_stats_new_count integer := 0;
  v_is_old boolean;
  v_is_new boolean;
  v_source_md5 text;
begin
  if current_user <> 'postgres' or auth.uid() is not null then
    raise exception 'Videoanalisis 01A: ejecutar como postgres sin JWT de usuario';
  end if;
  if pg_catalog.to_regclass('public.partidos') is null
     or pg_catalog.to_regclass('public.partido_eventos_sustitucion') is null
     or pg_catalog.to_regclass('public.partido_estadisticas_jugador') is null
     or pg_catalog.to_regprocedure('public.can_write_match(uuid)') is null
     or pg_catalog.to_regprocedure('public.can_read_match(uuid)') is null then
    raise exception 'Videoanalisis 01A: faltan tablas o helper de autorizacion';
  end if;
  for v_helper in
    select expected.signature, expected.source_md5, routine.oid,
           routine.prosrc, routine.proowner, routine.prosecdef, routine.proconfig
    from (values
      ('public.can_read_club_team_season(uuid)',
        'bbb2e5a9a81767749a2a26504a890442'),
      ('public.can_write_club_team_season(uuid)',
        'fc4a0e2c43689095da249ca834a2bde1'),
      ('public.can_read_match(uuid)',
        'ff69e4e15caed0a5e65f856ddfd94e61'),
      ('public.can_write_match(uuid)',
        '6bab76b45b9983a45a3a3dcb378a0096')
    ) as expected(signature,source_md5)
    left join pg_catalog.pg_proc routine
      on routine.oid = pg_catalog.to_regprocedure(expected.signature)
  loop
    if v_helper.oid is null or not v_helper.prosecdef
       or v_helper.proowner <> 'postgres'::regrole
       or v_helper.proconfig is distinct from array['search_path=pg_catalog']::text[]
       or pg_catalog.md5(pg_catalog.replace(
         v_helper.prosrc,E'\r\n',E'\n')) <> v_helper.source_md5
       or not pg_catalog.has_function_privilege(
         'authenticated',v_helper.oid,'EXECUTE')
       or pg_catalog.has_function_privilege('anon',v_helper.oid,'EXECUTE') then
      raise exception 'Videoanalisis 01A: helper desplegado incompatible: %',
        v_helper.signature;
    end if;
  end loop;
  if (select count(*) from pg_catalog.pg_proc routine
      join pg_catalog.pg_namespace namespace
        on namespace.oid = routine.pronamespace
      where namespace.nspname = 'public'
        and routine.proname = 'mutate_match_substitution_atomic') <> 1 then
    raise exception 'Videoanalisis 01A: sobrecarga ausente o conflictiva';
  end if;
  select * into v_routine
  from pg_catalog.pg_proc
  where oid = pg_catalog.to_regprocedure(
    'public.mutate_match_substitution_atomic(text,uuid,uuid,jsonb,integer)');
  if not found or v_routine.prokind <> 'f'
     or v_routine.prorettype <> 'jsonb'::regtype
     or v_routine.pronargdefaults <> 1
     or v_routine.proargnames is distinct from array[
       'p_operation','p_partido_id','p_event_id','p_event','p_match_duration']::text[]
     or v_routine.prolang <> (select language.oid
       from pg_catalog.pg_language language where language.lanname = 'plpgsql')
     or v_routine.provolatile::text <> 'v'
     or not v_routine.prosecdef
     or v_routine.proowner <> 'postgres'::regrole
     or v_routine.proconfig is distinct from array['search_path=pg_catalog']::text[]
     or not pg_catalog.has_function_privilege(
       'authenticated',v_routine.oid,'EXECUTE')
     or not pg_catalog.has_function_privilege(
       'service_role',v_routine.oid,'EXECUTE')
     or pg_catalog.has_function_privilege('anon',v_routine.oid,'EXECUTE') then
    raise exception 'Videoanalisis 01A: contrato o privilegios de la RPC incompatibles';
  end if;
  v_source_md5 := pg_catalog.md5(pg_catalog.replace(
    v_routine.prosrc, E'\r\n', E'\n'));
  if v_source_md5 not in (
    'd5961a8a85c1fe340e5bb160fe4c6b28',
    '745bd5f2d80cef1815a33698d30b2f2b'
  ) then
    raise exception 'Videoanalisis 01A: cuerpo desplegado distinto del contrato revisado (%)',
      v_source_md5;
  end if;
  perform pg_catalog.set_config('nexo.video_analysis_01a_acl_before',
    coalesce(v_routine.proacl::text, '<NULL>'), true);

  if (select count(*) from pg_catalog.pg_proc routine
      join pg_catalog.pg_namespace namespace
        on namespace.oid = routine.pronamespace
      where namespace.nspname = 'public'
        and routine.proname = 'get_match_substitution_events') <> 1 then
    raise exception 'Videoanalisis 01A: consulta de sustituciones ausente o sobrecargada';
  end if;
  select * into v_read from pg_catalog.pg_proc
  where oid = pg_catalog.to_regprocedure(
    'public.get_match_substitution_events(uuid)');
  if not found or v_read.prokind <> 'f'
     or v_read.prorettype <> 'jsonb'::regtype
     or v_read.proargnames is distinct from array['p_partido_id']::text[]
     or v_read.pronargdefaults <> 0
     or v_read.prolang <> (select language.oid
       from pg_catalog.pg_language language where language.lanname = 'plpgsql')
     or v_read.provolatile::text <> 's'
     or not v_read.prosecdef
     or v_read.proowner <> 'postgres'::regrole
     or v_read.proconfig is distinct from array['search_path=pg_catalog']::text[]
     or not pg_catalog.has_function_privilege(
       'authenticated',v_read.oid,'EXECUTE')
     or not pg_catalog.has_function_privilege(
       'service_role',v_read.oid,'EXECUTE')
     or pg_catalog.has_function_privilege('anon',v_read.oid,'EXECUTE')
     or pg_catalog.md5(pg_catalog.replace(v_read.prosrc,E'\r\n',E'\n'))
       not in ('6ee09faf368fa5fba7e2b90032207e2a',
               '5abccd5fdb69b1476268d72a1a2b3180') then
    raise exception 'Videoanalisis 01A: consulta desplegada incompatible';
  end if;
  perform pg_catalog.set_config('nexo.video_analysis_01a_read_acl_before',
    coalesce(v_read.proacl::text, '<NULL>'), true);

  if not (select relation.relrowsecurity from pg_catalog.pg_class relation
          where relation.oid = 'public.partido_eventos_sustitucion'::regclass)
     or not pg_catalog.has_table_privilege(
       'authenticated','public.partido_eventos_sustitucion','SELECT')
     or pg_catalog.has_table_privilege(
       'authenticated','public.partido_eventos_sustitucion','INSERT')
     or pg_catalog.has_table_privilege(
       'authenticated','public.partido_eventos_sustitucion','UPDATE')
     or pg_catalog.has_table_privilege(
       'authenticated','public.partido_eventos_sustitucion','DELETE')
     or pg_catalog.has_table_privilege(
       'authenticated','public.partido_eventos_sustitucion','TRUNCATE')
     or pg_catalog.has_table_privilege(
       'authenticated','public.partido_eventos_sustitucion','TRIGGER')
     or pg_catalog.has_table_privilege(
       'anon','public.partido_eventos_sustitucion','TRUNCATE')
     or (select count(*) from pg_catalog.pg_policy policy
         where policy.polrelid = 'public.partido_eventos_sustitucion'::regclass) <> 1 then
    raise exception 'Videoanalisis 01A: RLS o privilegios de sustituciones incompatibles';
  end if;
  select policy.polname, policy.polcmd::text as command_code,
         policy.polpermissive, policy.polroles,
         pg_catalog.lower(pg_catalog.regexp_replace(
           pg_catalog.replace(coalesce(pg_catalog.pg_get_expr(
             policy.polqual,policy.polrelid),''),'public.',''),
           '[[:space:]()]','','g')) as normalized_using
  into v_policy
  from pg_catalog.pg_policy policy
  where policy.polrelid = 'public.partido_eventos_sustitucion'::regclass;
  if v_policy.polname <> 'substitution_staff_select'
     or v_policy.command_code <> 'r'
     or not v_policy.polpermissive
     or v_policy.polroles <> array['authenticated'::regrole::oid]
     or v_policy.normalized_using not in (
       'is_app_staff','can_read_matchpartido_id') then
    raise exception 'Videoanalisis 01A: policy SELECT de sustituciones incompatible';
  end if;

  if not (select relation.relrowsecurity from pg_catalog.pg_class relation
          where relation.oid = 'public.partido_estadisticas_jugador'::regclass)
     or not (pg_catalog.has_table_privilege(
       'authenticated','public.partido_estadisticas_jugador','SELECT')
       and pg_catalog.has_table_privilege(
       'authenticated','public.partido_estadisticas_jugador','INSERT')
       and pg_catalog.has_table_privilege(
       'authenticated','public.partido_estadisticas_jugador','UPDATE')
       and pg_catalog.has_table_privilege(
       'authenticated','public.partido_estadisticas_jugador','DELETE'))
     or pg_catalog.has_table_privilege(
       'authenticated','public.partido_estadisticas_jugador','TRUNCATE')
     or pg_catalog.has_table_privilege(
       'authenticated','public.partido_estadisticas_jugador','TRIGGER')
     or pg_catalog.has_table_privilege(
       'anon','public.partido_estadisticas_jugador','TRUNCATE')
     or (select count(*) from pg_catalog.pg_policy policy
         where policy.polrelid = 'public.partido_estadisticas_jugador'::regclass) <> 4 then
    raise exception 'Videoanalisis 01A: RLS o grants de estadisticas incompatibles';
  end if;
  for v_stats_policy in
    select policy.polname, policy.polcmd::text as command_code,
           policy.polpermissive, policy.polroles,
           lower(pg_catalog.regexp_replace(replace(coalesce(
             pg_catalog.pg_get_expr(policy.polqual,policy.polrelid),''),
             'public.',''),'[[:space:]()]','','g')) as using_normalized,
           lower(pg_catalog.regexp_replace(replace(coalesce(
             pg_catalog.pg_get_expr(policy.polwithcheck,policy.polrelid),''),
             'public.',''),'[[:space:]()]','','g')) as check_normalized
    from pg_catalog.pg_policy policy
    where policy.polrelid = 'public.partido_estadisticas_jugador'::regclass
  loop
    if not v_stats_policy.polpermissive
       or v_stats_policy.polroles <> array['authenticated'::regrole::oid]
       or (v_stats_policy.polname,v_stats_policy.command_code) not in (
         ('player_sports_staff_select','r'),
         ('player_sports_staff_insert','a'),
         ('player_sports_staff_update','w'),
         ('player_sports_staff_delete','d')) then
      raise exception 'Videoanalisis 01A: policy de estadisticas inesperada: %',
        v_stats_policy.polname;
    end if;
    v_is_old := case v_stats_policy.command_code
      when 'r' then v_stats_policy.using_normalized = 'is_app_staff'
                    and v_stats_policy.check_normalized = ''
      when 'a' then v_stats_policy.using_normalized = ''
                    and v_stats_policy.check_normalized = 'is_app_staff'
      when 'w' then v_stats_policy.using_normalized = 'is_app_staff'
                    and v_stats_policy.check_normalized = 'is_app_staff'
      when 'd' then v_stats_policy.using_normalized = 'is_app_staff'
                    and v_stats_policy.check_normalized = ''
      else false end;
    v_is_new := case v_stats_policy.command_code
      when 'r' then v_stats_policy.using_normalized = 'can_read_matchpartido_id'
                    and v_stats_policy.check_normalized = ''
      when 'a' then v_stats_policy.using_normalized = ''
                    and v_stats_policy.check_normalized = 'can_write_matchpartido_id'
      when 'w' then v_stats_policy.using_normalized = 'can_write_matchpartido_id'
                    and v_stats_policy.check_normalized = 'can_write_matchpartido_id'
      when 'd' then v_stats_policy.using_normalized = 'can_write_matchpartido_id'
                    and v_stats_policy.check_normalized = ''
      else false end;
    if v_is_old then v_stats_old_count := v_stats_old_count + 1; end if;
    if v_is_new then v_stats_new_count := v_stats_new_count + 1; end if;
  end loop;
  if v_stats_old_count <> 4 and v_stats_new_count <> 4 then
    raise exception 'Videoanalisis 01A: policies de estadisticas mixtas o incompatibles';
  end if;
end
$pre$;

create or replace function public.mutate_match_substitution_atomic(
  p_operation text,
  p_partido_id uuid,
  p_event_id uuid,
  p_event jsonb,
  p_match_duration integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  normalized_operation text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_operation, '')));
  match_duration integer;
  initial_player_ids uuid[] := array[]::uuid[];
  on_field_player_ids uuid[] := array[]::uuid[];
  substituted_out_player_ids uuid[] := array[]::uuid[];
  entry_minutes jsonb := '{}'::jsonb;
  played_minutes jsonb := '{}'::jsonb;
  result_events jsonb;
  result_minutes jsonb;
  saved_event jsonb;
  materialized_count integer := 0;
  lineup_row record;
  legacy_row record;
  event_row record;
  current_player_id uuid;
  outgoing_player_id uuid;
  incoming_player_id uuid;
  outgoing_name text;
  incoming_name text;
  normalized_reason text;
  event_minute integer;
  event_order_value integer;
  identity_count integer;
  entered_at integer;
  accumulated_minutes integer;
begin
  if auth.uid() is null then
    raise exception 'SUBSTITUTION_STAFF_REQUIRED' using errcode = '42501';
  end if;
  if normalized_operation not in ('materialize', 'create', 'update', 'delete') then
    raise exception 'SUBSTITUTION_OPERATION_INVALID' using errcode = '22023';
  end if;
  if p_partido_id is null then
    raise exception 'SUBSTITUTION_MATCH_REQUIRED' using errcode = '22023';
  end if;
  if public.can_write_match(p_partido_id) is not true then
    raise exception 'SUBSTITUTION_MATCH_WRITE_FORBIDDEN' using errcode = '42501';
  end if;
  if normalized_operation in ('update', 'delete') and p_event_id is null then
    raise exception 'SUBSTITUTION_EVENT_ID_REQUIRED' using errcode = '22023';
  end if;
  if normalized_operation in ('create', 'update')
     and pg_catalog.jsonb_typeof(coalesce(p_event, 'null'::jsonb)) <> 'object' then
    raise exception 'SUBSTITUTION_PAYLOAD_INVALID' using errcode = '22023';
  end if;
  if p_match_duration is not null and p_match_duration <= 0 then
    raise exception 'SUBSTITUTION_DURATION_INVALID' using errcode = '22023';
  end if;

  perform 1
  from public.partidos match_row
  where match_row.id = p_partido_id
  for update;
  if not found then
    raise exception 'SUBSTITUTION_MATCH_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_match_duration is not null then
    match_duration := p_match_duration;
  else
    select pg_catalog.greatest(
      90,
      coalesce(pg_catalog.max(
        case
          when pg_catalog.btrim(stats.minutes::text) ~ '^[0-9]+$'
            then pg_catalog.btrim(stats.minutes::text)::integer
          else null
        end
      ), 90)
    )
    into match_duration
    from public.partido_estadisticas_jugador stats
    where stats.partido_id = p_partido_id;
  end if;

  for lineup_row in
    select lineup.slot, lineup.jugador_id, lineup.player_name
    from public.partido_alineacion_slots lineup
    where lineup.partido_id = p_partido_id
      and lineup.scope = 'stats'
    order by lineup.slot
  loop
    current_player_id := lineup_row.jugador_id;
    if current_player_id is null then
      select pg_catalog.count(distinct stats.jugador_id), pg_catalog.min(stats.jugador_id::text)::uuid
      into identity_count, current_player_id
      from public.partido_estadisticas_jugador stats
      where stats.partido_id = p_partido_id
        and stats.jugador_id is not null
        and pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(stats.player_name), '[[:space:]]+', ' ', 'g'))
          = pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(lineup_row.player_name), '[[:space:]]+', ' ', 'g'));
      if identity_count <> 1 then
        raise exception 'SUBSTITUTION_LINEUP_IDENTITY_AMBIGUOUS:%', coalesce(lineup_row.player_name, '')
          using errcode = 'P0001';
      end if;
    end if;
    if current_player_id = any(initial_player_ids) then
      raise exception 'SUBSTITUTION_LINEUP_DUPLICATE_PLAYER:%', current_player_id
        using errcode = '23514';
    end if;
    select pg_catalog.count(*) into identity_count
    from public.partido_estadisticas_jugador stats
    where stats.partido_id = p_partido_id
      and stats.jugador_id = current_player_id;
    if identity_count <> 1 then
      raise exception 'SUBSTITUTION_LINEUP_STATS_IDENTITY_INVALID:%', current_player_id
        using errcode = '23514';
    end if;
    initial_player_ids := pg_catalog.array_append(initial_player_ids, current_player_id);
  end loop;

  if pg_catalog.cardinality(initial_player_ids) <> 11 then
    raise exception 'SUBSTITUTION_LINEUP_REQUIRES_ELEVEN_CANONICAL_PLAYERS'
      using errcode = '23514';
  end if;

  -- La primera escritura de un partido historico materializa todos los
  -- replacement_name resolubles. Un saliente legacy no titular es ambiguo:
  -- su columna minutes ya representa duracion jugada, no minuto absoluto.
  if not exists (
    select 1 from public.partido_eventos_sustitucion existing
    where existing.partido_id = p_partido_id
  ) then
    for legacy_row in
      select stats.*
      from public.partido_estadisticas_jugador stats
      where stats.partido_id = p_partido_id
        and nullif(pg_catalog.btrim(coalesce(stats.replacement_name, '')), '') is not null
      order by
        case when pg_catalog.btrim(stats.minutes::text) ~ '^[0-9]+$'
          then pg_catalog.btrim(stats.minutes::text)::integer else 2147483647 end,
        stats.jugador_id
    loop
      if legacy_row.jugador_id is null
         or not (legacy_row.jugador_id = any(initial_player_ids))
         or pg_catalog.btrim(legacy_row.minutes::text) !~ '^[0-9]+$'
         or pg_catalog.btrim(legacy_row.minutes::text)::integer > match_duration then
        raise exception 'LEGACY_SUBSTITUTION_AMBIGUOUS:%', legacy_row.player_name
          using errcode = 'P0001';
      end if;

      select pg_catalog.count(distinct stats.jugador_id),
             pg_catalog.min(stats.jugador_id::text)::uuid,
             pg_catalog.min(stats.player_name)
      into identity_count, incoming_player_id, incoming_name
      from public.partido_estadisticas_jugador stats
      where stats.partido_id = p_partido_id
        and stats.jugador_id is not null
        and pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(stats.player_name), '[[:space:]]+', ' ', 'g'))
          = pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(legacy_row.replacement_name), '[[:space:]]+', ' ', 'g'));
      if identity_count <> 1 or incoming_player_id is null then
        raise exception 'LEGACY_SUBSTITUTION_AMBIGUOUS:%', legacy_row.replacement_name
          using errcode = 'P0001';
      end if;

      event_minute := pg_catalog.btrim(legacy_row.minutes::text)::integer;
      select coalesce(pg_catalog.max(existing.event_order), -1) + 1
      into event_order_value
      from public.partido_eventos_sustitucion existing
      where existing.partido_id = p_partido_id
        and existing.minute = event_minute;

      insert into public.partido_eventos_sustitucion (
        partido_id, minute, event_order,
        outgoing_jugador_id, incoming_jugador_id,
        outgoing_name_snapshot, incoming_name_snapshot, reason
      ) values (
        p_partido_id, event_minute, event_order_value,
        legacy_row.jugador_id, incoming_player_id,
        pg_catalog.btrim(legacy_row.player_name), pg_catalog.btrim(incoming_name), null
      );
      materialized_count := materialized_count + 1;
    end loop;
  end if;

  if normalized_operation in ('create', 'update') then
    if coalesce(p_event->>'minute', '') !~ '^[0-9]+$'
       or coalesce(p_event->>'event_order', '') !~ '^[0-9]+$' then
      raise exception 'SUBSTITUTION_MINUTE_OR_ORDER_INVALID' using errcode = '22023';
    end if;
    event_minute := (p_event->>'minute')::integer;
    event_order_value := (p_event->>'event_order')::integer;
    if event_minute > match_duration then
      raise exception 'SUBSTITUTION_MINUTE_OUT_OF_RANGE' using errcode = '22023';
    end if;
    begin
      outgoing_player_id := nullif(p_event->>'outgoing_jugador_id', '')::uuid;
      incoming_player_id := nullif(p_event->>'incoming_jugador_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'SUBSTITUTION_PLAYER_ID_INVALID' using errcode = '22023';
    end;
    if outgoing_player_id is null or incoming_player_id is null then
      raise exception 'SUBSTITUTION_PLAYER_ID_REQUIRED' using errcode = '22023';
    end if;
    if outgoing_player_id = incoming_player_id then
      raise exception 'SUBSTITUTION_PLAYERS_MUST_DIFFER' using errcode = '23514';
    end if;
    normalized_reason := nullif(pg_catalog.lower(pg_catalog.btrim(p_event->>'reason')), '');
    if normalized_reason is not null
       and normalized_reason not in ('tactical', 'injury', 'discomfort', 'other') then
      raise exception 'SUBSTITUTION_REASON_INVALID' using errcode = '22023';
    end if;

    select pg_catalog.count(*), pg_catalog.min(stats.player_name)
    into identity_count, outgoing_name
    from public.partido_estadisticas_jugador stats
    where stats.partido_id = p_partido_id
      and stats.jugador_id = outgoing_player_id;
    if identity_count <> 1 then
      raise exception 'SUBSTITUTION_OUTGOING_STATS_IDENTITY_INVALID'
        using errcode = '23514';
    end if;
    select pg_catalog.count(*), pg_catalog.min(stats.player_name)
    into identity_count, incoming_name
    from public.partido_estadisticas_jugador stats
    where stats.partido_id = p_partido_id
      and stats.jugador_id = incoming_player_id;
    if identity_count <> 1 then
      raise exception 'SUBSTITUTION_INCOMING_STATS_IDENTITY_INVALID'
        using errcode = '23514';
    end if;

    if exists (
      select 1 from public.partido_eventos_sustitucion existing
      where existing.partido_id = p_partido_id
        and existing.minute = event_minute
        and existing.event_order = event_order_value
        and existing.id is distinct from p_event_id
    ) then
      raise exception 'SUBSTITUTION_EVENT_ORDER_DUPLICATE' using errcode = '23505';
    end if;

    if normalized_operation = 'create' then
      insert into public.partido_eventos_sustitucion (
        partido_id, minute, event_order,
        outgoing_jugador_id, incoming_jugador_id,
        outgoing_name_snapshot, incoming_name_snapshot, reason
      ) values (
        p_partido_id, event_minute, event_order_value,
        outgoing_player_id, incoming_player_id,
        pg_catalog.btrim(outgoing_name), pg_catalog.btrim(incoming_name), normalized_reason
      ) returning pg_catalog.to_jsonb(partido_eventos_sustitucion) into saved_event;
    else
      update public.partido_eventos_sustitucion existing
      set minute = event_minute,
          event_order = event_order_value,
          outgoing_jugador_id = outgoing_player_id,
          incoming_jugador_id = incoming_player_id,
          outgoing_name_snapshot = pg_catalog.btrim(outgoing_name),
          incoming_name_snapshot = pg_catalog.btrim(incoming_name),
          reason = normalized_reason
      where existing.id = p_event_id
        and existing.partido_id = p_partido_id
      returning pg_catalog.to_jsonb(existing) into saved_event;
      if saved_event is null then
        raise exception 'SUBSTITUTION_EVENT_NOT_FOUND' using errcode = 'P0002';
      end if;
    end if;
  elsif normalized_operation = 'delete' then
    delete from public.partido_eventos_sustitucion existing
    where existing.id = p_event_id
      and existing.partido_id = p_partido_id
    returning pg_catalog.to_jsonb(existing) into saved_event;
    if saved_event is null then
      raise exception 'SUBSTITUTION_EVENT_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  on_field_player_ids := initial_player_ids;
  foreach current_player_id in array initial_player_ids loop
    entry_minutes := pg_catalog.jsonb_set(entry_minutes, array[current_player_id::text], '0'::jsonb, true);
    played_minutes := pg_catalog.jsonb_set(played_minutes, array[current_player_id::text], '0'::jsonb, true);
  end loop;

  for event_row in
    select event.*
    from public.partido_eventos_sustitucion event
    where event.partido_id = p_partido_id
    order by event.minute, event.event_order, event.id
  loop
    if event_row.minute > match_duration then
      raise exception 'SUBSTITUTION_MINUTE_OUT_OF_RANGE:%', event_row.id
        using errcode = '22023';
    end if;
    select pg_catalog.count(*) into identity_count
    from public.partido_estadisticas_jugador stats
    where stats.partido_id = p_partido_id
      and stats.jugador_id = event_row.outgoing_jugador_id;
    if identity_count <> 1 then
      raise exception 'SUBSTITUTION_OUTGOING_STATS_IDENTITY_INVALID:%', event_row.id
        using errcode = '23514';
    end if;
    select pg_catalog.count(*) into identity_count
    from public.partido_estadisticas_jugador stats
    where stats.partido_id = p_partido_id
      and stats.jugador_id = event_row.incoming_jugador_id;
    if identity_count <> 1 then
      raise exception 'SUBSTITUTION_INCOMING_STATS_IDENTITY_INVALID:%', event_row.id
        using errcode = '23514';
    end if;
    if not (event_row.outgoing_jugador_id = any(on_field_player_ids)) then
      raise exception 'SUBSTITUTION_OUTGOING_NOT_ON_FIELD:%', event_row.id
        using errcode = '23514';
    end if;
    if event_row.incoming_jugador_id = any(on_field_player_ids) then
      raise exception 'SUBSTITUTION_INCOMING_ALREADY_ON_FIELD:%', event_row.id
        using errcode = '23514';
    end if;
    if event_row.incoming_jugador_id = any(substituted_out_player_ids) then
      raise exception 'SUBSTITUTION_REENTRY_NOT_SUPPORTED:%', event_row.id
        using errcode = '23514';
    end if;
    entered_at := (entry_minutes->>event_row.outgoing_jugador_id::text)::integer;
    if entered_at is null or event_row.minute < entered_at then
      raise exception 'SUBSTITUTION_EXIT_BEFORE_ENTRY:%', event_row.id
        using errcode = '23514';
    end if;
    accumulated_minutes := coalesce((played_minutes->>event_row.outgoing_jugador_id::text)::integer, 0)
      + event_row.minute - entered_at;
    played_minutes := pg_catalog.jsonb_set(
      played_minutes,
      array[event_row.outgoing_jugador_id::text],
      pg_catalog.to_jsonb(accumulated_minutes),
      true
    );
    on_field_player_ids := pg_catalog.array_remove(on_field_player_ids, event_row.outgoing_jugador_id);
    substituted_out_player_ids := pg_catalog.array_append(substituted_out_player_ids, event_row.outgoing_jugador_id);
    on_field_player_ids := pg_catalog.array_append(on_field_player_ids, event_row.incoming_jugador_id);
    entry_minutes := entry_minutes - event_row.outgoing_jugador_id::text;
    entry_minutes := pg_catalog.jsonb_set(
      entry_minutes,
      array[event_row.incoming_jugador_id::text],
      pg_catalog.to_jsonb(event_row.minute),
      true
    );
    if not (played_minutes ? event_row.incoming_jugador_id::text) then
      played_minutes := pg_catalog.jsonb_set(
        played_minutes,
        array[event_row.incoming_jugador_id::text],
        '0'::jsonb,
        true
      );
    end if;
  end loop;

  foreach current_player_id in array on_field_player_ids loop
    entered_at := (entry_minutes->>current_player_id::text)::integer;
    accumulated_minutes := coalesce((played_minutes->>current_player_id::text)::integer, 0)
      + match_duration - entered_at;
    played_minutes := pg_catalog.jsonb_set(
      played_minutes,
      array[current_player_id::text],
      pg_catalog.to_jsonb(accumulated_minutes),
      true
    );
  end loop;

  update public.partido_estadisticas_jugador stats
  set minutes = coalesce(played_minutes->>stats.jugador_id::text, '0')
  where stats.partido_id = p_partido_id
    and stats.jugador_id is not null;

  -- replacement_name solo conserva cambios simples de titulares que no
  -- volvieron a entrar y cuyo minuto absoluto coincide con minutos jugados.
  -- Un suplente que entra y sale conserva minutes, pero su salida vive solo
  -- en partido_eventos_sustitucion para no crear una semantica falsa.
  update public.partido_estadisticas_jugador stats
  set replacement_name = coalesce((
    select event.incoming_name_snapshot
    from public.partido_eventos_sustitucion event
    where event.partido_id = p_partido_id
      and event.outgoing_jugador_id = stats.jugador_id
      and stats.jugador_id = any(initial_player_ids)
      and event.minute = coalesce((played_minutes->>stats.jugador_id::text)::integer, -1)
      and not exists (
        select 1
        from public.partido_eventos_sustitucion incoming_event
        where incoming_event.partido_id = p_partido_id
          and incoming_event.incoming_jugador_id = stats.jugador_id
      )
      and (
        select pg_catalog.count(*)
        from public.partido_eventos_sustitucion outgoing_event
        where outgoing_event.partido_id = p_partido_id
          and outgoing_event.outgoing_jugador_id = stats.jugador_id
      ) = 1
    limit 1
  ), '')
  where stats.partido_id = p_partido_id
    and stats.jugador_id is not null;

  select coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(event)
      order by event.minute, event.event_order, event.id),
    '[]'::jsonb
  )
  into result_events
  from public.partido_eventos_sustitucion event
  where event.partido_id = p_partido_id;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'jugador_id', stats.jugador_id,
        'player_name', stats.player_name,
        'minutes', coalesce((played_minutes->>stats.jugador_id::text)::integer, 0),
        'replacement_name', stats.replacement_name
      ) order by stats.player_name, stats.jugador_id
    ),
    '[]'::jsonb
  )
  into result_minutes
  from public.partido_estadisticas_jugador stats
  where stats.partido_id = p_partido_id
    and stats.jugador_id is not null;

  return pg_catalog.jsonb_build_object(
    'operation', normalized_operation,
    'partido_id', p_partido_id,
    'duration', match_duration,
    'materialized_legacy_events', materialized_count,
    'event', case when normalized_operation in ('delete', 'materialize') then null else saved_event end,
    'deleted_event_id', case when normalized_operation = 'delete' then p_event_id else null end,
    'events', result_events,
    'minutes', result_minutes
  );
end;
$function$;

-- La consulta de sustituciones comparte el mismo perimetro CTS; conserva
-- SECURITY DEFINER porque la tabla hija no concede escritura al cliente.
create or replace function public.get_match_substitution_events(p_partido_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $read_function$
declare
  result_events jsonb;
begin
  if auth.uid() is null then
    raise exception 'SUBSTITUTION_STAFF_REQUIRED' using errcode = '42501';
  end if;
  if p_partido_id is null then
    raise exception 'SUBSTITUTION_MATCH_REQUIRED' using errcode = '22023';
  end if;
  if public.can_read_match(p_partido_id) is not true then
    raise exception 'SUBSTITUTION_MATCH_READ_FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (select 1 from public.partidos match_row where match_row.id = p_partido_id) then
    raise exception 'SUBSTITUTION_MATCH_NOT_FOUND' using errcode = 'P0002';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(event_row)
      order by event_row.minute, event_row.event_order, event_row.id),
    '[]'::jsonb
  )
  into result_events
  from public.partido_eventos_sustitucion event_row
  where event_row.partido_id = p_partido_id;

  return pg_catalog.jsonb_build_object(
    'partido_id', p_partido_id,
    'source', 'canonical',
    'events', result_events
  );
end;
$read_function$;

-- Evita la misma lectura por SELECT directo a la tabla hija.
alter policy substitution_staff_select on public.partido_eventos_sustitucion
  to authenticated using (public.can_read_match(partido_id));

-- La RPC recalcula estas estadisticas con privilegios de postgres. Cerrar
-- tambien la via directa autenticada hacia las mismas filas.
alter policy player_sports_staff_select on public.partido_estadisticas_jugador
  to authenticated using (public.can_read_match(partido_id));
alter policy player_sports_staff_insert on public.partido_estadisticas_jugador
  to authenticated with check (public.can_write_match(partido_id));
alter policy player_sports_staff_update on public.partido_estadisticas_jugador
  to authenticated
  using (public.can_write_match(partido_id))
  with check (public.can_write_match(partido_id));
alter policy player_sports_staff_delete on public.partido_estadisticas_jugador
  to authenticated using (public.can_write_match(partido_id));

do $post$
declare
  v_routine pg_catalog.pg_proc%rowtype;
  v_read pg_catalog.pg_proc%rowtype;
  v_stats_policy_count integer;
begin
  select * into v_routine from pg_catalog.pg_proc
  where oid = pg_catalog.to_regprocedure(
    'public.mutate_match_substitution_atomic(text,uuid,uuid,jsonb,integer)');
  if not found
     or pg_catalog.md5(pg_catalog.replace(
       v_routine.prosrc, E'\r\n', E'\n'))
       <> '745bd5f2d80cef1815a33698d30b2f2b'
     or v_routine.prosrc ilike '%is_app_staff%'
     or v_routine.prosrc not ilike '%can_write_match(p_partido_id)%'
     or v_routine.proowner <> 'postgres'::regrole
     or not v_routine.prosecdef
     or v_routine.proconfig is distinct from array['search_path=pg_catalog']::text[]
     or coalesce(v_routine.proacl::text, '<NULL>')
       <> pg_catalog.current_setting('nexo.video_analysis_01a_acl_before', true)
     or not pg_catalog.has_function_privilege(
       'authenticated',v_routine.oid,'EXECUTE')
     or pg_catalog.has_function_privilege('anon',v_routine.oid,'EXECUTE') then
    raise exception 'Videoanalisis 01A: postcondicion de cuerpo o privilegios incumplida';
  end if;
  select * into v_read from pg_catalog.pg_proc
  where oid = pg_catalog.to_regprocedure(
    'public.get_match_substitution_events(uuid)');
  if not found
     or pg_catalog.md5(pg_catalog.replace(
       v_read.prosrc,E'\r\n',E'\n'))
       <> '5abccd5fdb69b1476268d72a1a2b3180'
     or v_read.prosrc ilike '%is_app_staff%'
     or v_read.prosrc not ilike '%can_read_match(p_partido_id)%'
     or v_read.proowner <> 'postgres'::regrole
     or not v_read.prosecdef
     or v_read.proconfig is distinct from array['search_path=pg_catalog']::text[]
     or coalesce(v_read.proacl::text, '<NULL>')
       <> pg_catalog.current_setting('nexo.video_analysis_01a_read_acl_before', true)
     or not pg_catalog.has_function_privilege('authenticated',v_read.oid,'EXECUTE')
     or pg_catalog.has_function_privilege('anon',v_read.oid,'EXECUTE') then
    raise exception 'Videoanalisis 01A: postcondicion de lectura o privilegios incumplida';
  end if;
  if (select count(*) from pg_catalog.pg_policy policy
      where policy.polrelid = 'public.partido_eventos_sustitucion'::regclass) <> 1
     or not exists (
       select 1 from pg_catalog.pg_policy policy
       where policy.polrelid = 'public.partido_eventos_sustitucion'::regclass
         and policy.polname = 'substitution_staff_select'
         and policy.polcmd::text = 'r'
         and policy.polpermissive
         and policy.polroles = array['authenticated'::regrole::oid]
         and pg_catalog.lower(pg_catalog.regexp_replace(
           pg_catalog.replace(pg_catalog.pg_get_expr(
             policy.polqual,policy.polrelid),'public.',''),
           '[[:space:]()]','','g')) = 'can_read_matchpartido_id') then
    raise exception 'Videoanalisis 01A: postcondicion RLS de sustituciones incumplida';
  end if;
  if not pg_catalog.has_table_privilege(
       'authenticated','public.partido_eventos_sustitucion','SELECT')
     or pg_catalog.has_table_privilege(
       'authenticated','public.partido_eventos_sustitucion','INSERT')
     or pg_catalog.has_table_privilege(
       'authenticated','public.partido_eventos_sustitucion','UPDATE')
     or pg_catalog.has_table_privilege(
       'authenticated','public.partido_eventos_sustitucion','DELETE')
     or pg_catalog.has_table_privilege(
       'authenticated','public.partido_eventos_sustitucion','TRUNCATE')
     or pg_catalog.has_table_privilege(
       'authenticated','public.partido_eventos_sustitucion','TRIGGER')
     or pg_catalog.has_table_privilege(
       'anon','public.partido_eventos_sustitucion','TRUNCATE') then
    raise exception 'Videoanalisis 01A: privilegios de sustituciones cambiaron';
  end if;
  select count(*) into v_stats_policy_count
  from pg_catalog.pg_policy policy
  where policy.polrelid = 'public.partido_estadisticas_jugador'::regclass
    and policy.polpermissive
    and policy.polroles = array['authenticated'::regrole::oid]
    and (
      (policy.polname = 'player_sports_staff_select'
        and policy.polcmd::text = 'r'
        and lower(pg_catalog.regexp_replace(replace(coalesce(
          pg_catalog.pg_get_expr(policy.polqual,policy.polrelid),''),
          'public.',''),'[[:space:]()]','','g')) = 'can_read_matchpartido_id')
      or (policy.polname = 'player_sports_staff_insert'
        and policy.polcmd::text = 'a'
        and lower(pg_catalog.regexp_replace(replace(coalesce(
          pg_catalog.pg_get_expr(policy.polwithcheck,policy.polrelid),''),
          'public.',''),'[[:space:]()]','','g')) = 'can_write_matchpartido_id')
      or (policy.polname = 'player_sports_staff_update'
        and policy.polcmd::text = 'w'
        and lower(pg_catalog.regexp_replace(replace(coalesce(
          pg_catalog.pg_get_expr(policy.polqual,policy.polrelid),''),
          'public.',''),'[[:space:]()]','','g')) = 'can_write_matchpartido_id'
        and lower(pg_catalog.regexp_replace(replace(coalesce(
          pg_catalog.pg_get_expr(policy.polwithcheck,policy.polrelid),''),
          'public.',''),'[[:space:]()]','','g')) = 'can_write_matchpartido_id')
      or (policy.polname = 'player_sports_staff_delete'
        and policy.polcmd::text = 'd'
        and lower(pg_catalog.regexp_replace(replace(coalesce(
          pg_catalog.pg_get_expr(policy.polqual,policy.polrelid),''),
          'public.',''),'[[:space:]()]','','g')) = 'can_write_matchpartido_id')
    );
  if v_stats_policy_count <> 4
     or (select count(*) from pg_catalog.pg_policy policy
         where policy.polrelid = 'public.partido_estadisticas_jugador'::regclass) <> 4
     or not (select relation.relrowsecurity from pg_catalog.pg_class relation
         where relation.oid = 'public.partido_estadisticas_jugador'::regclass)
     or not (pg_catalog.has_table_privilege(
       'authenticated','public.partido_estadisticas_jugador','SELECT')
       and pg_catalog.has_table_privilege(
       'authenticated','public.partido_estadisticas_jugador','INSERT')
       and pg_catalog.has_table_privilege(
       'authenticated','public.partido_estadisticas_jugador','UPDATE')
       and pg_catalog.has_table_privilege(
       'authenticated','public.partido_estadisticas_jugador','DELETE'))
     or pg_catalog.has_table_privilege(
       'authenticated','public.partido_estadisticas_jugador','TRUNCATE')
     or pg_catalog.has_table_privilege(
       'authenticated','public.partido_estadisticas_jugador','TRIGGER') then
    raise exception 'Videoanalisis 01A: postcondicion RLS de estadisticas incumplida';
  end if;
end
$post$;

commit;
