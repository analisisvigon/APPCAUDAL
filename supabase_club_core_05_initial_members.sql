-- APPCAUDAL · Etapa A.4
-- Alta idempotente del club inicial. No crea memberships.

begin;

do $$
declare
  caudal_club_id constant uuid := 'ca0da100-0000-4000-8000-000000000001';
  existing_club_id uuid;
begin
  select club.id
    into existing_club_id
  from public.clubs club
  where lower(trim(club.name)) = lower('C.D. Caudal')
  limit 1;

  if existing_club_id is null then
    if exists (select 1 from public.clubs where id = caudal_club_id) then
      raise exception 'El UUID estable de C.D. Caudal ya pertenece a otro club';
    end if;

    insert into public.clubs (id, name)
    values (caudal_club_id, 'C.D. Caudal');
  end if;
end;
$$;

commit;

select id, name, created_at
from public.clubs
where lower(trim(name)) = lower('C.D. Caudal');
