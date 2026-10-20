-- APPCAUDAL / Sesiones 04B: postflight SOLO LECTURA.
-- Ejecutar DESPUES de 04B. PASS estructural NO equivale a prueba de RPC real.
with objects as (
  select to_regclass('public.planned_session_date_change_authorizations') as token,
    to_regclass('public.planned_training_sessions') as sessions,
    to_regclass('public.planned_session_player_roster') as roster,
    to_regclass('public.planned_session_player_availability') as availability
), token_count as (
  select case when token is not null then pg_catalog.query_to_xml(
    'select count(*) as row_count from public.planned_session_date_change_authorizations',
    true,false,'') end as count_xml from objects
), expected_functions(signature,client_callable) as (values
  ('planned_session_04b_lock(uuid,integer)',false),
  ('planned_session_04b_state(uuid)',false),
  ('guard_planned_session_04b_date()',false),
  ('freeze_planned_session_roster_04b(uuid,integer,uuid[],boolean,boolean)',true),
  ('save_planned_session_availability_04b(uuid,integer,jsonb)',true),
  ('reconcile_planned_session_date_04b(uuid,integer,date,uuid[],boolean)',true)
), function_checks as (
  select e.signature,e.client_callable,p.oid,
    coalesce(p.prosecdef,false) as definer,
    coalesce(p.proowner='postgres'::regrole::oid,false) as owner_ok,
    coalesce(p.proconfig@>array['search_path=pg_catalog'],false) as path_ok,
    case when p.oid is null then false
      else has_function_privilege('authenticated',p.oid,'EXECUTE') end as authenticated_execute,
    case when p.oid is null then true
      else has_function_privilege('anon',p.oid,'EXECUTE') end as anon_execute,
    exists(select 1 from pg_proc p2,
      lateral aclexplode(coalesce(p2.proacl,acldefault('f',p2.proowner))) acl
      where p2.oid=p.oid and acl.grantee=0 and acl.privilege_type='EXECUTE')
      as public_execute,
    obj_description(p.oid,'pg_proc')=
      'APPCAUDAL Sesiones 04B: '||split_part(e.signature,'(',1) as origin_ok
  from expected_functions e
  left join pg_proc p on p.oid=to_regprocedure('public.'||e.signature)
), checks as (
  select 'six_functions_and_no_overloads'::text as check_name,
    (select count(*) from function_checks where oid is not null)=6
    and (select count(*) from pg_proc p
      where p.pronamespace='public'::regnamespace
        and p.proname in
        ('planned_session_04b_lock','planned_session_04b_state',
         'guard_planned_session_04b_date','freeze_planned_session_roster_04b',
         'save_planned_session_availability_04b',
         'reconcile_planned_session_date_04b'))=6 as ok,
    'Seis firmas exactas, sin sobrecargas que confundan RPC'::text as explanation
  union all select 'function_security',
    (select count(*) from function_checks
      where definer and owner_ok and path_ok and origin_ok)=6,
    'SECURITY DEFINER, postgres, search_path=pg_catalog y procedencia 04B'
  union all select 'execute_authenticated',
    (select count(*) from function_checks
      where authenticated_execute=client_callable)=6,
    'Solo las tres RPC públicas son ejecutables por authenticated'
  union all select 'execute_anon_public',
    (select count(*) from function_checks
      where not anon_execute and not public_execute)=6,
    'Ninguna función 04B es ejecutable por anon ni PUBLIC'
  union all select 'token_table_rls_and_owner',
    exists(select 1 from pg_class c
      where c.oid=(select token from objects) and c.relrowsecurity
        and c.relowner='postgres'::regrole::oid)
    and (select count(*) from pg_policy p
      where p.polrelid=(select token from objects))=0,
    'Tabla de token privada, con RLS y sin políticas'
  union all select 'token_table_columns',
    (select count(*) from pg_attribute a
      where a.attrelid=(select token from objects) and a.attnum>0 and not a.attisdropped)=6
    and (select count(*) from pg_attribute a
      where a.attrelid=(select token from objects) and a.attnum>0 and not a.attisdropped
        and ((a.attname in ('session_id','actor_membership_id')
               and a.atttypid='uuid'::regtype and a.attnotnull)
          or (a.attname in ('old_date','new_date')
               and a.atttypid='date'::regtype and a.attnotnull)
          or (a.attname='expected_revision' and a.atttypid='integer'::regtype
               and a.attnotnull)
          or (a.attname='created_at' and a.atttypid='timestamptz'::regtype
               and a.attnotnull)))=6,
    'Seis columnas de token con tipos y nulabilidad exactos'
  union all select 'token_constraints',
    (select count(*) from pg_constraint c
      where c.conrelid=(select token from objects) and c.convalidated)=5
    and (select count(*) from pg_constraint c
      where c.conrelid=(select token from objects))=5
    and (select count(*) from pg_constraint c
      where c.conrelid=(select token from objects) and c.contype='f'
        and c.convalidated and c.confdeltype='r'
        and c.confrelid in
          (to_regclass('public.planned_training_sessions'),
           to_regclass('public.club_memberships')))=2,
    'PK, dos FK RESTRICT y dos CHECK validados; sin restricciones extra'
  union all select 'token_check_expressions',
    exists(select 1 from pg_constraint c
      where c.conrelid=(select token from objects)
        and c.conname='planned_04b_date_revision_check' and c.contype='c'
        and regexp_replace(pg_get_expr(c.conbin,c.conrelid),
          '[[:space:]()]','','g')='expected_revision>0')
    and exists(select 1 from pg_constraint c
      where c.conrelid=(select token from objects)
        and c.conname='planned_session_date_change_difference_check' and c.contype='c'
        and regexp_replace(pg_get_expr(c.conbin,c.conrelid),
          '[[:space:]()]','','g')='new_date<>old_date'),
    'Las dos CHECK tienen la expresión prevista, no solo el nombre'
  union all select 'token_fk_columns',
    (select count(*) from pg_constraint c
      where c.conrelid=(select token from objects)
        and c.contype='f' and c.convalidated and c.confdeltype='r'
        and ((c.conname='planned_04b_date_session_fkey'
          and c.confrelid=(select sessions from objects)
          and c.confkey=array[(select a.attnum from pg_attribute a
            where a.attrelid=c.confrelid and a.attname='id')]::smallint[]
          and c.conkey=array[(select a.attnum from pg_attribute a
            where a.attrelid=c.conrelid and a.attname='session_id')]::smallint[])
         or (c.conname='planned_04b_date_actor_fkey'
          and c.confrelid=to_regclass('public.club_memberships')
          and c.confkey=array[(select a.attnum from pg_attribute a
            where a.attrelid=c.confrelid and a.attname='id')]::smallint[]
          and c.conkey=array[(select a.attnum from pg_attribute a
            where a.attrelid=c.conrelid and a.attname='actor_membership_id')]::smallint[])))=2,
    'Las dos FK enlazan columnas y tablas correctas con RESTRICT'
  union all select 'token_no_client_privileges',
    coalesce(not has_table_privilege('authenticated',
      (select token from objects),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,MAINTAIN'),false)
    and coalesce(not has_table_privilege('anon',
      (select token from objects),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,MAINTAIN'),false)
    and coalesce(not has_table_privilege('service_role',
      (select token from objects),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,MAINTAIN'),false),
    'Sin privilegios SQL efectivos para authenticated, anon ni service_role; incluido MAINTAIN'
  union all select 'token_empty',
    coalesce(nullif((pg_catalog.xpath(
      '/*[local-name()="table"]/*[local-name()="row"]/*[local-name()="row_count"]/text()',
      (select count_xml from token_count)))[1]::text,'')::bigint=0,false),
    'La RPC de conciliación no deja tokens persistentes'
  union all select 'date_trigger',
    exists(select 1 from pg_trigger t
      join pg_attribute a on a.attrelid=t.tgrelid and a.attname='session_date'
      where t.tgrelid=(select sessions from objects)
        and t.tgname='planned_sessions_04b_date_guard'
        and t.tgfoid=to_regprocedure('public.guard_planned_session_04b_date()')
        and t.tgenabled='O' and t.tgtype=19
        and t.tgattr::text=a.attnum::text),
    'BEFORE UPDATE OF session_date, por fila, enlazado al guard 04B'
  union all select 'original_session_guards_still_enabled',
    exists(select 1 from pg_trigger t where t.tgrelid=(select sessions from objects)
      and t.tgname='planned_sessions_guard' and t.tgenabled='O'
      and t.tgfoid=to_regprocedure('public.guard_planned_session_row()'))
    and exists(select 1 from pg_trigger t
      where t.tgrelid=to_regclass('public.planned_session_audit_events')
        and t.tgname='planned_audit_guard' and t.tgenabled='O'
        and t.tgfoid=to_regprocedure('public.guard_planned_session_audit()')),
    'Los guards de sesión y auditoría 03A siguen activos'
  union all select '04a_tables_read_only',
    (select count(*) from pg_class c where c.oid in
      ((select roster from objects),(select availability from objects))
      and c.relrowsecurity)=2
    and coalesce(not has_table_privilege('authenticated',
      (select roster from objects),'INSERT,UPDATE,DELETE'),false)
    and coalesce(not has_table_privilege('authenticated',
      (select availability from objects),'INSERT,UPDATE,DELETE'),false)
    and not exists(select 1 from pg_attribute a where a.attrelid in
      ((select roster from objects),(select availability from objects))
      and a.attnum>0 and not a.attisdropped
      and has_column_privilege('authenticated',a.attrelid,a.attname,'INSERT,UPDATE')),
    '04B no abre escritura directa sobre las tablas 04A'
  union all select 'historical_14_matches',
    (select count(*) from public.partidos p where p.id in (
      '12e019fb-e2bb-4a6d-91ce-f22a04c4f7dc'::uuid,
      '25cbc486-080a-4b82-9980-3c09cc103181'::uuid,
      '39e2d20d-5d6e-40fd-9645-d44e2eb40715'::uuid,
      '3a617129-de25-4531-a944-27832bb24b31'::uuid,
      '4b3312ed-96e6-440f-88e6-82c2b9baf622'::uuid,
      '65f6c0ab-66c8-47ad-882b-f12c529601bb'::uuid,
      '6785391e-a054-488b-acf4-67be3cd954c2'::uuid,
      '8ce7ceb8-60e6-4f55-9bc1-a24b4da2461e'::uuid,
      'ca6b6933-e075-4cee-b5a0-ab32abb61d41'::uuid,
      'd7e38bd4-1e63-492d-9676-cedc07b9a920'::uuid,
      'e98f09d2-fb31-4db3-89da-b53e5982b683'::uuid,
      'ebf6cc9c-ec1d-42d1-bf22-e09a9741ab3a'::uuid,
      'eca4bee3-4b98-42a1-9dff-b6f4187082d6'::uuid,
      'ffa62b07-b9a9-4f03-ad6c-2d65df327774'::uuid)
      and p.club_team_season_id='961970c8-0fcf-4c45-94d6-787647619c61'::uuid)=14,
    'Los 14 UUID históricos siguen vinculados al CTS aprobado'
), output as (
  select check_name,case
      when (select token is null or roster is null or availability is null from objects)
        then 'BLOCKED'
      when ok then 'PASS' else 'FAIL' end as result,
    explanation as detail from checks
  union all select 'session_1_current_state','INFO',
    coalesce((select 'id='||s.id::text||'; date='||s.session_date::text||
      '; revision='||s.revision::text||'; updated_at='||s.updated_at::text
      from public.planned_training_sessions s
      where s.club_team_season_id='961970c8-0fcf-4c45-94d6-787647619c61'::uuid
        and s.session_number=1),'No existe o no es visible: revisar')
  union all select 'dynamic_identity_tests','PENDING',
    'Sin ejecución real de RPC con owner, staff asignado/no asignado y player'
  union all select 'closed_season_test','PENDING',
    'No cerrar temporalmente la temporada en producción para probar'
  union all select 'roster_history_and_print','PENDING',
    'La interfaz y la impresión son Etapa B; verificar 24 nombres en A4 entonces'
), final as (
  select check_name,result,detail from output
  union all
  select 'GLOBAL',case when count(*) filter (where result='BLOCKED')>0
    then 'BLOCKED' when count(*) filter (where result='FAIL')=0
    then 'PASS' else 'FAIL' end,
    count(*) filter (where result='PASS')::text||' comprobaciones estructurales PASS; '||
    count(*) filter (where result='FAIL')::text||' FAIL; '||
    count(*) filter (where result='BLOCKED')::text||' BLOCKED; '||
    count(*) filter (where result='PENDING')::text||' pruebas PENDING'
  from output
)
select check_name,result,detail from final
order by case when check_name='GLOBAL' then 1 else 0 end,check_name;
