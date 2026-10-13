-- APPCAUDAL Change 35: one-click, read-only structural verification.
-- One WITH ... SELECT returns every check and a final GLOBAL result.
-- PASS is returned only when every mandatory check passes. The identity-based
-- transactional probe is a separate file and is not replaced by this query.

with
expected_columns(column_name, type_oid, is_not_null, expected_default) as (
  values
    ('id'::name, 'uuid'::regtype::oid, true, 'gen_random_uuid()'::text),
    ('club_id'::name, 'uuid'::regtype::oid, true, null::text),
    ('club_team_season_id'::name, 'uuid'::regtype::oid, true, null::text),
    ('membership_id'::name, 'uuid'::regtype::oid, true, null::text),
    ('created_at'::name, 'timestamptz'::regtype::oid, true, 'now()'::text)
),
actual_columns as (
  select a.attname as column_name, a.atttypid as type_oid,
    a.attnotnull as is_not_null,
    pg_get_expr(d.adbin, d.adrelid) as actual_default,
    format_type(a.atttypid, a.atttypmod) as data_type
  from pg_attribute a
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = to_regclass('public.club_team_season_permissions')
    and a.attnum > 0 and not a.attisdropped
),
column_checks as (
  select (select count(*) from actual_columns) = 5
    and not exists (
      select 1 from expected_columns e
      full join actual_columns a using (column_name)
      where e.column_name is null or a.column_name is null
        or e.type_oid is distinct from a.type_oid
        or e.is_not_null is distinct from a.is_not_null
        or e.expected_default is distinct from a.actual_default
    ) as exact_column_contract_ok
),
permission_attributes as (
  select max(attnum) filter (where attname = 'id') as id_attnum,
    max(attnum) filter (where attname = 'club_id') as club_attnum,
    max(attnum) filter (where attname = 'club_team_season_id') as relation_attnum,
    max(attnum) filter (where attname = 'membership_id') as membership_attnum
  from pg_attribute
  where attrelid = to_regclass('public.club_team_season_permissions')
    and not attisdropped
),
relation_attributes as (
  select max(attnum) filter (where attname = 'id') as id_attnum,
    max(attnum) filter (where attname = 'club_id') as club_attnum
  from pg_attribute
  where attrelid = to_regclass('public.club_team_seasons')
    and not attisdropped
),
membership_attributes as (
  select max(attnum) filter (where attname = 'id') as id_attnum,
    max(attnum) filter (where attname = 'club_id') as club_attnum
  from pg_attribute
  where attrelid = to_regclass('public.club_memberships')
    and not attisdropped
),
constraint_checks as (
  select
    (select count(*) from pg_constraint
     where conrelid = to_regclass('public.club_team_season_permissions')) = 4
      as exact_permission_constraint_count,
    exists (
      select 1 from pg_index i cross join relation_attributes a
      where i.indexrelid = to_regclass('public.club_team_seasons_id_club_uidx')
        and i.indrelid = to_regclass('public.club_team_seasons')
        and i.indisunique and i.indisvalid and i.indisready
        and i.indnkeyatts = 2 and i.indnatts = 2
        and i.indpred is null and i.indexprs is null
        and i.indkey::text = a.id_attnum::text || ' ' || a.club_attnum::text
    ) as relation_id_club_unique_index_ok,
    exists (
      select 1 from pg_constraint c cross join permission_attributes a
      where c.conrelid = to_regclass('public.club_team_season_permissions')
        and c.contype = 'p' and c.convalidated and not c.condeferrable
        and c.conkey = array[a.id_attnum]::smallint[]
    ) as primary_key_ok,
    exists (
      select 1 from pg_constraint c cross join permission_attributes a
      where c.conrelid = to_regclass('public.club_team_season_permissions')
        and c.contype = 'u' and c.convalidated and not c.condeferrable
        and c.conkey = array[a.membership_attnum, a.relation_attnum]::smallint[]
    ) as no_duplicate_assignment_ok,
    exists (
      select 1 from pg_constraint c
      cross join permission_attributes p cross join relation_attributes r
      where c.conrelid = to_regclass('public.club_team_season_permissions')
        and c.contype = 'f'
        and c.confrelid = to_regclass('public.club_team_seasons')
        and c.conkey = array[p.relation_attnum, p.club_attnum]::smallint[]
        and c.confkey = array[r.id_attnum, r.club_attnum]::smallint[]
        and c.confupdtype = 'a' and c.confdeltype = 'r'
        and c.convalidated and not c.condeferrable
    ) as relation_same_club_restrict_fk_ok,
    exists (
      select 1 from pg_constraint c
      cross join permission_attributes p cross join membership_attributes m
      where c.conrelid = to_regclass('public.club_team_season_permissions')
        and c.contype = 'f'
        and c.confrelid = to_regclass('public.club_memberships')
        and c.conkey = array[p.membership_attnum, p.club_attnum]::smallint[]
        and c.confkey = array[m.id_attnum, m.club_attnum]::smallint[]
        and c.confupdtype = 'a' and c.confdeltype = 'c'
        and c.convalidated and not c.condeferrable
    ) as membership_same_club_cascade_fk_ok
),
index_checks as (
  select exists (
    select 1 from pg_index i cross join permission_attributes a
    where i.indexrelid = to_regclass('public.club_team_season_permissions_club_relation_idx')
      and i.indrelid = to_regclass('public.club_team_season_permissions')
      and i.indisvalid and i.indisready and not i.indisunique
      and i.indnkeyatts = 3 and i.indnatts = 3
      and i.indpred is null and i.indexprs is null
      and i.indkey::text = a.club_attnum::text || ' ' ||
        a.relation_attnum::text || ' ' || a.membership_attnum::text
  ) as permission_lookup_index_ok
),
integrity_counts as (
  select
    count(*) filter (
      where relation.id is null or membership.id is null
        or p.club_id is distinct from relation.club_id
        or p.club_id is distinct from membership.club_id
    ) as invalid_or_cross_club_assignments,
    count(*) filter (where membership.role = 'player') as player_rows,
    count(*) filter (where membership.role <> 'staff' or not membership.is_active)
      as ineligible_assignments_that_should_have_been_revoked
  from public.club_team_season_permissions p
  left join public.club_team_seasons relation
    on relation.id = p.club_team_season_id and relation.club_id = p.club_id
  left join public.club_memberships membership
    on membership.id = p.membership_id and membership.club_id = p.club_id
),
integrity_checks as (
  select i.*,
    not exists (
      select 1 from public.club_team_season_permissions
      group by membership_id, club_team_season_id having count(*) > 1
    ) as no_duplicate_rows
  from integrity_counts i
),
policy_text as (
  select p.polname, p.polcmd, p.polpermissive, p.polroles,
    p.polqual, p.polwithcheck,
    regexp_replace(lower(pg_get_expr(p.polqual, p.polrelid)),
      '[[:space:]()]', '', 'g') as using_compact,
    regexp_replace(lower(pg_get_expr(p.polwithcheck, p.polrelid)),
      '[[:space:]()]', '', 'g') as check_compact
  from pg_policy p
  where p.polrelid = to_regclass('public.club_team_season_permissions')
),
policy_qualified as (
  select polname, polcmd, polpermissive, polroles, polqual, polwithcheck,
    regexp_replace(replace(replace(replace(replace(using_compact,
      'public.club_team_season_permissions.club_id', 'club_id'),
      'club_team_season_permissions.club_id', 'club_id'),
      'public.club_team_season_permissions.membership_id', 'membership_id'),
      'club_team_season_permissions.membership_id', 'membership_id'),
      '^public[.]', '') as using_qualified,
    regexp_replace(replace(replace(replace(replace(check_compact,
      'public.club_team_season_permissions.club_id', 'club_id'),
      'club_team_season_permissions.club_id', 'club_id'),
      'public.club_team_season_permissions.membership_id', 'membership_id'),
      'club_team_season_permissions.membership_id', 'membership_id'),
      '^public[.]', '') as check_qualified
  from policy_text
),
normalized_policies as (
  select polname, polcmd, polpermissive, polroles, polqual, polwithcheck,
    -- Remove only casts after known columns, a closing quote or a closing
    -- array bracket. Do not rewrite text inside the owner-role literal.
    replace(replace(replace(replace(replace(replace(replace(replace(
      using_qualified,
      'club_id::uuid', 'club_id'), 'membership_id::uuid', 'membership_id'),
      '''::pg_catalog.text[]', ''''), '''::text[]', ''''),
      '''::pg_catalog.text', ''''), '''::text', ''''),
      ']::pg_catalog.text[]', ']'), ']::text[]', ']') as using_expr,
    replace(replace(replace(replace(replace(replace(replace(replace(
      check_qualified,
      'club_id::uuid', 'club_id'), 'membership_id::uuid', 'membership_id'),
      '''::pg_catalog.text[]', ''''), '''::text[]', ''''),
      '''::pg_catalog.text', ''''), '''::text', ''''),
      ']::pg_catalog.text[]', ']'), ']::text[]', ']') as check_expr
  from policy_qualified
),
policy_checks as (
  select
    (select count(*) from normalized_policies) = 3 as exact_policy_count,
    exists (
      select 1 from normalized_policies
      where polname = 'club_team_season_permissions_manager_select'
        and polcmd = 'r' and polpermissive
        and polroles = array[(select oid from pg_roles where rolname = 'authenticated')]::oid[]
        and using_expr in (
          'has_club_roleclub_id,array[''owner'']',
          'has_club_roleclub_id,''{owner}''')
        and check_expr is null
    ) as manager_select_ok,
    exists (
      select 1 from normalized_policies
      where polname = 'club_team_season_permissions_manager_insert'
        and polcmd = 'a' and polpermissive
        and polroles = array[(select oid from pg_roles where rolname = 'authenticated')]::oid[]
        and using_expr is null
        and check_expr = 'can_assign_club_team_season_permissionclub_id,membership_id'
    ) as manager_insert_without_self_grant_ok,
    exists (
      select 1 from normalized_policies
      where polname = 'club_team_season_permissions_manager_delete'
        and polcmd = 'd' and polpermissive
        and polroles = array[(select oid from pg_roles where rolname = 'authenticated')]::oid[]
        and using_expr in (
          'has_club_roleclub_id,array[''owner'']',
          'has_club_roleclub_id,''{owner}''')
        and check_expr is null
    ) as manager_delete_ok,
    not exists (select 1 from normalized_policies where polcmd in ('w', '*'))
      as no_update_or_all_policy
),
owner_contract as (
  select
    (select count(*) from normalized_policies
     where polname in (
       'club_team_season_permissions_manager_select',
       'club_team_season_permissions_manager_delete')
       and using_expr in (
         'has_club_roleclub_id,array[''owner'']',
         'has_club_roleclub_id,''{owner}''')) = 2
      as select_and_delete_owner_only,
    position('public.has_club_role(target_club_id, array[''owner'']::text[])'
      in lower(pg_get_functiondef(to_regprocedure(
        'public.can_assign_club_team_season_permission(uuid,uuid)')))) > 0
      as grant_owner_only,
    position('public.has_club_role(new.club_id, array[''owner'']::text[]) is not true'
      in lower(pg_get_functiondef(to_regprocedure(
        'public.guard_club_team_season_permission_mutation()')))) > 0
      as insertion_guard_owner_only,
    position('membership.is_active' in lower(pg_get_functiondef(
      to_regprocedure('public.has_club_role(uuid,text[])')))) > 0
      as active_membership_required,
    position('membership.role = any(allowed_roles)' in lower(pg_get_functiondef(
      to_regprocedure('public.has_club_role(uuid,text[])')))) > 0
      as role_list_enforced
),
trigger_checks as (
  select
    exists (
      select 1 from pg_trigger t
      where t.tgrelid = to_regclass('public.club_team_season_permissions')
        and t.tgname = 'guard_club_team_season_permission_mutation'
        and t.tgfoid = to_regprocedure(
          'public.guard_club_team_season_permission_mutation()')
        and t.tgenabled = 'O' and t.tgtype = 23
        and not t.tgisinternal
    ) as permission_insert_update_guard_ok,
    exists (
      select 1 from pg_trigger t
      where t.tgrelid = to_regclass('public.club_memberships')
        and t.tgname = 'guard_club_membership_mutation'
        and t.tgfoid = to_regprocedure('public.guard_club_membership_mutation()')
        and t.tgenabled = 'O' and (t.tgtype & 2) = 2
        and (t.tgtype & 16) = 16 and not t.tgisinternal
    ) as existing_before_update_guard_preserved,
    exists (
      select 1 from pg_trigger t
      where t.tgrelid = to_regclass('public.club_memberships')
        and t.tgname = 'revoke_ineligible_club_team_season_permissions'
        and t.tgfoid = to_regprocedure(
          'public.revoke_ineligible_club_team_season_permissions()')
        and t.tgenabled = 'O' and t.tgtype = 17
        and t.tgqual is null and t.tgattr::text = ''
        and not t.tgisinternal
    ) as after_every_update_revocation_trigger_ok,
    (select count(*) from pg_trigger t
     where t.tgrelid = to_regclass('public.club_memberships')
       and t.tgname = 'revoke_ineligible_club_team_season_permissions'
       and not t.tgisinternal) = 1 as no_duplicate_revocation_trigger
),
function_definitions as (
  select
    lower(pg_get_functiondef(to_regprocedure(
      'public.revoke_ineligible_club_team_season_permissions()'))) as revoke_def,
    lower(pg_get_functiondef(to_regprocedure(
      'public.guard_club_team_season_permission_mutation()'))) as guard_def,
    lower(pg_get_functiondef(to_regprocedure(
      'public.can_assign_club_team_season_permission(uuid,uuid)'))) as assign_def,
    lower(pg_get_functiondef(to_regprocedure(
      'public.can_read_club_team_season(uuid)'))) as read_def
),
function_checks as (
  select
    position('old.role = ''staff''' in revoke_def) > 0 as revokes_only_prior_staff,
    position('new.role <> ''staff''' in revoke_def) > 0 as revokes_on_role_change,
    position('not new.is_active' in revoke_def) > 0 as revokes_on_deactivation,
    position('delete from public.club_team_season_permissions' in revoke_def) > 0
      as deletes_assignments,
    position('permission.membership_id = old.id' in revoke_def) > 0
      as limits_delete_to_membership,
    position('insert into' in revoke_def) = 0 as never_restores_assignments,
    position('public.has_club_role(new.club_id, array[''owner'']::text[]) is not true'
      in guard_def) > 0 as active_owner_checked_before_row_lock,
    position('for update' in guard_def) > 0 as insertion_locks_membership_row,
    position('target.is_active' in guard_def) > 0 as insertion_checks_active,
    position('target.role = ''staff''' in guard_def) > 0 as insertion_checks_staff,
    position(') is not true' in guard_def) > 0 as no_backend_identity_bypass,
    position('public.has_club_role(target_club_id, array[''owner'']::text[])'
      in assign_def) > 0 as active_owner_only_assignment_check,
    position('target.role = ''staff''' in assign_def) > 0 as grant_only_to_staff,
    position('target.user_id <> auth.uid()' in assign_def) > 0
      as self_grant_blocked,
    position('actor.role in (''owner'', ''admin'')' in read_def) > 0
      as owner_admin_implicit_read_present,
    position('actor.role = ''staff''' in read_def) > 0
      as explicit_staff_branch_present,
    position('permission.membership_id = actor.id' in read_def) > 0
      as explicit_assignment_required,
    position('status' in read_def) = 0 as closed_season_not_excluded,
    position('player' in read_def) = 0 as player_not_granted
  from function_definitions
),
function_security as (
  select
    exists (
      select 1 from pg_proc f
      where f.oid = to_regprocedure(
        'public.revoke_ineligible_club_team_season_permissions()')
        and f.proowner = to_regrole('postgres')
        and f.prosecdef and f.provolatile = 'v'
        and f.proconfig = array['search_path=pg_catalog']::text[]
    ) as revocation_function_security_ok,
    not has_function_privilege('authenticated',
      'public.revoke_ineligible_club_team_season_permissions()', 'EXECUTE')
      as clients_cannot_invoke_revocation_function,
    not has_function_privilege('anon',
      'public.revoke_ineligible_club_team_season_permissions()', 'EXECUTE')
      as anon_cannot_invoke_revocation_function
),
table_privileges as (
  select role_name,
    has_table_privilege(role_name, 'public.club_team_season_permissions', 'SELECT') as can_select,
    has_table_privilege(role_name, 'public.club_team_season_permissions', 'INSERT') as can_insert,
    has_table_privilege(role_name, 'public.club_team_season_permissions', 'UPDATE') as can_update,
    has_table_privilege(role_name, 'public.club_team_season_permissions', 'DELETE') as can_delete,
    has_table_privilege(role_name, 'public.club_team_season_permissions', 'TRUNCATE') as can_truncate,
    has_table_privilege(role_name, 'public.club_team_season_permissions', 'REFERENCES') as can_reference,
    has_table_privilege(role_name, 'public.club_team_season_permissions', 'TRIGGER') as can_trigger
  from (values ('anon'::text), ('authenticated'), ('service_role')) roles(role_name)
),
relation_security as (
  select pg_get_userbyid(c.relowner) = 'postgres' as owner_is_postgres,
    c.relrowsecurity as rls_enabled,
    not c.relforcerowsecurity as rls_not_forced
  from pg_class c
  where c.oid = to_regclass('public.club_team_season_permissions')
),
protected_tables(table_name) as (
  values ('clubs'::text), ('club_memberships'), ('club_member_permissions'),
    ('club_seasons'), ('club_teams'), ('club_team_seasons'),
    ('equipos_rivales'), ('player_team_memberships'), ('partidos'),
    ('competitions'), ('training_sessions'), ('training_tasks'), ('rpe_entries')
),
protected_inventory as (
  select p.table_name,
    to_regclass('public.' || p.table_name) is not null as table_exists,
    coalesce((select count(*) from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = p.table_name), 0)
      as column_count,
    coalesce((select count(*) from pg_policy pol
      where pol.polrelid = to_regclass('public.' || p.table_name)), 0)
      as policy_count
  from protected_tables p
),
mandatory_checks as (
  select 'columnas.' || x.name as control, x.ok as ok, x.detail as detalle
  from column_checks c cross join lateral (values
    ('contrato_exacto', c.exact_column_contract_ok,
      'Cinco columnas con tipos, NOT NULL y valores por defecto exactos.')
  ) x(name, ok, detail)
  union all
  select 'restricciones.' || x.name, x.ok, x.detail
  from constraint_checks c cross join lateral (values
    ('cantidad_exacta', c.exact_permission_constraint_count,
      'Exactamente cuatro restricciones en la tabla de asignaciones.'),
    ('indice_unico_relacion_club', c.relation_id_club_unique_index_ok,
      'Índice único válido (id, club_id) en club_team_seasons.'),
    ('clave_primaria', c.primary_key_ok,
      'PK validada, no aplazable, sobre id.'),
    ('sin_asignaciones_duplicadas', c.no_duplicate_assignment_ok,
      'UNIQUE validada sobre membership_id y club_team_season_id.'),
    ('fk_relacion_mismo_club', c.relation_same_club_restrict_fk_ok,
      'FK compuesta a la relación; ON UPDATE NO ACTION y ON DELETE RESTRICT.'),
    ('fk_membership_mismo_club', c.membership_same_club_cascade_fk_ok,
      'FK compuesta a membership; ON UPDATE NO ACTION y ON DELETE CASCADE.')
  ) x(name, ok, detail)
  union all
  select 'indices.' || x.name, x.ok, x.detail
  from index_checks c cross join lateral (values
    ('busqueda_club_relacion', c.permission_lookup_index_ok,
      'Índice válido (club_id, club_team_season_id, membership_id).')
  ) x(name, ok, detail)
  union all
  select 'integridad.' || x.name, x.ok, x.detail
  from integrity_checks c cross join lateral (values
    ('sin_cruces_de_club', c.invalid_or_cross_club_assignments = 0,
      'No hay referencias ausentes ni asignaciones entre clubes distintos.'),
    ('sin_asignaciones_player', c.player_rows = 0,
      'Ninguna asignación corresponde a player.'),
    ('sin_staff_inelegible', c.ineligible_assignments_that_should_have_been_revoked = 0,
      'No quedan asignaciones de miembros inactivos o que ya no son staff.'),
    ('sin_filas_duplicadas', c.no_duplicate_rows,
      'No hay combinaciones membership/equipo-temporada duplicadas.')
  ) x(name, ok, detail)
  union all
  select 'rls.' || x.name, x.ok, x.detail
  from policy_checks c cross join lateral (values
    ('cantidad_exacta', c.exact_policy_count,
      'Exactamente tres políticas para la tabla de asignaciones.'),
    ('select_solo_owner', c.manager_select_ok,
      'SELECT de asignaciones exige owner activo del club.'),
    ('insert_con_helper', c.manager_insert_without_self_grant_ok,
      'INSERT llama al helper que bloquea autoasignación.'),
    ('delete_solo_owner', c.manager_delete_ok,
      'DELETE de asignaciones exige owner activo del club.'),
    ('sin_update_ni_all', c.no_update_or_all_policy,
      'No hay políticas UPDATE ni ALL.')
  ) x(name, ok, detail)
  union all
  select 'autorizacion.' || x.name, x.ok, x.detail
  from owner_contract c cross join lateral (values
    ('politicas_owner', c.select_and_delete_owner_only,
      'SELECT y DELETE usan exclusivamente el rol owner.'),
    ('concesion_owner', c.grant_owner_only,
      'El helper de concesión exige owner.'),
    ('guard_owner', c.insertion_guard_owner_only,
      'El trigger de INSERT exige owner antes del bloqueo.'),
    ('membership_activa', c.active_membership_required,
      'has_club_role comprueba is_active.'),
    ('roles_permitidos', c.role_list_enforced,
      'has_club_role comprueba el rol contra allowed_roles.'),
    ('owner_puede_gestionar',
      c.select_and_delete_owner_only and c.grant_owner_only
        and c.insertion_guard_owner_only and c.active_membership_required
        and c.role_list_enforced,
      'Contrato estático de gestión para owner activo; probar identidad aparte.'),
    ('admin_no_puede_gestionar',
      c.select_and_delete_owner_only and c.grant_owner_only
        and c.insertion_guard_owner_only and c.active_membership_required
        and c.role_list_enforced,
      'Contrato estático que excluye admin de asignaciones; probar identidad aparte.')
  ) x(name, ok, detail)
  union all
  select 'triggers.' || x.name, x.ok, x.detail
  from trigger_checks c cross join lateral (values
    ('guard_asignaciones', c.permission_insert_update_guard_ok,
      'Guard BEFORE INSERT/UPDATE activo en asignaciones.'),
    ('guard_membership_preservado', c.existing_before_update_guard_preserved,
      'Sigue activo el guard BEFORE UPDATE existente de memberships.'),
    ('revocacion_after_update', c.after_every_update_revocation_trigger_ok,
      'Revocación AFTER UPDATE activa para cualquier cambio de membership.'),
    ('revocacion_sin_duplicado', c.no_duplicate_revocation_trigger,
      'Existe exactamente un trigger de revocación.')
  ) x(name, ok, detail)
  union all
  select 'funciones.' || x.name, x.ok, x.detail
  from function_checks c cross join lateral (values
    ('revoca_solo_staff_previo', c.revokes_only_prior_staff,
      'La revocación actúa sobre memberships antes staff.'),
    ('revoca_cambio_rol', c.revokes_on_role_change,
      'Revoca cuando el miembro deja de ser staff.'),
    ('revoca_inactividad', c.revokes_on_deactivation,
      'Revoca cuando el miembro pasa a inactivo.'),
    ('elimina_asignaciones', c.deletes_assignments,
      'La función elimina asignaciones de la tabla prevista.'),
    ('limita_a_membership', c.limits_delete_to_membership,
      'La eliminación se limita a la membership afectada.'),
    ('nunca_restaura', c.never_restores_assignments,
      'La reactivación no reinserta asignaciones.'),
    ('owner_antes_bloqueo', c.active_owner_checked_before_row_lock,
      'La inserción exige owner antes de bloquear la membership.'),
    ('bloqueo_concurrencia', c.insertion_locks_membership_row,
      'La inserción bloquea la membership objetivo con FOR UPDATE.'),
    ('objetivo_activo', c.insertion_checks_active,
      'El guard exige membership objetivo activa.'),
    ('objetivo_staff', c.insertion_checks_staff,
      'El guard exige rol staff en la membership objetivo.'),
    ('sin_bypass_identidad', c.no_backend_identity_bypass,
      'El guard rechaza explícitamente autorización no verdadera.'),
    ('helper_owner', c.active_owner_only_assignment_check,
      'El helper de asignación exige owner.'),
    ('helper_solo_staff', c.grant_only_to_staff,
      'El helper solo admite destinatarios staff.'),
    ('sin_autoasignacion', c.self_grant_blocked,
      'El helper prohíbe asignarse permisos a sí mismo.'),
    ('lectura_owner_admin', c.owner_admin_implicit_read_present,
      'Owner y admin conservan lectura implícita de datos.'),
    ('lectura_staff_explicita', c.explicit_staff_branch_present,
      'Staff usa una rama de lectura diferenciada.'),
    ('lectura_por_membership', c.explicit_assignment_required,
      'Staff requiere asignación de su membership.'),
    ('historial_cerrado_legible', c.closed_season_not_excluded,
      'La lectura no excluye temporadas cerradas.'),
    ('player_sin_acceso', c.player_not_granted,
      'La función de lectura no incorpora player.')
  ) x(name, ok, detail)
  union all
  select 'seguridad_funciones.' || x.name, x.ok, x.detail
  from function_security c cross join lateral (values
    ('revocacion_definer', c.revocation_function_security_ok,
      'Revocación SECURITY DEFINER de postgres con search_path fijo.'),
    ('authenticated_sin_execute_revocacion', c.clients_cannot_invoke_revocation_function,
      'Authenticated no puede invocar directamente la función de revocación.'),
    ('anon_sin_execute_revocacion', c.anon_cannot_invoke_revocation_function,
      'Anon no puede invocar directamente la función de revocación.')
  ) x(name, ok, detail)
  union all
  select 'tabla.' || x.name, x.ok, x.detail
  from relation_security c cross join lateral (values
    ('owner_postgres', c.owner_is_postgres,
      'La tabla pertenece a postgres.'),
    ('rls_activa', c.rls_enabled,
      'RLS está activada.'),
    ('rls_no_forzada', c.rls_not_forced,
      'FORCE ROW LEVEL SECURITY sigue desactivado, como exige la migración.')
  ) x(name, ok, detail)
  union all
  select 'privilegios.' || p.role_name, p.can_select = e.can_select
    and p.can_insert = e.can_insert and p.can_update = e.can_update
    and p.can_delete = e.can_delete and p.can_truncate = e.can_truncate
    and p.can_reference = e.can_reference and p.can_trigger = e.can_trigger,
    'Grants efectivos esperados: SELECT=' || e.can_select::text ||
    ', INSERT=' || e.can_insert::text || ', UPDATE=' || e.can_update::text ||
    ', DELETE=' || e.can_delete::text || ', TRUNCATE=' || e.can_truncate::text ||
    ', REFERENCES=' || e.can_reference::text || ', TRIGGER=' || e.can_trigger::text ||
    '. service_role conserva BYPASSRLS aunque no tenga grants directos aquí.'
  from table_privileges p
  join (values
    ('anon'::text, false, false, false, false, false, false, false),
    ('authenticated', true, true, false, true, false, false, false),
    ('service_role', false, false, false, false, false, false, false)
  ) e(role_name, can_select, can_insert, can_update, can_delete,
      can_truncate, can_reference, can_trigger) using (role_name)
  union all
  select 'no_regresion.tabla.' || p.table_name, p.table_exists,
    'La tabla protegida debe seguir existiendo; columnas=' ||
      p.column_count::text || ', politicas=' || p.policy_count::text ||
      '. Comparar cantidades con una línea base anterior.'
  from protected_inventory p
),
inventory_rows as (
  select 'inventario.asignacion.' || p.id::text as control, true as ok,
    'club=' || p.club_id::text || ', relacion=' || p.club_team_season_id::text ||
    ', equipo=' || relation.team_id::text || ', temporada=' || season.label ||
    ' (' || season.status::text || '), membership=' || p.membership_id::text ||
    ', usuario=' || membership.user_id::text || ', rol=' || membership.role::text ||
    ', activa=' || membership.is_active::text ||
    ', creada=' || p.created_at::text as detalle
  from public.club_team_season_permissions p
  join public.club_team_seasons relation
    on relation.id = p.club_team_season_id and relation.club_id = p.club_id
  join public.club_seasons season
    on season.id = relation.season_id and season.club_id = relation.club_id
  join public.club_memberships membership
    on membership.id = p.membership_id and membership.club_id = p.club_id
  union all
  select 'inventario.total_asignaciones', true,
    'Registros actuales: ' || count(*)::text
  from public.club_team_season_permissions
  union all
  select 'inventario.duplicado.' || membership_id::text || '.' ||
    club_team_season_id::text, false,
    'La combinación aparece ' || count(*)::text || ' veces.'
  from public.club_team_season_permissions
  group by membership_id, club_team_season_id
  having count(*) > 1
  union all
  select 'inventario.columna.' || a.column_name::text, true,
    'Tipo=' || a.data_type || ', NOT NULL=' || a.is_not_null::text ||
    ', DEFAULT=' || coalesce(a.actual_default, 'ninguno')
  from actual_columns a
  union all
  select 'inventario.restriccion.' || c.conname::text, true,
    'Tipo=' || c.contype::text || ', validada=' || c.convalidated::text ||
    ', aplazable=' || c.condeferrable::text ||
    ', diferida=' || c.condeferred::text ||
    ', definicion=' || pg_get_constraintdef(c.oid, true)
  from pg_constraint c
  where c.conrelid in (to_regclass('public.club_team_seasons'),
    to_regclass('public.club_team_season_permissions'))
  union all
  select 'inventario.indice.' || i.indexrelid::regclass::text, true,
    'Único=' || i.indisunique::text || ', válido=' || i.indisvalid::text ||
    ', preparado=' || i.indisready::text || ', ' || pg_get_indexdef(i.indexrelid)
  from pg_index i
  where i.indrelid = to_regclass('public.club_team_season_permissions')
  union all
  select 'inventario.politica.' || p.polname::text, true,
    'Comando=' || p.polcmd::text || ', permisiva=' || p.polpermissive::text ||
    ', roles=' || array_to_string(array(
      select r.rolname from pg_roles r where r.oid = any(p.polroles)
      order by r.rolname), ',') ||
    ', USING=' || coalesce(pg_get_expr(p.polqual, p.polrelid), 'ninguno') ||
    ', CHECK=' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), 'ninguno')
  from pg_policy p
  where p.polrelid = to_regclass('public.club_team_season_permissions')
  union all
  select 'inventario.trigger.' || t.tgname::text, true,
    'Función=' || t.tgfoid::regprocedure::text ||
    ', habilitado=' || t.tgenabled::text ||
    ', tipo=' || t.tgtype::text ||
    ', de usuario=' || (not t.tgisinternal)::text
  from pg_trigger t
  where t.tgrelid = to_regclass('public.club_team_season_permissions')
  union all
  select 'inventario.funcion.' || f.oid::regprocedure::text, true,
    'Owner=' || pg_get_userbyid(f.proowner) ||
    ', SECURITY DEFINER=' || f.prosecdef::text ||
    ', volatilidad=' || f.provolatile::text ||
    ', configuracion=' || coalesce(array_to_string(f.proconfig, ','), 'ninguna') ||
    ', authenticated EXECUTE=' || has_function_privilege('authenticated', f.oid, 'EXECUTE')::text ||
    ', descripcion=' || coalesce(obj_description(f.oid, 'pg_proc'), 'ninguna')
  from pg_proc f
  where f.oid in (
    to_regprocedure('public.can_assign_club_team_season_permission(uuid,uuid)'),
    to_regprocedure('public.can_read_club_team_season(uuid)'),
    to_regprocedure('public.guard_club_team_season_permission_mutation()'),
    to_regprocedure('public.revoke_ineligible_club_team_season_permissions()'))
  union all
  select 'inventario.rol.' || r.rolname::text, true,
    'BYPASSRLS=' || r.rolbypassrls::text || ', SUPERUSER=' || r.rolsuper::text
  from pg_roles r where r.rolname in ('authenticated', 'service_role')
  union all
  select 'inventario.tabla_protegida.' || p.table_name,
    p.table_exists,
    'Existe=' || p.table_exists::text || ', columnas=' || p.column_count::text ||
    ', politicas=' || p.policy_count::text ||
    '. Compare cantidades con una línea base anterior para detectar regresiones.'
  from protected_inventory p
),
all_results as (
  select control, coalesce(ok, false) as ok,
    coalesce(detalle, 'Sin detalle disponible') as detalle, true as obligatoria
  from mandatory_checks
  union all
  select control, coalesce(ok, false),
    coalesce(detalle, 'Sin detalle disponible'), false
  from inventory_rows
),
global_result as (
  select 'GLOBAL'::text as control,
    (count(*) filter (where obligatoria)) = 69
      and coalesce(bool_and(ok) filter (where obligatoria), false)
      as ok,
    'Obligatorias: ' || (count(*) filter (where obligatoria))::text || '/69' ||
    '; PASS: ' || (count(*) filter (where obligatoria and ok))::text ||
    '; FAIL: ' || (count(*) filter (where obligatoria and not ok))::text ||
    '. Los inventarios son informativos; la prueba con identidades reales es independiente.'
      as detalle,
    true as obligatoria
  from all_results
)
select control as comprobacion,
  case when ok then 'PASS' else 'FAIL' end as resultado,
  detalle as explicacion,
  obligatoria
from (
  select * from all_results
  union all
  select * from global_result
) results
order by case when control = 'GLOBAL' then 1 else 0 end,
  case when obligatoria then 0 else 1 end, control;

-- Idempotence remains an external two-run check: save this result and the
-- assignment rows, rerun Change 35 manually, then compare. This read-only
-- verifier cannot itself rerun a migration or assert an unsupplied baseline.
