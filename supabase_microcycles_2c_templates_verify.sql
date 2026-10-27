-- SOLO LECTURA. Antes de instalar: READY_TO_APPLY o BLOCKED.
-- Después de instalar: STRUCTURAL_PASS_IDENTITY_PENDING o BLOCKED.
with objects as (
  select to_regclass('public.planned_microcycle_templates')::oid as template_table,
    to_regclass('public.planned_microcycles')::oid as microcycle_table,
    to_regclass('public.club_teams')::oid as teams_table,
    to_regclass('public.club_memberships')::oid as memberships_table,
    to_regclass('public.club_team_seasons')::oid as relations_table,
    to_regclass('public.club_seasons')::oid as seasons_table,
    to_regprocedure('public.has_club_role(uuid,text[])')::oid as role_helper,
    to_regprocedure('public.can_read_club_team_season(uuid)')::oid as read_cts,
    to_regprocedure('public.can_write_club_team_season(uuid)')::oid as write_cts,
    to_regprocedure('public.can_read_microcycle_template_team_2c(uuid,uuid)')::oid as read_team,
    to_regprocedure('public.can_write_microcycle_template_team_2c(uuid,uuid)')::oid as write_team,
    to_regprocedure('public.create_planned_microcycle_template_2c(uuid,text,text)')::oid as create_template,
    to_regprocedure('public.manage_planned_microcycle_template_2c(uuid,integer,text,text,boolean)')::oid as manage_template
), checks as (
  select 'Dependencias 2B y CTS'::text as check_name,
    (microcycle_table is not null and teams_table is not null and
      memberships_table is not null and relations_table is not null and
      seasons_table is not null and role_helper is not null and
      read_cts is not null and write_cts is not null and
      (read_team is null or obj_description(read_team,'pg_proc')=
        'NEXO CLUB Microciclos 2C: función de plantillas') and
      (write_team is null or obj_description(write_team,'pg_proc')=
        'NEXO CLUB Microciclos 2C: función de plantillas') and
      (create_template is null or obj_description(create_template,'pg_proc')=
        'NEXO CLUB Microciclos 2C: función de plantillas') and
      (manage_template is null or obj_description(manage_template,'pg_proc')=
        'NEXO CLUB Microciclos 2C: función de plantillas')) as passed,
    'Tabla 2B, equipos, relaciones y autorización'::text as detail from objects
  union all
  select 'Identidad de tabla',
    obj_description(template_table,'pg_class') =
      'NEXO CLUB Microciclos 2C: plantillas inmutables por equipo',
    'Comentario de identidad; evita confundir una tabla preexistente' from objects
  union all
  select 'Columnas esperadas',
    (select count(*)=12 from pg_attribute where attrelid=template_table and attnum>0
      and not attisdropped and attname=any(array['id','club_id','team_id',
        'creator_membership_id','name','description','weekly','days','revision',
        'archived_at','created_at','updated_at'])),
    'Doce columnas del contrato de plantillas' from objects
  union all
  select 'FK compuestas validadas',
    (select count(*)=2 from pg_constraint where conrelid=template_table and contype='f'
      and convalidated and confdeltype='r' and conname=any(array[
        'planned_microcycle_templates_team_club_fk',
        'planned_microcycle_templates_creator_club_fk'])),
    'Equipo y creador permanecen en el mismo club; ON DELETE RESTRICT' from objects
  union all
  select 'Índices válidos',
    (select count(*)=2 from pg_index i join pg_class index_row on index_row.oid=i.indexrelid
      where i.indrelid=template_table and i.indisvalid and index_row.relname=any(array[
        'planned_microcycle_templates_team_idx','planned_microcycle_templates_creator_idx'])),
    'Búsqueda por equipo y creador' from objects
  union all
  select 'RLS de lectura única',
    (select c.relrowsecurity and (select count(*) from pg_policy p
      where p.polrelid=template_table)=1 from pg_class c where c.oid=template_table),
    'RLS activa y una política SELECT, sin políticas de escritura' from objects
  union all
  select 'Política de lectura autenticada',
    exists(select 1 from pg_policy p join pg_roles r on r.rolname='authenticated'
      where p.polrelid=template_table and p.polname='planned_microcycle_templates_read'
        and p.polcmd='r' and r.oid=any(p.polroles)),
    'La expresión detallada debe revisarse además en pruebas de identidad' from objects
  union all
  select 'Sin escritura SQL cliente',
    not coalesce(has_table_privilege('authenticated',template_table,'INSERT'),false) and
    not coalesce(has_table_privilege('authenticated',template_table,'UPDATE'),false) and
    not coalesce(has_table_privilege('authenticated',template_table,'DELETE'),false) and
    coalesce(has_table_privilege('authenticated',template_table,'SELECT'),false),
    'authenticated solo puede consultar; mutaciones mediante RPC' from objects
  union all
  select 'Anon sin acceso efectivo',
    not coalesce(has_table_privilege('anon',template_table,'SELECT'),false) and
    not coalesce(has_table_privilege('anon',template_table,'INSERT'),false) and
    not coalesce(has_table_privilege('anon',template_table,'UPDATE'),false) and
    not coalesce(has_table_privilege('anon',template_table,'DELETE'),false) and
    not coalesce(has_function_privilege('anon',read_team,'EXECUTE'),false) and
    not coalesce(has_function_privilege('anon',write_team,'EXECUTE'),false) and
    not coalesce(has_function_privilege('anon',create_template,'EXECUTE'),false) and
    not coalesce(has_function_privilege('anon',manage_template,'EXECUTE'),false),
    'Incluye privilegios efectivos por PUBLIC/herencia' from objects
  union all
  select 'Cuatro funciones seguras',
    (select count(*)=4 from pg_proc p where p.oid=any(array[
      read_team,write_team,create_template,manage_template])
      and p.prosecdef and p.proconfig @> array['search_path=pg_catalog']::text[]
      and pg_get_userbyid(p.proowner)='postgres'),
    'SECURITY DEFINER, propietario postgres y search_path fijo' from objects
  union all
  select 'RPC autenticadas',
    coalesce(has_function_privilege('authenticated',create_template,'EXECUTE'),false) and
    coalesce(has_function_privilege('authenticated',manage_template,'EXECUTE'),false),
    'Crear desde una semana y gestionar metadatos con CAS' from objects
), rows as (
  select check_name,
    case when (select template_table from objects) is null and check_name<>'Dependencias 2B y CTS'
      then 'PENDING' when passed then 'PASS' else 'FAIL' end as status,
    detail from checks
)
select check_name,status,detail from rows
union all
select 'GLOBAL', case
  when (select template_table from objects) is null then
    case when (select passed from checks where check_name='Dependencias 2B y CTS')
      then 'READY_TO_APPLY' else 'BLOCKED' end
  when exists(select 1 from rows where status='FAIL') then 'BLOCKED'
  else 'STRUCTURAL_PASS_IDENTITY_PENDING' end,
  'No sustituye pruebas con owner, staff asignado, staff sin asignación, player y anon'
order by check_name;
