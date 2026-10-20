-- PENDIENTE DE REVISIÓN — NO EJECUTAR NI CONSIDERAR AUTORIZADO.
-- Manifiesto: CSV 04A SHA256 92E2B31E4BA951A2D23E21D070235D4B9E8C6CACBB2167CCBCBCB9E1B326B0D6.
-- 24 perfiles aprobados por el propietario; Abel, Nel y Samuel están excluidos.
-- joined_on NULL = incorporación sin fecha acreditada; no prueba asistencia.
-- En caso de error, la transacción queda abortada: ejecutar ROLLBACK, nunca COMMIT.
begin;

do $preflight$
declare
  v_cts constant uuid := '961970c8-0fcf-4c45-94d6-787647619c61';
  v_club constant uuid := 'ca0da100-0000-4000-8000-000000000001';
  v_team constant uuid := '85a16f33-9fe5-44d4-b85d-37d73651ebf6';
  v_season constant uuid := 'a858d03b-aa54-49f5-bdb1-8c8b3b533dae';
  v_owner constant uuid := '4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3';
  v_manifest jsonb;
  v_row record;
  v_count bigint;
  v_starts date;
  v_ends date;
  v_session_id uuid;
  v_session_revision integer;
  v_session_hash text;
  v_primary_keys text[];
