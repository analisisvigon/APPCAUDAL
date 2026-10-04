-- Ejecutar MANUALMENTE en una base de prueba DESPUÉS de:
-- 1. supabase_training_tasks.sql
-- 2. supabase_training_tasks_patch_select_author.sql
-- Solo PostgreSQL/RLS: no prueba bytes, MIME ni signed URLs reales del Storage API.
-- Crea 5 usuarios auth fixture y requiere un jugador sin membership PLAYER activa.
-- Todo termina en ROLLBACK.
-- Todo se ejecuta dentro de una unica transaccion y termina en ROLLBACK.
-- Si un error no capturado aborta el script antes del ROLLBACK final, la
-- transaccion queda abortada: sus escrituras no pueden confirmarse y puede ser
-- necesario ejecutar ROLLBACK manualmente en esa sesion.
begin;

create or replace function pg_temp.admin_context()
returns void
language plpgsql
as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '{}'::jsonb::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  if auth.uid() is not null then
    raise exception 'training_tasks verifier failed to clear administrative auth context';
  end if;
end;
$$;

select pg_temp.admin_context();

create temporary table task_test_actors (
  n integer primary key,
  actor_key text not null unique,
  id uuid not null unique,
  email text not null unique
);

insert into task_test_actors(n, actor_key, id, email) values
  (1, 'author_a',    'b4a50000-0000-4000-8000-000000000001', 'verify.training-tasks.author-a@appcaudal.invalid'),
  (2, 'recipient_a', 'b4a50000-0000-4000-8000-000000000002', 'verify.training-tasks.recipient-a@appcaudal.invalid'),
  (3, 'outsider_a',  'b4a50000-0000-4000-8000-000000000003', 'verify.training-tasks.outsider-a@appcaudal.invalid'),
  (4, 'author_b',    'b4a50000-0000-4000-8000-000000000004', 'verify.training-tasks.author-b@appcaudal.invalid'),
  (5, 'viewer_a',    'b4a50000-0000-4000-8000-000000000005', 'verify.training-tasks.viewer-a@appcaudal.invalid');

create temporary table task_test_auth_config (
  instance_id uuid not null
);

grant execute on function pg_temp.admin_context() to authenticated;

-- Core 25-31 usan INSERT SQL transaccional en auth.users. El repositorio no
-- declara triggers propios sobre auth.users; por ello el conjunto conocido es
-- vacio. Solo se bloquean triggers no internos que se ejecutarian en INSERT.
do $$
declare
  collision_ids text;
  collision_emails text;
  collision_memberships text;
  unknown_triggers text;
  instance_count integer;
begin
  select string_agg(actor.actor_key || '=' || actor.id::text, ', ' order by actor.n)
  into collision_ids
  from task_test_actors actor
  join auth.users account on account.id = actor.id;
  if collision_ids is not null then
    raise exception 'training_tasks verifier auth UUID collision: %', collision_ids;
  end if;

  select string_agg(actor.actor_key || '=' || actor.email, ', ' order by actor.n)
  into collision_emails
  from task_test_actors actor
  join auth.users account on lower(account.email) = lower(actor.email);
  if collision_emails is not null then
    raise exception 'training_tasks verifier auth email collision: %', collision_emails;
  end if;

  select string_agg(actor.actor_key || '=' || membership.id::text, ', ' order by actor.n)
  into collision_memberships
  from task_test_actors actor
  join public.club_memberships membership on membership.user_id = actor.id;
  if collision_memberships is not null then
    raise exception 'training_tasks verifier membership collision: %', collision_memberships;
  end if;

  select string_agg(
    trigger_row.tgname || ' -> ' || function_namespace.nspname || '.' || function_row.proname,
    ', ' order by trigger_row.tgname
  )
  into unknown_triggers
  from pg_catalog.pg_trigger trigger_row
  join pg_catalog.pg_proc function_row on function_row.oid = trigger_row.tgfoid
  join pg_catalog.pg_namespace function_namespace on function_namespace.oid = function_row.pronamespace
  where trigger_row.tgrelid = 'auth.users'::regclass
    and not trigger_row.tgisinternal
    and trigger_row.tgenabled in ('O', 'A')
    and (trigger_row.tgtype::integer & 4) = 4;
  if unknown_triggers is not null then
    raise exception 'training_tasks verifier found unknown auth.users INSERT trigger(s): %', unknown_triggers;
  end if;

  select count(distinct account.instance_id)
  into instance_count
  from auth.users account
  where account.instance_id is not null;
  if instance_count <> 1 then
    raise exception 'training_tasks verifier requires exactly one non-null auth instance_id; found %', instance_count;
  end if;

  insert into task_test_auth_config(instance_id)
  select min(account.instance_id::text)::uuid
  from auth.users account
  where account.instance_id is not null;
