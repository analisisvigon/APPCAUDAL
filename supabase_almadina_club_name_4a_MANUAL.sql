-- NEXO CLUB / correccion exacta del nombre visible. REVISION MANUAL.
-- Conserva UUID, crest, team_kind y todas las relaciones deportivas.
begin;
do $preflight$
begin
  if auth.uid() is not null then
    raise exception 'Ejecutar administrativamente sin JWT de usuario';
  end if;
  if (select count(*) from public.clubs
      where id = 'ca0da100-0000-4000-8000-000000000001'::uuid
        and name in ('C.D. Caudal', 'Almadina SC', 'Al-Madina SC')) <> 1
     or (select count(*) from public.equipos_rivales
      where id = '85a16f33-9fe5-44d4-b85d-37d73651ebf6'::uuid
        and team_kind = 'own' and name in ('Almadina SC', 'Al-Madina SC')) <> 1
     or not exists (select 1 from public.club_teams
      where id = '85a16f33-9fe5-44d4-b85d-37d73651ebf6'::uuid
        and club_id = 'ca0da100-0000-4000-8000-000000000001'::uuid) then
    raise exception 'Identidad canonica o nombres actuales inesperados; detener';
  end if;
end $preflight$;

update public.clubs set name = 'Al-Madina SC'
where id = 'ca0da100-0000-4000-8000-000000000001'::uuid
  and name in ('C.D. Caudal', 'Almadina SC');
update public.equipos_rivales set name = 'Al-Madina SC'
where id = '85a16f33-9fe5-44d4-b85d-37d73651ebf6'::uuid
  and team_kind = 'own' and name = 'Almadina SC';

do $postflight$
begin
  if (select count(*) from public.clubs
      where id = 'ca0da100-0000-4000-8000-000000000001'::uuid
        and name = 'Al-Madina SC') <> 1
     or (select count(*) from public.equipos_rivales
      where id = '85a16f33-9fe5-44d4-b85d-37d73651ebf6'::uuid
        and team_kind = 'own' and name = 'Al-Madina SC') <> 1 then
    raise exception 'Nombre visible no confirmado; rollback';
  end if;
end $postflight$;
commit;