begin
  if to_regclass('public.club_team_season_players') is null
     or to_regclass('public.jugadores') is null
     or to_regclass('public.players_database') is null
     or to_regclass('public.player_team_memberships') is null
     or to_regclass('public.player_positions') is null
     or to_regclass('public.planned_training_sessions') is null
     or to_regprocedure('public.can_write_club_team_season(uuid)') is null then
    raise exception '04A: falta estructura requerida; no insertar';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = to_regclass('public.club_team_season_players')
      and t.tgname = 'club_team_season_players_guard'
      and t.tgenabled = 'O' and not t.tgisinternal
      and t.tgfoid = to_regprocedure('public.guard_club_team_season_player_mutation()')
  ) or (select count(*) from pg_catalog.pg_trigger t
        where t.tgrelid = to_regclass('public.club_team_season_players')
          and not t.tgisinternal and t.tgenabled <> 'D') <> 1
     or not exists (
       select 1 from pg_catalog.pg_class c
       where c.oid = to_regclass('public.club_team_season_players')
         and c.relrowsecurity
     ) then
    raise exception '04A: guard/RLS de Sesiones 01 ausente o triggers adicionales';
  end if;
  if not has_table_privilege('authenticated',
       'public.club_team_season_players', 'SELECT')
     or not has_function_privilege('authenticated',
       'public.can_write_club_team_season(uuid)', 'EXECUTE')
     or not has_column_privilege('authenticated',
       'public.club_team_season_players', 'club_team_season_id', 'INSERT')
     or not has_column_privilege('authenticated',
       'public.club_team_season_players', 'player_id', 'INSERT')
     or not has_column_privilege('authenticated',
       'public.club_team_season_players', 'joined_on', 'INSERT')
     or not has_column_privilege('authenticated',
       'public.club_team_season_players', 'left_on', 'INSERT')
     or not has_column_privilege('authenticated',
       'public.club_team_season_players', 'has_departed', 'INSERT') then
    raise exception '04A: privilegios de authenticated incompatibles con Sesiones 01';
  end if;

  -- Mismo orden de bloqueo que las RPC: temporada, luego sesión. Un cierre o
  -- edición concurrente de la sesión nº 1 esperará hasta finalizar esta operación.
  select se.starts_on, se.ends_on into v_starts, v_ends
  from public.club_team_seasons cts
  join public.club_seasons se on se.id = cts.season_id and se.club_id = cts.club_id
  where cts.id = v_cts and cts.club_id = v_club and cts.team_id = v_team
    and cts.season_id = v_season and se.status = 'open'
  for update of se;
  if not found then
    raise exception '04A: CTS/club/equipo/temporada no coincide o temporada cerrada';
  end if;
  perform 1 from public.club_memberships m
  where m.club_id = v_club and m.user_id = v_owner
    and m.role = 'owner' and m.is_active is true
  for share;
  if not found then
    raise exception '04A: el owner acreditado ya no está activo';
  end if;
  select s.id, s.revision, md5(to_jsonb(s)::text)
    into v_session_id, v_session_revision, v_session_hash
  from public.planned_training_sessions s
  where s.club_team_season_id = v_cts and s.session_number = 1
    and s.planning_state = 'confirmed' and s.session_date = date '2026-10-25'
  for share of s;
  if not found or v_session_revision <> 4 then
    raise exception '04A: sesión nº 1 ya no coincide con revisión 4; revisar su estado real antes de aplicar';
  end if;
  perform set_config('appcaudal.sessions04a_session1_id', v_session_id::text, true);
  perform set_config('appcaudal.sessions04a_session1_hash', v_session_hash, true);
  if (select count(*) from public.player_team_memberships stage
      where stage.team_id = v_team and stage.is_current is true) <> 27
     or (select count(distinct j.global_player_id)
         from public.jugadores j
         join public.player_team_memberships stage on stage.id = j.membership_id
         where stage.team_id = v_team and j.active_in_squad is true
           and j.global_player_id is not null) <> 24 then
    raise exception '04A: plantilla distinta del inventario 27/24; conciliar de nuevo';
  end if;
  select count(*) into v_count from public.club_team_season_players ctp
  where ctp.club_team_season_id = v_cts;
  if v_count <> 0 then
    raise exception '04A: ya existen % pertenencias en el CTS; no repetir ni sobrescribir', v_count;
  end if;

  -- Orden estable por player_id. Nombres solo como anotación humana, nunca JOIN.
  -- Omar Falah tiene start_date legacy 2026-10-02: NO se copia a joined_on.
  select jsonb_agg(to_jsonb(x)) into v_manifest
  from (values
    ('f742956d-2c46-4334-9c0c-e80d0498c45d'::uuid, '05e3839f-8c67-4093-87d3-edab2ce1e12a'::uuid, '93b31487-f4e8-4f0b-a4da-4658849929a4'::uuid, 'defender'::text, null::date), -- Roberto Albuquerque
    ('2e9baa0d-4a7a-4127-b2f5-6da7644c20e2'::uuid, '0a15ed36-e781-4219-826a-d14fb48c961e'::uuid, 'c0357070-0ecb-4886-99bb-a7e65dd7f2dc'::uuid, 'forward'::text, null::date), -- Óscar Fernández
    ('00406430-d43b-46c5-96ab-ba1ade89f862'::uuid, '111fa593-0fe1-4ca9-aa2b-f1a7e23df5d4'::uuid, '87105801-4931-4134-9bb6-85f031705bff'::uuid, 'goalkeeper'::text, null::date), -- Alex González
    ('faffde7c-33a9-446c-99ce-c76aefba5a0d'::uuid, '117e4e34-8b48-4544-88d1-1de8283241e5'::uuid, '06a7f22c-791d-4e89-ab7b-dcd7693c57b1'::uuid, 'defender'::text, null::date), -- Iago Delgado
    ('912a4e7b-c472-4a06-8ee7-ccdcacd82bc8'::uuid, '24ad5c88-29c9-4fc1-83de-fd2a2fb18ff8'::uuid, 'd1878fd9-a4dd-44e9-b4af-9bfb585b46a4'::uuid, 'midfielder'::text, null::date), -- Vicente Antuña
    ('513adcde-7df1-4d04-89da-be2a55a25a3c'::uuid, '2c619532-ed28-4689-8c44-1b3aa3a586e2'::uuid, 'a56374f5-697f-421e-a4eb-f8bcf3e36325'::uuid, 'forward'::text, null::date), -- Cristian Acerete
    ('4712860e-8578-47b8-8505-5127b16a3231'::uuid, '2cc7308e-58d2-4311-8687-a9657b2933a0'::uuid, '3e0cae81-5aea-43b7-9104-e4bd8ecd8568'::uuid, 'defender'::text, null::date), -- Marcos Barroso
    ('b78a67b1-47d5-40aa-8528-77d1ec487284'::uuid, '6f3744f9-4efb-40ce-baf8-9c31899d1220'::uuid, '2fcb102b-42e4-4e8b-9dd2-a6f01f9da91d'::uuid, 'forward'::text, null::date), -- Diego Boza
    ('b812a22a-2e3d-4a70-9e4c-c78c661db6e8'::uuid, '75385014-b321-44af-b701-1f3d1fff1875'::uuid, '0b0747fa-d008-451d-b4f9-5e59298ec049'::uuid, 'midfielder'::text, null::date), -- Lucas Suárez
    ('405e20ed-6648-4843-b223-54f7a6f3838f'::uuid, '76624d7a-b3d4-419e-b790-bf34e5808d57'::uuid, 'f550fb79-e773-4b1d-beb8-e5d4149a3c8b'::uuid, 'forward'::text, null::date), -- David Fernández García
    ('52b68efa-2087-44a0-8f9f-96ed0f612a82'::uuid, '783fc992-0a4d-4e95-be95-d45b55d87d26'::uuid, '5742f31e-b79b-4b6e-8452-b742bbaef409'::uuid, 'midfielder'::text, null::date), -- Julio Delgado
    ('c5029ff1-5668-4efd-b91c-ccd4d2836232'::uuid, '8135a522-3b48-4dc0-9ac1-ae54a46584f7'::uuid, 'af039e9e-5c81-4340-990a-89138083544a'::uuid, 'defender'::text, null::date), -- Julio Rodríguez
    ('af4060e4-b54a-4e43-94b8-ccd600e7e784'::uuid, '81decb7e-23f9-47ba-9bb5-f6e24fb65cde'::uuid, '2ffec25e-92be-47f2-ad31-ae743c5c1de7'::uuid, 'forward'::text, null::date), -- Daniel Palalcio (grafía CSV)
    ('31f6f2fb-15fb-4ba9-8557-97e57f37841a'::uuid, '8617ae3f-d8d9-41f0-88c7-66c23275f90e'::uuid, 'fed89127-3f2b-491f-b44e-d3b22598b918'::uuid, 'forward'::text, null::date), -- Isaac Martín
    ('2e0146e9-e9fc-45ad-b055-edc138a85f7e'::uuid, '93236fe2-0d19-4d58-a9d7-3769f7912e90'::uuid, '5614f91c-fbf3-4472-9736-b91ec7f95343'::uuid, 'defender'::text, null::date), -- Borja Rodríguez
    ('a9c06993-8bc6-4a84-b947-19a0fbc0bec1'::uuid, '994e9111-b1e2-4449-9a8c-d3e3dda2f0da'::uuid, '64603ccd-0ed7-4e81-9f60-f83ba006da65'::uuid, 'defender'::text, null::date), -- Marcos Trabanco
    ('1b1906d7-a97c-4184-ad20-17f7a021cbbd'::uuid, 'a7953dd5-4adb-4448-9935-c96de3973fde'::uuid, '4f2ea018-11f7-417d-8f48-885a698310ad'::uuid, 'goalkeeper'::text, null::date), -- Samuel González (no Samuel)
    ('237e4872-1be0-432e-965a-2262c110c7e0'::uuid, 'd796a32d-d83c-4ec4-b4d9-e4639d2a6643'::uuid, '3658e55d-9f45-41a6-9a33-bad7b74ccffb'::uuid, 'defender'::text, null::date), -- José Martínez
    ('e65fe80b-db97-4192-9bf9-9aba36c70de2'::uuid, 'da324f29-cc7d-4f97-8e41-7a6454b79578'::uuid, 'e83689e5-e1fa-40cd-92db-332d3e47af21'::uuid, 'midfielder'::text, null::date), -- Kike Fanjul
    ('b0216a5d-4317-4ec8-b791-3d7d7924da12'::uuid, 'dbac177b-41ea-4225-9c0e-6487b4369d6f'::uuid, '28a18690-5e61-476e-8383-640560969903'::uuid, 'midfielder'::text, null::date), -- Agustín Porto
    ('2aa728c2-828b-4d20-916b-03f6b43bd906'::uuid, 'e103081b-0e2e-4d45-9841-491bdeba19e3'::uuid, 'a60c23db-31dd-4d0a-8fd2-d7a6c763ff2f'::uuid, 'defender'::text, null::date), -- Omar Falah; start_date legacy 2026-10-02, no acreditada para CTS
    ('778c4e89-d806-4b7f-b7e5-072b1269fcb4'::uuid, 'e8745da4-aab9-41e4-82ea-14b65f54f001'::uuid, '53e31530-62e6-4f79-96ae-b7b233ae3348'::uuid, 'forward'::text, null::date), -- Isma Cerro
    ('14bc2739-7afe-453a-ad11-0a47141ca8d8'::uuid, 'fac05c2c-8551-4c5c-b38a-42b9e17d7002'::uuid, '497cc905-34e6-4bd9-9ed6-47a5534dd5b7'::uuid, 'defender'::text, null::date), -- Cristian Ebea
    ('f7f5aaeb-e82b-4e6b-8920-694bc32cb6c7'::uuid, 'fb533c91-fc62-4685-acfa-96785442689b'::uuid, '31427578-664f-4605-aee4-03fda2c01aa8'::uuid, 'forward'::text, null::date) -- Jairo Cárcaba
  ) as x(ficha_id, player_id, stage_id, expected_position, joined_on);
  if v_manifest is null or jsonb_array_length(v_manifest) <> 24 then
    raise exception '04A: manifiesto no contiene exactamente 24 filas';
  end if;
  if (select md5(string_agg(x.ficha_id::text || '|' || x.player_id::text || '|' ||
           x.stage_id::text || '|' || x.expected_position || '|' ||
           coalesce(x.joined_on::text, 'NULL'), E'\n' order by x.player_id::text))
      from jsonb_to_recordset(v_manifest) as x(
        ficha_id uuid, player_id uuid, stage_id uuid,
        expected_position text, joined_on date))
      is distinct from '8eedd7ec6aeeea2a93fc27ece1d36c4d' then
    raise exception '04A: manifiesto distinto de los 24 UUID/posiciones aprobados';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(v_manifest) as x(
      ficha_id uuid, player_id uuid, stage_id uuid,
      expected_position text, joined_on date)
    where x.ficha_id is null or x.player_id is null or x.stage_id is null
       or x.joined_on is not null or x.expected_position is null
       or x.expected_position not in
         ('goalkeeper','defender','midfielder','forward')
       or x.player_id in (
         '21acd1b7-074c-4632-94b3-9557bc090f5b'::uuid, -- Abel
         '628e5fac-cff8-47cc-a4ab-6b88b63501c4'::uuid, -- Nel
         'a4f796b0-50ad-40b0-a6e4-5c4cccf776a0'::uuid  -- Samuel excluido
       )
  ) then
    raise exception '04A: UUID inválido, excluido o fecha/posición no aprobada';
  end if;
  select count(*) into v_count from jsonb_to_recordset(v_manifest) as x(
    ficha_id uuid, player_id uuid, stage_id uuid,
    expected_position text, joined_on date);
  if v_count <> 24 or v_count <> (
    select count(distinct x.ficha_id) from jsonb_to_recordset(v_manifest) as x(
      ficha_id uuid, player_id uuid, stage_id uuid,
      expected_position text, joined_on date)
  ) or v_count <> (
    select count(distinct x.player_id) from jsonb_to_recordset(v_manifest) as x(
      ficha_id uuid, player_id uuid, stage_id uuid,
      expected_position text, joined_on date)
  ) or v_count <> (
    select count(distinct x.stage_id) from jsonb_to_recordset(v_manifest) as x(
      ficha_id uuid, player_id uuid, stage_id uuid,
      expected_position text, joined_on date)
  ) then
    raise exception '04A: UUID duplicado o manifiesto incompleto';
  end if;

  for v_row in
    select * from jsonb_to_recordset(v_manifest) as x(
      ficha_id uuid, player_id uuid, stage_id uuid,
      expected_position text, joined_on date)
  loop
    perform 1 from public.jugadores j
    join public.players_database p on p.id = j.global_player_id
    join public.player_team_memberships stage on stage.id = j.membership_id
    where j.id = v_row.ficha_id and j.active_in_squad is true
      and p.id = v_row.player_id and stage.id = v_row.stage_id
      and stage.player_id = p.id and stage.team_id = v_team
      and stage.is_current is true
    for share of j, p, stage;
    if not found then
      raise exception '04A: ficha/jugador/etapa % ya no coinciden', v_row.player_id;
    end if;
    if (select count(*) from public.jugadores j
        where j.active_in_squad is true and j.global_player_id = v_row.player_id) <> 1
       or (select count(*) from public.jugadores j
           where j.active_in_squad is true and j.membership_id = v_row.stage_id) <> 1 then
      raise exception '04A: ficha activa duplicada para %', v_row.player_id;
    end if;
    perform 1 from public.player_positions pp
    where pp.player_id = v_row.player_id for share;
    select array_agg(pp.position_key order by pp.position_key)
      into v_primary_keys from public.player_positions pp
    where pp.player_id = v_row.player_id
      and pp.position_type = 'natural' and pp.is_primary is true;
    if coalesce(cardinality(v_primary_keys), 0) <> 1
       or v_primary_keys[1] is distinct from v_row.expected_position then
      raise exception '04A: posición natural principal ambigua/cambiada para %', v_row.player_id;
    end if;
    if v_row.joined_on is not null
       and (v_row.joined_on < v_starts or v_row.joined_on > v_ends) then
      raise exception '04A: fecha fuera de temporada para %', v_row.player_id;
    end if;
  end loop;
  perform set_config('appcaudal.sessions04a_manifest', v_manifest::text, true);
  raise notice 'PREFLIGHT PASS: 24 identidades exactas; sesión nº 1 bloqueada en revisión 4';
