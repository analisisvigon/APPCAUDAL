-- SOLO LECTURA. No llama RPC de borrado, no instala ni cambia datos.
-- SQL Editor con auth.uid() NULL no acredita permisos de una sesión STAFF real.
-- Ejecutable ANTES y DESPUÉS de instalar: no requiere funciones nuevas presentes.
-- Esperado antes: guards ORIGINAL_REVISADO y contrato true.
-- Esperado después: guards DELETE_V1_REVISADO, contrato true y archivo privado.
select signature,to_regprocedure(signature) is not null as installed,
  p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) as owner,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') as service_role_execute,
  exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    where a.grantee=0 and a.privilege_type='EXECUTE') as public_execute
from (values
  ('public.planned_session_04b_lock(uuid,integer)'),
  ('public.can_write_club_team_season(uuid)'),
  ('public.planned_session_delete_ready_v1()'),
  ('public.delete_planned_session_v1(uuid,uuid,integer,boolean)'),
  ('public.planned_session_delete_authorized_v1(uuid)'),
  ('public.planned_session_delete_contract_v1()'),
  ('public.guard_planned_session_deletion_archive_v1()')
) signatures(signature) left join pg_proc p on p.oid=to_regprocedure(signature);

-- Dependencias directas E indirectas, incluidas las cascadas.
with recursive relations(oid) as (
  select to_regclass('public.planned_training_sessions')::oid
  union
  select c.conrelid from pg_constraint c join relations r on r.oid=c.confrelid where c.contype='f'
)
select c.conrelid::regclass as child,c.confrelid::regclass as parent,c.conname,
  pg_get_constraintdef(c.oid) as definition,
  case when c.conrelid::regclass::text = any(array[
    'planned_session_slots','planned_session_items','planned_session_player_roster',
    'planned_session_player_availability','planned_session_audit_events',
    'planned_session_date_change_authorizations','planned_session_distributions',
    'planned_session_board_seed_v11','planned_session_exercise_dimensions_v12'])
    then 'REVISAR CONTRATO' else 'DEPENDENCIA EXTERNA: BLOQUEA BORRADO' end as review
from pg_constraint c where c.contype='f' and c.confrelid in(select oid from relations)
order by c.confrelid::regclass::text,c.conrelid::regclass::text,c.conname;

with recursive relations(oid) as (
  select to_regclass('public.planned_training_sessions')::oid
  union
  select c.conrelid from pg_constraint c join relations r on r.oid=c.confrelid where c.contype='f'
)
select t.tgrelid::regclass as relation,t.tgname,t.tgenabled,
  pg_get_triggerdef(t.oid) as definition,pg_get_functiondef(t.tgfoid) as guard
from pg_trigger t where not t.tgisinternal and t.tgrelid in(select oid from relations)
order by t.tgrelid::regclass::text,t.tgname;

select c.oid::regclass as relation,c.relrowsecurity,
  has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE') as direct_write,
  has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE') as anon_write
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and (c.relname='planned_training_sessions' or c.relname like 'planned_session_%')
  and c.relkind='r' order by c.oid::regclass::text;

select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies
where schemaname='public' and (tablename='planned_training_sessions' or tablename like 'planned_session_%')
order by tablename,policyname;

select p.oid::regprocedure as routine,pg_get_functiondef(p.oid) as definition
from pg_proc p where p.oid in (
  to_regprocedure('public.delete_planned_session_v1(uuid,uuid,integer,boolean)'),
  to_regprocedure('public.planned_session_delete_authorized_v1(uuid)'),
  to_regprocedure('public.planned_session_delete_contract_v1()'),
  to_regprocedure('public.guard_planned_session_deletion_archive_v1()'),
  to_regprocedure('public.planned_session_04b_lock(uuid,integer)'),
  to_regprocedure('public.can_write_club_team_season(uuid)'));

-- Archivo: no lee contenido personal. Tras instalar, RLS=true, owner=postgres,
-- todas las columnas *_access=false, policy_count=0; dos triggers inmutables.
select to_regclass('public.planned_session_deletion_archive_v1') is not null as archive_installed;
select c.relrowsecurity,pg_get_userbyid(c.relowner) as owner,
  has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as authenticated_access,
  has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as anon_access,
  has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as service_role_access,
  exists(select 1 from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    where a.grantee=0) as public_access,
  exists(select 1 from pg_attribute col cross join lateral aclexplode(col.attacl) a
    where col.attrelid=c.oid and a.grantee<>c.relowner) as extra_column_access,
  (select count(*) from pg_policy p where p.polrelid=c.oid) as policy_count
from pg_class c where c.oid=to_regclass('public.planned_session_deletion_archive_v1');
select t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) as definition
from pg_trigger t where t.tgrelid=to_regclass('public.planned_session_deletion_archive_v1')
  and not t.tgisinternal order by t.tgname;

-- Reglas DELETE inesperadas: debe devolver cero filas.
select r.ev_class::regclass as relation,r.rulename,pg_get_ruledef(r.oid) as definition
from pg_rewrite r join pg_class c on c.oid=r.ev_class
where c.relnamespace='public'::regnamespace and r.ev_type='4'
  and (c.relname='planned_training_sessions' or c.relname like 'planned_session_%');

