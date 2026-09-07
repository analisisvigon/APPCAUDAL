-- APPCAUDAL - Multas: verificador de transparencia grupal sanitizada.
-- No persiste datos: ejecutar el archivo completo; la unica salida es la tabla final.

begin;

create temporary table fines_transparency_results (
  seq integer generated always as identity,
  test_name text not null,
  test_ok boolean not null,
  details text not null
) on commit drop;

create or replace function pg_temp.add_fines_transparency_check(
  p_name text,
  p_ok boolean,
  p_details text
)
returns void
language sql
volatile
security definer
set search_path = pg_catalog
as $function$
  insert into pg_temp.fines_transparency_results (test_name, test_ok, details)
  values (p_name, coalesce(p_ok, false), coalesce(p_details, ''));
$function$;

with expected(signature, required_fragments) as (
  values
    ('public.get_fines_transparency_summary()', array['require_fines_transparency_club', 'resolve_fines_season', 'fine.club_id', 'incident.club_id']::text[]),
    ('public.get_fines_transparency_subjects()', array['require_fines_transparency_club', 'resolve_fines_season', 'subject.subject_type', 'fine.club_id']::text[]),
    ('public.get_fines_transparency_rules()', array['require_fines_transparency_club', 'resolve_fines_season', 'reason_snapshot', 'fine.club_id']::text[]),
    ('public.get_fines_transparency_list(integer,integer)', array['require_fines_transparency_club', 'resolve_fines_season', 'p_limit', 'p_offset']::text[])
), audited as (
  select expected.*, procedure_row.*
  from expected
  left join pg_catalog.pg_proc procedure_row
    on procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
)
select pg_temp.add_fines_transparency_check(
  'RPC_' || audited.signature,
  audited.oid is not null
    and pg_catalog.pg_get_userbyid(audited.proowner) = 'postgres'
    and audited.prosecdef
    and audited.provolatile = 's'::"char"
    and audited.proconfig = array['search_path=pg_catalog']::text[]
    and not pg_catalog.has_function_privilege('anon', audited.oid, 'EXECUTE')
    and pg_catalog.has_function_privilege('authenticated', audited.oid, 'EXECUTE')
    and pg_catalog.has_function_privilege('service_role', audited.oid, 'EXECUTE')
    and (
      select pg_catalog.bool_and(pg_catalog.strpos(audited.prosrc, fragment) > 0)
      from pg_catalog.unnest(audited.required_fragments) fragment
    )
    and not exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(audited.proacl, pg_catalog.acldefault('f', audited.proowner))
      ) acl
      where acl.privilege_type = 'EXECUTE'
        and acl.grantee not in (
          audited.proowner,
          (select role_row.oid from pg_catalog.pg_roles role_row where role_row.rolname = 'authenticated'),
          (select role_row.oid from pg_catalog.pg_roles role_row where role_row.rolname = 'service_role')
        )
    ),
  'owner=postgres; stable definer; pg_catalog; ACL cerrada; guard, temporada y club presentes'
)
from audited;

with helper as (
  select procedure_row.*
  from (values ('public.require_fines_transparency_club()')) expected(signature)
  left join pg_catalog.pg_proc procedure_row
    on procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
)
select pg_temp.add_fines_transparency_check(
  'HELPER_public.require_fines_transparency_club()',
  helper.oid is not null
    and pg_catalog.pg_get_userbyid(helper.proowner) = 'postgres'
    and helper.prosecdef
    and helper.provolatile = 's'::"char"
    and helper.proconfig = array['search_path=pg_catalog']::text[]
    and pg_catalog.strpos(helper.prosrc, 'current_membership') > 0
    and pg_catalog.strpos(helper.prosrc, '''owner'', ''admin'', ''staff'', ''player''') > 0
    and pg_catalog.strpos(helper.prosrc, 'is_active is distinct from true') > 0
    and not pg_catalog.has_function_privilege('anon', helper.oid, 'EXECUTE')
    and not pg_catalog.has_function_privilege('authenticated', helper.oid, 'EXECUTE')
    and not pg_catalog.has_function_privilege('service_role', helper.oid, 'EXECUTE'),
  'helper interno, fail-closed y sin EXECUTE cliente'
)
from helper;

