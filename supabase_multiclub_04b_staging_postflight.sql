-- SOLO LECTURA. Ejecutar manualmente tras seed, dentro del proyecto de ensayo.
select (select count(*) from public.clubs where name in ('ENSAYO 04B A','ENSAYO 04B B'))=2 as two_fixture_clubs,
 (select count(*) from public.club_teams where code in ('ambar','azul'))=2 as two_fixture_teams,
 (select count(*) from public.club_team_seasons where id in
  ('040b0000-0000-4000-8000-000000000031'::uuid,'040b0000-0000-4000-8000-000000000032'::uuid))=2 as two_fixture_contexts,
 (select count(*) from public.legacy_jugador_cts_links_v1 where jugador_id in
  ('040b0000-0000-4000-8000-000000000051'::uuid,'040b0000-0000-4000-8000-000000000052'::uuid))=2 as two_exact_roster_links,
 (select count(*) from public.partidos where id in
  ('040b0000-0000-4000-8000-000000000061'::uuid,'040b0000-0000-4000-8000-000000000062'::uuid))=2 as two_fixture_matches,
 (select count(*) from public.club_memberships m join auth.users u on u.id=m.user_id
  where u.email='owner-04b@example.invalid' and m.role='owner')=2 as owner_has_two_clubs,
 (select count(*) from public.club_memberships m join auth.users u on u.id=m.user_id
  where u.email='outsider-04b@example.invalid')=0 as outsider_has_no_membership;

select c.name as fixture_club, count(distinct cts.id) as contexts,
 count(distinct roster.id) as roster_links, count(distinct match_row.id) as matches
from public.clubs c
join public.club_team_seasons cts on cts.club_id=c.id
left join public.club_team_season_players roster on roster.club_team_season_id=cts.id and roster.voided_at is null
left join public.partidos match_row on match_row.club_team_season_id=cts.id
where c.name in ('ENSAYO 04B A','ENSAYO 04B B')
group by c.name order by c.name;
