-- APPCAUDAL · Etapa A.6
-- Pruebas de integracion para ejecutar en una base de TEST tras 01-04.
-- Requiere cinco usuarios reales de auth.users y privilegios para SET ROLE.
-- Todo se ejecuta dentro de una transaccion que termina en ROLLBACK.

begin;

create temporary table club_core_test_users as
select id, row_number() over (order by created_at, id) as test_number
from auth.users
limit 5;

do $$
begin
  if (select count(*) from club_core_test_users) < 5 then
    raise exception 'Las pruebas requieren al menos cinco usuarios auth de test';
  end if;
end;
$$;

create temporary table club_core_test_context (
  club_a uuid not null,
  club_b uuid not null,
  owner_a uuid not null,
  admin_a uuid not null,
  staff_a uuid not null,
  viewer_a uuid not null,
  outsider_b uuid not null
);

insert into public.clubs (name)
values ('Club Core Test A'), ('Club Core Test B');

insert into club_core_test_context
select
  (select id from public.clubs where name = 'Club Core Test A'),
  (select id from public.clubs where name = 'Club Core Test B'),
  (select id from club_core_test_users where test_number = 1),
  (select id from club_core_test_users where test_number = 2),
  (select id from club_core_test_users where test_number = 3),
  (select id from club_core_test_users where test_number = 4),
  (select id from club_core_test_users where test_number = 5);

insert into public.club_memberships (club_id, user_id, role)
select club_a, owner_a, 'owner' from club_core_test_context
union all select club_a, admin_a, 'admin' from club_core_test_context
union all select club_a, staff_a, 'staff' from club_core_test_context
union all select club_a, viewer_a, 'viewer' from club_core_test_context
union all select club_b, outsider_b, 'owner' from club_core_test_context
union all select club_b, owner_a, 'viewer' from club_core_test_context;

