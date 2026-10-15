-- APPCAUDAL / Cambio 39A: verificador de privilegios de tablas deportivas.
--
-- SOLO LECTURA: una unica sentencia WITH ... SELECT.
-- Puede ejecutarse antes y despues de la migracion y exportarse completa a CSV.
--
-- Resultado global:
--   BLOCKED        = no aplicar; una precondicion de seguridad falla.
--   READY_TO_APPLY = precondiciones correctas, pero quedan ACL por retirar.
--   PASS           = precondiciones y estado final correctos.
--
-- Las filas ACL_ORIGIN deben conservarse en el CSV previo. Documentan las
-- concesiones directas que permitirian reconstruir exactamente el estado previo.

with recursive
target_names(table_name) as (
  values
    ('jugador_suspension_consumptions'::text),
    ('match_set_piece_diagrams'::text),
    ('match_set_piece_notes'::text),
    ('match_set_piece_takers'::text)
),
roles as (
  select
    (select r.oid from pg_catalog.pg_roles r where r.rolname = 'anon') as anon_oid,
    (select r.oid from pg_catalog.pg_roles r where r.rolname = 'authenticated') as authenticated_oid,
    (select r.oid from pg_catalog.pg_roles r where r.rolname = 'service_role') as service_role_oid,
    (select r.oid from pg_catalog.pg_roles r where r.rolname = 'pg_maintain') as pg_maintain_oid
),
relations as (
  select
    target.table_name,
    relation.oid as relation_oid,
    relation.relkind,
    relation.relrowsecurity,
    relation.relforcerowsecurity,
    relation.relowner,
    relation.relacl
  from target_names target
  left join pg_catalog.pg_namespace namespace
    on namespace.nspname = 'public'
  left join pg_catalog.pg_class relation
    on relation.relnamespace = namespace.oid
   and relation.relname = target.table_name
),
acl_entries as (
  select
    relation.table_name,
    relation.relation_oid,
    acl.grantee,
    case
      when acl.grantee = 0::oid then 'PUBLIC'
      else pg_catalog.pg_get_userbyid(acl.grantee)
    end::text as grantee_name,
    acl.grantor,
    pg_catalog.pg_get_userbyid(acl.grantor)::text as grantor_name,
    acl.privilege_type::text,
    acl.is_grantable
  from relations relation
  cross join lateral pg_catalog.aclexplode(
    case
      when relation.relation_oid is null then null::pg_catalog.aclitem[]
      else coalesce(
        relation.relacl,
        pg_catalog.acldefault('r', relation.relowner)
      )
    end
  ) acl
),
all_privileges(privilege_name) as (
  values
    ('SELECT'::text),
    ('INSERT'::text),
    ('UPDATE'::text),
    ('DELETE'::text),
    ('MAINTAIN'::text),
    ('TRUNCATE'::text),
    ('REFERENCES'::text),
    ('TRIGGER'::text)
),
dml_privileges(privilege_name) as (
  values ('SELECT'::text), ('INSERT'::text), ('UPDATE'::text), ('DELETE'::text)
),
dangerous_privileges(privilege_name) as (
  values
    ('MAINTAIN'::text),
    ('TRUNCATE'::text),
    ('REFERENCES'::text),
    ('TRIGGER'::text)
),
required_authenticated(table_name, privilege_name) as (
  values
    ('jugador_suspension_consumptions'::text, 'SELECT'::text),
    ('match_set_piece_diagrams'::text, 'SELECT'::text),
    ('match_set_piece_diagrams'::text, 'INSERT'::text),
    ('match_set_piece_diagrams'::text, 'UPDATE'::text),
    ('match_set_piece_diagrams'::text, 'DELETE'::text),
    ('match_set_piece_notes'::text, 'SELECT'::text),
    ('match_set_piece_notes'::text, 'INSERT'::text),
    ('match_set_piece_notes'::text, 'UPDATE'::text),
    ('match_set_piece_notes'::text, 'DELETE'::text),
    ('match_set_piece_takers'::text, 'SELECT'::text),
    ('match_set_piece_takers'::text, 'INSERT'::text),
    ('match_set_piece_takers'::text, 'UPDATE'::text),
    ('match_set_piece_takers'::text, 'DELETE'::text)
),
authenticated_non_public_sources as (
  select
    relation.table_name,
    privilege.privilege_name,
    relation.relowner = role_ids.authenticated_oid
    or exists (
      select 1
      from acl_entries acl
      where acl.table_name = relation.table_name
        and acl.privilege_type = privilege.privilege_name
        and acl.grantee <> 0::oid
        and (
          acl.grantee = role_ids.authenticated_oid
          or pg_catalog.pg_has_role(
               role_ids.authenticated_oid,
               acl.grantee,
               'USAGE'
             )
        )
    ) as has_source
  from relations relation
  cross join all_privileges privilege
  cross join roles role_ids
  where relation.relation_oid is not null
),
service_non_public_sources as (
  select
    relation.table_name,
    privilege.privilege_name,
    relation.relowner = role_ids.service_role_oid
    or exists (
      select 1
      from acl_entries acl
      where acl.table_name = relation.table_name
        and acl.privilege_type = privilege.privilege_name
        and acl.grantee <> 0::oid
        and (
          acl.grantee = role_ids.service_role_oid
          or pg_catalog.pg_has_role(
               role_ids.service_role_oid,
               acl.grantee,
               'USAGE'
             )
        )
    ) as has_source
  from relations relation
  cross join all_privileges privilege
  cross join roles role_ids
  where relation.relation_oid is not null
),
preflight_checks(check_name, object_name, passed, detail) as (
  select
    'postgresql_17_o_superior'::text,
    'database'::text,
    pg_catalog.current_setting('server_version_num')::integer >= 170000,
    pg_catalog.format(
      'server_version=%s; server_version_num=%s',
      pg_catalog.current_setting('server_version'),
      pg_catalog.current_setting('server_version_num')
    )::text

  union all

  select
    'roles_supabase_presentes'::text,
    'anon, authenticated, service_role, pg_maintain'::text,
    role_ids.anon_oid is not null
      and role_ids.authenticated_oid is not null
      and role_ids.service_role_oid is not null
      and role_ids.pg_maintain_oid is not null,
    pg_catalog.format(
      'anon=%s; authenticated=%s; service_role=%s; pg_maintain=%s',
      coalesce(role_ids.anon_oid::text, '<ausente>'),
      coalesce(role_ids.authenticated_oid::text, '<ausente>'),
      coalesce(role_ids.service_role_oid::text, '<ausente>'),
      coalesce(role_ids.pg_maintain_oid::text, '<ausente>')
    )::text
  from roles role_ids

  union all

  select
    'rol_sin_membresia_pg_maintain'::text,
    actor.role_name,
    case
      when actor.role_oid is null or role_ids.pg_maintain_oid is null then false
      else not pg_catalog.pg_has_role(
             actor.role_oid,
             role_ids.pg_maintain_oid,
             'MEMBER'
           )
        and not pg_catalog.pg_has_role(
             actor.role_oid,
             role_ids.pg_maintain_oid,
             'USAGE'
           )
        and not pg_catalog.pg_has_role(
             actor.role_oid,
             role_ids.pg_maintain_oid,
             'SET'
           )
    end,
    case
      when actor.role_oid is null or role_ids.pg_maintain_oid is null
        then 'No se puede comprobar la membresia.'
      else pg_catalog.format(
        'member=%s; usage=%s; can_set_role=%s',
        pg_catalog.pg_has_role(
          actor.role_oid,
          role_ids.pg_maintain_oid,
          'MEMBER'
        ),
        pg_catalog.pg_has_role(
          actor.role_oid,
          role_ids.pg_maintain_oid,
          'USAGE'
        ),
        pg_catalog.pg_has_role(
          actor.role_oid,
          role_ids.pg_maintain_oid,
          'SET'
        )
      )
    end::text
  from roles role_ids
  cross join lateral (
    values
      ('anon'::text, role_ids.anon_oid),
      ('authenticated'::text, role_ids.authenticated_oid)
  ) actor(role_name, role_oid)

  union all

  select
    'tabla_public_existente'::text,
    pg_catalog.format('public.%I', relation.table_name)::text,
    relation.relation_oid is not null
      and relation.relkind::text in ('r', 'p'),
    case
      when relation.relation_oid is null then 'No existe en public.'
      else pg_catalog.format('oid=%s; relkind=%s', relation.relation_oid, relation.relkind)
    end::text
  from relations relation

  union all

  select
    'rls_activa'::text,
    pg_catalog.format('public.%I', relation.table_name)::text,
    relation.relation_oid is not null and relation.relrowsecurity,
    pg_catalog.format(
      'enabled=%s; forced=%s',
      coalesce(relation.relrowsecurity::text, '<tabla ausente>'),
      coalesce(relation.relforcerowsecurity::text, '<tabla ausente>')
    )::text
  from relations relation

  union all

  select
    'anon_no_es_propietario'::text,
    pg_catalog.format('public.%I', relation.table_name)::text,
    relation.relation_oid is not null
      and relation.relowner is distinct from role_ids.anon_oid,
    pg_catalog.format(
      'owner=%s',
      case
        when relation.relation_oid is null then '<tabla ausente>'
        else pg_catalog.pg_get_userbyid(relation.relowner)
      end
    )::text
  from relations relation
  cross join roles role_ids

  union all

  select
    'anon_no_hereda_rol_propietario'::text,
    pg_catalog.format('public.%I', relation.table_name)::text,
    relation.relation_oid is not null
      and role_ids.anon_oid is not null
      and not pg_catalog.pg_has_role(
        role_ids.anon_oid,
        relation.relowner,
        'USAGE'
      ),
    pg_catalog.format(
      'owner=%s; inherited=%s',
      case
        when relation.relation_oid is null then '<tabla ausente>'
        else pg_catalog.pg_get_userbyid(relation.relowner)
      end,
      case
        when relation.relation_oid is null or role_ids.anon_oid is null
          then '<no comprobable>'
        else pg_catalog.pg_has_role(
          role_ids.anon_oid,
          relation.relowner,
          'USAGE'
        )::text
      end
    )::text
  from relations relation
  cross join roles role_ids

  union all

  select
    'anon_sin_fuente_heredada_no_public'::text,
    pg_catalog.format('public.%I', relation.table_name)::text,
    relation.relation_oid is not null
      and role_ids.anon_oid is not null
      and not exists (
        select 1
        from acl_entries acl
        where acl.table_name = relation.table_name
          and acl.grantee not in (0::oid, role_ids.anon_oid)
          and pg_catalog.pg_has_role(
                role_ids.anon_oid,
                acl.grantee,
                'USAGE'
              )
      ),
    coalesce((
      select pg_catalog.string_agg(
               distinct pg_catalog.format('%I:%s', acl.grantee_name, acl.privilege_type),
               ', '
               order by pg_catalog.format('%I:%s', acl.grantee_name, acl.privilege_type)
             )
      from acl_entries acl
      where acl.table_name = relation.table_name
        and role_ids.anon_oid is not null
        and acl.grantee not in (0::oid, role_ids.anon_oid)
        and pg_catalog.pg_has_role(role_ids.anon_oid, acl.grantee, 'USAGE')
    ), '<ninguna>')::text
  from relations relation
  cross join roles role_ids

  union all

  select
    'capacidad_authenticated_requerida_fuera_de_public'::text,
    pg_catalog.format(
      'public.%I:%s',
      required.table_name,
      required.privilege_name
    )::text,
    relation.relation_oid is not null
      and role_ids.authenticated_oid is not null
      and source.has_source,
    pg_catalog.format('non_public_source=%s', coalesce(source.has_source, false))::text
  from required_authenticated required
  join relations relation on relation.table_name = required.table_name
  cross join roles role_ids
  left join authenticated_non_public_sources source
    on source.table_name = required.table_name
   and source.privilege_name = required.privilege_name

  union all

  select
    'dml_authenticated_existente_no_depende_de_public'::text,
    pg_catalog.format(
      'public.%I:%s',
      relation.table_name,
      privilege.privilege_name
    )::text,
    relation.relation_oid is not null
      and role_ids.authenticated_oid is not null
      and (
        not pg_catalog.has_table_privilege(
          role_ids.authenticated_oid,
          relation.relation_oid,
          privilege.privilege_name
        )
        or source.has_source
      ),
    pg_catalog.format(
      'effective=%s; non_public_source=%s',
      case when role_ids.authenticated_oid is null then false
           else pg_catalog.has_table_privilege(
             role_ids.authenticated_oid,
             relation.relation_oid,
             privilege.privilege_name
           ) end,
      coalesce(source.has_source, false)
    )::text
  from relations relation
  cross join dml_privileges privilege
  cross join roles role_ids
  left join authenticated_non_public_sources source
    on source.table_name = relation.table_name
   and source.privilege_name = privilege.privilege_name
  where relation.relation_oid is not null

  union all

  select
    'service_role_no_depende_de_public'::text,
    pg_catalog.format(
      'public.%I:%s',
      relation.table_name,
      privilege.privilege_name
    )::text,
    relation.relation_oid is not null
      and role_ids.service_role_oid is not null
      and (
        not pg_catalog.has_table_privilege(
          role_ids.service_role_oid,
          relation.relation_oid,
          privilege.privilege_name
        )
        or source.has_source
      ),
    pg_catalog.format(
      'effective=%s; non_public_source=%s',
      case when role_ids.service_role_oid is null then false
           else pg_catalog.has_table_privilege(
             role_ids.service_role_oid,
             relation.relation_oid,
             privilege.privilege_name
           ) end,
      coalesce(source.has_source, false)
    )::text
  from relations relation
  cross join all_privileges privilege
  cross join roles role_ids
  left join service_non_public_sources source
    on source.table_name = relation.table_name
   and source.privilege_name = privilege.privilege_name
  where relation.relation_oid is not null

  union all

  select
    'authenticated_sin_privilegio_peligroso_heredado'::text,
    pg_catalog.format(
      'public.%I:%s',
      relation.table_name,
      privilege.privilege_name
    )::text,
    relation.relation_oid is not null
      and role_ids.authenticated_oid is not null
      and not (
        relation.relowner = role_ids.authenticated_oid
        or (
          pg_catalog.pg_has_role(
            role_ids.authenticated_oid,
            relation.relowner,
            'USAGE'
          )
          and pg_catalog.has_table_privilege(
            role_ids.authenticated_oid,
            relation.relation_oid,
            privilege.privilege_name
          )
        )
      )
      and not exists (
        select 1
        from acl_entries acl
        where acl.table_name = relation.table_name
          and acl.privilege_type = privilege.privilege_name
          and acl.grantee not in (0::oid, role_ids.authenticated_oid)
          and pg_catalog.pg_has_role(
                role_ids.authenticated_oid,
                acl.grantee,
                'USAGE'
              )
      ),
    coalesce((
      select pg_catalog.string_agg(
               distinct acl.grantee_name,
               ', '
               order by acl.grantee_name
             )
      from acl_entries acl
      where acl.table_name = relation.table_name
        and acl.privilege_type = privilege.privilege_name
        and role_ids.authenticated_oid is not null
        and acl.grantee not in (0::oid, role_ids.authenticated_oid)
        and pg_catalog.pg_has_role(role_ids.authenticated_oid, acl.grantee, 'USAGE')
    ), '<ninguna>')::text
  from relations relation
  cross join dangerous_privileges privilege
  cross join roles role_ids
  where relation.relation_oid is not null
),
target_checks(check_name, object_name, passed, detail) as (
  select
    'anon_sin_privilegios_efectivos'::text,
    pg_catalog.format('public.%I:%s', relation.table_name, privilege.privilege_name)::text,
    relation.relation_oid is not null
      and role_ids.anon_oid is not null
      and not pg_catalog.has_table_privilege(
        role_ids.anon_oid,
        relation.relation_oid,
        privilege.privilege_name
      ),
    pg_catalog.format(
      'effective=%s',
      case when role_ids.anon_oid is null or relation.relation_oid is null then '<no comprobable>'
           else pg_catalog.has_table_privilege(
             role_ids.anon_oid,
             relation.relation_oid,
             privilege.privilege_name
           )::text end
    )::text
  from relations relation
  cross join all_privileges privilege
  cross join roles role_ids

  union all

  select
    'public_sin_acl_directa'::text,
    pg_catalog.format('public.%I', relation.table_name)::text,
    relation.relation_oid is not null
      and not exists (
        select 1
        from acl_entries acl
        where acl.table_name = relation.table_name
          and acl.grantee = 0::oid
      ),
    coalesce((
      select pg_catalog.string_agg(
               distinct acl.privilege_type,
               ', '
               order by acl.privilege_type
             )
      from acl_entries acl
      where acl.table_name = relation.table_name
        and acl.grantee = 0::oid
    ), '<ninguno>')::text
  from relations relation

  union all

  select
    'authenticated_sin_privilegio_peligroso_efectivo'::text,
    pg_catalog.format('public.%I:%s', relation.table_name, privilege.privilege_name)::text,
    relation.relation_oid is not null
      and role_ids.authenticated_oid is not null
      and not pg_catalog.has_table_privilege(
        role_ids.authenticated_oid,
        relation.relation_oid,
        privilege.privilege_name
      ),
    pg_catalog.format(
      'effective=%s',
      case when role_ids.authenticated_oid is null or relation.relation_oid is null then '<no comprobable>'
           else pg_catalog.has_table_privilege(
             role_ids.authenticated_oid,
             relation.relation_oid,
             privilege.privilege_name
           )::text end
    )::text
  from relations relation
  cross join dangerous_privileges privilege
  cross join roles role_ids

  union all

  select
    'authenticated_con_capacidad_requerida'::text,
    pg_catalog.format('public.%I:%s', required.table_name, required.privilege_name)::text,
    relation.relation_oid is not null
      and role_ids.authenticated_oid is not null
      and pg_catalog.has_table_privilege(
        role_ids.authenticated_oid,
        relation.relation_oid,
        required.privilege_name
      ),
    pg_catalog.format(
      'effective=%s',
      case when role_ids.authenticated_oid is null or relation.relation_oid is null then '<no comprobable>'
           else pg_catalog.has_table_privilege(
             role_ids.authenticated_oid,
             relation.relation_oid,
             required.privilege_name
           )::text end
    )::text
  from required_authenticated required
  join relations relation on relation.table_name = required.table_name
  cross join roles role_ids
),
mandatory_checks as (
  select 'PREFLIGHT'::text as check_group, check_name, object_name, passed, detail
  from preflight_checks
  union all
  select 'TARGET'::text, check_name, object_name, passed, detail
  from target_checks
),
global_state as (
  select
    case
      when not coalesce(
        pg_catalog.bool_and(passed) filter (where check_group = 'PREFLIGHT'),
        false
      ) then 'BLOCKED'
      when coalesce(pg_catalog.bool_and(passed), false) then 'PASS'
      else 'READY_TO_APPLY'
    end::text as status,
    pg_catalog.count(*) filter (where check_group = 'PREFLIGHT')::bigint as preflight_total,
    pg_catalog.count(*) filter (where check_group = 'PREFLIGHT' and passed)::bigint as preflight_passed,
    pg_catalog.count(*) filter (where check_group = 'TARGET')::bigint as target_total,
    pg_catalog.count(*) filter (where check_group = 'TARGET' and passed)::bigint as target_passed
  from mandatory_checks
),
result_rows(section, object_type, object_name, check_name, status, severity, detail) as (
  select
    '00 GLOBAL'::text,
    'SUMMARY'::text,
    'Cambio 39A'::text,
    'estado_global'::text,
    state.status,
    case state.status
      when 'PASS' then 'INFO'
      when 'READY_TO_APPLY' then 'HIGH'
      else 'CRITICAL'
    end::text,
    pg_catalog.format(
      'preflight=%s/%s; target=%s/%s',
      state.preflight_passed,
      state.preflight_total,
      state.target_passed,
      state.target_total
    )::text
  from global_state state

  union all

  select
    case checks.check_group
      when 'PREFLIGHT' then '01 PREFLIGHT'
      else '02 TARGET_STATE'
    end::text,
    'CHECK'::text,
    checks.object_name,
    checks.check_name,
    case when checks.passed then 'PASS' else 'FAIL' end::text,
    case when checks.passed then 'INFO'
         when checks.check_group = 'PREFLIGHT' then 'CRITICAL'
         else 'HIGH' end::text,
    checks.detail
  from mandatory_checks checks

  union all

  select
    '03 ACL_ORIGIN'::text,
    'TABLE_ACL'::text,
    pg_catalog.format('public.%I', relation.table_name)::text,
    pg_catalog.format('concesion_directa_%s', acl.grantee_name)::text,
    'INFO'::text,
    case when acl.grantee_name in ('anon', 'PUBLIC') then 'HIGH' else 'INFO' end::text,
    pg_catalog.format(
      'grantor=%I; privilege=%s; grantable=%s',
      acl.grantor_name,
      acl.privilege_type,
      acl.is_grantable
    )::text
  from acl_entries acl
  join relations relation on relation.table_name = acl.table_name

  union all

  select
    '04 RLS_FINGERPRINT'::text,
    'POLICY'::text,
    pg_catalog.format('public.%I', relation.table_name)::text,
    policy.polname::text,
    'INFO'::text,
    'INFO'::text,
    pg_catalog.format(
      'hash=%s; command=%s; permissive=%s; roles=%s',
      pg_catalog.md5(
        pg_catalog.concat_ws(
          '|',
          policy.polname,
          policy.polcmd::text,
          policy.polpermissive::text,
          policy.polroles::text,
          coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), ''),
          coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), '')
        )
      ),
      policy.polcmd::text,
      policy.polpermissive,
      policy.polroles::text
    )::text
  from relations relation
  join pg_catalog.pg_policy policy
    on policy.polrelid = relation.relation_oid

  union all

  select
    '05 EFFECTIVE_PRIVILEGES'::text,
    'TABLE_ACL'::text,
    pg_catalog.format('public.%I', relation.table_name)::text,
    pg_catalog.format('privilegios_efectivos_%s', actor.role_name)::text,
    'INFO'::text,
    case when actor.role_name = 'anon'
           and pg_catalog.count(*) filter (where privilege.has_privilege) > 0
         then 'CRITICAL'
         else 'INFO' end::text,
    coalesce(
      pg_catalog.string_agg(
        privilege.privilege_name,
        ', '
        order by privilege.privilege_name
      ) filter (where privilege.has_privilege),
      '<ninguno>'
    )::text
  from relations relation
  cross join roles role_ids
  cross join lateral (
    values
      ('anon'::text, role_ids.anon_oid),
      ('authenticated'::text, role_ids.authenticated_oid),
      ('service_role'::text, role_ids.service_role_oid)
  ) actor(role_name, role_oid)
  cross join lateral (
    select
      privilege_name,
      case
        when relation.relation_oid is null or actor.role_oid is null then false
        else pg_catalog.has_table_privilege(
          actor.role_oid,
          relation.relation_oid,
          privilege_name
        )
      end as has_privilege
    from all_privileges
  ) privilege
  group by relation.table_name, actor.role_name

  union all

  select
    '06 PG_MAINTAIN_MEMBERSHIP'::text,
    'ROLE_MEMBERSHIP'::text,
    'pg_catalog.pg_maintain'::text,
    actor.role_name,
    'INFO'::text,
    case
      when actor.role_oid is null or role_ids.pg_maintain_oid is null then 'HIGH'
      when (
        pg_catalog.pg_has_role(actor.role_oid, role_ids.pg_maintain_oid, 'MEMBER')
        or pg_catalog.pg_has_role(actor.role_oid, role_ids.pg_maintain_oid, 'USAGE')
        or pg_catalog.pg_has_role(actor.role_oid, role_ids.pg_maintain_oid, 'SET')
      ) and actor.role_name in ('anon', 'authenticated') then 'CRITICAL'
      else 'INFO'
    end::text,
    case
      when actor.role_oid is null or role_ids.pg_maintain_oid is null
        then 'No se puede comprobar la membresia.'
      else pg_catalog.format(
        'member=%s; usage=%s; can_set_role=%s',
        pg_catalog.pg_has_role(
          actor.role_oid,
          role_ids.pg_maintain_oid,
          'MEMBER'
        ),
        pg_catalog.pg_has_role(
          actor.role_oid,
          role_ids.pg_maintain_oid,
          'USAGE'
        ),
        pg_catalog.pg_has_role(
          actor.role_oid,
          role_ids.pg_maintain_oid,
          'SET'
        )
      )
    end::text
  from roles role_ids
  cross join lateral (
    values
      ('anon'::text, role_ids.anon_oid),
      ('authenticated'::text, role_ids.authenticated_oid),
      ('service_role'::text, role_ids.service_role_oid)
  ) actor(role_name, role_oid)
)
select
  section,
  object_type,
  object_name,
  check_name,
  status,
  severity,
  detail
from result_rows
order by section, object_name, check_name, detail;
