-- APPCAUDAL - Fase 1 - Bloque 1.2 - PRUEBAS TRANSACCIONALES OPCIONALES
-- Ejecutar solo DESPUES de que la verificacion remota de Bloque 1.2 sea correcta.
-- Ejecutar el archivo COMPLETO. El ROLLBACK final es obligatorio.
--
-- Esta prueba crea un club y una membership VIEWER solo dentro de una
-- subtransaccion que se revierte. No crea PLAYER ni auth.users, no usa jugadores,
-- no deshabilita constraints/triggers y no deja datos persistentes.
--
-- La prueba PLAYER se aplaza: aun siendo reversible, requeriria desactivar
-- transitoriamente un staff real y diferir la FK. No es necesario asumir ese
-- riesgo operativo para cerrar Bloque 1.2.

begin;

do $$
begin
  if auth.uid() is not null then
    raise exception 'Las pruebas deben iniciarse sin JWT de aplicacion activo';
  end if;

  if (select count(*) from public.club_memberships) <> 5
     or (select count(*) from public.club_memberships where is_active) <> 5
     or (select count(*) from public.club_memberships where role = 'owner') <> 1
     or (select count(*) from public.club_memberships where role = 'staff') <> 4
     or (select count(*) from public.club_memberships where role = 'player') <> 0
     or exists (
       select 1 from public.club_memberships where jugador_id is not null
     ) then
    raise exception 'Inventario previo incompatible con las pruebas de Bloque 1.2';
  end if;
end
$$;

-- T1. Una segunda membership activa para el mismo auth.uid() debe producir
-- cardinality_violation (SQLSTATE 21000), nunca una eleccion silenciosa.
do $$
declare
  owner_id constant uuid := '4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3';
  test_club_id uuid := gen_random_uuid();
  ambiguity_rejected boolean := false;
begin
  begin
    insert into public.clubs (id, name)
    values (test_club_id, 'Bloque 1.2 - prueba ambiguedad');

    insert into public.club_memberships (
      club_id, user_id, role, is_active, jugador_id
    ) values (
      test_club_id, owner_id, 'viewer', true, null
    );

    perform set_config('request.jwt.claim.sub', owner_id::text, true);
    perform * from public.current_membership();

    raise exception 'TEST T1: se eligio silenciosamente una membership';
  exception
    when cardinality_violation then
      ambiguity_rejected := true;
  end;

  if not ambiguity_rejected then
    raise exception 'TEST T1: no se obtuvo SQLSTATE 21000';
  end if;

  raise notice 'TEST T1 OK: la identidad ambigua fue rechazada con SQLSTATE 21000';
end
$$;

-- T2. Debe mostrar durante la transaccion el mismo inventario original.
select
  count(*) as memberships_total,
  count(*) filter (where is_active) as memberships_activas,
  count(*) filter (where role = 'owner') as owners,
  count(*) filter (where role = 'staff') as staff,
  count(*) filter (where role = 'player') as players,
  count(*) filter (where jugador_id is not null) as vinculadas_a_jugador
from public.club_memberships;

rollback;

-- T3. Comprobacion posterior al ROLLBACK. Debe seguir mostrando 5/5/1/4/0/0.
select
  count(*) as memberships_total,
  count(*) filter (where is_active) as memberships_activas,
  count(*) filter (where role = 'owner') as owners,
  count(*) filter (where role = 'staff') as staff,
  count(*) filter (where role = 'player') as players,
  count(*) filter (where jugador_id is not null) as vinculadas_a_jugador
from public.club_memberships;
