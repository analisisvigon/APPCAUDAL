-- APPCAUDAL - Fase 1 - Bloque 1.2 - AUDITORIA REMOTA SOLO LECTURA
--
-- Ejecutar en Supabase SQL Editor como una consulta independiente.
-- Este archivo contiene exclusivamente SELECT/CTE sobre pg_catalog.
-- No invoca los helpers auditados y no modifica funciones, ACL, esquema o datos.

-- A1. Inventario de nombres y firmas. Devuelve una fila por nombre solicitado,
-- incluso si no existe, e incluye cualquier overload inesperado.
with requested(proname) as (
  values
    ('current_membership'),
    ('current_jugador_id'),
    ('is_app_staff'),
    ('is_player')
), discovered as (
  select
    procedure_row.proname,
    procedure_row.oid,
    pg_catalog.pg_get_function_identity_arguments(procedure_row.oid) as identity_arguments,
    pg_catalog.pg_get_function_result(procedure_row.oid) as result_type
  from pg_catalog.pg_proc procedure_row
  join pg_catalog.pg_namespace namespace_row
    on namespace_row.oid = procedure_row.pronamespace
  where namespace_row.nspname = 'public'
    and procedure_row.proname in (
      'current_membership',
      'current_jugador_id',
      'is_app_staff',
      'is_player'
    )
)
select
  requested.proname,
  count(discovered.oid) as overload_count,
  count(discovered.oid) filter (
    where discovered.identity_arguments = ''
  ) as zero_argument_count,
  coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'oid', discovered.oid,
        'identity_arguments', discovered.identity_arguments,
        'result_type', discovered.result_type
      ) order by discovered.oid
    ) filter (where discovered.oid is not null),
    '[]'::jsonb
  ) as discovered_signatures
from requested
left join discovered on discovered.proname = requested.proname
group by requested.proname
order by requested.proname;

-- A2. Detalle remoto completo de todas las funciones public con esos nombres.
-- PostgreSQL no conserva una fecha de creacion fiable en pg_proc. Se muestra
-- xmin solo como dato forense no temporal y la extension de origen, si existe.
select
  procedure_row.oid,
  namespace_row.nspname as schema_name,
  procedure_row.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(procedure_row.oid) as identity_arguments,
  pg_catalog.pg_get_function_arguments(procedure_row.oid) as full_arguments,
  pg_catalog.pg_get_function_result(procedure_row.oid) as result_type,
  pg_catalog.pg_get_userbyid(procedure_row.proowner) as owner,
  case
    when procedure_row.prosecdef then 'SECURITY DEFINER'
    else 'SECURITY INVOKER'
  end as security_mode,
  case procedure_row.provolatile
    when 'i' then 'IMMUTABLE'
    when 's' then 'STABLE'
    when 'v' then 'VOLATILE'
  end as volatility,
  language_row.lanname as language,
  procedure_row.proconfig as configuration,
  procedure_row.proacl as raw_acl,
  coalesce(
    (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'grantor', pg_catalog.pg_get_userbyid(acl.grantor),
          'grantee', case
            when acl.grantee = 0 then 'PUBLIC'
            else pg_catalog.pg_get_userbyid(acl.grantee)
          end,
          'privilege', acl.privilege_type,
          'grantable', acl.is_grantable
        )
        order by acl.grantee, acl.privilege_type
      )
      from pg_catalog.aclexplode(
        coalesce(
          procedure_row.proacl,
          pg_catalog.acldefault('f', procedure_row.proowner)
        )
      ) acl
    ),
    '[]'::jsonb
  ) as expanded_acl,
  exists (
    select 1
    from pg_catalog.aclexplode(
      coalesce(
        procedure_row.proacl,
        pg_catalog.acldefault('f', procedure_row.proowner)
      )
    ) acl
    where acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) as public_execute,
  pg_catalog.has_function_privilege(
    'anon', procedure_row.oid, 'EXECUTE'
  ) as anon_execute,
  pg_catalog.has_function_privilege(
    'authenticated', procedure_row.oid, 'EXECUTE'
  ) as authenticated_execute,
  pg_catalog.obj_description(procedure_row.oid, 'pg_proc') as function_comment,
  extension_row.extname as extension_origin,
  procedure_row.xmin::text as catalog_xmin_not_a_timestamp,
  null::timestamptz as reliable_created_at,
  'pg_proc no registra una fecha de creacion fiable'::text as created_at_note,
  pg_catalog.pg_get_functiondef(procedure_row.oid) as full_definition
