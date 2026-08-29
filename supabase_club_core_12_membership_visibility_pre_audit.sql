-- BLOQUE 1.5 - Auditoria remota previa, estrictamente READ ONLY.
--
-- Ejecutar el archivo completo en Supabase SQL Editor.
-- Devuelve una unica tabla con secciones de tabla, triggers, funciones,
-- inventario, clubs y candidatos PLAYER_A/PLAYER_B.
-- No ejecuta helpers ni modifica catalogo, Auth o datos.

with
membership_relation as materialized (
  select
    relation.oid as relation_oid,
    relation.relowner,
    relation.relacl,
    relation.relrowsecurity,
    relation.relforcerowsecurity
  from pg_catalog.pg_class relation
  join pg_catalog.pg_namespace namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = 'club_memberships'
    and relation.relkind in ('r', 'p')
),
function_targets(object_order, object_name, signature) as (
  values
    (20, 'guard_club_membership_mutation'::text,
      'public.guard_club_membership_mutation()'::text),
    (21, 'current_membership'::text,
      'public.current_membership()'::text),
    (22, 'current_jugador_id'::text,
      'public.current_jugador_id()'::text),
    (23, 'is_player'::text,
      'public.is_player()'::text),
    (24, 'is_app_staff'::text,
      'public.is_app_staff()'::text),
    (25, 'is_club_member'::text,
      'public.is_club_member(uuid)'::text),
    (26, 'has_club_role'::text,
      'public.has_club_role(uuid,text[])'::text),
    (27, 'can_manage_club'::text,
      'public.can_manage_club(uuid)'::text)
),
target_functions as materialized (
  select
    target.object_order,
    target.object_name,
    target.signature,
    pg_catalog.to_regprocedure(target.signature)::oid as function_oid
  from function_targets target
),
wellness_stats as materialized (
  select
    entry.jugador_id,
    count(*)::integer as row_count,
    count(distinct entry.entry_date)::integer as distinct_days,
    min(entry.entry_date) as first_date,
    max(entry.entry_date) as last_date
  from public.wellness_entries entry
  group by entry.jugador_id
),
rpe_stats as materialized (
  select
    entry.jugador_id,
    count(*)::integer as row_count,
    count(distinct entry.entry_date)::integer as distinct_days,
    min(entry.entry_date) as first_date,
    max(entry.entry_date) as last_date
  from public.rpe_entries entry
  group by entry.jugador_id
),
candidate_players as materialized (
  select
    jugador.id as jugador_id,
    jugador.name as jugador_name,
    wellness.row_count as wellness_rows,
    wellness.distinct_days as wellness_days,
    wellness.first_date as wellness_first_date,
    wellness.last_date as wellness_last_date,
    rpe.row_count as rpe_rows,
    rpe.distinct_days as rpe_days,
    rpe.first_date as rpe_first_date,
    rpe.last_date as rpe_last_date,
    pg_catalog.row_number() over (
      order by
        least(wellness.distinct_days, rpe.distinct_days) desc,
        wellness.row_count + rpe.row_count desc,
        jugador.id
    )::integer as candidate_rank
  from public.jugadores jugador
  join wellness_stats wellness on wellness.jugador_id = jugador.id
  join rpe_stats rpe on rpe.jugador_id = jugador.id
  where wellness.row_count > 0
    and rpe.row_count > 0
    and not exists (
      select 1
      from public.club_memberships membership
      where membership.jugador_id = jugador.id
        and membership.is_active
    )
),
table_audit as (
  select
    1 as object_order,
    'MEMBERSHIP_TABLE'::text as section,
    'public.club_memberships'::text as object_name,
    pg_catalog.jsonb_build_object(
      'exists', membership.relation_oid is not null,
      'owner', pg_catalog.pg_get_userbyid(membership.relowner),
      'rls_enabled', membership.relrowsecurity,
      'force_rls', membership.relforcerowsecurity,
      'columns', coalesce(
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
              )
            )
            order by attribute.attnum
          )
          from pg_catalog.pg_attribute attribute
          left join pg_catalog.pg_attrdef attribute_default
            on attribute_default.adrelid = attribute.attrelid
           and attribute_default.adnum = attribute.attnum
          where attribute.attrelid = membership.relation_oid
            and attribute.attnum > 0
            and not attribute.attisdropped
        ),
        '[]'::jsonb
      ),
      'constraints', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'name', constraint_row.conname,
              'type', constraint_row.contype,
              'definition', pg_catalog.pg_get_constraintdef(
                constraint_row.oid,
                true
              ),
              'deferrable', constraint_row.condeferrable,
              'initially_deferred', constraint_row.condeferred
            )
            order by constraint_row.conname
          )
          from pg_catalog.pg_constraint constraint_row
          where constraint_row.conrelid = membership.relation_oid
        ),
        '[]'::jsonb
      ),
      'indexes', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'name', index_class.relname,
              'definition', pg_catalog.pg_get_indexdef(index_row.indexrelid)
            )
            order by index_class.relname
          )
          from pg_catalog.pg_index index_row
          join pg_catalog.pg_class index_class
            on index_class.oid = index_row.indexrelid
          where index_row.indrelid = membership.relation_oid
        ),
        '[]'::jsonb
      ),
      'policies', coalesce(
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
              ),
              'comment', pg_catalog.obj_description(policy.oid, 'pg_policy')
            )
            order by policy.polname
          )
          from pg_catalog.pg_policy policy
          where policy.polrelid = membership.relation_oid
        ),
        '[]'::jsonb
      ),
      'acl', coalesce(
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
              membership.relacl,
              pg_catalog.acldefault('r', membership.relowner)
            )
          ) acl
          left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
        ),
        '[]'::jsonb
      ),
      'effective_privileges', (
        select pg_catalog.jsonb_object_agg(
          role_name,
          privileges
          order by role_name
        )
        from (
          select
            requested_role.role_name,
            coalesce(
              (
                select pg_catalog.jsonb_agg(
                  privilege.name
                  order by privilege.name
                )
                from (
                  values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                         ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
                ) privilege(name)
                join pg_catalog.pg_roles actual_role
                  on actual_role.rolname = requested_role.role_name
                where pg_catalog.has_table_privilege(
                  actual_role.oid,
                  membership.relation_oid,
                  privilege.name
                )
              ),
              '[]'::jsonb
            ) as privileges
          from (
            values
              ('anon'::text),
              ('authenticated'::text),
              ('service_role'::text)
          ) requested_role(role_name)
          union all
          select
            'PUBLIC'::text,
            coalesce(
              (
                select pg_catalog.jsonb_agg(
                  acl.privilege_type
                  order by acl.privilege_type
                )
                from pg_catalog.aclexplode(
                  coalesce(
                    membership.relacl,
                    pg_catalog.acldefault('r', membership.relowner)
                  )
                ) acl
                where acl.grantee = 0
              ),
              '[]'::jsonb
            )
        ) privilege_rows
      )
    ) as details,
    null::text as definition
  from membership_relation membership
),
trigger_audit as (
  select
    10 + pg_catalog.row_number() over (order by trigger.tgname)::integer
      as object_order,
    'TRIGGER'::text as section,
    pg_catalog.format('public.club_memberships.%I', trigger.tgname)
      as object_name,
    pg_catalog.jsonb_build_object(
      'enabled', case trigger.tgenabled
        when 'O' then 'ORIGIN'
        when 'D' then 'DISABLED'
        when 'R' then 'REPLICA'
        when 'A' then 'ALWAYS'
        else trigger.tgenabled::text
      end,
      'definition', pg_catalog.pg_get_triggerdef(trigger.oid, true),
      'function', trigger.tgfoid::regprocedure::text,
      'function_owner', pg_catalog.pg_get_userbyid(proc.proowner),
      'function_security', case
        when proc.prosecdef then 'DEFINER'
        else 'INVOKER'
      end,
      'function_config', proc.proconfig
    ) as details,
    pg_catalog.pg_get_functiondef(proc.oid) as definition
  from membership_relation membership
  join pg_catalog.pg_trigger trigger
    on trigger.tgrelid = membership.relation_oid
   and not trigger.tgisinternal
  join pg_catalog.pg_proc proc on proc.oid = trigger.tgfoid
),
function_audit as (
  select
    target.object_order,
    'FUNCTION'::text as section,
    target.signature as object_name,
    pg_catalog.jsonb_build_object(
      'exists', proc.oid is not null,
      'oid', proc.oid,
      'owner', pg_catalog.pg_get_userbyid(proc.proowner),
      'arguments', case when proc.oid is null then null else
        pg_catalog.pg_get_function_identity_arguments(proc.oid)
      end,
      'result_type', case when proc.oid is null then null else
        pg_catalog.pg_get_function_result(proc.oid)
      end,
      'language', language.lanname,
      'security_mode', case
        when proc.oid is null then null
        when proc.prosecdef then 'DEFINER'
        else 'INVOKER'
      end,
      'volatility', case proc.provolatile
        when 'i' then 'IMMUTABLE'
        when 's' then 'STABLE'
        when 'v' then 'VOLATILE'
        else null
      end,
      'config', proc.proconfig,
      'comment', pg_catalog.obj_description(proc.oid, 'pg_proc'),
      'execute_acl', case when proc.oid is null then '[]'::jsonb else
        (
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
            coalesce(proc.proacl, pg_catalog.acldefault('f', proc.proowner))
          ) acl
          left join pg_catalog.pg_roles grantee on grantee.oid = acl.grantee
          where acl.privilege_type = 'EXECUTE'
        )
      end
    ) as details,
    case
      when proc.oid is null then null::text
      else pg_catalog.pg_get_functiondef(proc.oid)
    end as definition
  from target_functions target
  left join pg_catalog.pg_proc proc on proc.oid = target.function_oid
  left join pg_catalog.pg_language language on language.oid = proc.prolang
),
inventory_audit as (
  select
    30 as object_order,
    'INVENTORY'::text as section,
    'public.club_memberships'::text as object_name,
    pg_catalog.jsonb_build_object(
      'memberships_total', count(*),
      'memberships_active', count(*) filter (where membership.is_active),
      'owners', count(*) filter (
        where membership.is_active and membership.role = 'owner'
      ),
      'admins', count(*) filter (
        where membership.is_active and membership.role = 'admin'
      ),
      'staff', count(*) filter (
        where membership.is_active and membership.role = 'staff'
      ),
      'viewers', count(*) filter (
        where membership.is_active and membership.role = 'viewer'
      ),
      'players', count(*) filter (
        where membership.is_active and membership.role = 'player'
      ),
      'linked_players', count(*) filter (
        where membership.is_active and membership.jugador_id is not null
      ),
      'eligible_player_candidates', (
        select count(*) from candidate_players
      )
    ) as details,
    null::text as definition
  from public.club_memberships membership
),
club_audit as (
  select
    40 + pg_catalog.row_number() over (order by club.id)::integer
      as object_order,
    'CLUB_CONTEXT'::text as section,
    club.id::text as object_name,
    pg_catalog.jsonb_build_object(
      'club_id', club.id,
      'club_name', club.name,
      'active_memberships', count(membership.id) filter (
        where membership.is_active
      ),
      'active_owners', count(membership.id) filter (
        where membership.is_active and membership.role = 'owner'
      ),
      'active_staff', count(membership.id) filter (
        where membership.is_active
          and membership.role in ('owner', 'admin', 'staff')
      )
    ) as details,
    null::text as definition
  from public.clubs club
  left join public.club_memberships membership on membership.club_id = club.id
  group by club.id, club.name
),
candidate_audit as (
  select
    100 + candidate.candidate_rank as object_order,
    'PLAYER_CANDIDATE'::text as section,
    candidate.jugador_id::text as object_name,
    pg_catalog.jsonb_build_object(
      'candidate_rank', candidate.candidate_rank,
      'jugador_id', candidate.jugador_id,
      'jugador_name', candidate.jugador_name,
      'wellness_rows', candidate.wellness_rows,
      'wellness_days', candidate.wellness_days,
      'wellness_first_date', candidate.wellness_first_date,
      'wellness_last_date', candidate.wellness_last_date,
      'rpe_rows', candidate.rpe_rows,
      'rpe_days', candidate.rpe_days,
      'rpe_first_date', candidate.rpe_first_date,
      'rpe_last_date', candidate.rpe_last_date,
      'already_linked_to_active_membership', false
    ) as details,
    null::text as definition
  from candidate_players candidate
  where candidate.candidate_rank <= 10
)
select
  section,
  object_name,
  details,
  definition
from (
  select * from table_audit
  union all
  select * from trigger_audit
  union all
  select * from function_audit
  union all
  select * from inventory_audit
  union all
  select * from club_audit
  union all
  select * from candidate_audit
) audit_rows
order by object_order;
