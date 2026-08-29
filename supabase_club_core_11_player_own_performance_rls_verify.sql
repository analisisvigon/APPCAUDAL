-- BLOQUE 1.4 - Verificacion posterior READ ONLY.
--
-- Ejecutar el archivo completo despues de la migracion del Bloque 1.4.
-- Devuelve una unica tabla de cinco filas. No ejecuta helpers y no modifica
-- usuarios, memberships, policies ni datos.
--
-- PENDIENTE: la prueba funcional PLAYER requiere una identidad Auth real y una
-- membership PLAYER controlada. No se simula alterando identidades STAFF.
--
-- RIESGO BLOQUEANTE ANTES DEL FRONTEND PLAYER:
-- Revisar club_memberships."Club members can read memberships", actualmente
-- (user_id = auth.uid()) OR is_club_member(club_id).

with
roles as (
  select
    max(role.oid) filter (where role.rolname = 'authenticated')
      as authenticated_oid,
    max(role.oid) filter (where role.rolname = 'anon') as anon_oid
  from pg_catalog.pg_roles role
),
targets(table_order, table_name, expects_player_select) as (
  values
    (1, 'wellness_entries'::text, true),
    (2, 'rpe_entries'::text, true),
    (3, 'training_sessions'::text, false),
    (4, 'training_session_load_metrics'::text, false),
    (5, 'rpe_sync_pending'::text, false)
),
relations as materialized (
  select
    target.table_order,
    target.table_name,
    target.expects_player_select,
    relation.oid as relation_oid,
    relation.relrowsecurity,
    relation.relforcerowsecurity
  from targets target
  left join pg_catalog.pg_namespace namespace
    on namespace.nspname = 'public'
  left join pg_catalog.pg_class relation
    on relation.relnamespace = namespace.oid
   and relation.relname = target.table_name
   and relation.relkind in ('r', 'p')
),
policy_inventory as materialized (
  select
    relation.table_name,
    relation.relation_oid,
    policy.oid as policy_oid,
    policy.polname as policy_name,
    policy.polpermissive as permissive,
    policy.polcmd as command,
    policy.polroles as policy_roles,
    policy.polqual,
    policy.polwithcheck,
    pg_catalog.pg_get_expr(policy.polqual, policy.polrelid) as using_expression,
    pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid)
      as check_expression,
    pg_catalog.replace(
      pg_catalog.regexp_replace(
        pg_catalog.lower(
          coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')
        ),
        '[[:space:]()]',
        '',
        'g'
      ),
      'public.',
      ''
    ) as normalized_using,
    pg_catalog.replace(
      pg_catalog.regexp_replace(
        pg_catalog.lower(
          coalesce(
            pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid),
            ''
          )
        ),
        '[[:space:]()]',
        '',
        'g'
      ),
      'public.',
      ''
    ) as normalized_check
  from relations relation
  join pg_catalog.pg_policy policy on policy.polrelid = relation.relation_oid
),
expected_staff(policy_name, command, needs_using, needs_check) as (
  values
    ('performance_staff_select'::text, 'r'::"char", true, false),
    ('performance_staff_insert'::text, 'a'::"char", false, true),
    ('performance_staff_update'::text, 'w'::"char", true, true),
    ('performance_staff_delete'::text, 'd'::"char", true, false)
),
staff_checks as (
  select
    relation.table_name,
    pg_catalog.bool_and(
      policy.policy_oid is not null
      and policy.permissive
      and policy.command = expected.command
      and policy.policy_roles = array[roles.authenticated_oid]::oid[]
      and case
        when expected.needs_using
          then policy.normalized_using = 'is_app_staff'
        else policy.polqual is null
      end
      and case
        when expected.needs_check
          then policy.normalized_check = 'is_app_staff'
        else policy.polwithcheck is null
      end
    ) as staff_contract_ok,
    pg_catalog.bool_and(
      case when expected.policy_name = 'performance_staff_select' then
        policy.policy_oid is not null
        and policy.command = 'r'
        and policy.normalized_using = 'is_app_staff'
      else true end
    ) as staff_select_ok,
    pg_catalog.bool_and(
      case when expected.policy_name = 'performance_staff_insert' then
        policy.policy_oid is not null
        and policy.command = 'a'
        and policy.normalized_check = 'is_app_staff'
      else true end
    ) as staff_insert_ok,
    pg_catalog.bool_and(
      case when expected.policy_name = 'performance_staff_update' then
        policy.policy_oid is not null
        and policy.command = 'w'
        and policy.normalized_using = 'is_app_staff'
        and policy.normalized_check = 'is_app_staff'
      else true end
    ) as staff_update_ok,
    pg_catalog.bool_and(
      case when expected.policy_name = 'performance_staff_delete' then
        policy.policy_oid is not null
        and policy.command = 'd'
        and policy.normalized_using = 'is_app_staff'
      else true end
    ) as staff_delete_ok
  from relations relation
  cross join expected_staff expected
  cross join roles
  left join policy_inventory policy
    on policy.relation_oid = relation.relation_oid
   and policy.policy_name = expected.policy_name
  group by relation.table_name
),
audited as (
  select
    relation.table_order,
    relation.table_name,
    relation.relation_oid is not null as table_exists,
    relation.relrowsecurity as rls_enabled,
    relation.relforcerowsecurity as force_rls,
    staff.staff_select_ok,
    staff.staff_insert_ok,
    staff.staff_update_ok,
    staff.staff_delete_ok,
    staff.staff_contract_ok,
    relation.expects_player_select,
    (
      select count(*)::integer
      from policy_inventory policy
      where policy.relation_oid = relation.relation_oid
        and (
          policy.policy_name = 'performance_player_select_own'
          or policy.normalized_using like '%is_player%'
          or policy.normalized_using like '%current_jugador_id%'
          or policy.normalized_check like '%is_player%'
          or policy.normalized_check like '%current_jugador_id%'
        )
    ) as player_policy_count,
    (
      select count(*)::integer
      from policy_inventory policy
      cross join roles
      where policy.relation_oid = relation.relation_oid
        and policy.policy_name = 'performance_player_select_own'
        and policy.permissive
        and policy.command = 'r'
        and policy.policy_roles = array[roles.authenticated_oid]::oid[]
        and policy.polwithcheck is null
        and policy.normalized_using =
          'is_playerandjugador_id=current_jugador_id'
    ) as valid_player_select_count,
    (
      select count(*)::integer
      from policy_inventory policy
      where policy.relation_oid = relation.relation_oid
        and policy.command <> 'r'
        and (
          policy.policy_name ilike '%player%'
          or policy.normalized_using like '%is_player%'
          or policy.normalized_using like '%current_jugador_id%'
          or policy.normalized_check like '%is_player%'
          or policy.normalized_check like '%current_jugador_id%'
        )
    ) as player_write_policy_count,
    (
      select count(*)::integer
      from policy_inventory policy
      where policy.relation_oid = relation.relation_oid
        and (
          policy.normalized_using = 'true'
          or policy.normalized_check = 'true'
        )
    ) as open_true_policy_count,
    (
      select count(*)::integer
      from policy_inventory policy
      cross join roles
      where policy.relation_oid = relation.relation_oid
        and exists (
          select 1
          from pg_catalog.unnest(policy.policy_roles)
            policy_role(role_oid)
          where policy_role.role_oid in (
            0::oid,
            roles.authenticated_oid,
            roles.anon_oid
          )
        )
        and not (
          policy.policy_name in (
            'performance_staff_select',
            'performance_staff_insert',
            'performance_staff_update',
            'performance_staff_delete'
          )
          or (
            relation.expects_player_select
            and policy.policy_name = 'performance_player_select_own'
          )
        )
    ) as unexpected_client_policy_count,
    case
      when relation.table_name = 'rpe_entries' then exists (
        select 1
        from pg_catalog.pg_attribute attribute
        where attribute.attrelid = relation.relation_oid
          and attribute.attname = 'session_id'
          and attribute.atttypid = 'uuid'::regtype
          and not attribute.attnotnull
          and attribute.attnum > 0
          and not attribute.attisdropped
      )
      else null::boolean
    end as rpe_session_id_nullable,
    coalesce(
      (
        select pg_catalog.has_table_privilege(
          roles.authenticated_oid,
          relation.relation_oid,
          'SELECT'
        )
        from roles
      ),
      false
    ) as authenticated_select_grant,
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'name', policy.policy_name,
            'command', case policy.command
              when 'r' then 'SELECT'
              when 'a' then 'INSERT'
              when 'w' then 'UPDATE'
              when 'd' then 'DELETE'
              when '*' then 'ALL'
              else policy.command::text
            end,
            'using', policy.using_expression,
            'with_check', policy.check_expression
          )
          order by policy.policy_name
        )
        from policy_inventory policy
        where policy.relation_oid = relation.relation_oid
      ),
      '[]'::jsonb
    ) as policies
  from relations relation
  join staff_checks staff on staff.table_name = relation.table_name
)
select
  table_name,
  table_exists,
  rls_enabled,
  force_rls,
  staff_select_ok,
  staff_insert_ok,
  staff_update_ok,
  staff_delete_ok,
  staff_contract_ok,
  expects_player_select,
  player_policy_count,
  valid_player_select_count,
  player_write_policy_count,
  open_true_policy_count,
  unexpected_client_policy_count,
  authenticated_select_grant,
  rpe_session_id_nullable,
  case
    when expects_player_select then 'STAFF_ALL_AND_PLAYER_OWN_SELECT'
    else 'STAFF_ONLY'
  end as expected_access_contract,
  case
    when expects_player_select then 'PENDING_REAL_AUTH_PLAYER_IDENTITY'
    else 'NOT_APPLICABLE'
  end as functional_player_test,
  coalesce(
    table_exists
    and rls_enabled
    and staff_contract_ok
    and authenticated_select_grant
    and player_write_policy_count = 0
    and open_true_policy_count = 0
    and unexpected_client_policy_count = 0
    and case
      when expects_player_select then
        player_policy_count = 1
        and valid_player_select_count = 1
      else
        player_policy_count = 0
        and valid_player_select_count = 0
      end
    and case
      when table_name = 'rpe_entries' then rpe_session_id_nullable
      else true
    end,
    false
  ) as test_ok,
  policies,
  'BLOCKER_BEFORE_PLAYER_FRONTEND: review club_memberships policy "Club members can read memberships"'::text
    as registered_risk
from audited
order by table_order;
