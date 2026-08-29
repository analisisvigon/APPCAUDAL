-- APPCAUDAL - Fase 1 - Bloque 1.2 - VERIFICACION REMOTA
-- Ejecutar solo DESPUES de aplicar supabase_club_core_09_identity_helpers.sql.
-- Este archivo no modifica datos ni esquema. Los claims simulados son locales a
-- una transaccion que termina siempre en ROLLBACK.

-- V1. Debe devolver exactamente 4 filas, todas con:
--   exists=true, owner=postgres, is_stable=true, configuration={search_path=pg_catalog},
--   security_mode esperado, public_execute=false, anon_execute=false,
--   authenticated_execute=true y result_type esperado.
with expected(signature, expected_security_mode, expected_result_type) as (
  values
    (
      'public.current_membership()',
      'DEFINER',
      'TABLE(membership_id uuid, club_id uuid, user_id uuid, role text, jugador_id uuid, is_active boolean)'
    ),
    ('public.current_jugador_id()', 'INVOKER', 'uuid'),
    ('public.is_app_staff()', 'INVOKER', 'boolean'),
    ('public.is_player()', 'INVOKER', 'boolean')
), inspected as (
  select
    expected.*,
    pg_catalog.to_regprocedure(expected.signature) as helper_oid
  from expected
)
select
  inspected.signature,
  inspected.helper_oid is not null as helper_exists,
  pg_catalog.pg_get_userbyid(procedure_row.proowner) as owner,
  pg_catalog.pg_get_function_result(procedure_row.oid) as result_type,
  inspected.expected_result_type,
  procedure_row.provolatile = 's' as is_stable,
  case
    when procedure_row.prosecdef then 'DEFINER'
    else 'INVOKER'
  end as security_mode,
  inspected.expected_security_mode,
  procedure_row.proconfig as configuration,
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
  ) as authenticated_execute
from inspected
left join pg_catalog.pg_proc procedure_row
  on procedure_row.oid = inspected.helper_oid
order by inspected.signature;

-- V2. Debe devolver helper_count=4 y all_contracts_valid=true.
with expected(signature, expected_security_definer, expected_result_type) as (
  values
    (
      'public.current_membership()',
      true,
      'TABLE(membership_id uuid, club_id uuid, user_id uuid, role text, jugador_id uuid, is_active boolean)'
    ),
    ('public.current_jugador_id()', false, 'uuid'),
    ('public.is_app_staff()', false, 'boolean'),
    ('public.is_player()', false, 'boolean')
), inspected as (
  select
    expected.*,
    procedure_row.*
  from expected
  left join pg_catalog.pg_proc procedure_row
    on procedure_row.oid = pg_catalog.to_regprocedure(expected.signature)
)
select
  count(oid) as helper_count,
  coalesce(bool_and(
    oid is not null
    and pg_catalog.pg_get_userbyid(proowner) = 'postgres'
    and provolatile = 's'
    and prosecdef is not distinct from expected_security_definer
    and coalesce(proconfig, array[]::text[])
        @> array['search_path=pg_catalog']::text[]
    and pg_catalog.pg_get_function_result(oid) = expected_result_type
    and not exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(proacl, pg_catalog.acldefault('f', proowner))
      ) acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    )
    and not pg_catalog.has_function_privilege('anon', oid, 'EXECUTE')
    and pg_catalog.has_function_privilege('authenticated', oid, 'EXECUTE')
  ), false) as all_contracts_valid
from inspected;

-- V3-V5. Identidades simuladas sin crear auth.users ni memberships.
begin;

-- Ejecuta las llamadas con los privilegios reales de authenticated. El ROLLBACK
-- restaura automaticamente el rol y los claims locales.
set local role authenticated;

-- V3. Owner actual: membership_rows=1, role=owner, jugador_id/current_jugador_id
-- NULL, is_app_staff=true, is_player=false.
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  '4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3',
  true
);

select
  'owner' as scenario,
  (select count(*) from public.current_membership()) as membership_rows,
  (select pg_catalog.to_jsonb(membership) from public.current_membership() membership) as membership,
  public.current_jugador_id() as current_jugador_id,
  public.is_app_staff() as is_app_staff,
  public.is_player() as is_player;

-- V4. Staff actual: membership_rows=1, role=staff, jugador_id/current_jugador_id
-- NULL, is_app_staff=true, is_player=false.
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'e0933d02-76c7-4e71-9765-896593e1ae80',
  true
);

select
  'staff' as scenario,
  (select count(*) from public.current_membership()) as membership_rows,
  (select pg_catalog.to_jsonb(membership) from public.current_membership() membership) as membership,
  public.current_jugador_id() as current_jugador_id,
  public.is_app_staff() as is_app_staff,
  public.is_player() as is_player;

-- V5. UID simulado sin membership: membership_rows=0, membership=NULL,
-- current_jugador_id=NULL, is_app_staff=false, is_player=false.
select pg_catalog.set_config(
  'request.jwt.claim.sub',
  'b1200000-0000-4000-8000-000000000001',
  true
);

select
  'uid_without_membership' as scenario,
  (select count(*) from public.current_membership()) as membership_rows,
  (select pg_catalog.to_jsonb(membership) from public.current_membership() membership) as membership,
  public.current_jugador_id() as current_jugador_id,
  public.is_app_staff() as is_app_staff,
  public.is_player() as is_player;

rollback;

-- V6. Inventario final esperado: total=5, activas=5, owners=1, staff=4,
-- players=0 y vinculadas_a_jugador=0.
select
  count(*) as memberships_total,
  count(*) filter (where is_active) as memberships_activas,
  count(*) filter (where role = 'owner') as owners,
  count(*) filter (where role = 'staff') as staff,
  count(*) filter (where role = 'player') as players,
  count(*) filter (where jugador_id is not null) as vinculadas_a_jugador
from public.club_memberships;
