-- BLOQUE 2.6 PLAYER
-- Auditoria remota READ ONLY de Mi analisis PLAYER y Partidos PLAYER.
--
-- Este archivo no crea objetos persistentes. Los auxiliares viven solamente
-- en pg_temp durante la sesion del SQL Editor. La fotografia real se ejecuta
-- dentro de una transaccion READ ONLY y termina en ROLLBACK.

-- Preparacion no persistente: solo objetos de la sesion en pg_temp.
begin;

create or replace function pg_temp.player_audit_safe_json(p_sql text)
returns table (
  query_ok boolean,
  result jsonb,
  error_code text,
  error_message text
)
language plpgsql
security invoker
set search_path = pg_catalog, public, auth, pg_temp
as $audit$
begin
  begin
    execute p_sql into result;
    query_ok := true;
    error_code := null;
    error_message := null;
  exception
    when others then
      query_ok := false;
      result := null;
      error_code := sqlstate;
      error_message := pg_catalog.left(sqlerrm, 240);
  end;
  return next;
end;
$audit$;

create or replace function pg_temp.player_audit_distinct_values(
  p_table_name text,
  p_column_name text
)
returns table (
  distinct_value text,
  row_count bigint
)
language plpgsql
security invoker
set search_path = pg_catalog, public, auth, pg_temp
as $audit$
declare
  relation_oid regclass;
begin
  relation_oid := pg_catalog.to_regclass(p_table_name);
  if relation_oid is null then
    return;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = relation_oid
      and attribute.attname = p_column_name
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) then
    return;
  end if;

  return query execute pg_catalog.format(
    'select pg_catalog.left(coalesce(%1$I::text, ''<NULL>''), 200), count(*)::bigint
       from %2$s
      group by %1$I
      order by count(*) desc, coalesce(%1$I::text, ''<NULL>'')',
    p_column_name,
    relation_oid
  );
end;
$audit$;

create or replace function pg_temp.player_audit_visibility(
  p_table_name text,
  p_database_role text,
  p_auth_uid uuid,
  p_subject_jugador_id uuid,
  p_contrast_jugador_id uuid,
  p_identity_mode text
)
returns table (
  access_mode text,
  visible_rows bigint,
  subject_rows bigint,
  contrast_rows bigint,
  non_subject_rows bigint,
  error_code text,
  error_message text
)
language plpgsql
security invoker
set search_path = pg_catalog, public, auth, pg_temp
as $audit$
declare
  relation_oid regclass;
  previous_sub text := pg_catalog.current_setting('request.jwt.claim.sub', true);
  previous_role_claim text := pg_catalog.current_setting('request.jwt.claim.role', true);
  previous_claims text := pg_catalog.current_setting('request.jwt.claims', true);
  identity_sql text;
begin
  relation_oid := pg_catalog.to_regclass(p_table_name);
  if relation_oid is null then
    access_mode := 'MISSING';
    error_code := '42P01';
    error_message := 'relation_not_found';
    return next;
    return;
  end if;

  begin
    execute pg_catalog.format('set local role %I', p_database_role);
    perform pg_catalog.set_config(
      'request.jwt.claim.sub',
      coalesce(p_auth_uid::text, ''),
      true
    );
    perform pg_catalog.set_config(
      'request.jwt.claim.role',
      case when p_database_role = 'anon' then 'anon' else 'authenticated' end,
      true
    );
    perform pg_catalog.set_config(
      'request.jwt.claims',
      pg_catalog.jsonb_build_object(
        'sub', p_auth_uid,
        'role', case when p_database_role = 'anon' then 'anon' else 'authenticated' end
      )::text,
      true
    );

    execute pg_catalog.format('select count(*)::bigint from %s', relation_oid)
      into visible_rows;
    access_mode := 'SELECT_OK';

    identity_sql := case pg_catalog.upper(coalesce(p_identity_mode, ''))
      when 'ROW_ID' then
        'select count(*) filter (where row_data.id = $1)::bigint,
                count(*) filter (where row_data.id = $2)::bigint
           from %s row_data'
      when 'JUGADOR_ID' then
        'select count(*) filter (where row_data.jugador_id = $1)::bigint,
                count(*) filter (where row_data.jugador_id = $2)::bigint
           from %s row_data'
      when 'GOAL_PARTICIPANT' then
        'select count(*) filter (
                  where row_data.scorer_id = $1 or row_data.assistant_id = $1
                )::bigint,
                count(*) filter (
                  where row_data.scorer_id = $2 or row_data.assistant_id = $2
                )::bigint
           from %s row_data'
      else null
    end;

    if identity_sql is not null then
      begin
        execute pg_catalog.format(identity_sql, relation_oid)
          into subject_rows, contrast_rows
          using p_subject_jugador_id, p_contrast_jugador_id;
        non_subject_rows := greatest(visible_rows - subject_rows, 0::bigint);
      exception
        when undefined_column then
          subject_rows := null;
          contrast_rows := null;
          non_subject_rows := null;
      end;
    end if;
  exception
    when insufficient_privilege then
      access_mode := 'DENIED';
      visible_rows := null;
      subject_rows := null;
      contrast_rows := null;
      non_subject_rows := null;
      error_code := sqlstate;
      error_message := pg_catalog.left(sqlerrm, 240);
    when others then
      access_mode := 'ERROR';
      visible_rows := null;
      subject_rows := null;
      contrast_rows := null;
      non_subject_rows := null;
      error_code := sqlstate;
      error_message := pg_catalog.left(sqlerrm, 240);
  end;

  begin
    execute 'reset role';
  exception
    when others then null;
  end;
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(previous_sub, ''), true);
  perform pg_catalog.set_config('request.jwt.claim.role', coalesce(previous_role_claim, ''), true);
  perform pg_catalog.set_config('request.jwt.claims', coalesce(previous_claims, ''), true);

  return next;
end;
$audit$;

create or replace function pg_temp.player_audit_identity(
  p_database_role text,
  p_auth_uid uuid
)
returns table (
  access_mode text,
  identity_result jsonb,
  error_code text,
  error_message text
)
language plpgsql
security invoker
set search_path = pg_catalog, public, auth, pg_temp
as $audit$
declare
  previous_sub text := pg_catalog.current_setting('request.jwt.claim.sub', true);
  previous_role_claim text := pg_catalog.current_setting('request.jwt.claim.role', true);
  previous_claims text := pg_catalog.current_setting('request.jwt.claims', true);
begin
  begin
    execute pg_catalog.format('set local role %I', p_database_role);
    perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(p_auth_uid::text, ''), true);
    perform pg_catalog.set_config(
      'request.jwt.claim.role',
      case when p_database_role = 'anon' then 'anon' else 'authenticated' end,
      true
    );
    perform pg_catalog.set_config(
      'request.jwt.claims',
      pg_catalog.jsonb_build_object(
        'sub', p_auth_uid,
        'role', case when p_database_role = 'anon' then 'anon' else 'authenticated' end
      )::text,
      true
    );

    execute $query$
      select pg_catalog.jsonb_build_object(
        'membership_rows', (select count(*) from public.current_membership()),
        'membership_role', (select membership.role from public.current_membership() membership),
        'membership_jugador_id', (select membership.jugador_id from public.current_membership() membership),
        'current_jugador_id', public.current_jugador_id(),
        'is_player', public.is_player(),
        'is_app_staff', public.is_app_staff(),
        'profile_rows', (select count(*) from public.get_my_player_profile()),
        'profile_jugador_id', (select profile.jugador_id from public.get_my_player_profile() profile)
      )
    $query$ into identity_result;
    access_mode := 'EXECUTE_OK';
  exception
    when insufficient_privilege then
      access_mode := 'DENIED';
      identity_result := null;
      error_code := sqlstate;
      error_message := pg_catalog.left(sqlerrm, 240);
    when others then
      access_mode := 'ERROR';
      identity_result := null;
      error_code := sqlstate;
      error_message := pg_catalog.left(sqlerrm, 240);
  end;

  begin
    execute 'reset role';
  exception
    when others then null;
  end;
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(previous_sub, ''), true);
  perform pg_catalog.set_config('request.jwt.claim.role', coalesce(previous_role_claim, ''), true);
  perform pg_catalog.set_config('request.jwt.claims', coalesce(previous_claims, ''), true);

  return next;
end;
$audit$;

create or replace function pg_temp.player_audit_video_domains()
returns table (
  domain_name text,
  provider text,
  protocol text,
  url_count bigint,
  query_string_count bigint,
  potentially_signed_count bigint
)
language plpgsql
security invoker
set search_path = pg_catalog, public, auth, pg_temp
as $audit$
declare
  relation_oid regclass;