end
$preflight$;

-- SQL Editor es privilegiado: esta simulación no autentica una sesión humana.
-- Se usa authenticated para que RLS y el guard 01 autoricen cada INSERT.
set local role authenticated;

do $apply$
declare
  v_cts constant uuid := '961970c8-0fcf-4c45-94d6-787647619c61';
  v_owner constant uuid := '4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3';
  v_manifest jsonb := current_setting('appcaudal.sessions04a_manifest', true)::jsonb;
  v_expected bigint;
  v_inserted bigint;
  v_actual bigint;
  v_session_hash text;
begin
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  if current_user <> 'authenticated' or auth.uid() is distinct from v_owner
     or public.can_write_club_team_season(v_cts) is not true
     or v_manifest is null or jsonb_array_length(v_manifest) <> 24 then
    raise exception '04A: contexto authenticated/owner/CTS no validado';
  end if;
  select count(*) into v_expected from jsonb_to_recordset(v_manifest) as x(
    ficha_id uuid, player_id uuid, stage_id uuid,
    expected_position text, joined_on date);
  insert into public.club_team_season_players
    (club_team_season_id, player_id, joined_on, left_on, has_departed)
  select v_cts, x.player_id, x.joined_on, null::date, false
  from jsonb_to_recordset(v_manifest) as x(
    ficha_id uuid, player_id uuid, stage_id uuid,
    expected_position text, joined_on date);
  get diagnostics v_inserted = row_count;
  if v_inserted <> 24 or v_inserted <> v_expected then
    raise exception '04A: INSERT incompleto: % de %', v_inserted, v_expected;
  end if;

  select count(*) into v_actual from public.club_team_season_players ctp
  where ctp.club_team_season_id = v_cts;
  if v_actual <> 24 or exists (
    select 1 from jsonb_to_recordset(v_manifest) as x(
      ficha_id uuid, player_id uuid, stage_id uuid,
      expected_position text, joined_on date)
    where not exists (
      select 1 from public.club_team_season_players ctp
      join public.club_memberships m on m.id = ctp.created_by_membership_id
      where ctp.club_team_season_id = v_cts and ctp.player_id = x.player_id
        and ctp.joined_on is not distinct from x.joined_on
        and ctp.left_on is null and ctp.has_departed is false
        and ctp.voided_at is null
        and m.user_id = v_owner
        and m.club_id = 'ca0da100-0000-4000-8000-000000000001'::uuid
        and m.role = 'owner' and m.is_active is true
    )
  ) then
    raise exception '04A: postcondición de los 24 vínculos no superada';
  end if;
  select md5(to_jsonb(s)::text) into v_session_hash
  from public.planned_training_sessions s
  where s.id = current_setting('appcaudal.sessions04a_session1_id', true)::uuid
    and s.club_team_season_id = v_cts and s.session_number = 1
    and s.planning_state = 'confirmed' and s.session_date = date '2026-10-25'
    and s.revision = 4;
  if v_session_hash is null or v_session_hash is distinct from
     current_setting('appcaudal.sessions04a_session1_hash', true) then
    raise exception '04A: sesión nº 1 cambió dentro de la transacción';
  end if;
  raise notice 'POSTCONDITION PASS: 24 vínculos exactos; sesión nº 1 intacta';
end
$apply$;

commit;