with expected(signature, expected_columns) as (
  values
    ('public.get_fines_transparency_summary()', array['season_code','total_fines','active_fines','unpaid_count','partial_count','paid_count','cancelled_count','overdue_count','generated_total','collected_total','pending_total']::text[]),
    ('public.get_fines_transparency_subjects()', array['subject_name','fine_count','active_count','paid_count','overdue_count','generated_total','collected_total','pending_total']::text[]),
    ('public.get_fines_transparency_rules()', array['rule_name','fine_count','active_count','paid_count','generated_total','collected_total','pending_total']::text[]),
    ('public.get_fines_transparency_list(integer,integer)', array['subject_name','rule_name','occurred_on','original_amount','surcharge_amount','generated_amount','collected_amount','pending_amount','due_on','financial_status','lifecycle_status','is_overdue','note']::text[])
), actual as (
  select
    expected.signature,
    expected.expected_columns,
    procedure_row.oid,
    array_agg(argument.name order by argument.position)
      filter (where argument.mode in ('o'::"char", 'b'::"char", 't'::"char")) as actual_columns
  from expected
  left join pg_catalog.pg_proc procedure_row
    on procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
  left join lateral (
    select
      position,
      procedure_row.proargnames[position] as name,
      procedure_row.proargmodes[position] as mode
    from pg_catalog.generate_subscripts(procedure_row.proallargtypes, 1) position
  ) argument on true
  group by expected.signature, expected.expected_columns, procedure_row.oid
)
select pg_temp.add_fines_transparency_check(
  'OUTPUT_' || actual.signature,
  actual.oid is not null and actual.actual_columns = actual.expected_columns,
  'columnas de salida exactas, sin IDs ni actores'
)
from actual;

with expected(table_name) as (
  values ('club_seasons'), ('fine_subjects'), ('fine_rules'),
         ('fine_incidents'), ('fines'), ('fine_payments')
)
select pg_temp.add_fines_transparency_check(
  'NO_WRITE_public.' || expected.table_name,
  not pg_catalog.has_table_privilege('authenticated', 'public.' || expected.table_name, 'INSERT')
    and not pg_catalog.has_table_privilege('authenticated', 'public.' || expected.table_name, 'UPDATE')
    and not pg_catalog.has_table_privilege('authenticated', 'public.' || expected.table_name, 'DELETE'),
  'authenticated conserva solo lectura directa; transparencia no abre escrituras'
)
from expected;

do $verify$
declare
  club_id_value uuid;
  season_id_value uuid;
  player_membership_id uuid;
  player_user_id uuid;
  owner_user_id uuid;
  staff_user_id uuid;
  staff_membership_id uuid;
  viewer_user_id constant uuid := 'b4250000-0000-4000-8000-000000000025'::uuid;
  viewer_membership_id uuid;
  no_membership_user_id constant uuid := 'b4250000-0000-4000-8000-000000000026'::uuid;
  rpc_call text;
  allowed_count integer;
  denied_count integer;
  direct_rows integer;
  viewer_permission_count integer;
  viewer_role text;
  viewer_jugador_id uuid;
  player_can_manage boolean := false;
  viewer_is_player boolean := true;
  viewer_is_staff boolean := true;
  viewer_has_permission boolean := false;
  viewer_can_manage boolean := true;
