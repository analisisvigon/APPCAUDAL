-- BLOQUE 1.3 - Auditoria remota previa, estrictamente READ ONLY.
--
-- Ejecutar el archivo completo en Supabase SQL Editor y copiar las cinco filas.
-- No invoca helpers ni funciones de negocio y no modifica catalogo ni datos.

with
target_tables(table_order, table_name) as (
  values
    (1, 'wellness_entries'::text),
    (2, 'rpe_entries'::text),
    (3, 'training_sessions'::text),
    (4, 'training_session_load_metrics'::text),
    (5, 'rpe_sync_pending'::text)
),
relations as materialized (
  select
    target.table_order,
    target.table_name,
    relation.oid as relation_oid,
    relation.relowner,
    relation.relacl,
    relation.relrowsecurity,
    relation.relforcerowsecurity,
    pg_catalog.pg_get_userbyid(relation.relowner) as table_owner
  from target_tables target
  left join pg_catalog.pg_namespace namespace
    on namespace.nspname = 'public'
  left join pg_catalog.pg_class relation
    on relation.relnamespace = namespace.oid
   and relation.relname = target.table_name
   and relation.relkind in ('r', 'p')
),
function_catalog as materialized (
  select
    proc.oid as function_oid,
    namespace.nspname as function_schema,
    proc.proname as function_name,
    pg_catalog.pg_get_function_identity_arguments(proc.oid) as identity_arguments,
    pg_catalog.pg_get_function_result(proc.oid) as result_type,
    pg_catalog.pg_get_userbyid(proc.proowner) as function_owner,
    language.lanname as function_language,
    case when proc.prosecdef then 'DEFINER' else 'INVOKER' end as security_mode,
    case proc.provolatile
      when 'i' then 'IMMUTABLE'
      when 's' then 'STABLE'
      else 'VOLATILE'
    end as volatility,
    proc.proconfig as function_config,
    proc.proacl,
    proc.proowner,
    pg_catalog.obj_description(proc.oid, 'pg_proc') as function_comment,
    pg_catalog.pg_get_functiondef(proc.oid) as function_definition
  from pg_catalog.pg_proc proc
  join pg_catalog.pg_namespace namespace
    on namespace.oid = proc.pronamespace
  join pg_catalog.pg_language language
    on language.oid = proc.prolang
  where proc.prokind = 'f'
    and language.lanname in ('sql', 'plpgsql')
    and namespace.nspname not in ('pg_catalog', 'information_schema')
)
select
  relation.table_name,
  relation.relation_oid is not null as table_exists,
  relation.table_owner,
  relation.relrowsecurity as rls_enabled,
  relation.relforcerowsecurity as force_rls,
  (
    select count(*)::integer
    from pg_catalog.pg_policy policy
    where policy.polrelid = relation.relation_oid
  ) as policy_count,
  coalesce(
    (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'policy_name', policy.polname,
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
            from pg_catalog.unnest(policy.polroles) policy_role(role_oid)
            left join pg_catalog.pg_roles role
              on role.oid = policy_role.role_oid
          ),
          'using', pg_catalog.pg_get_expr(policy.polqual, policy.polrelid),
          'with_check', pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid),
          'comment', pg_catalog.obj_description(policy.oid, 'pg_policy')
        )
        order by policy.polname
      )
      from pg_catalog.pg_policy policy
      where policy.polrelid = relation.relation_oid
    ),
    '[]'::jsonb
  ) as policies,
  coalesce(
    (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'policy_name', policy.polname,
          'command', case policy.polcmd
            when '*' then 'ALL'
            when 'r' then 'SELECT'
            when 'a' then 'INSERT'
            when 'w' then 'UPDATE'
            when 'd' then 'DELETE'
            else policy.polcmd::text
          end,
          'using', pg_catalog.pg_get_expr(policy.polqual, policy.polrelid),
          'with_check', pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid)
        )
        order by policy.polname
      )
      from pg_catalog.pg_policy policy
      where policy.polrelid = relation.relation_oid
        and policy.polpermissive
        and (
          0::oid = any(policy.polroles)
          or exists (
            select 1
            from pg_catalog.pg_roles role
            where role.rolname = 'authenticated'
              and role.oid = any(policy.polroles)
          )
        )
        and (
          pg_catalog.regexp_replace(
            coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), ''),
            '[[:space:]()]',
            '',
            'g'
          ) = 'true'
          or pg_catalog.regexp_replace(
            coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), ''),
            '[[:space:]()]',
            '',
            'g'
          ) = 'true'
        )
    ),
    '[]'::jsonb
  ) as dangerous_open_authenticated_policies,
  pg_catalog.jsonb_build_object(
    'PUBLIC', pg_catalog.jsonb_build_object(
      'direct', coalesce(
        (
          select pg_catalog.jsonb_agg(acl.privilege_type order by acl.privilege_type)
          from pg_catalog.aclexplode(
            coalesce(
              relation.relacl,
              pg_catalog.acldefault('r', relation.relowner)
            )
          ) acl
          where acl.grantee = 0
        ),
        '[]'::jsonb
      ),
      'effective', coalesce(
        (
          select pg_catalog.jsonb_agg(acl.privilege_type order by acl.privilege_type)
          from pg_catalog.aclexplode(
            coalesce(
              relation.relacl,
              pg_catalog.acldefault('r', relation.relowner)
            )
          ) acl
          where acl.grantee = 0
        ),
        '[]'::jsonb
      )
    ),
    'anon', pg_catalog.jsonb_build_object(
      'direct', coalesce(
        (
          select pg_catalog.jsonb_agg(acl.privilege_type order by acl.privilege_type)
          from pg_catalog.aclexplode(
            coalesce(
              relation.relacl,
              pg_catalog.acldefault('r', relation.relowner)
            )
          ) acl
          join pg_catalog.pg_roles role on role.oid = acl.grantee
          where role.rolname = 'anon'
        ),
        '[]'::jsonb
      ),
      'effective', coalesce(
        (
          select pg_catalog.jsonb_agg(privilege.name order by privilege.name)
          from (
            values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                   ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
          ) privilege(name)
          join pg_catalog.pg_roles role on role.rolname = 'anon'
          where pg_catalog.has_table_privilege(
            role.oid,
            relation.relation_oid,
            privilege.name
          )
        ),
        '[]'::jsonb
      )
    ),
    'authenticated', pg_catalog.jsonb_build_object(
      'direct', coalesce(
        (
          select pg_catalog.jsonb_agg(acl.privilege_type order by acl.privilege_type)
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
      'effective', coalesce(
        (
          select pg_catalog.jsonb_agg(privilege.name order by privilege.name)
          from (
            values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                   ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
          ) privilege(name)
          join pg_catalog.pg_roles role on role.rolname = 'authenticated'
          where pg_catalog.has_table_privilege(
            role.oid,
            relation.relation_oid,
            privilege.name
          )
        ),
        '[]'::jsonb
      )
    ),
    'service_role', pg_catalog.jsonb_build_object(
      'direct', coalesce(
        (
          select pg_catalog.jsonb_agg(acl.privilege_type order by acl.privilege_type)
          from pg_catalog.aclexplode(
            coalesce(
              relation.relacl,
              pg_catalog.acldefault('r', relation.relowner)
            )
          ) acl
          join pg_catalog.pg_roles role on role.oid = acl.grantee
          where role.rolname = 'service_role'
        ),
        '[]'::jsonb
      ),
      'effective', coalesce(
        (
          select pg_catalog.jsonb_agg(privilege.name order by privilege.name)
          from (
            values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                   ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
          ) privilege(name)
          join pg_catalog.pg_roles role on role.rolname = 'service_role'
          where pg_catalog.has_table_privilege(
            role.oid,
            relation.relation_oid,
            privilege.name
          )
        ),
        '[]'::jsonb
      )
    ),
    'other_explicit_grants', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'grantee', case
              when acl.grantee = 0 then 'PUBLIC'
              else grantee.rolname
            end,
            'grantor', pg_catalog.pg_get_userbyid(acl.grantor),
            'privilege', acl.privilege_type,
            'grantable', acl.is_grantable
          )
          order by
            case when acl.grantee = 0 then 'PUBLIC' else grantee.rolname end,
            acl.privilege_type
        )
        from pg_catalog.aclexplode(
          coalesce(
            relation.relacl,
            pg_catalog.acldefault('r', relation.relowner)
          )
        ) acl
        left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
        where acl.grantee <> relation.relowner
          and coalesce(grantee.rolname, 'PUBLIC') not in (
            'PUBLIC', 'anon', 'authenticated', 'service_role'
          )
      ),
      '[]'::jsonb
    )
  ) as table_grants,
  coalesce(
    (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'trigger_name', trigger.tgname,
          'enabled', case trigger.tgenabled
            when 'O' then 'ORIGIN'
            when 'D' then 'DISABLED'
            when 'R' then 'REPLICA'
            when 'A' then 'ALWAYS'
            else trigger.tgenabled::text
          end,
          'definition', pg_catalog.pg_get_triggerdef(trigger.oid, true),
          'function', trigger_function.oid::regprocedure::text,
          'function_owner', pg_catalog.pg_get_userbyid(trigger_function.proowner),
          'function_security', case
            when trigger_function.prosecdef then 'DEFINER'
            else 'INVOKER'
          end,
          'function_config', trigger_function.proconfig,
          'function_definition', pg_catalog.pg_get_functiondef(trigger_function.oid)
        )
        order by trigger.tgname
      )
      from pg_catalog.pg_trigger trigger
      join pg_catalog.pg_proc trigger_function
        on trigger_function.oid = trigger.tgfoid
      where trigger.tgrelid = relation.relation_oid
        and not trigger.tgisinternal
    ),
    '[]'::jsonb
  ) as triggers,
  coalesce(
    (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'direction', case
            when fk.conrelid = relation.relation_oid then 'OUTBOUND'
            else 'INBOUND'
          end,
          'constraint_name', fk.conname,
          'table', fk.conrelid::regclass::text,
          'referenced_table', fk.confrelid::regclass::text,
          'definition', pg_catalog.pg_get_constraintdef(fk.oid, true)
        )
        order by fk.conname
      )
      from pg_catalog.pg_constraint fk
      where fk.contype = 'f'
        and (
          fk.conrelid = relation.relation_oid
          or fk.confrelid = relation.relation_oid
        )
    ),
    '[]'::jsonb
  ) as foreign_keys,
  coalesce(
    (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'function', pg_catalog.format(
            '%I.%I(%s)',
            fn.function_schema,
            fn.function_name,
            fn.identity_arguments
          ),
          'result_type', fn.result_type,
          'owner', fn.function_owner,
          'language', fn.function_language,
          'security_mode', fn.security_mode,
          'volatility', fn.volatility,
          'config', fn.function_config,
          'comment', fn.function_comment,
          'access_kind', case
            when fn.function_definition ~* pg_catalog.format(
              '(insert[[:space:]]+into|update|delete[[:space:]]+from|merge[[:space:]]+into)[[:space:]]+(public[.])?%s([^a-z0-9_]|$)',
              relation.table_name
            ) then 'WRITES'
            else 'READS_OR_REFERENCES'
          end,
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
          'definition', fn.function_definition
        )
        order by fn.function_schema, fn.function_name,
          fn.identity_arguments
      )
      from function_catalog fn
      where fn.function_definition ~* pg_catalog.format(
          '(^|[^a-z0-9_])(public[.])?%s([^a-z0-9_]|$)',
          relation.table_name
        )
        or exists (
          select 1
          from pg_catalog.pg_depend dependency
          where dependency.classid = 'pg_catalog.pg_proc'::regclass
            and dependency.objid = fn.function_oid
            and dependency.refclassid = 'pg_catalog.pg_class'::regclass
            and dependency.refobjid = relation.relation_oid
        )
    ),
    '[]'::jsonb
  ) as related_functions
from relations relation
order by relation.table_order;
