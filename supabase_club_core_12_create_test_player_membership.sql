-- BLOQUE 1.5 - Alta controlada de la membership PLAYER ficticia.
--
-- PRERREQUISITO MANUAL:
-- Crear primero en Supabase Auth el usuario:
--   player.test.lucas+appcaudal@example.com
--
-- Antes de ejecutar, sustituir el marcador de la variable
-- player_auth_user_id_text por el UUID real de Authentication > Users.
--
-- Este archivo NO crea auth.users ni jugadores deportivos. Inserta una unica
-- fila en public.club_memberships y valida el resultado antes del COMMIT.

begin;

do $$
declare
  player_auth_user_id_text constant text :=
    'REPLACE_WITH_REAL_AUTH_USER_UUID';
  expected_email constant text :=
    'player.test.lucas+appcaudal@example.com';
  target_club_id constant uuid :=
    'ca0da100-0000-4000-8000-000000000001';
  player_a_jugador_id constant uuid :=
    'b812a22a-2e3d-4a70-9e4c-c78c661db6e8';
  player_b_jugador_id constant uuid :=
    'f7f5aaeb-e82b-4e6b-8920-694bc32cb6c7';
  player_auth_user_id uuid;
  original_staff_count integer;
begin
  if player_auth_user_id_text like 'REPLACE_%' then
    raise exception
      'Bloque 1.5 abortado: sustituya el marcador por el UUID Auth real';
  end if;

  begin
    player_auth_user_id := player_auth_user_id_text::uuid;
  exception
    when invalid_text_representation then
      raise exception
        'Bloque 1.5 abortado: el UUID Auth indicado no es valido';
  end;

  if auth.uid() is not null then
    raise exception
      'Bloque 1.5 abortado: ejecute el alta desde SQL Editor sin JWT de aplicacion';
  end if;

  if not exists (
    select 1
    from auth.users account
    where account.id = player_auth_user_id
      and pg_catalog.lower(coalesce(account.email, '')) =
        pg_catalog.lower(expected_email)
      and account.deleted_at is null
      and not coalesce(account.is_anonymous, false)
      and (
        account.banned_until is null
        or account.banned_until <= pg_catalog.now()
      )
  ) then
    raise exception
      'Bloque 1.5 abortado: el UUID Auth no corresponde a la cuenta ficticia activa esperada';
  end if;

  if not exists (
    select 1
    from public.clubs club
    where club.id = target_club_id
  ) then
    raise exception 'Bloque 1.5 abortado: no existe el club objetivo';
  end if;

  if not exists (
    select 1 from public.jugadores jugador
    where jugador.id = player_a_jugador_id
  ) or not exists (
    select 1 from public.jugadores jugador
    where jugador.id = player_b_jugador_id
  ) then
    raise exception
      'Bloque 1.5 abortado: falta Lucas (PLAYER_A) o Jairo (PLAYER_B)';
  end if;

  if not exists (
    select 1 from public.wellness_entries entry
    where entry.jugador_id = player_a_jugador_id
  ) or not exists (
    select 1 from public.rpe_entries entry
    where entry.jugador_id = player_a_jugador_id
  ) or not exists (
    select 1 from public.wellness_entries entry
    where entry.jugador_id = player_b_jugador_id
  ) or not exists (
    select 1 from public.rpe_entries entry
    where entry.jugador_id = player_b_jugador_id
  ) then
    raise exception
      'Bloque 1.5 abortado: PLAYER_A o PLAYER_B ya no tienen datos Wellness y RPE para la prueba cruzada';
  end if;

  if exists (
    select 1
    from public.club_memberships membership
    where membership.user_id = player_auth_user_id
  ) then
    raise exception
      'Bloque 1.5 abortado: el usuario Auth ya tiene alguna membership';
  end if;

  if exists (
    select 1
    from public.club_memberships membership
    where membership.jugador_id = player_a_jugador_id
      and membership.is_active
  ) then
    raise exception
      'Bloque 1.5 abortado: Lucas ya esta vinculado a otra membership activa';
  end if;

  select count(*)::integer
    into original_staff_count
  from public.club_memberships membership
  where membership.club_id = target_club_id
    and membership.is_active
    and membership.role in ('owner', 'admin', 'staff');

  if (select count(*) from public.club_memberships) <> 5
     or (select count(*) from public.club_memberships where is_active) <> 5
     or original_staff_count <> 5
     or (
       select count(*) from public.club_memberships
       where is_active and role = 'owner'
     ) <> 1
     or (
       select count(*) from public.club_memberships
       where is_active and role = 'staff'
     ) <> 4
     or exists (
       select 1 from public.club_memberships
       where role in ('admin', 'viewer')
     )
     or exists (
       select 1 from public.club_memberships
       where role <> 'player' and jugador_id is not null
     )
     or exists (
       select 1 from public.club_memberships where role = 'player'
     ) then
    raise exception
      'Bloque 1.5 abortado: el inventario previo ya no es 5 STAFF activos y 0 PLAYER';
  end if;

  insert into public.club_memberships (
    club_id,
    user_id,
    role,
    jugador_id,
    is_active
  ) values (
    target_club_id,
    player_auth_user_id,
    'player',
    player_a_jugador_id,
    true
  );

  if (
    select count(*)
    from public.club_memberships membership
    where membership.club_id = target_club_id
      and membership.user_id = player_auth_user_id
      and membership.role = 'player'
      and membership.jugador_id = player_a_jugador_id
      and membership.is_active
  ) <> 1 then
    raise exception
      'Bloque 1.5 abortado: no se creo exactamente la membership PLAYER esperada';
  end if;

  if (select count(*) from public.club_memberships) <> 6
     or (select count(*) from public.club_memberships where is_active) <> 6
     or (
       select count(*) from public.club_memberships
       where is_active and role in ('owner', 'admin', 'staff')
     ) <> original_staff_count
     or (
       select count(*) from public.club_memberships
       where is_active and role = 'player'
     ) <> 1
     or (
       select count(*) from public.club_memberships
       where is_active and role = 'owner'
     ) <> 1
     or (
       select count(*) from public.club_memberships
       where is_active and role = 'staff'
     ) <> 4 then
    raise exception
      'Bloque 1.5 abortado: el inventario posterior no es 5 STAFF + 1 PLAYER';
  end if;
end
$$;

commit;

-- Unica salida visible de confirmacion.
select
  membership.id as membership_id,
  membership.club_id,
  membership.user_id,
  membership.role,
  membership.jugador_id,
  membership.is_active,
  (
    membership.role = 'player'
    and membership.jugador_id =
      'b812a22a-2e3d-4a70-9e4c-c78c661db6e8'::uuid
    and membership.is_active
  ) as test_ok
from public.club_memberships membership
join auth.users account on account.id = membership.user_id
where pg_catalog.lower(coalesce(account.email, '')) =
  'player.test.lucas+appcaudal@example.com';