begin
  select membership.club_id, membership.id, membership.user_id, season.id
  into club_id_value, player_membership_id, player_user_id, season_id_value
  from public.club_memberships membership
  join public.club_seasons season
    on season.club_id = membership.club_id
   and season.starts_on <= current_date
   and season.ends_on >= current_date
  where membership.role = 'player'
    and membership.is_active
    and membership.jugador_id is not null
  order by membership.id
  limit 1;

  select membership.user_id
  into owner_user_id
  from public.club_memberships membership
  where membership.club_id = club_id_value
    and membership.role = 'owner'
    and membership.is_active
  order by membership.id
  limit 1;

  select membership.id, membership.user_id
  into staff_membership_id, staff_user_id
  from public.club_memberships membership
  where membership.club_id = club_id_value
    and membership.role = 'staff'
    and membership.is_active
  order by membership.id
  limit 1;

  perform pg_temp.add_fines_transparency_check(
    'INVENTORY_functional_identities',
    club_id_value is not null
      and season_id_value is not null
      and player_membership_id is not null
      and owner_user_id is not null
      and staff_membership_id is not null,
    'club y temporada actual con PLAYER, OWNER y STAFF activos'
  );

  -- Fixture VIEWER independiente. A diferencia de los verify 23/24, no cambia
  -- el role de ninguna membership real. El usuario Auth, la membership y el
  -- permiso nacen dentro de esta transaccion y desaparecen con el ROLLBACK.
  perform pg_catalog.set_config('request.jwt.claims', '{}'::jsonb::text, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', '', true);
  execute 'reset role';

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  select
    account.instance_id,
    viewer_user_id,
    'authenticated',
    'authenticated',
    pg_catalog.format('verify25.viewer.%s@appcaudal.invalid', viewer_user_id),
    '',
    pg_catalog.now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    pg_catalog.now(),
    pg_catalog.now()
  from auth.users account
  where account.id = owner_user_id;

  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', owner_user_id, 'role', 'authenticated')::text,
    true
  );
  perform pg_catalog.set_config('request.jwt.claim.sub', owner_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  insert into public.club_memberships (
    club_id,
    user_id,
    role,
    jugador_id,
    is_active
  ) values (
    club_id_value,
    viewer_user_id,
    'viewer',
    null,
    true
  )
  returning id into viewer_membership_id;
  insert into public.club_member_permissions (membership_id, permission_key)
  values (viewer_membership_id, 'fines_manage');
  execute 'reset role';

  -- PLAYER normal: transparencia completa, gestion denegada y tablas sin filas.
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', player_user_id, 'role', 'authenticated')::text,
    true
  );
  perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  allowed_count := 0;
  foreach rpc_call in array array[
    'select 1 from public.get_fines_transparency_summary()',
    'select 1 from public.get_fines_transparency_subjects()',
    'select 1 from public.get_fines_transparency_rules()',
    'select 1 from public.get_fines_transparency_list(1, 0)'
  ] loop
    begin
      execute rpc_call;
      allowed_count := allowed_count + 1;
    exception when others then
      null;
    end;
  end loop;
  execute 'reset role';
  perform pg_temp.add_fines_transparency_check(
    'ROLE_player_transparency_allowed', allowed_count = 4,
    pg_catalog.format('allowed=%s/4', allowed_count)
  );

  execute 'set local role authenticated';
  denied_count := 0;
  foreach rpc_call in array array[
    'select 1 from public.get_fine_rules_for_management()',
    'select 1 from public.get_fine_subjects_for_management()',
    'select 1 from public.create_fine_individual(null::uuid, null::uuid, current_date, null::text)',
    'select 1 from public.create_fine_collective(null::uuid, array[]::uuid[], current_date, null::text)',
    'select 1 from public.cancel_fine(null::uuid, null::text)',
    'select 1 from public.record_fine_payment(null::uuid, 1::numeric, current_date, null::text)',
    'select 1 from public.record_fine_refund(null::uuid, 1::numeric, current_date, null::text)',
    'select 1 from public.get_fines_management_list()',
    'select 1 from public.get_fines_financial_summary()',
    'select 1 from public.get_fines_subject_summary()'
  ] loop
    begin
      execute rpc_call;
    exception when insufficient_privilege then
      denied_count := denied_count + 1;
    when others then
      null;
    end;
  end loop;
  execute 'reset role';
  perform pg_temp.add_fines_transparency_check(
    'ROLE_player_management_denied', denied_count = 10,
    pg_catalog.format('denied_42501=%s/10', denied_count)
  );

  execute 'set local role authenticated';
  select
    (select pg_catalog.count(*) from public.fine_rules)
      + (select pg_catalog.count(*) from public.fine_subjects)
      + (select pg_catalog.count(*) from public.fine_incidents)
      + (select pg_catalog.count(*) from public.fines)
      + (select pg_catalog.count(*) from public.fine_payments)
  into direct_rows;
  execute 'reset role';
  perform pg_temp.add_fines_transparency_check(
    'ROLE_player_direct_tables_zero', direct_rows = 0,
    'cinco tablas financieras visibles=0'
  );

  -- PLAYER manager: mismo PLAYER + permiso transitorio validado en 19/23/24.
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', owner_user_id, 'role', 'authenticated')::text,
    true
  );
  perform pg_catalog.set_config('request.jwt.claim.sub', owner_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  insert into public.club_member_permissions (membership_id, permission_key)
  values (player_membership_id, 'fines_manage');
  execute 'reset role';

  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', player_user_id, 'role', 'authenticated')::text,
    true
  );
  perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  player_can_manage := public.can_manage_fines();
  execute 'reset role';
  perform pg_temp.add_fines_transparency_check(
    'ROLE_player_manager_capability', player_can_manage,
    'role=player y can_manage_fines()=true mediante permiso transitorio'
  );

  execute 'set local role authenticated';
  allowed_count := 0;
  foreach rpc_call in array array[
    'select 1 from public.get_fines_transparency_summary()',
    'select 1 from public.get_fines_transparency_subjects()',
    'select 1 from public.get_fines_transparency_rules()',
    'select 1 from public.get_fines_transparency_list(1, 0)'
  ] loop
    begin
      execute rpc_call;
      allowed_count := allowed_count + 1;
    exception when others then
      null;
    end;
  end loop;
  execute 'reset role';
  perform pg_temp.add_fines_transparency_check(
    'ROLE_player_manager_transparency_allowed', allowed_count = 4,
    pg_catalog.format('allowed=%s/4', allowed_count)
  );

  execute 'set local role authenticated';
  allowed_count := 0;
  foreach rpc_call in array array[
    'select 1 from public.get_fine_rules_for_management()',
    'select 1 from public.get_fine_subjects_for_management()',
    'select 1 from public.get_fines_management_list()',
    'select 1 from public.get_fines_financial_summary()',
    'select 1 from public.get_fines_subject_summary()'
  ] loop
    begin
      execute rpc_call;
      allowed_count := allowed_count + 1;
    exception when others then
      null;
    end;
  end loop;
  execute 'reset role';
  perform pg_temp.add_fines_transparency_check(
    'ROLE_player_manager_management_reads_allowed', allowed_count = 5,
    pg_catalog.format('allowed=%s/5', allowed_count)
  );

  execute 'set local role authenticated';
  select
    (select pg_catalog.count(*) from public.fine_rules)
      + (select pg_catalog.count(*) from public.fine_subjects)
      + (select pg_catalog.count(*) from public.fine_incidents)
      + (select pg_catalog.count(*) from public.fines)
      + (select pg_catalog.count(*) from public.fine_payments)
  into direct_rows;
  execute 'reset role';
  perform pg_temp.add_fines_transparency_check(
    'ROLE_player_manager_direct_tables_zero', direct_rows = 0,
    'la capability no abre SELECT directo sobre cinco tablas'
  );

  -- STAFF mantiene transparencia y las cinco RPC de lectura de gestion.
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', staff_user_id, 'role', 'authenticated')::text,
    true
  );
  perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  allowed_count := 0;
  foreach rpc_call in array array[
    'select 1 from public.get_fines_transparency_summary()',
    'select 1 from public.get_fines_transparency_subjects()',
    'select 1 from public.get_fines_transparency_rules()',
    'select 1 from public.get_fines_transparency_list(1, 0)'
  ] loop
    begin
      execute rpc_call;
      allowed_count := allowed_count + 1;
    exception when others then
      null;
    end;
  end loop;
  execute 'reset role';
  perform pg_temp.add_fines_transparency_check(
    'ROLE_staff_transparency_allowed', allowed_count = 4,
    pg_catalog.format('allowed=%s/4', allowed_count)
  );

  execute 'set local role authenticated';
  allowed_count := 0;
  foreach rpc_call in array array[
    'select 1 from public.get_fine_rules_for_management()',
    'select 1 from public.get_fine_subjects_for_management()',
    'select 1 from public.get_fines_management_list()',
    'select 1 from public.get_fines_financial_summary()',
    'select 1 from public.get_fines_subject_summary()'
  ] loop
    begin
      execute rpc_call;
      allowed_count := allowed_count + 1;
    exception when others then
      null;
    end;
  end loop;
  execute 'reset role';
  perform pg_temp.add_fines_transparency_check(
    'ROLE_staff_management_reads_allowed', allowed_count = 5,
    pg_catalog.format('allowed=%s/5', allowed_count)
  );

  -- VIEWER transitorio con fines_manage: identidad valida, autoridad siempre false.
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', viewer_user_id, 'role', 'authenticated')::text,
    true
  );
  perform pg_catalog.set_config('request.jwt.claim.sub', viewer_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  select membership.role, membership.jugador_id
  into viewer_role, viewer_jugador_id
  from public.current_membership() membership;
  viewer_is_player := public.is_player();
  viewer_is_staff := public.is_app_staff();
  viewer_has_permission := public.has_club_permission(club_id_value, 'fines_manage');
  viewer_can_manage := public.can_manage_fines();
  select pg_catalog.count(*)::integer
  into viewer_permission_count
  from public.club_member_permissions permission
  where permission.membership_id = viewer_membership_id
    and permission.permission_key = 'fines_manage';
  execute 'reset role';
  perform pg_temp.add_fines_transparency_check(
    'ROLE_viewer_fixture_fail_closed',
    viewer_role = 'viewer'
      and viewer_jugador_id is null
      and viewer_permission_count = 1
      and not viewer_is_player
      and not viewer_is_staff
      and viewer_has_permission
      and not viewer_can_manage,
    'role=viewer; jugador_id=NULL; permission=1; is_player=false; is_staff=false; can_manage=false'
  );

  execute 'set local role authenticated';
  denied_count := 0;
  foreach rpc_call in array array[
    'select 1 from public.get_fines_transparency_summary()',
    'select 1 from public.get_fines_transparency_subjects()',
    'select 1 from public.get_fines_transparency_rules()',
    'select 1 from public.get_fines_transparency_list(1, 0)'
  ] loop
    begin
      execute rpc_call;
    exception when insufficient_privilege then
      denied_count := denied_count + 1;
    when others then
      null;
    end;
  end loop;
  execute 'reset role';
  perform pg_temp.add_fines_transparency_check(
    'ROLE_viewer_transparency_denied', denied_count = 4,
    pg_catalog.format('denied_42501=%s/4', denied_count)
  );

  execute 'set local role authenticated';
  denied_count := 0;
  foreach rpc_call in array array[
    'select 1 from public.get_fine_rules_for_management()',
    'select 1 from public.get_fine_subjects_for_management()',
    'select 1 from public.create_fine_individual(null::uuid, null::uuid, current_date, null::text)',
    'select 1 from public.create_fine_collective(null::uuid, array[]::uuid[], current_date, null::text)',
    'select 1 from public.cancel_fine(null::uuid, null::text)',
    'select 1 from public.record_fine_payment(null::uuid, 1::numeric, current_date, null::text)',
    'select 1 from public.record_fine_refund(null::uuid, 1::numeric, current_date, null::text)',
    'select 1 from public.get_fines_management_list()',
    'select 1 from public.get_fines_financial_summary()',
    'select 1 from public.get_fines_subject_summary()'
  ] loop
    begin
      execute rpc_call;
    exception when insufficient_privilege then
      denied_count := denied_count + 1;
    when others then
      null;
    end;
  end loop;
  execute 'reset role';
  perform pg_temp.add_fines_transparency_check(
    'ROLE_viewer_management_denied', denied_count = 10,
    pg_catalog.format('denied_42501=%s/10', denied_count)
  );

  execute 'set local role authenticated';
  select
    (select pg_catalog.count(*) from public.fine_rules)
      + (select pg_catalog.count(*) from public.fine_subjects)
      + (select pg_catalog.count(*) from public.fine_incidents)
      + (select pg_catalog.count(*) from public.fines)
      + (select pg_catalog.count(*) from public.fine_payments)
  into direct_rows;
  execute 'reset role';
  perform pg_temp.add_fines_transparency_check(
    'ROLE_viewer_direct_tables_zero', direct_rows = 0,
    'cinco tablas financieras visibles=0'
  );

  -- Authenticated sin membership: las cuatro RPC fallan con 42501.
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', no_membership_user_id, 'role', 'authenticated')::text,
    true
  );
  perform pg_catalog.set_config('request.jwt.claim.sub', no_membership_user_id::text, true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
  denied_count := 0;
  foreach rpc_call in array array[
    'select 1 from public.get_fines_transparency_summary()',
    'select 1 from public.get_fines_transparency_subjects()',
    'select 1 from public.get_fines_transparency_rules()',
    'select 1 from public.get_fines_transparency_list(1, 0)'
  ] loop
    begin
      execute rpc_call;
    exception when insufficient_privilege then
      denied_count := denied_count + 1;
    when others then
      null;
    end;
  end loop;
  execute 'reset role';
  perform pg_temp.add_fines_transparency_check(
    'ROLE_no_membership_denied', denied_count = 4,
    pg_catalog.format('denied_42501=%s/4', denied_count)
  );

  -- ANON: sin EXECUTE sobre ninguna RPC de transparencia.
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('role', 'anon')::text,
    true
  );
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', 'anon', true);
  execute 'set local role anon';
  denied_count := 0;
  foreach rpc_call in array array[
    'select 1 from public.get_fines_transparency_summary()',
    'select 1 from public.get_fines_transparency_subjects()',
    'select 1 from public.get_fines_transparency_rules()',
    'select 1 from public.get_fines_transparency_list(1, 0)'
  ] loop
    begin
      execute rpc_call;
    exception when insufficient_privilege then
      denied_count := denied_count + 1;
    when others then
      null;
    end;
  end loop;
  execute 'reset role';
  perform pg_temp.add_fines_transparency_check(
    'ROLE_anon_denied', denied_count = 4,
    pg_catalog.format('denied_42501=%s/4', denied_count)
  );

  perform pg_temp.add_fines_transparency_check(
    'TRANSACTION_viewer_fixture_scoped',
    exists (select 1 from auth.users account where account.id = viewer_user_id)
      and exists (
        select 1
        from public.club_memberships membership
        where membership.id = viewer_membership_id
          and membership.user_id = viewer_user_id
          and membership.club_id = club_id_value
          and membership.role = 'viewer'
          and membership.jugador_id is null
      ),
    'usuario Auth y membership VIEWER son fixtures de la transaccion; ROLLBACK final obligatorio'
  );

  perform pg_catalog.set_config('request.jwt.claims', '{}'::jsonb::text, true);
  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', '', true);
end;
$verify$;

select pg_temp.add_fines_transparency_check(
  'VERIFY_expected_check_count',
  (select pg_catalog.count(*) = 32 from pg_temp.fines_transparency_results),
  pg_catalog.format(
    'checks_before_counter=%s; expected=32; total_output=33',
    (select pg_catalog.count(*) from pg_temp.fines_transparency_results)
  )
);

select test_name, test_ok, details
from pg_temp.fines_transparency_results
order by seq;

rollback;