begin
  relation_oid := pg_catalog.to_regclass('public.partido_eventos_gol');
  if relation_oid is null then
    return;
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = relation_oid
      and attribute.attname = 'video_url'
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) then
    return;
  end if;

  return query execute $query$
    with source_urls as (
      select pg_catalog.btrim(video_url) as url
      from public.partido_eventos_gol
      where nullif(pg_catalog.btrim(video_url), '') is not null
    ), parsed as (
      select
        url,
        case
          when url ~* '^https?://' then
            pg_catalog.lower(
              pg_catalog.regexp_replace(
                pg_catalog.split_part(
                  pg_catalog.split_part(
                    pg_catalog.split_part(url, '/', 3),
                    '?', 1
                  ),
                  '#', 1
                ),
                E'^www\\.', ''
              )
            )
          else '<NO_HOST>'
        end as host,
        case
          when url ~* '^https://' then 'HTTPS'
          when url ~* '^http://' then 'HTTP'
          else 'OTHER'
        end as scheme
      from source_urls
    )
    select
      host,
      case
        when host in ('youtube.com', 'youtu.be', 'youtube-nocookie.com') then 'YouTube'
        when host in ('vimeo.com', 'player.vimeo.com') then 'Vimeo'
        when host = 'play.asturfutbol.es' then 'AsturFutbol'
        when host ~ E'(?:^|\\.)supabase\\.co$' then 'Supabase'
        when url ~* E'\\.(mp4|webm|m3u8)(?:[?#]|$)' then 'DIRECT_KNOWN'
        else 'OTHER'
      end,
      scheme,
      count(*)::bigint,
      count(*) filter (where pg_catalog.strpos(url, '?') > 0)::bigint,
      count(*) filter (
        where url ~* '[?&](token|signature|sig|expires|x-amz-[^=]*|apikey)='
      )::bigint
    from parsed
    group by host, scheme,
      case
        when host in ('youtube.com', 'youtu.be', 'youtube-nocookie.com') then 'YouTube'
        when host in ('vimeo.com', 'player.vimeo.com') then 'Vimeo'
        when host = 'play.asturfutbol.es' then 'AsturFutbol'
        when host ~ E'(?:^|\\.)supabase\\.co$' then 'Supabase'
        when url ~* E'\\.(mp4|webm|m3u8)(?:[?#]|$)' then 'DIRECT_KNOWN'
        else 'OTHER'
      end
    order by count(*) desc, host
  $query$;
end;
$audit$;

commit;

-- Toda la fotografia catalogo/datos comienza en una transaccion READ ONLY.
begin;
set transaction read only;