from pg_catalog.pg_proc procedure_row
join pg_catalog.pg_namespace namespace_row
  on namespace_row.oid = procedure_row.pronamespace
join pg_catalog.pg_language language_row
  on language_row.oid = procedure_row.prolang
left join pg_catalog.pg_depend extension_dependency
  on extension_dependency.classid = 'pg_proc'::regclass
 and extension_dependency.objid = procedure_row.oid
 and extension_dependency.deptype = 'e'
left join pg_catalog.pg_extension extension_row
  on extension_row.oid = extension_dependency.refobjid
where namespace_row.nspname = 'public'
  and procedure_row.proname in (
    'current_membership',
    'current_jugador_id',
    'is_app_staff',
    'is_player'
  )
order by procedure_row.proname, identity_arguments, procedure_row.oid;

-- A3. Comparacion automatica contra el contrato local exacto de Bloque 1.2.
-- source_exact_match exige el mismo cuerpo salvo espacios exteriores.
-- source_normalized_match tolera solo diferencias de formato en whitespace.
with expected(
  proname,
  expected_language,
  expected_security_definer,
  expected_result_type,
  expected_comment,
  expected_source
) as (
  values
    (
      'current_membership',
      'plpgsql',
      true,
      'TABLE(membership_id uuid, club_id uuid, user_id uuid, role text, jugador_id uuid, is_active boolean)',
      'Resuelve la unica membership activa de auth.uid(); devuelve 0 filas sin identidad y lanza 21000 si existe ambiguedad.',
      $expected$
declare
  actor_id uuid := auth.uid();
  active_membership_count integer;
begin
  if actor_id is null then
    return;
  end if;

  select count(*)
    into active_membership_count
  from public.club_memberships membership
  where membership.user_id = actor_id
    and membership.is_active;

  if active_membership_count > 1 then
    raise exception
      'Identidad ambigua: auth.uid() tiene % memberships activas',
      active_membership_count
      using errcode = '21000';
  end if;

  return query
  select
    membership.id,
    membership.club_id,
    membership.user_id,
    membership.role,
    membership.jugador_id,
    membership.is_active
  from public.club_memberships membership
  where membership.user_id = actor_id
    and membership.is_active;
end;
$expected$
    ),
    (
      'current_jugador_id',
      'sql',
      false,
      'uuid',
      'Devuelve jugador_id solo para la identidad PLAYER activa derivada de auth.uid(); NULL en cualquier otro caso.',
      $expected$
  select case
    when membership.role = 'player' then membership.jugador_id
    else null::uuid
  end
  from public.current_membership() membership;
$expected$
    ),
    (
      'is_app_staff',
      'sql',
      false,
      'boolean',
      'True solo para owner, admin o staff con membership activa resuelta desde auth.uid(); no consulta permisos individuales.',
      $expected$
  select coalesce(
    (
      select membership.role in ('owner', 'admin', 'staff')
      from public.current_membership() membership
    ),
    false
  );
$expected$
    ),
    (
      'is_player',
      'sql',
      false,
      'boolean',
      'True solo para una membership PLAYER activa y coherente, derivada exclusivamente de auth.uid().',
      $expected$
  select coalesce(
    (
      select
        membership.role = 'player'
        and membership.jugador_id is not null
      from public.current_membership() membership
    ),
    false
  );
$expected$
    )
), actual as (
  select
    expected.*,
    procedure_row.oid,
    procedure_row.proowner,
    procedure_row.prosecdef,
    procedure_row.provolatile,
    procedure_row.proconfig,
    procedure_row.proacl,
    procedure_row.prosrc,
    language_row.lanname,
    pg_catalog.pg_get_function_result(procedure_row.oid) as actual_result_type,
    pg_catalog.obj_description(procedure_row.oid, 'pg_proc') as actual_comment
  from expected
  left join pg_catalog.pg_proc procedure_row
    on procedure_row.pronamespace = 'public'::regnamespace
   and procedure_row.proname = expected.proname
   and procedure_row.pronargs = 0
  left join pg_catalog.pg_language language_row
    on language_row.oid = procedure_row.prolang
), compared as (
  select
    actual.*,
    coalesce(
      pg_catalog.btrim(actual.prosrc) = pg_catalog.btrim(actual.expected_source),
      false
    ) as source_exact_match,
    coalesce(
      pg_catalog.regexp_replace(
        pg_catalog.btrim(actual.prosrc), E'\\s+', ' ', 'g'
      ) = pg_catalog.regexp_replace(
        pg_catalog.btrim(actual.expected_source), E'\\s+', ' ', 'g'
      ),
      false
    ) as source_normalized_match,
    coalesce(
      actual.oid is not null
      and pg_catalog.pg_get_userbyid(actual.proowner) = 'postgres'
      and actual.lanname = actual.expected_language
      and actual.prosecdef is not distinct from actual.expected_security_definer
      and actual.provolatile = 's'
      and coalesce(actual.proconfig, array[]::text[])
          @> array['search_path=pg_catalog']::text[]
      and actual.actual_result_type = actual.expected_result_type,
      false
    ) as metadata_match,
    coalesce(actual.actual_comment = actual.expected_comment, false) as comment_match,
    coalesce(
      not exists (
        select 1
        from pg_catalog.aclexplode(
          coalesce(actual.proacl, pg_catalog.acldefault('f', actual.proowner))
        ) acl
        where acl.grantee = 0
          and acl.privilege_type = 'EXECUTE'
      )
      and not pg_catalog.has_function_privilege('anon', actual.oid, 'EXECUTE')
      and pg_catalog.has_function_privilege('authenticated', actual.oid, 'EXECUTE'),
      false
    ) as acl_match
  from actual
), per_helper as (
  select
    proname,
    oid,
    source_exact_match,
    source_normalized_match,
    metadata_match,
    comment_match,
    acl_match,
    source_exact_match
      and metadata_match
      and comment_match
      and acl_match as block_1_2_exact_match,
    source_normalized_match
      and metadata_match
      and comment_match
      and acl_match as block_1_2_contract_match
  from compared
)
select *
from per_helper
order by proname;

