-- APPCAUDAL · Fase 1 · Bloque 1.0
-- Alta inicial de las cinco cuentas STAFF existentes en C.D. Caudal.
--
-- Esta migración:
--   - solo inserta filas en public.club_memberships;
--   - no modifica roles permitidos, RLS, grants, RPC, Storage ni React;
--   - no crea permisos individuales;
--   - es idempotente cuando las memberships existentes coinciden;
--   - no sobrescribe una membership preexistente con otro rol o estado.
--
-- Debe ejecutarse desde Supabase SQL Editor con contexto administrativo y sin
-- una identidad JWT de aplicación activa. No ha sido ejecutada remotamente.

begin;

create temporary table expected_initial_staff_memberships (
  user_id uuid primary key,
  email text not null unique,
  role text not null check (role in ('owner', 'admin', 'staff', 'viewer'))
) on commit drop;

insert into expected_initial_staff_memberships (user_id, email, role)
values
  ('4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3', 'analisisvigon@gmail.com', 'owner'),
  ('e0933d02-76c7-4e71-9765-896593e1ae80', 'eladro10@gmail.com', 'staff'),
  ('535cc04b-c9c5-4964-86eb-cfdf68ea902f', 'ricardofrail@hotmail.com', 'staff'),
  ('e5fe943f-eaff-4935-8909-7def7b7ba362', 'rodriguezvillanuevadavid@gmail.com', 'staff'),
  ('414427ca-2870-4e46-92e7-ca5133e373fc', 'juanmacanales11@gmail.com', 'staff');

do $$
declare
  target_club_id constant uuid := 'ca0da100-0000-4000-8000-000000000001';
  invalid_account_count integer;
  expected_owner_count integer;
  unexpected_membership_count integer;
  existing_permission_count integer;
begin
  if auth.uid() is not null then
    raise exception
      'Bloque 1.0 debe ejecutarse sin una identidad JWT de aplicacion activa';
  end if;

  if not exists (
    select 1
    from public.clubs
    where id = target_club_id
      and lower(trim(name)) = lower('C.D. Caudal')
  ) then
    raise exception
      'No se encuentra C.D. Caudal con el id esperado %', target_club_id;
  end if;

  if (select count(*) from expected_initial_staff_memberships) <> 5 then
    raise exception 'El inventario STAFF esperado debe contener exactamente 5 cuentas';
  end if;

  select count(*)
  into expected_owner_count
  from expected_initial_staff_memberships
  where role = 'owner';

  if expected_owner_count <> 1 then
    raise exception 'La carga inicial debe contener exactamente un owner';
  end if;

  select count(*)
  into invalid_account_count
  from expected_initial_staff_memberships expected
  left join auth.users account on account.id = expected.user_id
  where account.id is null
     or lower(coalesce(account.email, '')) <> lower(expected.email)
     or account.deleted_at is not null
     or (account.banned_until is not null and account.banned_until > now())
     or coalesce(account.is_anonymous, false);

  if invalid_account_count <> 0 then
    raise exception
      '% cuentas no existen, no coinciden con su email o no estan activas',
      invalid_account_count;
  end if;

  select count(*)
  into unexpected_membership_count
  from public.club_memberships membership
  where membership.club_id = target_club_id
    and not exists (
      select 1
      from expected_initial_staff_memberships expected
      where expected.user_id = membership.user_id
    );

  if unexpected_membership_count <> 0 then
    raise exception
      'Hay % memberships no previstas en C.D. Caudal; revise el inventario',
      unexpected_membership_count;
  end if;

  select count(*)
  into existing_permission_count
  from public.club_member_permissions permission
  join public.club_memberships membership
    on membership.id = permission.membership_id
  where membership.club_id = target_club_id;

  if existing_permission_count <> 0 then
    raise exception
      'Hay % permisos individuales existentes; revise el inventario',
      existing_permission_count;
  end if;
end
$$;

-- El owner se inserta primero para que el club tenga una identidad gestora
-- antes de incorporar el resto de cuentas operativas.
insert into public.club_memberships (club_id, user_id, role, is_active)
select
  'ca0da100-0000-4000-8000-000000000001'::uuid,
  expected.user_id,
  expected.role,
  true
from expected_initial_staff_memberships expected
where expected.role = 'owner'
on conflict (club_id, user_id) do nothing;