-- FINAL_RESULT_BEGIN: la unica consulta de resultados del archivo comienza aqui.
with recursive
constants as (
  select
    '350615a9-b068-450a-b867-da30a59b9082'::uuid as borja_auth_uid,
    '2e0146e9-e9fc-45ad-b055-edc138a85f7e'::uuid as borja_jugador_id,
    'f7f5aaeb-e82b-4e6b-8920-694bc32cb6c7'::uuid as jairo_jugador_id,
    '4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3'::uuid as staff_owner_auth_uid,
    '00000000-0000-4000-8000-000000000260'::uuid as no_membership_auth_uid
),
audited_tables(table_order, table_name, area, identity_mode, sensitivity) as (
  values
    (1,  'public.club_memberships',                  'IDENTITY',         'JUGADOR_ID',      'IDENTITY'),
    (2,  'public.jugadores',                         'IDENTITY',         'ROW_ID',           'INDIVIDUAL'),
    (3,  'public.partido_estadisticas_jugador',      'PLAYER_ANALYSIS',  'JUGADOR_ID',      'INDIVIDUAL'),
    (4,  'public.partido_eventos_gol',               'SHARED',           'GOAL_PARTICIPANT','SPORT_GLOBAL'),
    (5,  'public.match_quick_events',                'PLAYER_ANALYSIS',  'JUGADOR_ID',      'STAFF_INTERNAL'),
    (6,  'public.partidos',                          'PLAYER_MATCHES',   null,               'SPORT_GLOBAL'),
    (7,  'public.partido_alineacion_slots',          'SHARED',           'JUGADOR_ID',      'TACTICAL'),
    (8,  'public.partido_eventos_sistema',           'SHARED',           null,               'TACTICAL'),
    (9,  'public.partido_snapshots_tacticos',        'SHARED',           null,               'TACTICAL'),
    (10, 'public.partido_snapshot_tactico_slots',    'SHARED',           'JUGADOR_ID',      'TACTICAL'),
    (11, 'public.partido_eventos_post',              'PLAYER_MATCHES',   'JUGADOR_ID',      'STAFF_INTERNAL'),
    (12, 'public.competitions',                      'PLAYER_MATCHES',   null,               'CATALOG'),
    (13, 'public.partido_convocados',                'PLAYER_MATCHES',   'JUGADOR_ID',      'TACTICAL'),
    (14, 'public.partido_notas_individuales_pre',    'PLAYER_MATCHES',   'JUGADOR_ID',      'STAFF_INTERNAL')
),
relations as (
  select
    audited.*,
    class.oid as relation_oid,
    class.relrowsecurity,
    class.relforcerowsecurity,
    class.relowner,
    class.relacl,
    owner_role.rolname as owner_name
  from audited_tables audited
  left join pg_catalog.pg_class class
    on class.oid = pg_catalog.to_regclass(audited.table_name)
  left join pg_catalog.pg_roles owner_role
    on owner_role.oid = class.relowner
),
table_catalog_checks as (
  select
    100 + relation.table_order as sort_group,
    relation.table_name as sort_key,
    'TABLE_CATALOG'::text as category,
    'REMOTE'::text as scenario,
    relation.table_name as object_name,
    'existence_owner_rls'::text as check_name,
    'exists=true; inspect RLS/FORCE/owner'::text as expected,
    pg_catalog.jsonb_build_object(
      'exists', relation.relation_oid is not null,
      'owner', relation.owner_name,
      'rls_on', relation.relrowsecurity,
      'force_rls', relation.relforcerowsecurity,
      'area', relation.area,
      'sensitivity', relation.sensitivity
    )::text as observed,
    case
      when relation.relation_oid is null then 'CRITICAL'
      when not relation.relrowsecurity then 'CRITICAL'
      else 'INFO'
    end::text as risk_level,
    (relation.relation_oid is not null and relation.relrowsecurity)::boolean as test_ok,
    case
      when relation.relation_oid is null then 'Tabla necesaria ausente.'
      when not relation.relrowsecurity then 'RLS esta desactivada en una tabla del perimetro.'
      else 'Catalogo leido correctamente.'
    end::text as details
  from relations relation
),
grant_roles(role_order, role_name) as (
  values (1, 'PUBLIC'), (2, 'anon'), (3, 'authenticated'), (4, 'service_role')
),
table_grant_checks as (
  select
    200 + relation.table_order as sort_group,
    relation.table_name || ':' || grant_role.role_name as sort_key,
    'TABLE_GRANTS'::text as category,
    grant_role.role_name::text as scenario,
    relation.table_name as object_name,
    'effective_and_explicit_table_privileges'::text as check_name,
    case
      when grant_role.role_name in ('PUBLIC', 'anon') then 'no direct privileges'
      else 'inventory only; RLS decides row visibility'
    end::text as expected,
    pg_catalog.jsonb_build_object(
      'role_exists', grant_role.role_name = 'PUBLIC' or database_role.oid is not null,
      'acl_is_null', relation.relacl is null,
      'explicit_privileges', coalesce(explicit_acl.privileges::text[], array[]::text[]),
      'effective_select', case
        when relation.relation_oid is null then null
        when grant_role.role_name = 'PUBLIC' then coalesce('SELECT' = any(explicit_acl.privileges::text[]), false)
        when database_role.oid is null then null
        else pg_catalog.has_table_privilege(database_role.oid, relation.relation_oid, 'SELECT')
      end,
      'effective_insert', case
        when relation.relation_oid is null then null
        when grant_role.role_name = 'PUBLIC' then coalesce('INSERT' = any(explicit_acl.privileges::text[]), false)
        when database_role.oid is null then null
        else pg_catalog.has_table_privilege(database_role.oid, relation.relation_oid, 'INSERT')
      end,
      'effective_update', case
        when relation.relation_oid is null then null
        when grant_role.role_name = 'PUBLIC' then coalesce('UPDATE' = any(explicit_acl.privileges::text[]), false)
        when database_role.oid is null then null
        else pg_catalog.has_table_privilege(database_role.oid, relation.relation_oid, 'UPDATE')
      end,
      'effective_delete', case
        when relation.relation_oid is null then null
        when grant_role.role_name = 'PUBLIC' then coalesce('DELETE' = any(explicit_acl.privileges::text[]), false)
        when database_role.oid is null then null
        else pg_catalog.has_table_privilege(database_role.oid, relation.relation_oid, 'DELETE')
      end
    )::text as observed,
    case
      when relation.relation_oid is null or (grant_role.role_name <> 'PUBLIC' and database_role.oid is null) then 'HIGH'
      when grant_role.role_name = 'PUBLIC' and coalesce('SELECT' = any(explicit_acl.privileges::text[]), false) then 'CRITICAL'
      when grant_role.role_name = 'anon'
       and database_role.oid is not null
       and pg_catalog.has_table_privilege(database_role.oid, relation.relation_oid, 'SELECT') then 'CRITICAL'
      when grant_role.role_name = 'authenticated' and coalesce('SELECT' = any(explicit_acl.privileges::text[]), false) then 'MEDIUM'
      else 'INFO'
    end::text as risk_level,
    case
      when relation.relation_oid is null then false
      when grant_role.role_name <> 'PUBLIC' and database_role.oid is null then false
      when grant_role.role_name = 'PUBLIC' and coalesce('SELECT' = any(explicit_acl.privileges::text[]), false) then false
      when grant_role.role_name = 'anon'
       and database_role.oid is not null
       and pg_catalog.has_table_privilege(database_role.oid, relation.relation_oid, 'SELECT') then false
      else true
    end::boolean as test_ok,
    'Los grants no sustituyen la comprobacion funcional de RLS.'::text as details
  from relations relation
  cross join grant_roles grant_role
  left join pg_catalog.pg_roles database_role
    on database_role.rolname = grant_role.role_name
  left join lateral (
    select pg_catalog.array_agg(distinct acl.privilege_type::text order by acl.privilege_type::text)::text[] as privileges
    from pg_catalog.aclexplode(
      coalesce(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
    ) acl
    where (
      grant_role.role_name = 'PUBLIC' and acl.grantee = 0
    ) or (
      grant_role.role_name <> 'PUBLIC' and acl.grantee = database_role.oid
    )
  ) explicit_acl on relation.relation_oid is not null
),
policy_rows as (
  select
    relation.table_order,
    relation.table_name,
    relation.relation_oid,
    policy.polname,
    policy.polcmd,
    policy.polpermissive,
    policy.polroles,
    pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) as using_expression,
    pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid) as check_expression,
    pg_catalog.array_to_string(array(
      select case when role_value.role_oid = 0 then 'PUBLIC' else policy_role.rolname end
      from pg_catalog.unnest(policy.polroles) as role_value(role_oid)
      left join pg_catalog.pg_roles policy_role on policy_role.oid = role_value.role_oid
      order by case when role_value.role_oid = 0 then 'PUBLIC' else policy_role.rolname end
    ), ',') as policy_roles
  from relations relation
  join pg_catalog.pg_policy policy on policy.polrelid = relation.relation_oid
),
policy_checks as (
  select
    300 + policy.table_order as sort_group,
    policy.table_name || ':' || policy.polname as sort_key,
    'RLS_POLICY'::text as category,
    'REMOTE'::text as scenario,
    policy.table_name as object_name,
    policy.polname::text as check_name,
    'no broad PUBLIC/anon/authenticated policy for sensitive data'::text as expected,
    pg_catalog.jsonb_build_object(
      'command', case policy.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL' end,
      'permissive', policy.polpermissive,
      'roles', policy.policy_roles,
      'using', policy.using_expression,
      'with_check', policy.check_expression,
      'using_true', pg_catalog.regexp_replace(pg_catalog.lower(coalesce(policy.using_expression, '')), '[[:space:]():]', '', 'g') in ('true', 'trueboolean'),
      'with_check_true', pg_catalog.regexp_replace(pg_catalog.lower(coalesce(policy.check_expression, '')), '[[:space:]():]', '', 'g') in ('true', 'trueboolean'),
      'staff_named_but_broad', policy.polname ~* 'staff' and (
        pg_catalog.regexp_replace(pg_catalog.lower(coalesce(policy.using_expression, '')), '[[:space:]():]', '', 'g') in ('true', 'trueboolean')
        or pg_catalog.regexp_replace(pg_catalog.lower(coalesce(policy.check_expression, '')), '[[:space:]():]', '', 'g') in ('true', 'trueboolean')
      )
    )::text as observed,
    case
      when policy.policy_roles ~ '(^|,)(PUBLIC|anon|authenticated)(,|$)'
       and (
         pg_catalog.regexp_replace(pg_catalog.lower(coalesce(policy.using_expression, '')), '[[:space:]():]', '', 'g') in ('true', 'trueboolean')
         or pg_catalog.regexp_replace(pg_catalog.lower(coalesce(policy.check_expression, '')), '[[:space:]():]', '', 'g') in ('true', 'trueboolean')
       ) then 'CRITICAL'
      else 'INFO'
    end::text as risk_level,
    not (
      policy.policy_roles ~ '(^|,)(PUBLIC|anon|authenticated)(,|$)'
      and (
        pg_catalog.regexp_replace(pg_catalog.lower(coalesce(policy.using_expression, '')), '[[:space:]():]', '', 'g') in ('true', 'trueboolean')
        or pg_catalog.regexp_replace(pg_catalog.lower(coalesce(policy.check_expression, '')), '[[:space:]():]', '', 'g') in ('true', 'trueboolean')
      )
    )::boolean as test_ok,
    case
      when policy.polname ~* 'staff' and (
        pg_catalog.regexp_replace(pg_catalog.lower(coalesce(policy.using_expression, '')), '[[:space:]():]', '', 'g') in ('true', 'trueboolean')
        or pg_catalog.regexp_replace(pg_catalog.lower(coalesce(policy.check_expression, '')), '[[:space:]():]', '', 'g') in ('true', 'trueboolean')
      ) then 'El nombre sugiere STAFF, pero la expresion es broad.'
      else 'Definicion catalogada sin ejecutar escrituras.'
    end::text as details
  from policy_rows policy
),
missing_policy_checks as (
  select
    350 + relation.table_order as sort_group,
    relation.table_name as sort_key,
    'RLS_POLICY'::text as category,
    'REMOTE'::text as scenario,
    relation.table_name as object_name,
    'policy_count'::text as check_name,
    'at least one intentional policy or access denied by default'::text as expected,
    pg_catalog.jsonb_build_object(
      'policy_count', count(policy.polname),
      'rls_on', relation.relrowsecurity
    )::text as observed,
    case when relation.relation_oid is null then 'CRITICAL' else 'INFO' end::text as risk_level,
    (relation.relation_oid is not null)::boolean as test_ok,
    'Cero policies con RLS ON significa denegacion por defecto para no-owner.'::text as details
  from relations relation
  left join pg_catalog.pg_policy policy on policy.polrelid = relation.relation_oid
  group by relation.table_order, relation.table_name, relation.relation_oid, relation.relrowsecurity
),
scenarios(scenario_order, scenario, database_role, auth_uid) as (
  select 1, 'BORJA_PLAYER', 'authenticated', constants.borja_auth_uid from constants
  union all
  select 2, 'UID_WITHOUT_MEMBERSHIP', 'authenticated', constants.no_membership_auth_uid from constants
  union all
  select 3, 'ANON', 'anon', null::uuid from constants
  union all
  select 4, 'STAFF_OWNER', 'authenticated', constants.staff_owner_auth_uid from constants
),
visibility_raw as (
  select
    relation.*,
    scenario.scenario_order,
    scenario.scenario,
    scenario.database_role,
    scenario.auth_uid,
    baseline.access_mode as baseline_access,
    baseline.visible_rows as baseline_rows,
    baseline.subject_rows as baseline_borja_rows,
    baseline.contrast_rows as baseline_jairo_rows,
    baseline.non_subject_rows as baseline_non_borja_rows,
    observed.access_mode,
    observed.visible_rows,
    observed.subject_rows,
    observed.contrast_rows,
    observed.non_subject_rows,
    observed.error_code,
    observed.error_message
  from relations relation
  cross join scenarios scenario
  cross join constants
  left join lateral pg_temp.player_audit_visibility(
    relation.table_name,
    'postgres',
    null,
    constants.borja_jugador_id,
    constants.jairo_jugador_id,
    relation.identity_mode
  ) baseline on true
  left join lateral pg_temp.player_audit_visibility(
    relation.table_name,
    scenario.database_role,
    scenario.auth_uid,
    constants.borja_jugador_id,
    constants.jairo_jugador_id,
    relation.identity_mode
  ) observed on true
),
visibility_checks as (
  select
    400 + visibility.table_order as sort_group,
    pg_catalog.lpad(visibility.scenario_order::text, 2, '0') || ':' || visibility.table_name as sort_key,
    'FUNCTIONAL_SELECT'::text as category,
    visibility.scenario::text as scenario,
    visibility.table_name as object_name,
    'row_visibility'::text as check_name,
    case
      when visibility.scenario = 'STAFF_OWNER' then 'SELECT_OK and visible_rows=baseline_rows'
      when visibility.scenario = 'BORJA_PLAYER' and visibility.table_name = 'public.club_memberships' then 'exactly own membership; no contrast/other rows'
      else 'DENIED or 0 rows'
    end::text as expected,
    pg_catalog.jsonb_build_object(
      'baseline_access', visibility.baseline_access,
      'baseline_rows', visibility.baseline_rows,
      'baseline_borja_rows', visibility.baseline_borja_rows,
      'baseline_jairo_rows', visibility.baseline_jairo_rows,
      'baseline_non_borja_rows', visibility.baseline_non_borja_rows,
      'access', visibility.access_mode,
      'visible_rows', visibility.visible_rows,
      'borja_rows', visibility.subject_rows,
      'jairo_rows', visibility.contrast_rows,
      'non_borja_rows', visibility.non_subject_rows,
      'error_code', visibility.error_code
    )::text as observed,
    case
      when visibility.relation_oid is null or visibility.access_mode = 'ERROR' then 'CRITICAL'
      when visibility.scenario = 'STAFF_OWNER'
       and (visibility.access_mode <> 'SELECT_OK' or visibility.visible_rows is distinct from visibility.baseline_rows) then 'HIGH'
      when visibility.scenario = 'BORJA_PLAYER'
       and visibility.table_name = 'public.club_memberships'
       and not (
         visibility.access_mode = 'SELECT_OK'
         and visibility.visible_rows = 1::bigint
         and visibility.subject_rows = 1::bigint
         and coalesce(visibility.contrast_rows, 0::bigint) = 0::bigint
         and coalesce(visibility.non_subject_rows, 0::bigint) = 0::bigint
       ) then 'CRITICAL'
      when visibility.scenario <> 'STAFF_OWNER'
       and visibility.scenario <> 'BORJA_PLAYER'
       and coalesce(visibility.visible_rows, 0::bigint) > 0::bigint then 'CRITICAL'
      when visibility.scenario = 'BORJA_PLAYER'
       and visibility.table_name <> 'public.club_memberships'
       and coalesce(visibility.visible_rows, 0::bigint) > 0::bigint
       and visibility.sensitivity in ('TACTICAL', 'STAFF_INTERNAL', 'INDIVIDUAL') then 'CRITICAL'
      when visibility.scenario = 'BORJA_PLAYER'
       and visibility.table_name <> 'public.club_memberships'
       and coalesce(visibility.visible_rows, 0::bigint) > 0::bigint then 'HIGH'
      else 'INFO'
    end::text as risk_level,
    case
      when visibility.relation_oid is null or visibility.access_mode = 'ERROR' then false
      when visibility.scenario = 'STAFF_OWNER' then
        visibility.access_mode = 'SELECT_OK'
        and visibility.visible_rows is not distinct from visibility.baseline_rows
      when visibility.scenario = 'BORJA_PLAYER' and visibility.table_name = 'public.club_memberships' then
        visibility.access_mode = 'SELECT_OK'
        and visibility.visible_rows = 1::bigint
        and visibility.subject_rows = 1::bigint
        and coalesce(visibility.contrast_rows, 0::bigint) = 0::bigint
        and coalesce(visibility.non_subject_rows, 0::bigint) = 0::bigint
      else visibility.access_mode = 'DENIED' or coalesce(visibility.visible_rows, 0::bigint) = 0::bigint
    end::boolean as test_ok,
    coalesce(visibility.error_message, 'Solo contadores; no se exponen filas ni nombres.')::text as details
  from visibility_raw visibility
),
identity_scenarios(scenario_order, scenario, database_role, auth_uid) as (
  select * from scenarios
),
identity_checks as (
  select
    500 as sort_group,
    pg_catalog.lpad(identity_scenario.scenario_order::text, 2, '0') as sort_key,
    'IDENTITY_HELPERS'::text as category,
    identity_scenario.scenario::text as scenario,
    'current_membership/current_jugador_id/is_player/is_app_staff/get_my_player_profile'::text as object_name,
    'read_only_identity_contract'::text as check_name,
    case
      when identity_scenario.scenario = 'BORJA_PLAYER' then 'membership=1, own jugador, player=true, staff=false, profile=1'
      when identity_scenario.scenario = 'STAFF_OWNER' then 'staff=true, player=false, profile=0'
      when identity_scenario.scenario = 'UID_WITHOUT_MEMBERSHIP' then 'membership=0, player=false, staff=false, profile=0'
      else 'logical or ACL denial'
    end::text as expected,
    coalesce(identity_result.identity_result, pg_catalog.jsonb_build_object(
      'access', identity_result.access_mode,
      'error_code', identity_result.error_code
    ))::text as observed,
    case
      when identity_result.access_mode = 'ERROR' then 'CRITICAL'
      when identity_scenario.scenario = 'ANON' and identity_result.access_mode <> 'DENIED' then 'CRITICAL'
      else 'INFO'
    end::text as risk_level,
    coalesce((case
      when identity_scenario.scenario = 'BORJA_PLAYER' then
        identity_result.access_mode = 'EXECUTE_OK'
        and (identity_result.identity_result ->> 'membership_rows')::bigint = 1::bigint
        and identity_result.identity_result ->> 'membership_role' = 'player'
        and identity_result.identity_result ->> 'membership_jugador_id' = constants.borja_jugador_id::text
        and identity_result.identity_result ->> 'current_jugador_id' = constants.borja_jugador_id::text
        and (identity_result.identity_result ->> 'is_player')::boolean
        and not (identity_result.identity_result ->> 'is_app_staff')::boolean
        and (identity_result.identity_result ->> 'profile_rows')::bigint = 1::bigint
        and identity_result.identity_result ->> 'profile_jugador_id' = constants.borja_jugador_id::text
      when identity_scenario.scenario = 'STAFF_OWNER' then
        identity_result.access_mode = 'EXECUTE_OK'
        and (identity_result.identity_result ->> 'is_app_staff')::boolean
        and not (identity_result.identity_result ->> 'is_player')::boolean
        and (identity_result.identity_result ->> 'profile_rows')::bigint = 0::bigint
      when identity_scenario.scenario = 'UID_WITHOUT_MEMBERSHIP' then
        identity_result.access_mode = 'EXECUTE_OK'
        and (identity_result.identity_result ->> 'membership_rows')::bigint = 0::bigint
        and not (identity_result.identity_result ->> 'is_app_staff')::boolean
        and not (identity_result.identity_result ->> 'is_player')::boolean
        and (identity_result.identity_result ->> 'profile_rows')::bigint = 0::bigint
      else identity_result.access_mode = 'DENIED'
    end), false)::boolean as test_ok,
    coalesce(identity_result.error_message, 'Funciones ejecutadas solo en lectura.')::text as details
  from identity_scenarios identity_scenario
  cross join constants
  left join lateral pg_temp.player_audit_identity(
    identity_scenario.database_role,
    identity_scenario.auth_uid
  ) identity_result on true
),
schema_columns as (
  select
    600 + relation.table_order as sort_group,
    relation.table_name || ':' || pg_catalog.lpad(column_row.ordinal_position::text, 4, '0') as sort_key,
    'SCHEMA_COLUMN'::text as category,
    'REMOTE'::text as scenario,
    relation.table_name as object_name,
    column_row.column_name::text as check_name,
    'catalog actual'::text as expected,
    pg_catalog.jsonb_build_object(
      'ordinal_position', column_row.ordinal_position,
      'data_type', column_row.data_type,
      'udt_name', column_row.udt_name,
      'nullable', column_row.is_nullable,
      'default_present', column_row.column_default is not null
    )::text as observed,
    'INFO'::text as risk_level,
    true::boolean as test_ok,
    'No se devuelve ningun valor de datos.'::text as details
  from relations relation
  join information_schema.columns column_row
    on column_row.table_schema = pg_catalog.split_part(relation.table_name, '.', 1)
   and column_row.table_name = pg_catalog.split_part(relation.table_name, '.', 2)
),
foreign_key_checks as (
  select
    700 + relation.table_order as sort_group,
    relation.table_name || ':' || constraint_row.conname as sort_key,
    'FOREIGN_KEY'::text as category,
    'REMOTE'::text as scenario,
    relation.table_name as object_name,
    constraint_row.conname::text as check_name,
    'catalog actual'::text as expected,
    pg_catalog.pg_get_constraintdef(constraint_row.oid, true)::text as observed,
    'INFO'::text as risk_level,
    true::boolean as test_ok,
    'Relacion real leida de pg_constraint.'::text as details
  from relations relation
  join pg_catalog.pg_constraint constraint_row
    on constraint_row.conrelid = relation.relation_oid
   and constraint_row.contype = 'f'
),
publication_check as (
  select
    800 as sort_group,
    'publication_fields'::text as sort_key,
    'MATCH_PUBLICATION'::text as category,
    'REMOTE'::text as scenario,
    'public.partidos'::text as object_name,
    'publication_or_draft_field'::text as check_name,
    'explicit publication/visibility/draft field or NO_PUBLICATION_FIELD_FOUND'::text as expected,
    case
      when count(*) filter (
        where column_row.column_name::text ~* '(publish|public|visible|visibility|draft|borrador|internal)'
      ) = 0 then 'NO_PUBLICATION_FIELD_FOUND'
      else pg_catalog.array_to_string(
        (
          pg_catalog.array_agg(column_row.column_name::text order by column_row.ordinal_position)
            filter (
              where column_row.column_name::text ~* '(publish|public|visible|visibility|draft|borrador|internal)'
            )
        )::text[],
        ','
      )
    end::text as observed,
    case
      when count(*) filter (
        where column_row.column_name::text ~* '(publish|public|visible|visibility|draft|borrador|internal)'
      ) = 0 then 'HIGH'
      else 'MEDIUM'
    end::text as risk_level,
    true::boolean as test_ok,
    pg_catalog.jsonb_build_object(
      'state_like_columns', coalesce(
        (
          pg_catalog.array_agg(column_row.column_name::text order by column_row.ordinal_position)
            filter (
              where column_row.column_name::text ~* '(status|estado|final)'
            )
        )::text[],
        array[]::text[]
      ),
      'warning', 'Un campo status/final no se considera por si solo una autorizacion de publicacion.'
    )::text as details
  from information_schema.columns column_row
  where column_row.table_schema = 'public'
    and column_row.table_name = 'partidos'
),
match_state_columns as (
  select column_row.column_name::text as column_name
  from information_schema.columns column_row
  where column_row.table_schema = 'public'
    and column_row.table_name = 'partidos'
    and column_row.column_name::text ~* '(status|estado|publication|publish|visible|visibility|draft|borrador|final)'
),
match_state_checks as (
  select
    810 as sort_group,
    state_column.column_name || ':' || distinct_row.distinct_value as sort_key,
    'MATCH_STATE_VALUES'::text as category,
    'REMOTE'::text as scenario,
    'public.partidos'::text as object_name,
    state_column.column_name::text as check_name,
    'real DISTINCT value and count'::text as expected,
    pg_catalog.jsonb_build_object(
      'value', distinct_row.distinct_value,
      'row_count', distinct_row.row_count
    )::text as observed,
    'INFO'::text as risk_level,
    true::boolean as test_ok,
    'Valor agregado; no se aplica normalizacion local.'::text as details
  from match_state_columns state_column
  cross join lateral pg_temp.player_audit_distinct_values(
    'public.partidos', state_column.column_name
  ) distinct_row
),
match_summary_query as (
  select *
  from pg_temp.player_audit_safe_json($query$
    select pg_catalog.jsonb_build_object(
      'total_matches', count(*),
      'min_date', min(date),
      'max_date', max(date),
      'with_complete_score', count(*) filter (where home_score is not null and away_score is not null),
      'without_complete_score', count(*) filter (where home_score is null or away_score is null),
      'competition_keys', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object('value', grouped.competition_key, 'matches', grouped.row_count)
            order by grouped.row_count desc, grouped.competition_key
          )
          from (
            select coalesce(competition_key, '<NULL>') as competition_key, count(*) as row_count
            from public.partidos
            group by competition_key
          ) grouped
        ),
        '[]'::jsonb
      )
    )
    from public.partidos
  $query$)
),
match_summary_check as (
  select
    820 as sort_group,
    'summary'::text as sort_key,
    'MATCH_AGGREGATES'::text as category,
    'POSTGRES_BASELINE'::text as scenario,
    'public.partidos'::text as object_name,
    'volume_dates_scores_competitions'::text as check_name,
    'aggregate real values'::text as expected,
    coalesce(match_summary.result, pg_catalog.jsonb_build_object(
      'error_code', match_summary.error_code
    ))::text as observed,
    case when match_summary.query_ok then 'INFO' else 'HIGH' end::text as risk_level,
    match_summary.query_ok::boolean as test_ok,
    coalesce(match_summary.error_message, 'No se devuelven filas de partidos.')::text as details
  from match_summary_query match_summary
),
competition_summary_query as (
  select *
  from pg_temp.player_audit_safe_json($query$
    select pg_catalog.jsonb_build_object(
      'competition_count', (select count(*) from public.competitions),
      'active_count', (select count(*) from public.competitions where is_active),
      'catalog', coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'key', competition.key,
            'name', competition.name,
            'short_name', competition.short_name,
            'competition_type', competition.competition_type,
            'season', competition.season,
            'is_active', competition.is_active,
            'linked_matches', (
              select count(*)
              from public.partidos match_row
              where match_row.competition_id = competition.id
                 or (
                   match_row.competition_id is null
                   and match_row.competition_key = competition.key
                 )
            )
          )
          order by competition.name, competition.key
        )
        from public.competitions competition
      ), '[]'::jsonb)
    )
  $query$)
),
competition_summary_check as (
  select
    830 as sort_group,
    'catalog'::text as sort_key,
    'COMPETITIONS'::text as category,
    'POSTGRES_BASELINE'::text as scenario,
    'public.competitions -> public.partidos'::text as object_name,
    'catalog_and_match_counts'::text as check_name,
    'real catalog values and linked match counts'::text as expected,
    coalesce(competition_summary.result, pg_catalog.jsonb_build_object(
      'error_code', competition_summary.error_code
    ))::text as observed,
    case when competition_summary.query_ok then 'INFO' else 'HIGH' end::text as risk_level,
    competition_summary.query_ok::boolean as test_ok,
    coalesce(competition_summary.error_message, 'Nombres de competiciones no son datos personales.')::text as details
  from competition_summary_query competition_summary
),
event_type_columns(table_name, column_name) as (
  values
    ('public.partido_eventos_gol', 'type'),
    ('public.partido_eventos_gol', 'half'),
    ('public.match_quick_events', 'tipo_evento'),
    ('public.partido_eventos_sistema', 'period'),
    ('public.partido_eventos_post', 'type')
),
event_type_checks as (
  select
    900 as sort_group,
    event_column.table_name || ':' || event_column.column_name || ':' || distinct_row.distinct_value as sort_key,
    'TIMELINE_TYPES'::text as category,
    'POSTGRES_BASELINE'::text as scenario,
    event_column.table_name::text as object_name,
    event_column.column_name::text as check_name,
    'real DISTINCT value and count'::text as expected,
    pg_catalog.jsonb_build_object(
      'value', distinct_row.distinct_value,
      'row_count', distinct_row.row_count
    )::text as observed,
    case
      when event_column.table_name in (
        'public.match_quick_events',
        'public.partido_eventos_sistema',
        'public.partido_eventos_post'
      ) then 'MEDIUM'
      else 'INFO'
    end::text as risk_level,
    true::boolean as test_ok,
    'Solo tipos agregados; no descripciones ni comentarios.'::text as details
  from event_type_columns event_column
  cross join lateral pg_temp.player_audit_distinct_values(
    event_column.table_name, event_column.column_name
  ) distinct_row
),
timeline_source_specs(event_name, source_table, required_columns, player_classification) as (
  values
    ('goal_for',       'public.partido_eventos_gol',          array['type']::text[],                              'CANDIDATE_PLAYER'),
    ('goal_against',   'public.partido_eventos_gol',          array['type']::text[],                              'CANDIDATE_PLAYER'),
    ('assist',         'public.partido_eventos_gol',          array['assistant','assistant_id']::text[],           'CANDIDATE_PLAYER'),
    ('yellow_card',    'public.partido_estadisticas_jugador', array['yellow','yellow_count']::text[],              'CANDIDATE_PLAYER'),
    ('red_card',       'public.partido_estadisticas_jugador', array['red']::text[],                                'CANDIDATE_PLAYER'),
    ('substitution',   'public.partido_estadisticas_jugador', array['role','replacement_name','minutes']::text[],  'DUDOSO'),
    ('system_change',  'public.partido_eventos_sistema',      array['from_system','to_system']::text[],            'STAFF_ONLY'),
    ('injury',         'public.partido_estadisticas_jugador', array['injured']::text[],                            'STAFF_ONLY'),
    ('quick_events',   'public.match_quick_events',           array['tipo_evento']::text[],                        'STAFF_ONLY'),
    ('post_events',    'public.partido_eventos_post',         array['type','description']::text[],                 'STAFF_ONLY'),
    ('tactical_state', 'public.partido_snapshots_tacticos',   array['system']::text[],                             'STAFF_ONLY')
),
timeline_source_checks as (
  select
    910 as sort_group,
    timeline.event_name as sort_key,
    'TIMELINE_SOURCE'::text as category,
    'REMOTE_SCHEMA'::text as scenario,
    timeline.source_table::text as object_name,
    timeline.event_name::text as check_name,
    timeline.player_classification::text as expected,
    pg_catalog.jsonb_build_object(
      'required_columns', timeline.required_columns,
      'present_columns', coalesce(present.present_columns::text[], array[]::text[]),
      'all_required_present', coalesce(present.present_columns::text[], array[]::text[]) @> timeline.required_columns::text[]
    )::text as observed,
    case when timeline.player_classification = 'STAFF_ONLY' then 'INFO' else 'LOW' end::text as risk_level,
    (
      pg_catalog.to_regclass(timeline.source_table) is not null
      and coalesce(present.present_columns::text[], array[]::text[]) @> timeline.required_columns::text[]
    )::boolean as test_ok,
    'La clasificacion es informativa; no crea la allowlist.'::text as details
  from timeline_source_specs timeline
  left join lateral (
    select pg_catalog.array_agg(column_row.column_name::text order by column_row.column_name::text)::text[] as present_columns
    from information_schema.columns column_row
    where column_row.table_schema = pg_catalog.split_part(timeline.source_table, '.', 1)
      and column_row.table_name = pg_catalog.split_part(timeline.source_table, '.', 2)
      and column_row.column_name::text = any(timeline.required_columns::text[])
  ) present on true
),
video_summary_query as (
  select *
  from pg_temp.player_audit_safe_json($query$
    select pg_catalog.jsonb_build_object(
      'total_goal_rows', count(*),
      'with_video_url', count(*) filter (where nullif(pg_catalog.btrim(video_url), '') is not null),
      'null_or_empty_video_url', count(*) filter (where nullif(pg_catalog.btrim(video_url), '') is null),
      'https', count(*) filter (where video_url ~* '^https://'),
      'http', count(*) filter (where video_url ~* '^http://'),
      'other_protocol_or_invalid', count(*) filter (
        where nullif(pg_catalog.btrim(video_url), '') is not null
          and video_url !~* '^https?://'
      ),
      'supabase_storage_like', count(*) filter (
        where video_url ~* E'supabase\\.co/.*/storage/v1/object/'
      ),
      'with_query_string', count(*) filter (where pg_catalog.strpos(coalesce(video_url, ''), '?') > 0),
      'potentially_signed', count(*) filter (
        where video_url ~* '[?&](token|signature|sig|expires|x-amz-[^=]*|apikey)='
      )
    )
    from public.partido_eventos_gol
  $query$)
),
video_summary_check as (
  select
    1000 as sort_group,
    'summary'::text as sort_key,
    'GOAL_VIDEO'::text as category,
    'POSTGRES_BASELINE'::text as scenario,
    'public.partido_eventos_gol.video_url'::text as object_name,
    'safe_video_aggregates'::text as check_name,
    'aggregates only; no complete URL'::text as expected,
    coalesce(video_summary.result, pg_catalog.jsonb_build_object(
      'error_code', video_summary.error_code
    ))::text as observed,
    case
      when not video_summary.query_ok then 'HIGH'
      when coalesce((video_summary.result ->> 'http')::bigint, 0::bigint) > 0::bigint
        or coalesce((video_summary.result ->> 'potentially_signed')::bigint, 0::bigint) > 0::bigint then 'HIGH'
      else 'MEDIUM'
    end::text as risk_level,
    video_summary.query_ok::boolean as test_ok,
    coalesce(video_summary.error_message, 'No se incluyen tokens ni query strings.')::text as details
  from video_summary_query video_summary
),
video_domain_checks as (
  select
    1010 as sort_group,
    video.domain_name || ':' || video.protocol as sort_key,
    'GOAL_VIDEO_DOMAIN'::text as category,
    'POSTGRES_BASELINE'::text as scenario,
    'public.partido_eventos_gol.video_url'::text as object_name,
    video.domain_name::text as check_name,
    'known provider/domain inventory'::text as expected,
    pg_catalog.jsonb_build_object(
      'provider', video.provider,
      'protocol', video.protocol,
      'url_count', video.url_count,
      'query_string_count', video.query_string_count,
      'potentially_signed_count', video.potentially_signed_count
    )::text as observed,
    case
      when video.protocol <> 'HTTPS'
        or video.provider = 'OTHER'
        or video.potentially_signed_count > 0 then 'HIGH'
      else 'INFO'
    end::text as risk_level,
    (
      video.protocol = 'HTTPS'
      and video.provider <> 'OTHER'
      and video.potentially_signed_count = 0
    )::boolean as test_ok,
    'Dominio agregado; la URL original nunca sale en el resultado.'::text as details
  from pg_temp.player_audit_video_domains() video
),
analysis_metric_specs(metric_order, metric_name, source_name, metric_sql, required_columns, base_status) as (
  values
    (1, 'partidos', 'public.partido_estadisticas_jugador',
      'select pg_catalog.jsonb_build_object(''borja_value'', count(distinct partido_id)) from public.partido_estadisticas_jugador where jugador_id = ''2e0146e9-e9fc-45ad-b055-edc138a85f7e''::uuid',
      array['partido_id','jugador_id']::text[], 'AVAILABLE'),
    (2, 'minutos', 'public.partido_estadisticas_jugador',
      'select pg_catalog.jsonb_build_object(''borja_value'', coalesce(sum(case when pg_catalog.btrim(minutes::text) ~ ''^[0-9]+([.][0-9]+)?$'' then pg_catalog.btrim(minutes::text)::numeric else 0::numeric end), 0::numeric)) from public.partido_estadisticas_jugador where jugador_id = ''2e0146e9-e9fc-45ad-b055-edc138a85f7e''::uuid',
      array['jugador_id','minutes']::text[], 'AVAILABLE'),
    (3, 'titularidades', 'public.partido_estadisticas_jugador',
      'select pg_catalog.jsonb_build_object(''borja_value'', count(*) filter (where pg_catalog.lower(coalesce(role, '''')) = ''titular'')) from public.partido_estadisticas_jugador where jugador_id = ''2e0146e9-e9fc-45ad-b055-edc138a85f7e''::uuid',
      array['jugador_id','role']::text[], 'AVAILABLE'),
    (4, 'entradas_desde_banquillo', 'public.partido_estadisticas_jugador',
      'select pg_catalog.jsonb_build_object(''borja_value'', count(*) filter (where pg_catalog.lower(coalesce(role, '''')) <> ''titular'' and case when pg_catalog.btrim(minutes::text) ~ ''^[0-9]+([.][0-9]+)?$'' then pg_catalog.btrim(minutes::text)::numeric else 0::numeric end > 0::numeric)) from public.partido_estadisticas_jugador where jugador_id = ''2e0146e9-e9fc-45ad-b055-edc138a85f7e''::uuid',
      array['jugador_id','role','minutes']::text[], 'AVAILABLE'),
    (5, 'goles', 'public.partido_eventos_gol',
      'select pg_catalog.jsonb_build_object(''borja_value'', count(*) filter (where scorer_id = ''2e0146e9-e9fc-45ad-b055-edc138a85f7e''::uuid), ''uuid_linked_rows'', count(*) filter (where scorer_id is not null), ''name_only_rows'', count(*) filter (where scorer_id is null and nullif(pg_catalog.btrim(scorer), '''') is not null)) from public.partido_eventos_gol',
      array['scorer_id','scorer']::text[], 'AVAILABLE'),
    (6, 'asistencias', 'public.partido_eventos_gol',
      'select pg_catalog.jsonb_build_object(''borja_value'', count(*) filter (where assistant_id = ''2e0146e9-e9fc-45ad-b055-edc138a85f7e''::uuid), ''uuid_linked_rows'', count(*) filter (where assistant_id is not null), ''name_only_rows'', count(*) filter (where assistant_id is null and nullif(pg_catalog.btrim(assistant), '''') is not null)) from public.partido_eventos_gol',
      array['assistant_id','assistant']::text[], 'AVAILABLE'),
    (7, 'amarillas', 'public.partido_estadisticas_jugador',
      'select pg_catalog.jsonb_build_object(''borja_value'', coalesce(sum(coalesce(yellow_count::numeric, case when yellow then 1::numeric else 0::numeric end)), 0::numeric)) from public.partido_estadisticas_jugador where jugador_id = ''2e0146e9-e9fc-45ad-b055-edc138a85f7e''::uuid',
      array['jugador_id','yellow','yellow_count']::text[], 'AVAILABLE'),
    (8, 'rojas', 'public.partido_estadisticas_jugador',
      'select pg_catalog.jsonb_build_object(''borja_value'', count(*) filter (where red)) from public.partido_estadisticas_jugador where jugador_id = ''2e0146e9-e9fc-45ad-b055-edc138a85f7e''::uuid',
      array['jugador_id','red']::text[], 'AVAILABLE'),
    (9, 'medias_y_produccion_por_90', 'public.partido_estadisticas_jugador',
      'select pg_catalog.jsonb_build_object(''stats_rows'', count(*), ''minutes_total'', coalesce(sum(case when pg_catalog.btrim(minutes::text) ~ ''^[0-9]+([.][0-9]+)?$'' then pg_catalog.btrim(minutes::text)::numeric else 0::numeric end), 0::numeric)) from public.partido_estadisticas_jugador where jugador_id = ''2e0146e9-e9fc-45ad-b055-edc138a85f7e''::uuid',
      array['jugador_id','partido_id','minutes']::text[], 'AVAILABLE'),
    (10, 'distribucion_posicional', 'public.partido_snapshot_tactico_slots',
      'select pg_catalog.jsonb_build_object(''uuid_linked_snapshot_slots'', count(*) filter (where jugador_id = ''2e0146e9-e9fc-45ad-b055-edc138a85f7e''::uuid), ''legacy_name_slots'', count(*) filter (where jugador_id is null and nullif(pg_catalog.btrim(player_name_snapshot), '''') is not null)) from public.partido_snapshot_tactico_slots',
      array['snapshot_id','slot','jugador_id','player_name_snapshot']::text[], 'PARTIAL')
),
analysis_metric_checks as (
  select
    1100 + metric.metric_order as sort_group,
    metric.metric_name as sort_key,
    'PLAYER_ANALYSIS_DATA'::text as category,
    'BORJA_PLAYER_BASELINE'::text as scenario,
    metric.source_name::text as object_name,
    metric.metric_name::text as check_name,
    'AVAILABLE, PARTIAL or NOT_AVAILABLE from UUID-safe source'::text as expected,
    pg_catalog.jsonb_build_object(
      'availability', case
        when pg_catalog.to_regclass(metric.source_name) is null then 'NOT_AVAILABLE'
        when metric.metric_name in ('goles', 'asistencias')
         and metric_result.query_ok
         and coalesce((metric_result.result ->> 'name_only_rows')::bigint, 0::bigint) > 0::bigint then 'PARTIAL'
        when coalesce(columns_present.present_columns::text[], array[]::text[]) @> metric.required_columns::text[]
          and metric_result.query_ok then metric.base_status
        when coalesce(pg_catalog.array_length(columns_present.present_columns::text[], 1), 0::integer) > 0::integer then 'PARTIAL'
        else 'NOT_AVAILABLE'
      end,
      'source', metric.source_name,
      'required_columns', metric.required_columns,
      'present_columns', coalesce(columns_present.present_columns::text[], array[]::text[]),
      'aggregates', metric_result.result,
      'error_code', metric_result.error_code
    )::text as observed,
    case
      when pg_catalog.to_regclass(metric.source_name) is null then 'HIGH'
      when not (coalesce(columns_present.present_columns::text[], array[]::text[]) @> metric.required_columns::text[]) then 'HIGH'
      when metric.metric_name in ('goles', 'asistencias')
       and coalesce((metric_result.result ->> 'name_only_rows')::bigint, 0::bigint) > 0::bigint then 'HIGH'
      when metric.base_status = 'PARTIAL' then 'MEDIUM'
      else 'INFO'
    end::text as risk_level,
    (
      pg_catalog.to_regclass(metric.source_name) is not null
      and coalesce(columns_present.present_columns::text[], array[]::text[]) @> metric.required_columns::text[]
      and metric_result.query_ok
      and not (
        metric.metric_name in ('goles', 'asistencias')
        and coalesce((metric_result.result ->> 'name_only_rows')::bigint, 0::bigint) > 0::bigint
      )
    )::boolean as test_ok,
    coalesce(
      metric_result.error_message,
      case
        when metric.metric_name = 'distribucion_posicional' then
          'PARTIAL: requiere derivacion backend desde slots, sistemas y snapshots; nunca SELECT tactico directo en PLAYER.'
        else 'Solo agregados de Borja; no nombres ni filas.'
      end
    )::text as details
  from analysis_metric_specs metric
  left join lateral (
    select pg_catalog.array_agg(column_row.column_name::text order by column_row.column_name::text)::text[] as present_columns
    from information_schema.columns column_row
    where column_row.table_schema = pg_catalog.split_part(metric.source_name, '.', 1)
      and column_row.table_name = pg_catalog.split_part(metric.source_name, '.', 2)
      and column_row.column_name::text = any(metric.required_columns::text[])
  ) columns_present on true
  left join lateral pg_temp.player_audit_safe_json(metric.metric_sql) metric_result on true
),
identity_linkage_checks as (
  select
    1200 + relation.table_order as sort_group,
    relation.table_name as sort_key,
    'PLAYER_ID_LINKAGE'::text as category,
    'REMOTE_SCHEMA'::text as scenario,
    relation.table_name as object_name,
    'uuid_vs_legacy_identity_columns'::text as check_name,
    'UUID linkage preferred; name-only linkage reported as risk'::text as expected,
    pg_catalog.jsonb_build_object(
      'identity_columns', coalesce(identity_columns.columns::text[], array[]::text[]),
      'has_jugador_id', coalesce('jugador_id' = any(identity_columns.columns::text[]), false),
      'has_player_id', coalesce('player_id' = any(identity_columns.columns::text[]), false),
      'has_player_name', coalesce(
        identity_columns.columns::text[] && array['player_name','player_name_snapshot','scorer','assistant']::text[],
        false
      ),
      'uuid_fk_count', coalesce(uuid_fk.uuid_fk_count, 0::bigint)
    )::text as observed,
    case
      when relation.identity_mode is not null
       and not coalesce(identity_columns.columns::text[] && array['id','jugador_id','scorer_id','assistant_id']::text[], false) then 'HIGH'
      when coalesce(identity_columns.columns::text[] && array['player_name','player_name_snapshot','scorer','assistant']::text[], false) then 'MEDIUM'
      else 'INFO'
    end::text as risk_level,
    (
      relation.identity_mode is null
      or coalesce(identity_columns.columns::text[] && array['id','jugador_id','scorer_id','assistant_id']::text[], false)
    )::boolean as test_ok,
    'La existencia de una columna UUID no garantiza cobertura completa; revisar metricas name_only.'::text as details
  from relations relation
  left join lateral (
    select pg_catalog.array_agg(column_row.column_name::text order by column_row.ordinal_position)::text[] as columns
    from information_schema.columns column_row
    where column_row.table_schema = pg_catalog.split_part(relation.table_name, '.', 1)
      and column_row.table_name = pg_catalog.split_part(relation.table_name, '.', 2)
      and column_row.column_name in (
        'id', 'jugador_id', 'player_id', 'player_name', 'player_name_snapshot',
        'scorer', 'scorer_id', 'assistant', 'assistant_id'
      )
  ) identity_columns on true
  left join lateral (
    select count(*)::bigint as uuid_fk_count
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = relation.relation_oid
      and constraint_row.contype = 'f'
      and constraint_row.confrelid = pg_catalog.to_regclass('public.jugadores')
  ) uuid_fk on true
),
identity_coverage_specs(coverage_order, table_name, coverage_sql) as (
  values
    (1, 'public.partido_estadisticas_jugador',
      'select pg_catalog.jsonb_build_object(''total_rows'', count(*), ''uuid_linked_rows'', count(*) filter (where jugador_id is not null), ''name_only_rows'', count(*) filter (where jugador_id is null and nullif(pg_catalog.btrim(player_name), '''') is not null)) from public.partido_estadisticas_jugador'),
    (2, 'public.partido_alineacion_slots',
      'select pg_catalog.jsonb_build_object(''total_rows'', count(*), ''uuid_linked_rows'', count(*) filter (where jugador_id is not null), ''name_only_rows'', count(*) filter (where jugador_id is null and nullif(pg_catalog.btrim(player_name), '''') is not null)) from public.partido_alineacion_slots'),
    (3, 'public.partido_snapshot_tactico_slots',
      'select pg_catalog.jsonb_build_object(''total_rows'', count(*), ''uuid_linked_rows'', count(*) filter (where jugador_id is not null), ''name_only_rows'', count(*) filter (where jugador_id is null and nullif(pg_catalog.btrim(player_name_snapshot), '''') is not null)) from public.partido_snapshot_tactico_slots'),
    (4, 'public.partido_convocados',
      'select pg_catalog.jsonb_build_object(''total_rows'', count(*), ''uuid_linked_rows'', count(*) filter (where jugador_id is not null), ''name_only_rows'', count(*) filter (where jugador_id is null and nullif(pg_catalog.btrim(player_name), '''') is not null)) from public.partido_convocados')
),
identity_coverage_checks as (
  select
    1250 + coverage.coverage_order as sort_group,
    coverage.table_name as sort_key,
    'PLAYER_ID_COVERAGE'::text as category,
    'POSTGRES_BASELINE'::text as scenario,
    coverage.table_name::text as object_name,
    'uuid_linked_vs_name_only_rows'::text as check_name,
    'name_only_rows=0 for an exclusively UUID-addressable backend'::text as expected,
    coalesce(coverage_result.result, pg_catalog.jsonb_build_object(
      'error_code', coverage_result.error_code
    ))::text as observed,
    case
      when not coverage_result.query_ok then 'HIGH'
      when coalesce((coverage_result.result ->> 'name_only_rows')::bigint, 0::bigint) > 0::bigint then 'HIGH'
      else 'INFO'
    end::text as risk_level,
    (
      coverage_result.query_ok
      and coalesce((coverage_result.result ->> 'name_only_rows')::bigint, 0::bigint) = 0::bigint
    )::boolean as test_ok,
    coalesce(coverage_result.error_message, 'Solo contadores de cobertura; no se devuelve player_name.')::text as details
  from identity_coverage_specs coverage
  left join lateral pg_temp.player_audit_safe_json(coverage.coverage_sql) coverage_result on true
),
companion_baseline_checks as (
  select
    1300 + visibility.table_order as sort_group,
    visibility.table_name as sort_key,
    'TEAMMATE_DATA_BASELINE'::text as category,
    'POSTGRES_BASELINE'::text as scenario,
    visibility.table_name as object_name,
    'borja_jairo_non_borja_counts'::text as check_name,
    'aggregated counters only'::text as expected,
    pg_catalog.jsonb_build_object(
      'total_rows', visibility.baseline_rows,
      'borja_rows', visibility.baseline_borja_rows,
      'jairo_rows', visibility.baseline_jairo_rows,
      'non_borja_rows', visibility.baseline_non_borja_rows
    )::text as observed,
    case
      when coalesce(visibility.baseline_non_borja_rows, 0::bigint) > 0::bigint then 'HIGH'
      else 'INFO'
    end::text as risk_level,
    true::boolean as test_ok,
    'Que existan filas de otros confirma que la tabla no debe abrirse directamente a PLAYER.'::text as details
  from visibility_raw visibility
  where visibility.scenario = 'BORJA_PLAYER'
    and visibility.identity_mode is not null
),
staff_content_tables(table_name, content_class) as (
  values
    ('public.partido_alineacion_slots',       'TACTICAL_LINEUP'),
    ('public.partido_eventos_sistema',        'TACTICAL_SYSTEM'),
    ('public.partido_snapshots_tacticos',     'TACTICAL_SNAPSHOT'),
    ('public.partido_snapshot_tactico_slots', 'TACTICAL_PLAYERS'),
    ('public.partido_eventos_post',           'POST_INTERNAL'),
    ('public.partido_notas_individuales_pre', 'PRE_INTERNAL')
),
staff_content_checks as (
  select
    1400 as sort_group,
    staff_table.table_name as sort_key,
    'STAFF_CONTENT'::text as category,
    'BORJA_PLAYER'::text as scenario,
    staff_table.table_name::text as object_name,
    staff_table.content_class::text as check_name,
    'PLAYER direct SELECT denied or 0 rows'::text as expected,
    pg_catalog.jsonb_build_object(
      'exists', pg_catalog.to_regclass(staff_table.table_name) is not null,
      'borja_access', visibility.access_mode,
      'borja_visible_rows', visibility.visible_rows,
      'baseline_rows', visibility.baseline_rows,
      'columns_with_internal_semantics', coalesce(internal_columns.columns::text[], array[]::text[])
    )::text as observed,
    case
      when pg_catalog.to_regclass(staff_table.table_name) is null then 'CRITICAL'
      when coalesce(visibility.visible_rows, 0::bigint) > 0::bigint then 'CRITICAL'
      else 'INFO'
    end::text as risk_level,
    (
      pg_catalog.to_regclass(staff_table.table_name) is not null
      and (visibility.access_mode = 'DENIED' or coalesce(visibility.visible_rows, 0::bigint) = 0::bigint)
    )::boolean as test_ok,
    'No se devuelven notas, descripciones, sistemas ni nombres.'::text as details
  from staff_content_tables staff_table
  left join visibility_raw visibility
    on visibility.table_name = staff_table.table_name
   and visibility.scenario = 'BORJA_PLAYER'
  left join lateral (
    select pg_catalog.array_agg(column_row.column_name::text order by column_row.ordinal_position)::text[] as columns
    from information_schema.columns column_row
    where column_row.table_schema = pg_catalog.split_part(staff_table.table_name, '.', 1)
      and column_row.table_name = pg_catalog.split_part(staff_table.table_name, '.', 2)
      and column_row.column_name::text ~* '(note|nota|description|comment|system|formation|position|player|jugador|lineup|scope|phase|zone)'
  ) internal_columns on true
),
relevant_functions as (
  select
    procedure.oid,
    procedure.proname,
    procedure.proowner,
    procedure.prosecdef,
    procedure.provolatile,
    procedure.proconfig,
    procedure.proacl,
    procedure.prosrc,
    owner_role.rolname as owner_name,
    language_row.lanname as language_name,
    pg_catalog.pg_get_function_identity_arguments(procedure.oid) as identity_arguments,
    pg_catalog.pg_get_function_result(procedure.oid) as result_type,
    pg_catalog.format(
      '%I.%I(%s)',
      namespace.nspname,
      procedure.proname,
      pg_catalog.pg_get_function_identity_arguments(procedure.oid)
    ) as signature
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
  join pg_catalog.pg_roles owner_role on owner_role.oid = procedure.proowner
  join pg_catalog.pg_language language_row on language_row.oid = procedure.prolang
  where namespace.nspname = 'public'
    and procedure.prokind = 'f'
    and (
      procedure.proname ~* '(partid|match|jugador|player|alineacion|lineup|gol|goal|event|perfil|profile|anal|stat)'
      or procedure.proname in ('current_membership', 'current_jugador_id', 'is_player', 'is_app_staff')
    )
),
rpc_checks as (
  select
    1500 as sort_group,
    function_row.signature as sort_key,
    'RPC_INVENTORY'::text as category,
    'REMOTE'::text as scenario,
    function_row.signature::text as object_name,
    'contract_acl_guard'::text as check_name,
    'inventory only; no mutating RPC is executed'::text as expected,
    pg_catalog.jsonb_build_object(
      'arguments', function_row.identity_arguments,
      'result_type', function_row.result_type,
      'owner', function_row.owner_name,
      'language', function_row.language_name,
      'security_mode', case when function_row.prosecdef then 'DEFINER' else 'INVOKER' end,
      'volatility', case function_row.provolatile when 'i' then 'IMMUTABLE' when 's' then 'STABLE' else 'VOLATILE' end,
      'proconfig', function_row.proconfig,
      'public_execute', coalesce(public_acl.can_execute, false),
      'anon_execute', case when anon_role.oid is null then null else pg_catalog.has_function_privilege(anon_role.oid, function_row.oid, 'EXECUTE') end,
      'authenticated_execute', case when authenticated_role.oid is null then null else pg_catalog.has_function_privilege(authenticated_role.oid, function_row.oid, 'EXECUTE') end,
      'service_role_execute', case when service_database_role.oid is null then null else pg_catalog.has_function_privilege(service_database_role.oid, function_row.oid, 'EXECUTE') end,
      'staff_guard_detected', pg_catalog.strpos(pg_catalog.lower(function_row.prosrc), 'is_app_staff') > 0
        and pg_catalog.strpos(function_row.prosrc, 'STAFF_ONLY') > 0,
      'player_acl_can_invoke', case when authenticated_role.oid is null then null else pg_catalog.has_function_privilege(authenticated_role.oid, function_row.oid, 'EXECUTE') end
    )::text as observed,
    case
      when coalesce(public_acl.can_execute, false) then 'HIGH'
      when anon_role.oid is not null and pg_catalog.has_function_privilege(anon_role.oid, function_row.oid, 'EXECUTE') then 'HIGH'
      else 'INFO'
    end::text as risk_level,
    not (
      coalesce(public_acl.can_execute, false)
      or (
        anon_role.oid is not null
        and pg_catalog.has_function_privilege(anon_role.oid, function_row.oid, 'EXECUTE')
      )
    )::boolean as test_ok,
    'EXECUTE autenticado es solo capacidad ACL; el guard/logica decide el uso valido.'::text as details
  from relevant_functions function_row
  left join pg_catalog.pg_roles anon_role on anon_role.rolname = 'anon'
  left join pg_catalog.pg_roles authenticated_role on authenticated_role.rolname = 'authenticated'
  left join pg_catalog.pg_roles service_database_role on service_database_role.rolname = 'service_role'
  left join lateral (
    select pg_catalog.bool_or(acl.privilege_type = 'EXECUTE') as can_execute
    from pg_catalog.aclexplode(
      coalesce(function_row.proacl, pg_catalog.acldefault('f', function_row.proowner))
    ) acl
    where acl.grantee = 0
  ) public_acl on true
),
all_checks as (
  select * from table_catalog_checks
  union all select * from table_grant_checks
  union all select * from policy_checks
  union all select * from missing_policy_checks
  union all select * from visibility_checks
  union all select * from identity_checks
  union all select * from schema_columns
  union all select * from foreign_key_checks
  union all select * from publication_check
  union all select * from match_state_checks
  union all select * from match_summary_check
  union all select * from competition_summary_check
  union all select * from event_type_checks
  union all select * from timeline_source_checks
  union all select * from video_summary_check
  union all select * from video_domain_checks
  union all select * from analysis_metric_checks
  union all select * from identity_linkage_checks
  union all select * from identity_coverage_checks
  union all select * from companion_baseline_checks
  union all select * from staff_content_checks
  union all select * from rpc_checks
),
numbered_checks as (
  select
    pg_catalog.row_number() over (
      order by sort_group, sort_key, category, scenario, object_name, check_name
    )::bigint as test_order,
    category,
    scenario,
    object_name,
    check_name,
    expected,
    observed,
    risk_level,
    test_ok,
    details
  from all_checks
)
select
  1::bigint as test_order,
  'AUDIT_SUMMARY'::text as category,
  'REMOTE'::text as scenario,
  'BLOQUE_2_6_PLAYER'::text as object_name,
  'check_count_and_failures'::text as check_name,
  'all checks visible in this single result table'::text as expected,
  pg_catalog.jsonb_build_object(
    'check_count', (select count(*) from numbered_checks),
    'failed_checks', (select count(*) from numbered_checks where not test_ok),
    'critical_checks', (select count(*) from numbered_checks where risk_level = 'CRITICAL'),
    'high_checks', (select count(*) from numbered_checks where risk_level = 'HIGH')
  )::text as observed,
  case
    when exists (select 1 from numbered_checks where risk_level = 'CRITICAL' and not test_ok) then 'CRITICAL'
    when exists (select 1 from numbered_checks where risk_level = 'HIGH' and not test_ok) then 'HIGH'
    else 'INFO'
  end::text as risk_level,
  (not exists (select 1 from numbered_checks where not test_ok))::boolean as test_ok,
  'test_ok=false destaca hallazgos; no significa que la consulta de auditoria haya escrito datos.'::text as details
union all
select
  numbered.test_order + 1,
  numbered.category,
  numbered.scenario,
  numbered.object_name,
  numbered.check_name,
  numbered.expected,
  numbered.observed,
  numbered.risk_level,
  numbered.test_ok,
  numbered.details
from numbered_checks numbered
order by test_order;
-- FINAL_RESULT_END

rollback;