-- A4. Clasificacion A/B/C/D automatica. La salida debe interpretarse junto con
-- A1-A3 y las definiciones completas; no realiza ninguna reparacion.
with requested(proname) as (
  values
    ('current_membership'),
    ('current_jugador_id'),
    ('is_app_staff'),
    ('is_player')
), counts as (
  select
    count(*) filter (where procedure_row.pronargs = 0) as zero_arg_helper_count,
    count(*) as all_named_overload_count
  from pg_catalog.pg_proc procedure_row
  join pg_catalog.pg_namespace namespace_row
    on namespace_row.oid = procedure_row.pronamespace
  join requested on requested.proname = procedure_row.proname
  where namespace_row.nspname = 'public'
)
select
  zero_arg_helper_count,
  all_named_overload_count,
  case
    when zero_arg_helper_count between 1 and 3 then
      'B: solo existen algunos helpers de firma cero'
    when zero_arg_helper_count = 4 then
      'A-o-C: existen los cuatro; use A3 para decidir igualdad o incompatibilidad'
    when zero_arg_helper_count = 0 and all_named_overload_count > 0 then
      'D: solo existen overloads antiguos/no relacionados'
    else
      'NINGUNO: no se localizaron helpers; incompatible con el error observado'
  end as preliminary_classification
from counts;