end $$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
select
  config.instance_id,
  actor.id,
  'authenticated',
  'authenticated',
  actor.email,
  '',
  pg_catalog.now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  pg_catalog.now(),
  pg_catalog.now()
from task_test_actors actor
cross join task_test_auth_config config
order by actor.n;

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
  (select id from task_test_actors where actor_key = 'author_a'),
  (select id from task_test_actors where actor_key = 'recipient_a'),
  (select id from task_test_actors where actor_key = 'outsider_a'),
  (select id from task_test_actors where actor_key = 'author_b'),
  (select id from task_test_actors where actor_key = 'viewer_a'),
  null,
  null, null, null, null, null, null;

select pg_temp.admin_context();
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
do $$
declare
  selected_player uuid;
begin
  select player.id
  into selected_player
  from public.jugadores player
  where not exists (
    select 1
    from public.club_memberships membership
    where membership.jugador_id = player.id
      and membership.role = 'player'
      and membership.is_active
  )
  order by player.id
  limit 1
  for update of player;

  if selected_player is null then
    raise exception 'training_tasks verifier requires one player without an active PLAYER membership';
  end if;
  if exists (
    select 1
    from public.club_memberships membership
    where membership.jugador_id = selected_player
      and membership.role = 'player'
      and membership.is_active
  ) then
    raise exception 'training_tasks verifier selected player % acquired an active PLAYER membership', selected_player;
  end if;

  update task_test_context set player_jugador = selected_player;
end $$;

create or replace function pg_temp.actor(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_user, 'role', 'authenticated')::text,
    true
  );
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
with inserted_task as (
  insert into public.training_tasks(club_id,author_user_id,name,objective,game_phase,game_moment)
  select club_a,author_a,'Tarea principal','Control del balón','offensive','creation' from task_test_context
  returning id
)
update task_test_context set task_id = (select id from inserted_task);
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
select pg_temp.admin_context();
update public.club_memberships set role = 'player', jugador_id = (select player_jugador from task_test_context)
where id = (select recipient_membership from task_test_context);
set local role authenticated;
select pg_temp.actor(recipient_a) from task_test_context;
select pg_temp.assert_true((select count(*) = 0 from public.training_tasks where id = task_id), '17/22 receptor PLAYER pierde acceso') from task_test_context;
select pg_temp.assert_true((select count(*) = 0 from public.training_task_shares where task_id = c.task_id), '22 receptor PLAYER pierde metadata share') from task_test_context c;
select pg_temp.admin_context();
update public.club_memberships set role = 'staff', jugador_id = null where id = (select recipient_membership from task_test_context);
set local role authenticated;
select pg_temp.actor(recipient_a) from task_test_context;

-- 15-16: autor revocado conserva datos, pierde acceso y mutaciones.
select pg_temp.admin_context();
update public.club_memberships set is_active = false where club_id = (select club_a from task_test_context) and user_id = (select author_a from task_test_context);
set local role authenticated;
select pg_temp.actor(author_a) from task_test_context;
select pg_temp.assert_true((select count(*) = 0 from public.training_tasks where id = task_id), '15 autor revocado no lee') from task_test_context;
select pg_temp.denied(format('update public.training_tasks set name = %L where id = %L','Revocada',task_id), '16 autor revocado no edita') from task_test_context;
select pg_temp.denied(format('delete from public.training_tasks where id = %L',task_id), '16 autor revocado no borra') from task_test_context;
select pg_temp.denied(format('delete from public.training_task_shares where task_id = %L',task_id), '16 autor revocado no comparte') from task_test_context;
select pg_temp.admin_context();
update public.club_memberships set is_active = true where club_id = (select club_a from task_test_context) and user_id = (select author_a from task_test_context);
set local role authenticated;
select pg_temp.actor(author_a) from task_test_context;

-- 19: grants ANON; no acceso a tablas públicas de Tareas.
select pg_temp.assert_true(not has_table_privilege('anon','public.training_tasks','SELECT')
  and not has_table_privilege('anon','public.training_task_shares','SELECT'), '19 ANON sin grants');

-- 24-31: prueba PostgreSQL de helpers y RLS de metadatos storage.objects.
-- NO prueba upload/download/remove HTTP ni emisión/expiración de signed URLs.
select pg_temp.admin_context();
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
select pg_temp.admin_context();
update public.club_memberships set role = 'player', jugador_id = (select player_jugador from task_test_context)
where id = (select recipient_membership from task_test_context);
set local role authenticated;
select pg_temp.actor(recipient_a) from task_test_context;
select pg_temp.assert_true(not public.training_task_storage_allowed(path,'write'), '25 PLAYER no sube') from task_test_context;
select pg_temp.denied(format(
  'insert into storage.objects(bucket_id,name) values (%L,%L)',
  'training-task-files', replace(path,'.png','-player.png')
), '25 INSERT Storage PLAYER') from task_test_context;

rollback;
