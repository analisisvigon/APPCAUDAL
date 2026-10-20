-- APPCAUDAL / Sesiones 04B: preflight SOLO LECTURA. Ejecutar antes de 04B.
-- No sustituye al postflight 04A ni a pruebas con identidades reales.
with facts as (
  select
    to_regclass('public.planned_training_sessions') as sessions,
    to_regclass('public.planned_session_player_roster') as roster,
    to_regclass('public.planned_session_player_availability') as availability,
    to_regclass('public.club_team_season_players') as memberships,
    to_regprocedure('public.save_planned_session(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])') as save03a,
    to_regprocedure('public.save_planned_session_03c(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])') as save03c,
    to_regprocedure('public.planned_session_state(uuid)') as session_state,
    to_regprocedure('public.can_write_club_team_season(uuid)') as can_write
), checks as (
  select 'dependencies'::text as check_name,
    (sessions is not null and roster is not null and availability is not null
      and memberships is not null and save03a is not null and save03c is not null
      and session_state is not null and can_write is not null) as ok,
    '03A, 03C, 04A y autorización CTS instalados'::text as explanation
    from facts
  union all select '04a_roster_origin',
    obj_description(roster,'pg_class')=
      'APPCAUDAL Sesiones 04A: immutable session roster snapshot'
    and obj_description(availability,'pg_class')=
      'APPCAUDAL Sesiones 04A: sparse session availability overrides',
    'Las tablas nuevas son las previstas por 04A' from facts
  union all select '04a_guards',
    exists(select 1 from pg_trigger t where t.tgrelid=roster
      and t.tgname='planned_session_player_roster_guard' and t.tgenabled='O'
      and t.tgfoid=to_regprocedure('public.guard_planned_session_player_roster()'))
    and exists(select 1 from pg_trigger t where t.tgrelid=availability
      and t.tgname='planned_session_player_availability_guard' and t.tgenabled='O'
      and t.tgfoid=to_regprocedure('public.guard_planned_session_player_availability()')),
    'Ambos guards 04A activos' from facts
  union all select '04a_rls_and_no_direct_write',
    exists(select 1 from pg_class c where c.oid=roster and c.relrowsecurity)
    and exists(select 1 from pg_class c where c.oid=availability and c.relrowsecurity)
    and coalesce(not has_table_privilege('authenticated',roster,'INSERT,UPDATE,DELETE'),false)
    and coalesce(not has_table_privilege('authenticated',availability,'INSERT,UPDATE,DELETE'),false)
    and not exists(select 1 from pg_attribute a
      where a.attrelid in (roster,availability) and a.attnum>0
        and not a.attisdropped and
        has_column_privilege('authenticated',a.attrelid,a.attname,'INSERT,UPDATE')),
    'RLS activo y authenticated sin escritura directa en roster/disponibilidad' from facts
  union all select '03a_03c_owner_and_path',
    (select count(*) from pg_proc p where p.oid in (save03a,save03c)
      and p.prosecdef and p.proowner='postgres'::regrole::oid
      and p.proconfig@>array['search_path=pg_catalog'])=2,
    'RPC previas con propietario y search_path esperados' from facts
  union all select 'caudal_24_memberships',
    (select count(*) from public.club_team_season_players m
      where m.club_team_season_id='961970c8-0fcf-4c45-94d6-787647619c61'::uuid
        and m.voided_at is null)=24,
    'Confirma que siguen existiendo 24 pertenencias canónicas no anuladas' from facts
  union all select 'session_1_exists',
    (select count(*) from public.planned_training_sessions s
      where s.club_team_season_id='961970c8-0fcf-4c45-94d6-787647619c61'::uuid
        and s.session_number=1 and s.planning_state='confirmed')=1,
    'La sesión histórica nº 1 sigue confirmada; revisión y fecha se informan aparte' from facts
  union all select 'session_1_last_confirmed_baseline',
    (select count(*) from public.planned_training_sessions s
      where s.club_team_season_id='961970c8-0fcf-4c45-94d6-787647619c61'::uuid
        and s.session_number=1 and s.planning_state='confirmed'
        and s.session_date='2026-10-25'::date and s.revision=4)=1,
    'La fecha/revisión deben coincidir con el último dato confirmado; si hubo edición legítima, revisar nueva línea base antes de instalar' from facts
), output as (
  select check_name,case when ok then 'PASS' else 'BLOCKED' end as result,
    explanation as detail from checks
  union all
  select 'session_1_current_state','INFO',
    coalesce((select 'id='||s.id::text||'; date='||s.session_date::text||
      '; revision='||s.revision::text||'; updated_at='||s.updated_at::text
      from public.planned_training_sessions s
      where s.club_team_season_id='961970c8-0fcf-4c45-94d6-787647619c61'::uuid
        and s.session_number=1),'No existe o no es visible')
  union all
  select 'membership_dates','INFO',
    'joined_on NULL='||count(*) filter (where m.joined_on is null)::text||
    '; departed_without_left_on='||count(*) filter
      (where m.has_departed and m.left_on is null)::text
    from public.club_team_season_players m
    where m.club_team_season_id='961970c8-0fcf-4c45-94d6-787647619c61'::uuid
      and m.voided_at is null
  union all
  select 'identity_tests','PENDING',
    'Este preflight no ejecuta RPC ni simula identidades; probar después con usuarios reales'
), final as (
  select check_name,result,detail from output
  union all
  select 'GLOBAL',case when count(*) filter (where result='BLOCKED')=0
    then 'READY_TO_APPLY' else 'BLOCKED' end,
    count(*) filter (where result='PASS')::text||' controles PASS; '||
    count(*) filter (where result='BLOCKED')::text||' bloqueos; pruebas de identidad PENDING'
  from output
)
select check_name,result,detail from final
order by case when check_name='GLOBAL' then 1 else 0 end,check_name;