-- Comparacion exacta de cuerpos originales y finales, mas definiciones completas.
with expected(signature,original_md5,delete_v1_md5) as (values
  ('public.guard_planned_session_row()', '491865ab08c80da496bea7ba369ad51c', 'ff7f49076776ef40c5a3469a68509c3c'),
  ('public.guard_planned_session_player_roster()', '5aa7234d70b762e9602ca255336b8cd5', 'd1e21584958022bd256d17762dc0055d'),
  ('public.guard_planned_session_audit()', 'b5612164156faa7b2c4cd5026ed25e7c', '5f913caba07173377a99c42a7363c526')
), actual as (
  select e.*,p.*,md5(btrim(replace(p.prosrc,chr(13)||chr(10),chr(10)),E' \t\r\n')) as body_md5
  from expected e left join pg_proc p on p.oid=to_regprocedure(e.signature)
)
select signature,body_md5,original_md5,delete_v1_md5,
  case when body_md5=original_md5 then 'ORIGINAL_REVISADO'
       when body_md5=delete_v1_md5 then 'DELETE_V1_REVISADO'
       else 'DIFERENTE: REVISAR ANTES DE INSTALAR' end as body_review,
  prosecdef and proowner='postgres'::regrole and prorettype='trigger'::regtype
    and proconfig=array['search_path=pg_catalog']::text[] as metadata_expected,
  pg_get_functiondef(oid) as full_definition
from actual order by signature;

-- Contrato exacto de las diez FK y seis triggers DELETE: debe devolver true.
-- Mismo SELECT que la migracion; funciona tambien antes de instalarla.
with expected_fk(child,parent,child_columns,parent_columns,delete_action) as (values
    ('planned_session_slots','planned_training_sessions',array['session_id'],array['id'],'r'),
    ('planned_session_items','planned_training_sessions',array['session_id'],array['id'],'r'),
    ('planned_session_items','planned_session_slots',array['slot_id','session_id'],array['id','session_id'],'r'),
    ('planned_session_player_roster','planned_training_sessions',array['session_id'],array['id'],'r'),
    ('planned_session_player_availability','planned_session_player_roster',array['session_id','player_id'],array['session_id','player_id'],'r'),
    ('planned_session_audit_events','planned_training_sessions',array['session_id'],array['id'],'r'),
    ('planned_session_date_change_authorizations','planned_training_sessions',array['session_id'],array['id'],'r'),
    ('planned_session_distributions','planned_training_sessions',array['session_id'],array['id'],'r'),
    ('planned_session_board_seed_v11','planned_training_sessions',array['session_id'],array['id'],'r'),
    ('planned_session_exercise_dimensions_v12','planned_session_slots',array['slot_id','session_id'],array['id','session_id'],'c')
  ), target_tables as (
    select to_regclass('public.'||child)::oid as oid from expected_fk
    union select to_regclass('public.planned_training_sessions')::oid
  ), actual_fk as (
    select c.*,array(select a.attname::text from unnest(c.conkey) with ordinality k(num,ord)
      join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num order by k.ord) as child_columns,
      array(select a.attname::text from unnest(c.confkey) with ordinality k(num,ord)
      join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.num order by k.ord) as parent_columns
    from pg_constraint c where c.contype='f' and c.confrelid in(select oid from target_tables)
  ), expected_trigger(relation,name,routine) as (values
    ('planned_training_sessions','planned_sessions_guard','guard_planned_session_row()'),
    ('planned_session_slots','planned_slots_guard','guard_planned_session_child()'),
    ('planned_session_items','planned_items_guard','guard_planned_session_child()'),
    ('planned_session_player_roster','planned_session_player_roster_guard','guard_planned_session_player_roster()'),
    ('planned_session_player_availability','planned_session_player_availability_guard','guard_planned_session_player_availability()'),
    ('planned_session_audit_events','planned_audit_guard','guard_planned_session_audit()')
  ), actual_trigger as (
    select * from pg_trigger where not tgisinternal and (tgtype & 8)<>0
      and tgrelid in(select oid from target_tables)
  )
  select (select count(*)=10 from target_tables)
    and (select count(*)=10 from pg_class c where c.oid in(select oid from target_tables)
      and c.relkind='r' and not c.relhassubclass and c.relrowsecurity)
    -- Una regla de reescritura DELETE tambien podria modificar otras tablas.
    and not exists(select 1 from pg_rewrite r where r.ev_class in(select oid from target_tables)
      and r.ev_type='4')
    and (select count(*)=10 from actual_fk)
    and not exists(select 1 from expected_fk e where not exists(
      select 1 from actual_fk c where c.conrelid=to_regclass('public.'||e.child)
        and c.confrelid=to_regclass('public.'||e.parent)
        and c.child_columns=e.child_columns and c.parent_columns=e.parent_columns
        and c.confdeltype::text=e.delete_action and c.confupdtype='a'
        and c.convalidated and not c.condeferrable))
    and (select count(*)=6 from actual_trigger)
    and not exists(select 1 from expected_trigger e where not exists(
      select 1 from actual_trigger t join pg_proc p on p.oid=t.tgfoid
      where t.tgrelid=to_regclass('public.'||e.relation) and t.tgname=e.name
        and t.tgfoid=to_regprocedure('public.'||e.routine) and t.tgtype=31
        and t.tgenabled in ('O','A') and t.tgqual is null and t.tgnargs=0
        and p.prosecdef and p.proowner='postgres'::regrole
        and p.proconfig=array['search_path=pg_catalog']::text[]));
