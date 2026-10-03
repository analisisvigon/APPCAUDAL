-- Ejecutar MANUALMENTE en una base de prueba DESPUÉS de supabase_training_tasks.sql.
-- Solo PostgreSQL/RLS: no prueba bytes, MIME ni signed URLs reales del Storage API.
-- Requiere 5 usuarios auth y un jugador sin membership PLAYER activa.
-- Todo termina en ROLLBACK.
begin;

create temporary table task_test_actors as
select id, row_number() over (order by created_at, id) as n from auth.users limit 5;
do $$ begin
  if (select count(*) from task_test_actors) < 5 then
    raise exception 'El verificador de Tareas necesita 5 usuarios auth de prueba';
  end if;
end $$;

create temporary table task_test_context (
  club_a uuid, club_b uuid, author_a uuid, recipient_a uuid,
  outsider_a uuid, author_b uuid, viewer_a uuid, player_jugador uuid,
  recipient_membership uuid, outsider_membership uuid, author_b_membership uuid, task_id uuid, sibling_task_id uuid,
  path text
);

insert into public.clubs(name) values
  ('Training Tasks Verify A ' || gen_random_uuid()::text),
  ('Training Tasks Verify B ' || gen_random_uuid()::text);

insert into task_test_context
select
  (select id from public.clubs where name like 'Training Tasks Verify A %' order by created_at desc limit 1),
  (select id from public.clubs where name like 'Training Tasks Verify B %' order by created_at desc limit 1),
  (select id from task_test_actors where n = 1),
  (select id from task_test_actors where n = 2),
  (select id from task_test_actors where n = 3),
  (select id from task_test_actors where n = 4),
  (select id from task_test_actors where n = 5),
  (select jugador.id from public.jugadores jugador where not exists (
    select 1 from public.club_memberships member
    where member.jugador_id = jugador.id and member.role = 'player' and member.is_active
  ) limit 1),
  null, null, null, null, null, null;

insert into public.club_memberships (club_id,user_id,role,is_active)
select club_a, author_a, 'staff', true from task_test_context
union all select club_a, recipient_a, 'staff', true from task_test_context
union all select club_a, outsider_a, 'staff', true from task_test_context
union all select club_b, author_b, 'staff', true from task_test_context
union all select club_a, viewer_a, 'viewer', true from task_test_context;

update task_test_context c set
  recipient_membership = (select id from public.club_memberships where club_id = c.club_a and user_id = c.recipient_a),
  outsider_membership = (select id from public.club_memberships where club_id = c.club_a and user_id = c.outsider_a),
  author_b_membership = (select id from public.club_memberships where club_id = c.club_b and user_id = c.author_b);
do $$ begin
  if (select player_jugador from task_test_context) is null then
    raise exception 'Se necesita un jugador sin membership PLAYER activa para el verificador';
  end if;
end $$;

