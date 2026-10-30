-- Solo lectura. Ejecutar antes o despues del cambio manual de nombre.
with identity as (
  select
    (select name from public.clubs
     where id = 'ca0da100-0000-4000-8000-000000000001'::uuid) as club_name,
    (select name from public.equipos_rivales
     where id = '85a16f33-9fe5-44d4-b85d-37d73651ebf6'::uuid
       and team_kind = 'own') as team_name,
    exists (select 1 from public.club_teams
      where id = '85a16f33-9fe5-44d4-b85d-37d73651ebf6'::uuid
        and club_id = 'ca0da100-0000-4000-8000-000000000001'::uuid) as same_club
)
select club_name, team_name, same_club,
  case
    when not same_club or club_name is null or team_name is null then 'BLOCKED'
    when club_name = 'Al-Madina SC' and team_name = 'Al-Madina SC' then 'PASS'
    when club_name in ('C.D. Caudal', 'Almadina SC')
      and team_name = 'Almadina SC' then 'READY_TO_REVIEW'
    else 'BLOCKED'
  end as status
from identity;
