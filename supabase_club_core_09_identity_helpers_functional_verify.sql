-- BLOQUE 1.2 - Verificacion funcional simplificada de helpers de identidad.
--
-- Ejecutar el archivo completo en Supabase SQL Editor.
-- Es una unica sentencia SELECT: devuelve una unica tabla de tres filas.
-- set_config(..., true) limita cada claim a la transaccion implicita de esta
-- sentencia, por lo que no persiste ningun cambio de configuracion.

with
owner_claim as materialized (
  select pg_catalog.set_config(
    'request.jwt.claim.sub',
    '4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3',
    true
  ) as claim_sub
),
owner_observation as materialized (
  select
    'OWNER'::text as scenario,
    '4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3'::uuid as simulated_user_id,
    count(membership.membership_id)::integer as membership_rows,
    min(membership.role)::text as membership_role,
    (array_agg(membership.jugador_id order by membership.membership_id))[1]
      as membership_jugador_id,
    public.current_jugador_id() as current_jugador_id,
    public.is_app_staff() as is_app_staff,
    public.is_player() as is_player
  from owner_claim claim
  left join lateral public.current_membership() membership on true
  where claim.claim_sub is not null
),
staff_claim as materialized (
  select pg_catalog.set_config(
    'request.jwt.claim.sub',
    'e0933d02-76c7-4e71-9765-896593e1ae80',
    true
  ) as claim_sub
  from owner_observation
),
staff_observation as materialized (
  select
    'STAFF'::text as scenario,
    'e0933d02-76c7-4e71-9765-896593e1ae80'::uuid as simulated_user_id,
    count(membership.membership_id)::integer as membership_rows,
    min(membership.role)::text as membership_role,
    (array_agg(membership.jugador_id order by membership.membership_id))[1]
      as membership_jugador_id,
    public.current_jugador_id() as current_jugador_id,
    public.is_app_staff() as is_app_staff,
    public.is_player() as is_player
  from staff_claim claim
  left join lateral public.current_membership() membership on true
  where claim.claim_sub is not null
),
without_membership_claim as materialized (
  select pg_catalog.set_config(
    'request.jwt.claim.sub',
    'b1200000-0000-4000-8000-000000000001',
    true
  ) as claim_sub
  from staff_observation
),
without_membership_observation as materialized (
  select
    'UID_WITHOUT_MEMBERSHIP'::text as scenario,
    'b1200000-0000-4000-8000-000000000001'::uuid as simulated_user_id,
    count(membership.membership_id)::integer as membership_rows,
    min(membership.role)::text as membership_role,
    (array_agg(membership.jugador_id order by membership.membership_id))[1]
      as membership_jugador_id,
    public.current_jugador_id() as current_jugador_id,
    public.is_app_staff() as is_app_staff,
    public.is_player() as is_player
  from without_membership_claim claim
  left join lateral public.current_membership() membership on true
  where claim.claim_sub is not null
),
observations as (
  select * from owner_observation
  union all
  select * from staff_observation
  union all
  select * from without_membership_observation
)
select
  scenario,
  simulated_user_id,
  membership_rows,
  membership_role,
  membership_jugador_id,
  current_jugador_id,
  is_app_staff,
  is_player,
  case scenario
    when 'OWNER' then
      coalesce(
        membership_rows = 1
        and membership_role = 'owner'
        and membership_jugador_id is null
        and current_jugador_id is null
        and is_app_staff is true
        and is_player is false,
        false
      )
    when 'STAFF' then
      coalesce(
        membership_rows = 1
        and membership_role = 'staff'
        and membership_jugador_id is null
        and current_jugador_id is null
        and is_app_staff is true
        and is_player is false,
        false
      )
    when 'UID_WITHOUT_MEMBERSHIP' then
      coalesce(
        membership_rows = 0
        and membership_role is null
        and membership_jugador_id is null
        and current_jugador_id is null
        and is_app_staff is false
        and is_player is false,
        false
      )
    else false
  end as test_ok
from observations
order by case scenario
  when 'OWNER' then 1
  when 'STAFF' then 2
  when 'UID_WITHOUT_MEMBERSHIP' then 3
  else 4
end;
