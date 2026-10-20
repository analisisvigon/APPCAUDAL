-- Sesiones 04A · verificación independiente, SOLO SELECT.
-- Copiar aquí el MISMO manifiesto de UUID y joined_on aprobado para APPLY_TEMPLATE.
-- La fila NULL impide obtener GLOBAL PASS por accidente.
with
expected(ficha_id, player_id, stage_id, joined_on) as (
  values (null::uuid, null::uuid, null::uuid, null::date)
),
constants as (
  select '961970c8-0fcf-4c45-94d6-787647619c61'::uuid as cts_id,
         'ca0da100-0000-4000-8000-000000000001'::uuid as club_id,
         '85a16f33-9fe5-44d4-b85d-37d73651ebf6'::uuid as team_id,
         'a858d03b-aa54-49f5-bdb1-8c8b3b533dae'::uuid as season_id
),
manifest as (
  select count(*) as n,
         count(*) filter (where ficha_id is null or player_id is null
                           or stage_id is null) as incomplete,
         count(distinct ficha_id) as fichas,
         count(distinct player_id) as players,
         count(distinct stage_id) as stages
  from expected
),
actual as (
  select ctp.* from public.club_team_season_players ctp
  join constants c on c.cts_id = ctp.club_team_season_id
),
checks as (
  select 'CTS_CANONICO_ABIERTO'::text as check_name,
         exists (
           select 1 from public.club_team_seasons cts
           join public.club_seasons se on se.id = cts.season_id
             and se.club_id = cts.club_id
           join constants c on c.cts_id = cts.id
           where cts.club_id = c.club_id and cts.team_id = c.team_id
             and cts.season_id = c.season_id and se.status = 'open'
         ) as ok,
         'CTS, club, equipo y temporada coinciden; estado open'::text as detail
  union all
  select 'MANIFIESTO_EXPLICITO',
         m.n > 0 and m.incomplete = 0 and m.fichas = m.n
           and m.players = m.n and m.stages = m.n,
         format('%s filas; %s incompletas; %s fichas/%s jugadores/%s etapas únicos',
           m.n, m.incomplete, m.fichas, m.players, m.stages)
  from manifest m
  union all
  select 'FUENTE_IDENTIDAD_SIN_INFERENCIA',
         not exists (
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
         ),
         'Cada ficha activa coincide por UUID con jugador y etapa vigente del equipo'
  union all
  select 'RECUENTO_EXACTO',
         (select count(*) from actual) = (select n from manifest),
         format('%s vínculos en CTS; %s seleccionados',
           (select count(*) from actual), (select n from manifest))
  union all
  select 'CONJUNTO_EXACTO_SIN_SOBRANTES',
         not exists (
           select e.player_id, e.joined_on from expected e
           except
           select a.player_id, a.joined_on from actual a
         ) and not exists (
           select a.player_id, a.joined_on from actual a
           except
           select e.player_id, e.joined_on from expected e
         ),
         'La pareja jugador/fecha es exactamente la aprobada'
  union all
  select 'SIN_ANULACIONES_NI_SALIDAS_INVENTADAS',
         not exists (
           select 1 from actual a
           where a.voided_at is not null or a.left_on is not null
              or a.has_departed is distinct from false
         ),
         'Los seleccionados se vincularon sin inventar bajas o salidas'
  union all
  select 'CREADOR_OWNER_DEL_CLUB',
         not exists (
           select 1 from actual a
           left join public.club_memberships m on m.id = a.created_by_membership_id
           where m.id is null or m.club_id <> (select club_id from constants)
             or m.user_id <> '4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3'::uuid
             or m.role <> 'owner' or m.is_active is distinct from true
         ),
         'Todos los vínculos registran al owner activo acreditado'
  union all
  select 'SESION_1_CONSERVADA',
         (select count(*) from public.planned_training_sessions s
          join constants c on c.cts_id = s.club_team_season_id
          where s.session_number = 1 and s.planning_state = 'confirmed'
            and s.session_date = date '2026-10-25' and s.revision = 4) = 1,
         'Sesión nº 1: confirmada, 2026-10-25, revisión 4 según preflight'
),
results as (
  select 'CHECK'::text as row_type, check_name,
         case when ok then 'PASS' else 'FAIL' end as status,
         detail, null::uuid as player_id, null::uuid as membership_id,
         null::date as joined_on
  from checks
  union all
  select 'LINK', 'VINCULO', 'INFO',
         p.name, a.player_id, a.id, a.joined_on
  from actual a
  left join public.players_database p on p.id = a.player_id
  union all
  select 'GLOBAL', 'GLOBAL',
         case when bool_and(ok) and (select incomplete = 0 and n > 0 from manifest)
              then 'PASS' else 'FAIL' end,
         format('%s/%s comprobaciones; requiere cotejar el manifiesto firmado',
           count(*) filter (where ok), count(*)),
         null::uuid, null::uuid, null::date
  from checks
)
select * from results
order by case row_type when 'GLOBAL' then 0 when 'CHECK' then 1 else 2 end,
         check_name, player_id;
