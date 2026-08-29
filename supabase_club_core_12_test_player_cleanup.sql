-- BLOQUE 1.5 - Limpieza de la membership PLAYER ficticia.
--
-- NO ejecutar hasta haber terminado y revisado todas las pruebas.
-- Sustituir el marcador por el mismo UUID Auth utilizado en el alta.
-- Este SQL elimina exclusivamente la membership ficticia. Despues se elimina
-- manualmente el usuario desde Authentication > Users. No borra jugadores ni
-- datos Wellness/RPE.

begin;
set transaction isolation level repeatable read;

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
  player_auth_user_id uuid;
  wellness_before integer;
  rpe_before integer;
  wellness_after integer;
  rpe_after integer;
  deleted_memberships integer;
begin
  if player_auth_user_id_text like 'REPLACE_%' then
    raise exception
      'Limpieza abortada: sustituya el marcador por el UUID Auth PLAYER real';
  end if;

  begin
    player_auth_user_id := player_auth_user_id_text::uuid;
  exception
    when invalid_text_representation then
      raise exception 'Limpieza abortada: UUID Auth no valido';
  end;

  if auth.uid() is not null then
    raise exception
      'Limpieza abortada: ejecute desde SQL Editor sin JWT de aplicacion';
  end if;

  if not exists (
    select 1
    from auth.users account
    where account.id = player_auth_user_id
      and pg_catalog.lower(coalesce(account.email, '')) =
        pg_catalog.lower(expected_email)
  ) then
    raise exception
      'Limpieza abortada: UUID/email Auth no corresponden a la cuenta ficticia';
  end if;

  if (
    select count(*)
    from public.club_memberships membership
    where membership.club_id = target_club_id
      and membership.user_id = player_auth_user_id
      and membership.role = 'player'
      and membership.jugador_id = player_a_jugador_id
  ) <> 1 then
    raise exception
      'Limpieza abortada: no existe exactamente la membership PLAYER esperada';
  end if;

  select count(*)::integer into wellness_before
  from public.wellness_entries entry
  where entry.jugador_id = player_a_jugador_id;

  select count(*)::integer into rpe_before
  from public.rpe_entries entry
  where entry.jugador_id = player_a_jugador_id;

  delete from public.club_memberships membership
  where membership.club_id = target_club_id
    and membership.user_id = player_auth_user_id
    and membership.role = 'player'
    and membership.jugador_id = player_a_jugador_id;
  get diagnostics deleted_memberships = row_count;

  if deleted_memberships <> 1 then
    raise exception
      'Limpieza abortada: se eliminaron % memberships, se esperaba 1',
      deleted_memberships;
  end if;

  select count(*)::integer into wellness_after
  from public.wellness_entries entry
  where entry.jugador_id = player_a_jugador_id;

  select count(*)::integer into rpe_after
  from public.rpe_entries entry
  where entry.jugador_id = player_a_jugador_id;

  if not exists (
    select 1 from public.jugadores jugador
    where jugador.id = player_a_jugador_id
  ) or wellness_after <> wellness_before or rpe_after <> rpe_before then
    raise exception
      'Limpieza abortada: cambiaron Lucas o sus datos deportivos';
  end if;
end
$$;

commit;

select
  account.id as auth_user_id,
  account.email,
  (
    select count(*)
    from public.club_memberships membership
    where membership.user_id = account.id
  ) as remaining_memberships,
  exists (
    select 1
    from public.jugadores jugador
    where jugador.id =
      'b812a22a-2e3d-4a70-9e4c-c78c661db6e8'::uuid
  ) as lucas_still_exists,
  true as ready_to_delete_auth_user_in_dashboard
from auth.users account
where pg_catalog.lower(coalesce(account.email, '')) =
  'player.test.lucas+appcaudal@example.com';
