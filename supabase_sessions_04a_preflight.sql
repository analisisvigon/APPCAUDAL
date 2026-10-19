-- APPCAUDAL / Sesiones 04A. INVENTARIO PREVIO; solo SELECT.
-- Ejecutar manualmente y revisar TODAS las filas antes de autorizar 04A.
-- Las filas player incluyen nombres reales: exportar y custodiar como datos privados.
-- Este archivo requiere que Sesiones 01 y 03A/03C estén instaladas; si falta una
-- tabla fuente, el error es un bloqueo, no una autorización para inferir datos.
with context as (
  select cts.id, cts.club_id, cts.team_id, cts.season_id,
         se.label, se.status, se.starts_on, se.ends_on
  from public.club_team_seasons cts
  join public.club_seasons se on se.id=cts.season_id and se.club_id=cts.club_id
  where cts.id='961970c8-0fcf-4c45-94d6-787647619c61'::uuid
), roster as (
  select m.id as membership_id, m.player_id, m.joined_on, m.left_on,
         m.has_departed, m.voided_at, p.name,
         count(pos.id) filter (where pos.position_type='natural' and pos.is_primary) as primary_count,
         max(pos.position_key) filter (where pos.position_type='natural' and pos.is_primary) as primary_position
  from public.club_team_season_players m
  join public.players_database p on p.id=m.player_id
  left join public.player_positions pos on pos.player_id=p.id
  where m.club_team_season_id='961970c8-0fcf-4c45-94d6-787647619c61'::uuid
  group by m.id,m.player_id,m.joined_on,m.left_on,m.has_departed,m.voided_at,p.name
), checks as (
  select 'source_tables'::text as object_name,
    case when to_regclass('public.planned_training_sessions') is not null
       and to_regclass('public.club_team_season_players') is not null
       and to_regclass('public.players_database') is not null
       and to_regclass('public.player_positions') is not null
       and to_regclass('public.planned_session_audit_events') is not null
      then 'PASS' else 'BLOCKED' end as result,
    jsonb_build_object('meaning','Tablas fuente requeridas') as detail
  union all select 'canonical_context',
    case when (select count(*) from context)=1 then 'PASS' else 'BLOCKED' end,
    coalesce((select to_jsonb(c) from context c), '{}'::jsonb)
  union all select 'source_identity',
    case when obj_description(to_regclass('public.club_team_season_players'),'pg_class')=
        'APPCAUDAL Sesiones 01: canonical player membership in a club team-season, dates optional'
      and obj_description(to_regclass('public.planned_training_sessions'),'pg_class')=
        'APPCAUDAL Sesiones 03A: planned_training_sessions'
      then 'PASS' else 'BLOCKED' end,
    jsonb_build_object('meaning','Comentarios de procedencia de las dos tablas centrales')
  union all select 'source_columns',
    case when (select count(*) from pg_attribute a
        where a.attrelid=to_regclass('public.club_team_season_players')
          and a.attnum>0 and not a.attisdropped and
          ((a.attname in ('id','club_team_season_id','player_id')
            and a.atttypid='uuid'::regtype and a.attnotnull)
           or (a.attname='voided_at'
             and a.atttypid='timestamp with time zone'::regtype)
           or (a.attname in ('joined_on','left_on') and a.atttypid='date'::regtype)
           or (a.attname='has_departed' and a.atttypid='boolean'::regtype
             and a.attnotnull)))=7
       and (select count(*) from pg_attribute a
        where a.attrelid=to_regclass('public.planned_training_sessions')
          and a.attnum>0 and not a.attisdropped and
          ((a.attname in ('id','club_team_season_id')
            and a.atttypid='uuid'::regtype and a.attnotnull)
           or (a.attname='revision' and a.atttypid='integer'::regtype
             and a.attnotnull)))=3
      then 'PASS' else 'BLOCKED' end,
    jsonb_build_object('meaning','Columnas y tipos esenciales de 01 y 03A')
  union all select 'planned_rpcs',
    case when to_regprocedure('public.create_planned_session_draft(uuid,date)') is not null
       and to_regprocedure('public.save_planned_session(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])') is not null
       and to_regprocedure('public.save_planned_session_03c(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])') is not null
       and to_regprocedure('public.confirm_planned_session(uuid,integer)') is not null
       and to_regprocedure('public.confirm_planned_session_03c(uuid,integer)') is not null
      then 'PASS' else 'BLOCKED' end,
    jsonb_build_object('meaning','Firmas 03A/03C usadas por la aplicación; verificar cuerpos aparte')
  union all select 'auth_helpers',
    case when to_regprocedure('public.can_read_club_team_season(uuid)') is not null
       and to_regprocedure('public.can_write_club_team_season(uuid)') is not null
      then 'PASS' else 'BLOCKED' end,
    jsonb_build_object('meaning','Existencia de helpers, no prueba dinámica de identidad')
  union all select 'source_rls',
    case when (select count(*) from pg_class
               where oid in (to_regclass('public.planned_training_sessions'),
                             to_regclass('public.club_team_season_players'))
                 and relrowsecurity)=2 then 'PASS' else 'BLOCKED' end,
    jsonb_build_object('meaning','RLS habilitada en sesiones y pertenencias canónicas')
  union all select 'target_names_free',
    case when to_regclass('public.planned_session_player_roster') is null
       and to_regclass('public.planned_session_player_availability') is null
       and to_regprocedure('public.guard_planned_session_player_roster()') is null
       and to_regprocedure('public.guard_planned_session_player_availability()') is null
      then 'PASS' else 'BLOCKED' end,
    jsonb_build_object('meaning','La primera instalación no debe colisionar con objetos ajenos')
), report as (
  select 'check'::text as section, object_name, result, detail from checks
  union all
  select 'summary','canonical_memberships','REVIEW',jsonb_build_object(
    'total_rows',count(*),'nonvoid_rows',count(*) filter (where voided_at is null),
    'distinct_nonvoid_players',count(distinct player_id) filter (where voided_at is null),
    'unknown_arrival',count(*) filter (where voided_at is null and joined_on is null),
    'unknown_departure',count(*) filter (where voided_at is null and has_departed and left_on is null),
    'without_primary_natural_position',count(*) filter (where voided_at is null and primary_count<>1))
  from roster
  union all
  select 'player',membership_id::text,
    case when voided_at is not null then 'VOIDED'
         when joined_on is null or (has_departed and left_on is null) then 'DATE_REVIEW'
         else 'REVIEW' end,
    jsonb_build_object('player_id',player_id,'name',name,'joined_on',joined_on,
      'left_on_exclusive',left_on,'has_departed',has_departed,'voided_at',voided_at,
      'primary_natural_position',primary_position,'primary_position_count',primary_count)
  from roster
  union all
  select 'session',s.id::text,'BASELINE',jsonb_build_object(
    'session_number',s.session_number,'session_date',s.session_date,
    'planning_state',s.planning_state,'revision',s.revision,'updated_at',s.updated_at)
  from public.planned_training_sessions s
  where s.club_team_season_id='961970c8-0fcf-4c45-94d6-787647619c61'::uuid
  union all
  select 'global','04A','BLOCKED',jsonb_build_object(
    'reason','No autorizar carga ni migración hasta conciliar jugadores, fechas y esquema real; este inventario no prueba permisos por identidad')
)
select section,object_name,result,detail from report
order by case section when 'check' then 0 when 'summary' then 1
  when 'player' then 2 when 'session' then 3 else 4 end,object_name;