insert into public.club_memberships (club_id, user_id, role, is_active)
select
  'ca0da100-0000-4000-8000-000000000001'::uuid,
  expected.user_id,
  expected.role,
  true
from expected_initial_staff_memberships expected
where expected.role <> 'owner'
on conflict (club_id, user_id) do nothing;

do $$
declare
  target_club_id constant uuid := 'ca0da100-0000-4000-8000-000000000001';
  invalid_membership_count integer;
  actual_membership_count integer;
begin
  select count(*)
  into invalid_membership_count
  from expected_initial_staff_memberships expected
  left join public.club_memberships membership
    on membership.club_id = target_club_id
   and membership.user_id = expected.user_id
  where membership.id is null
     or membership.role <> expected.role
     or not membership.is_active;

  if invalid_membership_count <> 0 then
    raise exception
      '% memberships faltan o no coinciden con el rol/estado esperado',
      invalid_membership_count;
  end if;

  select count(*)
  into actual_membership_count
  from public.club_memberships
  where club_id = target_club_id;

  if actual_membership_count <> 5 then
    raise exception
      'C.D. Caudal debe tener exactamente 5 memberships; hay %',
      actual_membership_count;
  end if;
end
$$;

commit;

-- Resultado informativo esperado tras una ejecución correcta: 5 filas.
select
  membership.club_id,
  membership.user_id,
  account.email,
  membership.role,
  membership.is_active
from public.club_memberships membership
join auth.users account on account.id = membership.user_id
where membership.club_id = 'ca0da100-0000-4000-8000-000000000001'::uuid
  and membership.user_id in (
    '4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3'::uuid,
    'e0933d02-76c7-4e71-9765-896593e1ae80'::uuid,
    '535cc04b-c9c5-4964-86eb-cfdf68ea902f'::uuid,
    'e5fe943f-eaff-4935-8909-7def7b7ba362'::uuid,
    '414427ca-2870-4e46-92e7-ca5133e373fc'::uuid
  )
order by
  case membership.role when 'owner' then 0 else 1 end,
  account.email;

-- Reversion controlada (NO forma parte de la ejecucion de esta migracion).
-- Debe usarse, si fuera necesaria, antes de crear otros miembros o permisos.
-- El guard del ultimo owner impide volver a cero mediante DELETE ordinario;
-- por eso la reversion exige contexto postgres y desactiva unicamente ese
-- trigger dentro de una transaccion. Cualquier error revierte tambien el
-- ALTER TABLE y conserva el trigger habilitado.
--
-- begin;
-- lock table public.club_memberships in exclusive mode;
--
-- do $$
-- begin
--   if (
--     select count(*)
--     from public.club_memberships
--     where club_id = 'ca0da100-0000-4000-8000-000000000001'::uuid
--   ) <> 5 then
--     raise exception 'La reversion solo admite las 5 memberships iniciales';
--   end if;
--
--   if exists (
--     select 1
--     from public.club_member_permissions permission
--     join public.club_memberships membership
--       on membership.id = permission.membership_id
--     where membership.club_id = 'ca0da100-0000-4000-8000-000000000001'::uuid
--   ) then
--     raise exception 'Hay permisos asociados; no se ejecuta la reversion';
--   end if;
-- end
-- $$;
--
-- alter table public.club_memberships
--   disable trigger guard_club_membership_mutation;
--
-- delete from public.club_memberships
-- where club_id = 'ca0da100-0000-4000-8000-000000000001'::uuid
--   and user_id in (
--     '4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3'::uuid,
--     'e0933d02-76c7-4e71-9765-896593e1ae80'::uuid,
--     '535cc04b-c9c5-4964-86eb-cfdf68ea902f'::uuid,
--     'e5fe943f-eaff-4935-8909-7def7b7ba362'::uuid,
--     '414427ca-2870-4e46-92e7-ca5133e373fc'::uuid
--   );
--
-- alter table public.club_memberships
--   enable trigger guard_club_membership_mutation;
--
-- do $$
-- begin
--   if exists (
--     select 1
--     from public.club_memberships
--     where club_id = 'ca0da100-0000-4000-8000-000000000001'::uuid
--   ) then
--     raise exception 'La reversion no dejo el club sin memberships';
--   end if;
-- end
-- $$;
--
-- commit;