create or replace function pg_temp.set_test_user(test_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', test_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end;
$$;

create or replace function pg_temp.assert_true(condition boolean, message text)
returns void
language plpgsql
as $$
begin
  if not coalesce(condition, false) then
    raise exception 'ASSERT TRUE: %', message;
  end if;
end;
$$;

create or replace function pg_temp.assert_fails(statement text, message text)
returns void
language plpgsql
as $$
declare
  affected_rows bigint;
begin
  begin
    execute statement;
    get diagnostics affected_rows = row_count;
  exception when others then
    return;
  end;
  -- UPDATE/DELETE bloqueados por RLS pueden finalizar correctamente afectando
  -- cero filas; eso tambien demuestra que la mutacion no se produjo.
  if affected_rows = 0 then
    return;
  end if;
  raise exception 'ASSERT FAILS: %', message;
end;
$$;

grant select on club_core_test_context to authenticated;
grant execute on function pg_temp.set_test_user(uuid) to authenticated;
grant execute on function pg_temp.assert_true(boolean, text) to authenticated;
grant execute on function pg_temp.assert_fails(text, text) to authenticated;

-- A partir de aqui las consultas se ejecutan como authenticated: RLS esta activa
-- y el JWT simulado determina auth.uid(). El setup anterior se hizo como admin.
set local role authenticated;

-- Funciones: miembro, multi-club, roles, inactivo, no autenticado y permisos.
select pg_temp.set_test_user(owner_a) from club_core_test_context;
select pg_temp.assert_true(public.is_club_member(club_a), 'owner debe ser miembro de Club A')
from club_core_test_context;
select pg_temp.assert_true(public.is_club_member(club_b), 'usuario multiclub debe acceder a Club B')
from club_core_test_context;
select pg_temp.assert_true(public.has_club_role(club_a, array['owner']), 'rol owner')
from club_core_test_context;
select pg_temp.assert_true(public.can_manage_club(club_a), 'owner gestiona club')
from club_core_test_context;
select pg_temp.assert_true(
  (select count(*) = 2 from public.clubs),
  'usuario multiclub solo ve sus dos clubs'
);

-- Owner crea staff y admin (se eliminan y recrean dentro del rollback).
delete from public.club_memberships
where club_id = (select club_a from club_core_test_context)
  and user_id in (
    (select admin_a from club_core_test_context),
    (select staff_a from club_core_test_context)
  );
insert into public.club_memberships (club_id, user_id, role)
select club_a, admin_a, 'admin' from club_core_test_context
union all
select club_a, staff_a, 'staff' from club_core_test_context;

reset role;
insert into public.club_member_permissions (membership_id, permission_key)
select membership.id, 'performance_aggregate_read'
from public.club_memberships membership
join club_core_test_context context
  on context.club_a = membership.club_id
 and context.staff_a = membership.user_id;
set local role authenticated;

select pg_temp.set_test_user(staff_a) from club_core_test_context;
select pg_temp.assert_true(public.can_edit_club_data(club_a), 'staff puede editar datos futuros')
from club_core_test_context;
select pg_temp.assert_true(
  public.has_club_permission(club_a, 'performance_aggregate_read'),
  'permiso explicito'
) from club_core_test_context;
select pg_temp.assert_true(not public.can_manage_club(club_a), 'staff no gestiona club')
from club_core_test_context;

-- Un miembro inactivo y un usuario de otro club no obtienen acceso.
select pg_temp.set_test_user(owner_a) from club_core_test_context;
update public.club_memberships
set is_active = false
where club_id = (select club_a from club_core_test_context)
  and user_id = (select viewer_a from club_core_test_context);

select pg_temp.set_test_user(viewer_a) from club_core_test_context;
select pg_temp.assert_true(not public.is_club_member(club_a), 'membership inactiva devuelve false')
from club_core_test_context;
select pg_temp.assert_fails(
  format(
    'update public.club_memberships set is_active=true where club_id=%L and user_id=%L',
    club_a, viewer_a
  ),
  'usuario inactivo no se reactiva'
) from club_core_test_context;

select pg_temp.set_test_user(owner_a) from club_core_test_context;
update public.club_memberships
set is_active = true
where club_id = (select club_a from club_core_test_context)
  and user_id = (select viewer_a from club_core_test_context);

select pg_temp.set_test_user(viewer_a) from club_core_test_context;
select pg_temp.assert_true(not public.can_edit_club_data(club_a), 'viewer no edita')
from club_core_test_context;

select pg_temp.set_test_user(outsider_b) from club_core_test_context;
select pg_temp.assert_true(not public.is_club_member(club_a), 'usuario de Club B no accede a Club A')
from club_core_test_context;
select pg_temp.assert_true(
  (select count(*) = 1 from public.clubs),
  'usuario de Club B solo ve su club'
);

set local request.jwt.claim.sub = '';
select pg_temp.assert_true(
  not public.is_club_member(club_a),
  'usuario no autenticado devuelve false'
) from club_core_test_context;

-- Mutaciones por rol. Las pruebas negativas se ejecutan con el JWT del actor.
select pg_temp.set_test_user(admin_a) from club_core_test_context;
delete from public.club_memberships
where club_id = (select club_a from club_core_test_context)
  and user_id = (select staff_a from club_core_test_context);
select pg_temp.assert_fails(
  format(
    'insert into public.club_memberships (club_id,user_id,role) values (%L,%L,%L)',
    club_a, staff_a, 'owner'
  ),
  'admin no crea owner'
) from club_core_test_context;
insert into public.club_memberships (club_id, user_id, role)
select club_a, staff_a, 'staff' from club_core_test_context;

select pg_temp.assert_fails(
  format(
    'update public.club_memberships set role=%L where club_id=%L and user_id=%L',
    'staff', club_a, owner_a
  ),
  'admin no modifica owner'
) from club_core_test_context;

select pg_temp.set_test_user(staff_a) from club_core_test_context;
select pg_temp.assert_fails(
  format(
    'update public.club_memberships set role=%L where club_id=%L and user_id=%L',
    'owner', club_a, staff_a
  ),
  'usuario no se eleva de rol'
) from club_core_test_context;
select pg_temp.assert_fails(
  format(
    'update public.club_memberships set role=%L where club_id=%L and user_id=%L',
    'viewer', club_a, viewer_a
  ),
  'staff no gestiona memberships'
) from club_core_test_context;

select pg_temp.assert_fails(
  format(
    'insert into public.club_member_permissions (membership_id,permission_key) select id,%L from public.club_memberships where club_id=%L and user_id=%L',
    'rpe_manage', club_a, staff_a
  ),
  'usuario no se concede permisos'
) from club_core_test_context;

select pg_temp.set_test_user(admin_a) from club_core_test_context;
select pg_temp.assert_fails(
  format(
    'insert into public.club_member_permissions (membership_id,permission_key) select id,%L from public.club_memberships where club_id=%L and user_id=%L',
    'rpe_manage', club_a, owner_a
  ),
  'admin no modifica permisos de owner'
) from club_core_test_context;

-- Ultimo owner: Club B solo tiene un owner activo.
select pg_temp.set_test_user(outsider_b) from club_core_test_context;
select pg_temp.assert_fails(
  format(
    'delete from public.club_memberships where club_id=%L and user_id=%L',
    club_b, outsider_b
  ),
  'ultimo owner no se elimina'
) from club_core_test_context;
select pg_temp.assert_fails(
  format(
    'update public.club_memberships set is_active=false where club_id=%L and user_id=%L',
    club_b, outsider_b
  ),
  'ultimo owner no se desactiva'
) from club_core_test_context;
select pg_temp.assert_fails(
  format(
    'update public.club_memberships set role=%L where club_id=%L and user_id=%L',
    'admin', club_b, outsider_b
  ),
  'ultimo owner no se degrada'
) from club_core_test_context;

-- Transferencia segura: primero otro owner, despues el owner original se degrada.
select pg_temp.set_test_user(owner_a) from club_core_test_context;
update public.club_memberships
set role = 'owner'
where club_id = (select club_a from club_core_test_context)
  and user_id = (select admin_a from club_core_test_context);
update public.club_memberships
set role = 'admin'
where club_id = (select club_a from club_core_test_context)
  and user_id = (select owner_a from club_core_test_context);

select 'club_core_integration_tests_passed' as result;

reset role;
rollback;
