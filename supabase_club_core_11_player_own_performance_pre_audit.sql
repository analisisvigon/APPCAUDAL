-- BLOQUE 1.4 - Auditoria remota previa, estrictamente READ ONLY.
--
-- Ejecutar el archivo completo en Supabase SQL Editor.
-- Devuelve una unica tabla de cinco filas: tres tablas y dos helpers.
-- No ejecuta los helpers ni modifica catalogo o datos.

with
table_targets(object_order, object_name) as (
  values
    (1, 'wellness_entries'::text),
    (2, 'rpe_entries'::text),
    (3, 'club_memberships'::text)
),
function_targets(object_order, object_name) as (
  values
    (4, 'current_jugador_id'::text),
    (5, 'is_player'::text)
),
target_relations as materialized (
  select
    target.object_order,
    target.object_name,
    relation.oid as relation_oid,
    relation.relowner,
    relation.relacl,
    relation.relrowsecurity,
    relation.relforcerowsecurity
  from table_targets target
  left join pg_catalog.pg_namespace namespace
    on namespace.nspname = 'public'
  left join pg_catalog.pg_class relation
    on relation.relnamespace = namespace.oid
   and relation.relname = target.object_name
   and relation.relkind in ('r', 'p')
),
target_functions as materialized (
  select
    target.object_order,
    target.object_name,
    proc.oid as function_oid,
    proc.proowner,
    proc.proacl,
    proc.prosecdef,
    proc.provolatile,
    proc.proconfig,
    language.lanname as function_language
  from function_targets target
  left join pg_catalog.pg_namespace namespace
    on namespace.nspname = 'public'
  left join pg_catalog.pg_proc proc
    on proc.pronamespace = namespace.oid
   and proc.proname = target.object_name
   and proc.pronargs = 0
   and proc.prokind = 'f'
  left join pg_catalog.pg_language language
    on language.oid = proc.prolang
),
table_rows as (
  select
    relation.object_order,
    'TABLE'::text as object_kind,
    pg_catalog.format('public.%I', relation.object_name) as object_name,
    relation.relation_oid is not null as object_exists,
    pg_catalog.pg_get_userbyid(relation.relowner) as owner,
    relation.relrowsecurity as rls_enabled,
    relation.relforcerowsecurity as force_rls,
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'position', attribute.attnum,
            'name', attribute.attname,
            'type', pg_catalog.format_type(
              attribute.atttypid,
              attribute.atttypmod
            ),
            'nullable', not attribute.attnotnull,
            'default', pg_catalog.pg_get_expr(
              attribute_default.adbin,
              attribute_default.adrelid
            ),
            'identity', nullif(attribute.attidentity::text, ''),
            'generated', nullif(attribute.attgenerated::text, '')
          )
          order by attribute.attnum
        )
        from pg_catalog.pg_attribute attribute
        left join pg_catalog.pg_attrdef attribute_default
          on attribute_default.adrelid = attribute.attrelid
         and attribute_default.adnum = attribute.attnum
        where attribute.attrelid = relation.relation_oid
          and attribute.attnum > 0
          and not attribute.attisdropped
      ),
      '[]'::jsonb
    ) as columns,
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'direction', case
              when foreign_key.conrelid = relation.relation_oid
                then 'OUTBOUND'
              else 'INBOUND'
            end,
            'name', foreign_key.conname,
            'table', foreign_key.conrelid::regclass::text,
            'referenced_table', foreign_key.confrelid::regclass::text,
            'definition', pg_catalog.pg_get_constraintdef(
              foreign_key.oid,
              true
            ),
            'deferrable', foreign_key.condeferrable,
            'initially_deferred', foreign_key.condeferred
          )
          order by foreign_key.conname
        )
        from pg_catalog.pg_constraint foreign_key
        where foreign_key.contype = 'f'
          and (
            foreign_key.conrelid = relation.relation_oid
            or foreign_key.confrelid = relation.relation_oid
          )
      ),
      '[]'::jsonb
    ) as foreign_keys,
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'name', policy.polname,
            'permissive', policy.polpermissive,
            'command', case policy.polcmd
              when '*' then 'ALL'
              when 'r' then 'SELECT'
              when 'a' then 'INSERT'
              when 'w' then 'UPDATE'
              when 'd' then 'DELETE'
              else policy.polcmd::text
            end,
            'roles', (
              select pg_catalog.jsonb_agg(
                case
                  when policy_role.role_oid = 0 then 'PUBLIC'
                  else role.rolname
                end
                order by case
                  when policy_role.role_oid = 0 then 'PUBLIC'
                  else role.rolname
                end
              )
              from pg_catalog.unnest(policy.polroles)
                policy_role(role_oid)
              left join pg_catalog.pg_roles role
                on role.oid = policy_role.role_oid
            ),
            'using', pg_catalog.pg_get_expr(
              policy.polqual,
              policy.polrelid
            ),
            'with_check', pg_catalog.pg_get_expr(
              policy.polwithcheck,
              policy.polrelid
            )
          )
          order by policy.polname
        )
        from pg_catalog.pg_policy policy
        where policy.polrelid = relation.relation_oid
      ),
      '[]'::jsonb
    ) as policies,
    pg_catalog.jsonb_build_object(
      'direct_acl', coalesce(
        (
          select pg_catalog.jsonb_agg(
            acl.privilege_type
            order by acl.privilege_type
          )
          from pg_catalog.aclexplode(
            coalesce(
              relation.relacl,
              pg_catalog.acldefault('r', relation.relowner)
            )
          ) acl
          join pg_catalog.pg_roles role on role.oid = acl.grantee
          where role.rolname = 'authenticated'
        ),
        '[]'::jsonb
      ),
      'effective_select', coalesce(
        (
          select pg_catalog.has_table_privilege(
            role.oid,
            relation.relation_oid,
            'SELECT'
          )
          from pg_catalog.pg_roles role
          where role.rolname = 'authenticated'
        ),
        false
      ),
      'effective_insert', coalesce(
        (
          select pg_catalog.has_table_privilege(
            role.oid,
            relation.relation_oid,
            'INSERT'
          )
          from pg_catalog.pg_roles role
          where role.rolname = 'authenticated'
        ),
        false
      ),
      'effective_update', coalesce(
        (
          select pg_catalog.has_table_privilege(
            role.oid,
            relation.relation_oid,
            'UPDATE'
          )
          from pg_catalog.pg_roles role
          where role.rolname = 'authenticated'
        ),
        false
      ),
      'effective_delete', coalesce(
        (
          select pg_catalog.has_table_privilege(
            role.oid,
            relation.relation_oid,
            'DELETE'
          )
          from pg_catalog.pg_roles role
          where role.rolname = 'authenticated'
        ),
        false
      )
    ) as authenticated_privileges,
    null::jsonb as function_metadata,
    null::text as definition
  from target_relations relation
),
function_rows as (
  select
    fn.object_order,
    'FUNCTION'::text as object_kind,
    pg_catalog.format('public.%I()', fn.object_name) as object_name,
    fn.function_oid is not null as object_exists,
    pg_catalog.pg_get_userbyid(fn.proowner) as owner,
    null::boolean as rls_enabled,
    null::boolean as force_rls,
    null::jsonb as columns,
    null::jsonb as foreign_keys,
    null::jsonb as policies,
    null::jsonb as authenticated_privileges,
    case
      when fn.function_oid is null then null::jsonb
      else pg_catalog.jsonb_build_object(
        'arguments', pg_catalog.pg_get_function_identity_arguments(
          fn.function_oid
        ),
        'result_type', pg_catalog.pg_get_function_result(
          fn.function_oid
        ),
        'language', fn.function_language,
        'security_mode', case
          when fn.prosecdef then 'DEFINER'
          else 'INVOKER'
        end,
        'volatility', case fn.provolatile
          when 'i' then 'IMMUTABLE'
          when 's' then 'STABLE'
          else 'VOLATILE'
        end,
        'config', fn.proconfig,
        'execute_acl', (
          select coalesce(
            pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'grantee', case
                  when acl.grantee = 0 then 'PUBLIC'
                  else grantee.rolname
                end,
                'grantor', pg_catalog.pg_get_userbyid(acl.grantor),
                'grantable', acl.is_grantable
              )
              order by case
                when acl.grantee = 0 then 'PUBLIC'
                else grantee.rolname
              end
            ),
            '[]'::jsonb
          )
          from pg_catalog.aclexplode(
            coalesce(
              fn.proacl,
              pg_catalog.acldefault('f', fn.proowner)
            )
          ) acl
          left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
          where acl.privilege_type = 'EXECUTE'
        ),
        'authenticated_execute', coalesce(
          (
            select pg_catalog.has_function_privilege(
              role.oid,
              fn.function_oid,
              'EXECUTE'
            )
            from pg_catalog.pg_roles role
            where role.rolname = 'authenticated'
          ),
          false
        )
      )
    end as function_metadata,
    case
      when fn.function_oid is null then null::text
      else pg_catalog.pg_get_functiondef(fn.function_oid)
    end as definition
  from target_functions fn
)
select
  object_kind,
  object_name,
  object_exists,
  owner,
  rls_enabled,
  force_rls,
  columns,
  foreign_keys,
  policies,
  authenticated_privileges,
  function_metadata,
  definition
from (
  select * from table_rows
  union all
  select * from function_rows
) audited_objects
order by object_order;
