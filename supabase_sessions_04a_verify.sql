-- APPCAUDAL / Sesiones 04A. POSTFLIGHT; una consulta SELECT, solo lectura.
-- PASS estructural no acredita pruebas de identidad ni inicialización de plantilla.
with objects as (
  select to_regclass('public.planned_session_player_roster') as roster,
         to_regclass('public.planned_session_player_availability') as availability
), checks as (
  select 'tables_identified'::text as check_name,
    (select roster is not null and availability is not null from objects) as ok,
    'Existen las dos tablas nuevas; no se escriben jugadores existentes'::text as explanation
  union all select 'table_comments',
    obj_description((select roster from objects),'pg_class')=
      'APPCAUDAL Sesiones 04A: immutable session roster snapshot'
    and obj_description((select availability from objects),'pg_class')=
      'APPCAUDAL Sesiones 04A: sparse session availability overrides',
    'Identidad de las tablas antes de atribuirles diseño 04A'
  union all select 'roster_columns',
    (select count(*) from pg_attribute a where a.attrelid=(select roster from objects)
       and a.attnum>0 and not a.attisdropped)=6
    and (select count(*) from pg_attribute a where a.attrelid=(select roster from objects)
       and a.attnum>0 and not a.attisdropped and
       ((a.attname in ('session_id','player_id','source_membership_id')
          and a.atttypid='uuid'::regtype and a.attnotnull)
        or (a.attname='player_name_snapshot' and a.atttypid='text'::regtype and a.attnotnull)
        or (a.attname='position_key_snapshot' and a.atttypid='text'::regtype and not a.attnotnull)
        or (a.attname='created_at' and a.atttypid='timestamp with time zone'::regtype
          and a.attnotnull)))=6,
    'Seis columnas de instantánea con tipos y nulabilidad previstos'
  union all select 'availability_columns',
    (select count(*) from pg_attribute a where a.attrelid=(select availability from objects)
       and a.attnum>0 and not a.attisdropped)=6
    and (select count(*) from pg_attribute a where a.attrelid=(select availability from objects)
       and a.attnum>0 and not a.attisdropped and
       ((a.attname in ('session_id','player_id') and a.atttypid='uuid'::regtype
         and a.attnotnull)
        or (a.attname='status' and a.atttypid='text'::regtype and a.attnotnull)
        or (a.attname='observation' and a.atttypid='text'::regtype and not a.attnotnull)
        or (a.attname in ('created_at','updated_at')
          and a.atttypid='timestamp with time zone'::regtype and a.attnotnull)))=6,
    'Seis columnas de excepción por sesión con tipos previstos'
  union all select 'constraints_validated',
    (select count(*) from pg_constraint c where c.conrelid=(select roster from objects)
      and c.convalidated)=7
    and (select count(*) from pg_constraint c where c.conrelid=(select availability from objects)
      and c.convalidated)=5
    and (select count(*) from pg_constraint c where c.conrelid=(select roster from objects))=7
    and (select count(*) from pg_constraint c where c.conrelid=(select availability from objects))=5,
    'Siete restricciones de plantilla y cinco de disponibilidad, todas validadas'
  union all select 'foreign_keys_restrict',
    (select count(*) from pg_constraint c where c.conrelid=(select roster from objects)
      and c.contype='f' and c.convalidated and c.confdeltype='r'
      and c.confrelid in (to_regclass('public.planned_training_sessions'),
        to_regclass('public.players_database'),to_regclass('public.club_team_season_players')))=3
    and (select count(*) from pg_constraint c
      where c.conrelid=(select availability from objects) and c.contype='f'
        and c.convalidated and c.confdeltype='r'
        and c.confrelid=(select roster from objects))=1,
    'FK validadas y RESTRICT hacia sesión, identidad, pertenencia y snapshot'
  union all select 'foreign_key_columns',
    (select count(*) from pg_constraint c where
      c.conrelid=(select roster from objects) and c.contype='f' and
      ((c.conname='planned_session_player_roster_session_fkey' and
        c.conkey=array[(select attnum from pg_attribute where
          attrelid=c.conrelid and attname='session_id')]::smallint[])
       or (c.conname='planned_session_player_roster_player_fkey' and
        c.conkey=array[(select attnum from pg_attribute where
          attrelid=c.conrelid and attname='player_id')]::smallint[])
       or (c.conname='planned_session_player_roster_source_fkey' and
        c.conkey=array[(select attnum from pg_attribute where
          attrelid=c.conrelid and attname='source_membership_id')]::smallint[])))=3
    and exists(select 1 from pg_constraint c where
      c.conrelid=(select availability from objects) and c.contype='f'
      and c.conname='planned_session_player_availability_roster_fkey'
      and c.conkey=array[
        (select attnum from pg_attribute where attrelid=c.conrelid and attname='session_id'),
        (select attnum from pg_attribute where attrelid=c.conrelid and attname='player_id')
      ]::smallint[]),
    'Columnas de referencia esperadas; no basta con comprobar tabla destino'
  union all select 'guards_enabled',
    (select count(*) from pg_trigger t where t.tgrelid in
      ((select roster from objects),(select availability from objects))
      and not t.tgisinternal and t.tgenabled='O' and t.tgtype=31
      and ((t.tgname='planned_session_player_roster_guard' and
        t.tgfoid=to_regprocedure('public.guard_planned_session_player_roster()'))
       or (t.tgname='planned_session_player_availability_guard' and
        t.tgfoid=to_regprocedure('public.guard_planned_session_player_availability()'))))=2,
    'Guardas activas enlazadas a las funciones 04A correctas'
  union all select 'guards_security',
    (select count(*) from pg_proc p where p.oid in
      (to_regprocedure('public.guard_planned_session_player_roster()'),
       to_regprocedure('public.guard_planned_session_player_availability()'))
      and p.prosecdef and p.proconfig @> array['search_path=pg_catalog']::text[]
      and not has_function_privilege('anon',p.oid,'EXECUTE')
      and not has_function_privilege('authenticated',p.oid,'EXECUTE'))=2,
    'Guardas SECURITY DEFINER, search_path seguro y sin EXECUTE directo cliente'
  union all select 'rls_read_only',
    (select count(*) from pg_class c where c.oid in
      ((select roster from objects),(select availability from objects))
      and c.relrowsecurity)=2
    and (select count(*) from pg_policy p where p.polrelid in
      ((select roster from objects),(select availability from objects))
      and p.polcmd='r' and p.polpermissive
      and p.polroles=array['authenticated'::regrole::oid]
      and p.polwithcheck is null)=2
    and (select count(*) from pg_policy p where p.polrelid in
      ((select roster from objects),(select availability from objects)))=2,
    'Solo dos políticas SELECT; RLS activa en ambas tablas'
  union all select 'policy_uses_cts_helper',
    (select count(*) from pg_policy p where p.polrelid in
      ((select roster from objects),(select availability from objects))
      and position('can_read_club_team_season' in
        lower(pg_get_expr(p.polqual,p.polrelid)))>0
      and position('planned_training_sessions' in
        lower(pg_get_expr(p.polqual,p.polrelid)))>0
      and lower(pg_get_expr(p.polqual,p.polrelid)) !~
        '(^|[^a-z_])or([^a-z_]|$)')=2,
    'La expresión RLS usa sesión y helper CTS sin OR explícito; revisión textual, no prueba dinámica'
  union all select 'client_privileges',
    has_table_privilege('authenticated',(select roster from objects),'SELECT')
    and has_table_privilege('authenticated',(select availability from objects),'SELECT')
    and not has_table_privilege('authenticated',(select roster from objects),'INSERT,UPDATE,DELETE')
    and not has_table_privilege('authenticated',(select availability from objects),'INSERT,UPDATE,DELETE')
    and not has_table_privilege('anon',(select roster from objects),'SELECT,INSERT,UPDATE,DELETE')
    and not has_table_privilege('anon',(select availability from objects),'SELECT,INSERT,UPDATE,DELETE'),
    'authenticated solo lee; anon no tiene acceso directo'
  union all select 'no_column_write_grants',
    not exists(select 1 from pg_attribute a where
      a.attrelid in ((select roster from objects),(select availability from objects))
      and a.attnum>0 and not a.attisdropped and
      (has_column_privilege('authenticated',a.attrelid,a.attname,'INSERT,UPDATE')
       or has_column_privilege('anon',a.attrelid,a.attname,'INSERT,UPDATE'))),
    'No quedan privilegios de columna que permitan escribir aunque se revoque la tabla'
  union all select 'existing_session_one',
    (select count(*) from public.planned_training_sessions s where
      s.club_team_season_id='961970c8-0fcf-4c45-94d6-787647619c61'::uuid
      and s.session_number=1 and s.planning_state='confirmed')=1,
    'Sesión confirmada nº 1 presente; comparar fecha/revisión con preflight'
), counts as (
  select
    case when roster is not null then pg_catalog.query_to_xml(
      'select count(*) as row_count from public.planned_session_player_roster',
      true,false,'') end as roster_xml,
    case when availability is not null then pg_catalog.query_to_xml(
      'select count(*) as row_count from public.planned_session_player_availability',
      true,false,'') end as availability_xml
  from objects
), report as (
  select check_name,case
      when (select roster is null or availability is null from objects) then 'BLOCKED'
      when ok then 'PASS' else 'FAIL' end as result,
    explanation from checks
), output as (
  select check_name,result,explanation from report
  union all select 'GLOBAL',case
      when bool_or(result='BLOCKED') then 'BLOCKED'
      when bool_and(result='PASS') then 'PASS' else 'FAIL' end,
    format('%s/%s comprobaciones estructurales; identidad y CAS aún PENDING',
      count(*) filter(where result='PASS'),count(*)) from report
  union all select 'ROSTER_ROWS',
    case when roster_xml is null then 'PENDING' else 'INFO' end,
    coalesce(nullif((pg_catalog.xpath(
      '/*[local-name()="table"]/*[local-name()="row"]/*[local-name()="row_count"]/text()',
      roster_xml))[1]::text,'')::bigint::text,'Tabla 04A no instalada') from counts
  union all select 'AVAILABILITY_OVERRIDE_ROWS',
    case when availability_xml is null then 'PENDING' else 'INFO' end,
    coalesce(nullif((pg_catalog.xpath(
      '/*[local-name()="table"]/*[local-name()="row"]/*[local-name()="row_count"]/text()',
      availability_xml))[1]::text,'')::bigint::text,'Tabla 04A no instalada') from counts
)
select check_name,result,explanation from output
order by case when check_name='GLOBAL' then 1 else 0 end,check_name;
