-- Sesiones 04A · verificador INDEPENDIENTE, SOLO LECTURA.
-- Antes de vincular: GLOBAL READY_TO_APPLY solo si estado e identidades coinciden.
-- Después: GLOBAL PASS solo si están los 24 vínculos exactos y ningún otro.
-- CSV fuente SHA256: 92E2B31E4BA951A2D23E21D070235D4B9E8C6CACBB2167CCBCB9E1B326B0D6.
with
expected(ficha_id, player_id, stage_id, expected_position, joined_on) as (
  values
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
    ('1b1906d7-a97c-4184-ad20-17f7a021cbbd'::uuid, 'a7953dd5-4adb-4448-9935-c96de3973fde'::uuid, '4f2ea018-11f7-417d-8f48-885a698310ad'::uuid, 'goalkeeper'::text, null::date), -- Samuel González, distinto de Samuel
    ('237e4872-1be0-432e-965a-2262c110c7e0'::uuid, 'd796a32d-d83c-4ec4-b4d9-e4639d2a6643'::uuid, '3658e55d-9f45-41a6-9a33-bad7b74ccffb'::uuid, 'defender'::text, null::date), -- José Martínez
    ('e65fe80b-db97-4192-9bf9-9aba36c70de2'::uuid, 'da324f29-cc7d-4f97-8e41-7a6454b79578'::uuid, 'e83689e5-e1fa-40cd-92db-332d3e47af21'::uuid, 'midfielder'::text, null::date), -- Kike Fanjul
    ('b0216a5d-4317-4ec8-b791-3d7d7924da12'::uuid, 'dbac177b-41ea-4225-9c0e-6487b4369d6f'::uuid, '28a18690-5e61-476e-8383-640560969903'::uuid, 'midfielder'::text, null::date), -- Agustín Porto
    ('2aa728c2-828b-4d20-916b-03f6b43bd906'::uuid, 'e103081b-0e2e-4d45-9841-491bdeba19e3'::uuid, 'a60c23db-31dd-4d0a-8fd2-d7a6c763ff2f'::uuid, 'defender'::text, null::date), -- Omar Falah; fecha legacy no trasladada
    ('778c4e89-d806-4b7f-b7e5-072b1269fcb4'::uuid, 'e8745da4-aab9-41e4-82ea-14b65f54f001'::uuid, '53e31530-62e6-4f79-96ae-b7b233ae3348'::uuid, 'forward'::text, null::date), -- Isma Cerro
    ('14bc2739-7afe-453a-ad11-0a47141ca8d8'::uuid, 'fac05c2c-8551-4c5c-b38a-42b9e17d7002'::uuid, '497cc905-34e6-4bd9-9ed6-47a5534dd5b7'::uuid, 'defender'::text, null::date), -- Cristian Ebea
    ('f7f5aaeb-e82b-4e6b-8920-694bc32cb6c7'::uuid, 'fb533c91-fc62-4685-acfa-96785442689b'::uuid, '31427578-664f-4605-aee4-03fda2c01aa8'::uuid, 'forward'::text, null::date) -- Jairo Cárcaba
),
constants as (
  select '961970c8-0fcf-4c45-94d6-787647619c61'::uuid as cts_id,
         'ca0da100-0000-4000-8000-000000000001'::uuid as club_id,
         '85a16f33-9fe5-44d4-b85d-37d73651ebf6'::uuid as team_id,
         'a858d03b-aa54-49f5-bdb1-8c8b3b533dae'::uuid as season_id,
         '4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3'::uuid as owner_id
),
manifest as (
  select count(*) as n, count(distinct ficha_id) as fichas,
         count(distinct player_id) as players, count(distinct stage_id) as stages,
         count(*) filter (where ficha_id is null or player_id is null
                           or stage_id is null or expected_position is null
                           or joined_on is not null) as invalid_rows,
         md5(string_agg(ficha_id::text || '|' || player_id::text || '|' ||
           stage_id::text || '|' || expected_position || '|' ||
           coalesce(joined_on::text, 'NULL'), E'\n' order by player_id::text)) as fingerprint
  from expected
),
actual as (
  select ctp.* from public.club_team_season_players ctp
  join constants c on c.cts_id = ctp.club_team_season_id
),
common_checks as (
  select 'MANIFEST_24_UUID_APROBADOS'::text as check_name,
         m.n = 24 and m.fichas = 24 and m.players = 24 and m.stages = 24
           and m.invalid_rows = 0
           and m.fingerprint = '8eedd7ec6aeeea2a93fc27ece1d36c4d' as ok,
         format('%s filas; huella %s', m.n, m.fingerprint)::text as detail
  from manifest m
  union all
  select 'CTS_ABIERTO', exists (
    select 1 from public.club_team_seasons cts
    join public.club_seasons se on se.id = cts.season_id
      and se.club_id = cts.club_id
    join constants c on c.cts_id = cts.id
    where cts.club_id = c.club_id and cts.team_id = c.team_id
      and cts.season_id = c.season_id and se.status = 'open'
  ), 'Club/equipo/temporada canónicos y estado open'
  union all
  select 'OWNER_ACTIVO', exists (
    select 1 from public.club_memberships m
    join constants c on c.club_id = m.club_id and c.owner_id = m.user_id
    where m.role = 'owner' and m.is_active is true
  ), 'Membership owner activa del club'
  union all
  select 'GUARD_Y_RLS', exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid = to_regclass('public.club_team_season_players')
      and t.tgname = 'club_team_season_players_guard'
      and t.tgenabled = 'O' and not t.tgisinternal
      and t.tgfoid = to_regprocedure('public.guard_club_team_season_player_mutation()')
  ) and exists (
    select 1 from pg_catalog.pg_class cls
    where cls.oid = to_regclass('public.club_team_season_players')
      and cls.relrowsecurity
  ) and (select count(*) from pg_catalog.pg_trigger t
    where t.tgrelid = to_regclass('public.club_team_season_players')
      and not t.tgisinternal and t.tgenabled <> 'D') = 1,
    'Guard Sesiones 01 habilitado, sin otros triggers activos, y RLS activo'
  union all
  select 'PRIVILEGIOS_AUTHENTICATED',
    has_table_privilege('authenticated',
      'public.club_team_season_players', 'SELECT')
    and has_function_privilege('authenticated',
      'public.can_write_club_team_season(uuid)', 'EXECUTE')
    and has_column_privilege('authenticated',
      'public.club_team_season_players', 'club_team_season_id', 'INSERT')
    and has_column_privilege('authenticated',
      'public.club_team_season_players', 'player_id', 'INSERT')
    and has_column_privilege('authenticated',
      'public.club_team_season_players', 'joined_on', 'INSERT')
    and has_column_privilege('authenticated',
      'public.club_team_season_players', 'left_on', 'INSERT')
    and has_column_privilege('authenticated',
      'public.club_team_season_players', 'has_departed', 'INSERT'),
    'SELECT, EXECUTE helper y las cinco columnas INSERT requeridas'
  union all
  select 'FUENTE_UUID_VIGENTE', not exists (
    select 1 from expected e
    left join public.jugadores j on j.id = e.ficha_id
      and j.active_in_squad is true and j.global_player_id = e.player_id
      and j.membership_id = e.stage_id
    left join public.player_team_memberships stage on stage.id = e.stage_id
      and stage.player_id = e.player_id
      and stage.team_id = (select team_id from constants)
      and stage.is_current is true
    left join public.players_database p on p.id = e.player_id
    where j.id is null or stage.id is null or p.id is null
  ), 'Cada ficha activa conserva su jugador, etapa y equipo por UUID'
  union all
  select 'FICHA_ACTIVA_UNICA', not exists (
    select 1 from expected e
    where (select count(*) from public.jugadores j
      where j.active_in_squad is true and j.global_player_id = e.player_id) <> 1
      or (select count(*) from public.jugadores j
        where j.active_in_squad is true and j.membership_id = e.stage_id) <> 1
  ), 'Una sola ficha activa por jugador y por etapa seleccionados'
  union all
  select 'POSICION_PRINCIPAL_UNICA', not exists (
    select 1 from expected e
    left join lateral (
      select count(*) as n,
             array_agg(pp.position_key order by pp.position_key) as keys
      from public.player_positions pp
      where pp.player_id = e.player_id and pp.position_type = 'natural'
        and pp.is_primary is true
    ) pos on true
    where pos.n <> 1 or pos.keys[1] is distinct from e.expected_position
  ), 'Una sola posición natural principal, igual a la aprobada'
  union all
  select 'EXCLUIDOS_SIN_VINCULO', not exists (
    select 1 from actual a
    where a.player_id in (
      '21acd1b7-074c-4632-94b3-9557bc090f5b'::uuid, -- Abel
      '628e5fac-cff8-47cc-a4ab-6b88b63501c4'::uuid, -- Nel
      'a4f796b0-50ad-40b0-a6e4-5c4cccf776a0'::uuid  -- Samuel
    )
  ), 'Abel, Nel y Samuel distinto de Samuel González siguen excluidos'
  union all
  select 'SESION_1_REVISION_4',
    (select count(*) from public.planned_training_sessions s
     join constants c on c.cts_id = s.club_team_season_id
     where s.session_number = 1 and s.planning_state = 'confirmed'
       and s.session_date = date '2026-10-25' and s.revision = 4) = 1,
    coalesce((select string_agg(format('id=%s; fecha=%s; revisión=%s; updated_at=%s',
               s.id, s.session_date, s.revision, s.updated_at), '; ' order by s.id)
      from public.planned_training_sessions s
      join constants c on c.cts_id = s.club_team_season_id
      where s.session_number = 1), 'Sesión nº 1 no encontrada')
  union all
  select 'LINEA_BASE_27_24',
    (select count(*) from public.player_team_memberships stage
      join constants c on c.team_id = stage.team_id
      where stage.is_current is true) = 27
    and (select count(distinct j.global_player_id)
      from public.jugadores j
      join public.player_team_memberships stage on stage.id = j.membership_id
      join constants c on c.team_id = stage.team_id
      where j.active_in_squad is true and j.global_player_id is not null) = 24,
    '27 etapas actuales y 24 perfiles distintos con ficha activa'
),
target_state as (
  select (select count(*) from actual) as actual_count,
         not exists (
           select e.player_id, e.joined_on from expected e
           except
           select a.player_id, a.joined_on from actual a
         ) and not exists (
           select a.player_id, a.joined_on from actual a
           except
           select e.player_id, e.joined_on from expected e
         ) as same_players_and_dates,
         not exists (
           select 1 from actual a
           left join public.club_memberships m on m.id = a.created_by_membership_id
           join constants c on true
           where a.voided_at is not null or a.left_on is not null
              or a.has_departed is distinct from false
              or m.id is null or m.club_id is distinct from c.club_id
              or m.user_id is distinct from c.owner_id
              or m.role is distinct from 'owner'
         ) as all_clean_and_owner
),
summary as (
  select coalesce(bool_and(ch.ok is true), false) as common_ok,
         count(*) filter (where ch.ok is true) as passed,
         count(*) as total,
         t.actual_count,
         t.actual_count = 24 and t.same_players_and_dates
           and t.all_clean_and_owner as target_exact
  from common_checks ch cross join target_state t
  group by t.actual_count, t.same_players_and_dates, t.all_clean_and_owner
),
results as (
  select 'GLOBAL'::text as row_type, 'GLOBAL'::text as check_name,
         case when s.common_ok and s.target_exact then 'PASS'
              when s.common_ok and s.actual_count = 0 then 'READY_TO_APPLY'
              else 'BLOCKED' end as status,
         format('%s/%s comprobaciones comunes; %s pertenencias CTS',
           s.passed, s.total, s.actual_count)::text as detail,
         null::uuid as ficha_id, null::uuid as player_id,
         null::uuid as stage_id, null::uuid as membership_id
  from summary s
  union all
  select 'CHECK', ch.check_name,
         case when ch.ok is true then 'PASS' else 'FAIL' end, ch.detail,
         null::uuid, null::uuid, null::uuid, null::uuid
  from common_checks ch
  union all
  select 'TARGET', 'VINCULOS_CTS',
         case when s.common_ok and s.target_exact then 'PASS'
              when s.common_ok and s.actual_count = 0 then 'READY_TO_APPLY'
              else 'BLOCKED' end,
         format('%s filas; conjunto exacto y atributos válidos: %s',
           s.actual_count, s.target_exact),
         null::uuid, null::uuid, null::uuid, null::uuid
  from summary s
  union all
  select 'EXPECTED', 'IDENTIDAD_APROBADA', 'INFO',
         coalesce(p.name, '<perfil no visible>') || ' · ' || e.expected_position,
         e.ficha_id, e.player_id, e.stage_id, a.id
  from expected e
  left join public.players_database p on p.id = e.player_id
  left join actual a on a.player_id = e.player_id
)
select * from results
order by case row_type when 'GLOBAL' then 0 when 'CHECK' then 1
                       when 'TARGET' then 2 else 3 end,
         check_name, player_id;