create or replace function pg_temp.actor(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end $$;
create or replace function pg_temp.assert_true(p_condition boolean, p_label text)
returns void language plpgsql as $$
begin if not coalesce(p_condition,false) then raise exception 'FAIL: %', p_label; end if; end $$;
create or replace function pg_temp.denied(p_sql text, p_label text)
returns void language plpgsql as $$
declare affected bigint;
begin
  begin
    execute p_sql;
    get diagnostics affected = row_count;
  exception when insufficient_privilege or check_violation or raise_exception then return;
  end;
  if affected <> 0 then raise exception 'DENIAL FAILED: %', p_label; end if;
end $$;

grant select, update on task_test_context to authenticated;
grant execute on function pg_temp.actor(uuid), pg_temp.assert_true(boolean,text), pg_temp.denied(text,text) to authenticated;
set local role authenticated;

-- 1-4: autor STAFF crea, lee, edita; borrado se comprueba en una copia.
select pg_temp.actor(author_a) from task_test_context;
insert into public.training_tasks(club_id,author_user_id,name,objective,game_phase,game_moment)
select club_a,author_a,'Tarea principal','Control del balón','offensive','creation' from task_test_context;
update task_test_context c set task_id = (
  select id from public.training_tasks where club_id = c.club_a and name = 'Tarea principal'
);
select pg_temp.assert_true((select count(*) = 1 from public.training_tasks where id = task_id), '1-2 autor crea y lee') from task_test_context;
update public.training_tasks set description = 'Editada' where id = (select task_id from task_test_context);
select pg_temp.assert_true((select description = 'Editada' from public.training_tasks where id = task_id), '3 autor edita') from task_test_context;
insert into public.training_tasks(club_id,author_user_id,name,objective)
select club_a,author_a,'Temporal','Borrado' from task_test_context;
delete from public.training_tasks where name = 'Temporal' and club_id = (select club_a from task_test_context);
select pg_temp.assert_true((select count(*) = 0 from public.training_tasks where name = 'Temporal' and club_id = club_a), '4 autor borra') from task_test_context;
insert into public.training_tasks(club_id,author_user_id,name,objective)
select club_a,author_a,'Tarea hermana','Control' from task_test_context;
update task_test_context c set sibling_task_id = (
  select id from public.training_tasks where club_id = c.club_a and name = 'Tarea hermana'
);

-- 13-14: identidad inmutable, incluso si el actor tuviera ambos clubes.
select pg_temp.denied(format('update public.training_tasks set club_id = %L where id = %L',club_b,task_id), '13 club_id inmutable') from task_test_context;
select pg_temp.denied(format('update public.training_tasks set author_user_id = %L where id = %L',recipient_a,task_id), '14 author_user_id inmutable') from task_test_context;
select pg_temp.denied(format(
  'update public.training_tasks set attachment_path = %L where id = %L',
  format('%s/%s/%s/attachment-%s-ajeno.png',club_a,sibling_task_id,author_a,gen_random_uuid()),task_id
), '29 path de otra tarea existente no se puede referenciar') from task_test_context;

-- 5: STAFF sin share. 6: luego receptor explícito. 12,20,21: inserts inválidos.
select pg_temp.actor(outsider_a) from task_test_context;
select pg_temp.assert_true((select count(*) = 0 from public.training_tasks where id = task_id), '5 STAFF no compartido no lee') from task_test_context;
select pg_temp.actor(author_a) from task_test_context;
select pg_temp.denied(format(
  'insert into public.training_task_shares(task_id,membership_id,shared_by_user_id) values (%L,%L,%L)',
  task_id, author_b_membership, author_a
), '12 share cross-club') from task_test_context;
select pg_temp.denied(format(
  'insert into public.training_task_shares(task_id,membership_id,shared_by_user_id) values (%L,%L,%L)',
  task_id,recipient_membership,author_b
), '20 shared_by falsificado') from task_test_context;
select pg_temp.denied(format(
  'insert into public.training_task_shares(task_id,membership_id,shared_by_user_id) values (%L,%L,%L)',
  task_id,(select id from public.club_memberships where club_id = club_a and user_id = author_a),author_a
), '21 self-share') from task_test_context;
insert into public.training_task_shares(task_id,membership_id,shared_by_user_id)
select task_id,recipient_membership,author_a from task_test_context;

select pg_temp.actor(recipient_a) from task_test_context;
select pg_temp.assert_true((select count(*) = 1 from public.training_tasks where id = task_id), '6-23 receptor lee sin recursión') from task_test_context;
select pg_temp.assert_true((select count(*) = 1 from public.training_task_shares where task_id = c.task_id), '6 receptor ve su share') from task_test_context c;
select pg_temp.denied(format('update public.training_tasks set name = %L where id = %L','Ataque',task_id), '7 receptor no edita') from task_test_context;
select pg_temp.denied(format('delete from public.training_tasks where id = %L',task_id), '8 receptor no borra') from task_test_context;
select pg_temp.denied(format('delete from public.training_task_shares where task_id = %L',task_id), '9 receptor no gestiona shares') from task_test_context;
insert into public.training_tasks(club_id,author_user_id,name,objective,game_phase,game_moment)
select club_a,recipient_a,'Copia propia','Control del balón','offensive','creation' from task_test_context;
select pg_temp.assert_true((select count(*) = 1 from public.training_tasks where author_user_id = recipient_a and name = 'Copia propia'), '10 receptor duplica como propia') from task_test_context;

-- 11,18: otro club y VIEWER no leen.
select pg_temp.actor(author_b) from task_test_context;
select pg_temp.assert_true((select count(*) = 0 from public.training_tasks where id = task_id), '11 otro club no lee') from task_test_context;
select pg_temp.actor(viewer_a) from task_test_context;
select pg_temp.assert_true((select count(*) = 0 from public.training_tasks where id = task_id), '18 VIEWER no lee') from task_test_context;

-- 17,22: receptor pierde acceso al pasar a PLAYER con jugador_id válido.
reset role;
update public.club_memberships set role = 'player', jugador_id = (select player_jugador from task_test_context)
where id = (select recipient_membership from task_test_context);
set local role authenticated;
select pg_temp.actor(recipient_a) from task_test_context;
select pg_temp.assert_true((select count(*) = 0 from public.training_tasks where id = task_id), '17/22 receptor PLAYER pierde acceso') from task_test_context;
select pg_temp.assert_true((select count(*) = 0 from public.training_task_shares where task_id = c.task_id), '22 receptor PLAYER pierde metadata share') from task_test_context c;
reset role;
update public.club_memberships set role = 'staff', jugador_id = null where id = (select recipient_membership from task_test_context);
set local role authenticated;

-- 15-16: autor revocado conserva datos, pierde acceso y mutaciones.
reset role;
update public.club_memberships set is_active = false where club_id = (select club_a from task_test_context) and user_id = (select author_a from task_test_context);
set local role authenticated;
select pg_temp.actor(author_a) from task_test_context;
select pg_temp.assert_true((select count(*) = 0 from public.training_tasks where id = task_id), '15 autor revocado no lee') from task_test_context;
select pg_temp.denied(format('update public.training_tasks set name = %L where id = %L','Revocada',task_id), '16 autor revocado no edita') from task_test_context;
select pg_temp.denied(format('delete from public.training_tasks where id = %L',task_id), '16 autor revocado no borra') from task_test_context;
select pg_temp.denied(format('delete from public.training_task_shares where task_id = %L',task_id), '16 autor revocado no comparte') from task_test_context;
reset role;
update public.club_memberships set is_active = true where club_id = (select club_a from task_test_context) and user_id = (select author_a from task_test_context);
set local role authenticated;

-- 19: grants ANON; no acceso a tablas públicas de Tareas.
select pg_temp.assert_true(not has_table_privilege('anon','public.training_tasks','SELECT')
  and not has_table_privilege('anon','public.training_task_shares','SELECT'), '19 ANON sin grants');

-- 24-31: prueba PostgreSQL de helpers y RLS de metadatos storage.objects.
-- NO prueba upload/download/remove HTTP ni emisión/expiración de signed URLs.
reset role;
update task_test_context c set path = format('%s/%s/%s/attachment-%s-ejercicio.png',club_a,task_id,author_a,gen_random_uuid());
set local role authenticated;
select pg_temp.actor(author_a) from task_test_context;
select pg_temp.assert_true(public.training_task_storage_allowed(path,'write'), '24 autor puede subir path de tarea') from task_test_context;
select pg_temp.assert_true(not public.training_task_storage_allowed(format('%s/%s/%s/attachment-%s-otro.png',club_a,gen_random_uuid(),author_a,gen_random_uuid()),'write'), '29 path de otra tarea rechazado') from task_test_context;
insert into storage.objects(bucket_id,name)
select 'training-task-files',path from task_test_context;
select pg_temp.assert_true((select count(*) = 1 from storage.objects where bucket_id = 'training-task-files' and name = path), '24 INSERT Storage metadata y SELECT autor') from task_test_context;
update public.training_tasks set attachment_path = (select path from task_test_context)
where id = (select task_id from task_test_context);
select pg_temp.assert_true(public.training_task_storage_allowed(path,'read'), '26 autor lee metadata objeto') from task_test_context;
select pg_temp.actor(recipient_a) from task_test_context;
select pg_temp.assert_true(public.training_task_storage_allowed(path,'read'), '27 receptor lee metadata objeto') from task_test_context;
select pg_temp.assert_true((select count(*) = 1 from storage.objects where bucket_id = 'training-task-files' and name = path), '27 SELECT Storage receptor') from task_test_context;
select pg_temp.assert_true(not public.training_task_storage_allowed(path,'write'), '30 receptor no borra metadata objeto') from task_test_context;
select pg_temp.denied(format('delete from storage.objects where bucket_id = %L and name = %L','training-task-files',path), '30 DELETE Storage receptor') from task_test_context;
select pg_temp.actor(outsider_a) from task_test_context;
select pg_temp.assert_true(not public.training_task_storage_allowed(path,'read'), '28 STAFF sin share no lee metadata') from task_test_context;
select pg_temp.assert_true((select count(*) = 0 from storage.objects where bucket_id = 'training-task-files' and name = path), '28 SELECT Storage STAFF sin share') from task_test_context;
select pg_temp.actor(author_b) from task_test_context;
select pg_temp.assert_true(not public.training_task_storage_allowed(path,'read'), '31 otro club no lee metadata') from task_test_context;
select pg_temp.assert_true((select count(*) = 0 from storage.objects where bucket_id = 'training-task-files' and name = path), '31 SELECT Storage cross-club') from task_test_context;
select pg_temp.actor(recipient_a) from task_test_context;
reset role;
update public.club_memberships set role = 'player', jugador_id = (select player_jugador from task_test_context)
where id = (select recipient_membership from task_test_context);
set local role authenticated;
select pg_temp.assert_true(not public.training_task_storage_allowed(path,'write'), '25 PLAYER no sube') from task_test_context;
select pg_temp.denied(format(
  'insert into storage.objects(bucket_id,name) values (%L,%L)',
  'training-task-files', replace(path,'.png','-player.png')
), '25 INSERT Storage PLAYER') from task_test_context;

rollback;
