-- SOLO ENSAYO. Instalar MANUALMENTE despues de reconstruir y verificar el
-- esquema base, antes de ejecutar el seed 04B. Esta transaccion exige una
-- base deportiva vacia y exactamente las cinco cuentas ficticias 04B.
-- Verificar ademas el project ref en el panel: SQL no puede acreditar por si
-- solo que el proyecto remoto abierto es el deseado.
begin;
do $guard$
declare expected_emails text[] := array[
 'owner-04b@example.invalid', 'staff-a-04b@example.invalid',
 'staff-b-04b@example.invalid', 'outsider-04b@example.invalid',
 'player-04b@example.invalid'
];
begin
  if auth.uid() is not null then
    raise exception 'Instalar exclusivamente desde SQL Editor sin JWT de usuario';
  end if;
  if to_regclass('public.nexoclub_04c_staging_guard') is not null then
    raise exception 'Marcador 04C ya existe; revisar el proyecto';
  end if;
  if to_regclass('public.clubs') is null
    or to_regclass('public.club_memberships') is null
    or to_regclass('public.club_team_seasons') is null
    or to_regclass('public.players_database') is null
    or to_regclass('public.equipos_rivales') is null
    or to_regclass('public.jugadores') is null
    or to_regclass('public.partidos') is null then
    raise exception 'Esquema base 04C incompleto';
  end if;
  if (select count(*) from auth.users) <> 5
    or (select count(*) from auth.users where email = any(expected_emails)) <> 5 then
    raise exception 'Se esperan solo cinco cuentas ficticias 04B';
  end if;
  if exists (select 1 from public.clubs)
    or exists (select 1 from public.club_memberships)
    or exists (select 1 from public.club_team_seasons)
    or exists (select 1 from public.players_database)
    or exists (select 1 from public.equipos_rivales)
    or exists (select 1 from public.jugadores)
    or exists (select 1 from public.partidos) then
    raise exception 'Base deportiva no vacia: prohibido instalar fixture 04B';
  end if;
end $guard$;
create table public.nexoclub_04c_staging_guard (
  marker text primary key check (marker = 'EMPTY_FIXTURE_04B_ONLY')
);
revoke all on table public.nexoclub_04c_staging_guard from public, anon, authenticated;
insert into public.nexoclub_04c_staging_guard(marker)
values ('EMPTY_FIXTURE_04B_ONLY');
commit;
