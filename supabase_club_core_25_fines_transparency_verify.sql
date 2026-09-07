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
  player_user_id uuid;
  staff_user_id uuid;
  staff_membership_id uuid;
  player_allowed boolean := false;
  staff_allowed boolean := false;
  viewer_denied boolean := false;
  no_membership_denied boolean := false;
begin
  select membership.user_id
  into player_user_id
  from public.club_memberships membership
  where membership.role = 'player'
    and membership.is_active
    and membership.jugador_id is not null
  order by membership.id
  limit 1;

  select membership.id, membership.user_id
  into staff_membership_id, staff_user_id
  from public.club_memberships membership
  where membership.role = 'staff'
    and membership.is_active
  order by membership.id
  limit 1;

  perform pg_temp.add_fines_transparency_check(
    'INVENTORY_player_and_staff',
    player_user_id is not null and staff_membership_id is not null,
    'hay identidades activas para la prueba funcional'
  );

  if player_user_id is not null then
    perform pg_catalog.set_config('request.jwt.claim.sub', player_user_id::text, true);
    perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
    begin
      execute 'set local role authenticated';
      perform 1 from public.get_fines_transparency_summary();
      perform 1 from public.get_fines_transparency_subjects();
      perform 1 from public.get_fines_transparency_rules();
      perform 1 from public.get_fines_transparency_list(1, 0);
      execute 'reset role';
      player_allowed := true;
    exception when others then
      execute 'reset role';
      player_allowed := false;
    end;
  end if;
  perform pg_temp.add_fines_transparency_check(
    'ROLE_player_read_allowed', player_allowed,
    'PLAYER activo puede ejecutar las cuatro RPC de transparencia'
  );

  if staff_user_id is not null then
    perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
    perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
    begin
      execute 'set local role authenticated';
      perform 1 from public.get_fines_transparency_summary();
      perform 1 from public.get_fines_transparency_subjects();
      perform 1 from public.get_fines_transparency_rules();
      perform 1 from public.get_fines_transparency_list(1, 0);
      execute 'reset role';
      staff_allowed := true;
    exception when others then
      execute 'reset role';
      staff_allowed := false;
    end;
  end if;
  perform pg_temp.add_fines_transparency_check(
    'ROLE_staff_read_allowed', staff_allowed,
    'STAFF activo conserva lectura de transparencia'
  );

  if staff_membership_id is not null then
    update public.club_memberships
    set role = 'viewer'
    where id = staff_membership_id;
    perform pg_catalog.set_config('request.jwt.claim.sub', staff_user_id::text, true);
    begin
      execute 'set local role authenticated';
      perform 1 from public.get_fines_transparency_summary();
      execute 'reset role';
    exception when insufficient_privilege then
      execute 'reset role';
      viewer_denied := true;
    when others then
      execute 'reset role';
      viewer_denied := false;
    end;
    update public.club_memberships
    set role = 'staff'
    where id = staff_membership_id;
  end if;
  perform pg_temp.add_fines_transparency_check(
    'ROLE_viewer_denied', viewer_denied,
    'VIEWER falla cerrado aunque tenga sesión authenticated'
  );

  perform pg_catalog.set_config('request.jwt.claim.sub', 'b4600000-0000-4000-8000-000000000098', true);
  begin
    execute 'set local role authenticated';
    perform 1 from public.get_fines_transparency_summary();
    execute 'reset role';
  exception when insufficient_privilege then
    execute 'reset role';
    no_membership_denied := true;
  when others then
    execute 'reset role';
    no_membership_denied := false;
  end;
  perform pg_temp.add_fines_transparency_check(
    'ROLE_no_membership_denied', no_membership_denied,
    'sesión sin membership falla cerrada'
  );

  perform pg_catalog.set_config('request.jwt.claim.sub', '', true);
  perform pg_catalog.set_config('request.jwt.claim.role', '', true);
end;
$verify$;

select test_name, test_ok, details
from pg_temp.fines_transparency_results
order by seq;

rollback;
