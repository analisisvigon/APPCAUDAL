-- SOLO LECTURA DE DATOS; cambia claims SOLO en esta transaccion del SQL Editor.
-- Verifica los guards explicitos de las RPC, NO RLS: SQL Editor usa postgres.
-- Repetir el resultado con JWT authenticated reales desde la app o cliente.
begin;
select set_config('request.jwt.claim.sub',
  (select id::text from auth.users where email='staff-a-04b@example.invalid'),true);
select 'staff A -> A' as caso,
  (select count(*) from public.my_cts_jugadores_v1('040b0000-0000-4000-8000-000000000031')) as jugadores,
  (select count(*) from public.my_cts_matches_v1('040b0000-0000-4000-8000-000000000031')) as partidos;
select 'staff A -> B denegado' as caso,
  (select count(*) from public.my_cts_jugadores_v1('040b0000-0000-4000-8000-000000000032')) as jugadores,
  (select count(*) from public.my_cts_matches_v1('040b0000-0000-4000-8000-000000000032')) as partidos;
select set_config('request.jwt.claim.sub',
  (select id::text from auth.users where email='staff-b-04b@example.invalid'),true);
select 'staff B -> A denegado' as caso,
  (select count(*) from public.my_cts_jugadores_v1('040b0000-0000-4000-8000-000000000031')) as jugadores,
  (select count(*) from public.my_cts_matches_v1('040b0000-0000-4000-8000-000000000031')) as partidos;
select 'staff B -> B' as caso,
  (select count(*) from public.my_cts_jugadores_v1('040b0000-0000-4000-8000-000000000032')) as jugadores,
  (select count(*) from public.my_cts_matches_v1('040b0000-0000-4000-8000-000000000032')) as partidos;
select set_config('request.jwt.claim.sub',
  (select id::text from auth.users where email='outsider-04b@example.invalid'),true);
select 'sin acceso -> A denegado' as caso,
  (select count(*) from public.my_cts_jugadores_v1('040b0000-0000-4000-8000-000000000031')) as jugadores,
  (select count(*) from public.my_cts_matches_v1('040b0000-0000-4000-8000-000000000031')) as partidos;
commit;
