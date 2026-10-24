-- REVISION MANUAL / APPCAUDAL EXISTENTE. No ejecutar desde el repositorio.
-- Cambia solo la identidad del unico equipo propio legacy. Conserva su UUID,
-- team_kind, relaciones, jugadores y partidos. Ejecutar solo cuando el escudo
-- real exista en public/branding/almadina-sc-crest.png de la aplicacion.
-- Si el nombre actual difiere del documentado en supabase_global_players.sql,
-- esta transaccion falla y debe revisarse antes de adaptar la condicion.
begin;

do $preflight$
begin
  if auth.uid() is not null then
    raise exception 'Ejecutar manualmente sin JWT de usuario';
  end if;
  if (select count(*) from public.equipos_rivales where team_kind = 'own') <> 1
    or not exists (
      select 1 from public.equipos_rivales
      where id = '85a16f33-9fe5-44d4-b85d-37d73651ebf6'::uuid
        and team_kind = 'own' and name = 'C.D. Caudal'
    ) then
    raise exception 'Equipo propio o nombre actual inesperado: detener y revisar';
  end if;
end $preflight$;

update public.equipos_rivales
set name = 'Almadina SC', crest = '/branding/almadina-sc-crest.png'
where id = '85a16f33-9fe5-44d4-b85d-37d73651ebf6'::uuid
  and team_kind = 'own' and name = 'C.D. Caudal';

do $postflight$
begin
  if (select count(*) from public.equipos_rivales
      where id = '85a16f33-9fe5-44d4-b85d-37d73651ebf6'::uuid
        and team_kind = 'own' and name = 'Almadina SC'
        and crest = '/branding/almadina-sc-crest.png') <> 1 then
    raise exception 'El cambio de identidad no se aplico exactamente una vez';
  end if;
end $postflight$;

commit;
