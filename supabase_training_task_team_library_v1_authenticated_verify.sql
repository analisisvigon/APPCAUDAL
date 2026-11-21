-- NEXO CLUB · Prueba RLS/RPC con las cuatro identidades reales.
-- Crea filas de prueba dentro de esta transacción y las revierte al final.
-- No ejecutar hasta instalar foundation + backfill y revisar este archivo.
begin;

do $identity_precheck$
declare
  v_count integer;
begin
  select count(*) into v_count from auth.users
  where lower(email) = any(array[
    'analisisvigon@gmail.com','2samuelbc79@gmail.com',
    'almadinacalvillo@gmail.com','turonovo@gmail.com'
  ]::text[]);
  if v_count <> 4 then
    raise exception 'Verificación autenticada: no se resolvieron exactamente las cuatro cuentas';
  end if;
end
$identity_precheck$;

-- OWNER: debe ver las 30 tareas tras el backfill.
select set_config('request.jwt.claim.sub', (
  select id::text from auth.users where lower(email) = 'analisisvigon@gmail.com'
), true);
set local role authenticated;
do $owner_count$
begin
  if (select count(*) from public.training_task_library_scope_v1(
    '961970c8-0fcf-4c45-94d6-787647619c61'::uuid, null, null, 0, 250
  )) <> 30 then
    raise exception 'OWNER no ve exactamente las 30 tareas iniciales';
  end if;
end
$owner_count$;
reset role;

-- Cada STAFF autorizado debe ver las mismas 30 tareas.
select set_config('request.jwt.claim.sub', (
  select id::text from auth.users where lower(email) = '2samuelbc79@gmail.com'
), true);
set local role authenticated;
do $samuel_count$
begin
  if (select count(*) from public.training_task_library_scope_v1(
    '961970c8-0fcf-4c45-94d6-787647619c61'::uuid, null, null, 0, 250
  )) <> 30 then raise exception 'Samuel no ve exactamente 30 tareas'; end if;
end
$samuel_count$;
reset role;

select set_config('request.jwt.claim.sub', (
  select id::text from auth.users where lower(email) = 'almadinacalvillo@gmail.com'
), true);
set local role authenticated;
do $calvillo_count$
begin
  if (select count(*) from public.training_task_library_scope_v1(
    '961970c8-0fcf-4c45-94d6-787647619c61'::uuid, null, null, 0, 250
  )) <> 30 then raise exception 'Calvillo no ve exactamente 30 tareas'; end if;
end
$calvillo_count$;
reset role;

select set_config('request.jwt.claim.sub', (
  select id::text from auth.users where lower(email) = 'turonovo@gmail.com'
), true);
set local role authenticated;
do $turono_count$
begin
  if (select count(*) from public.training_task_library_scope_v1(
    '961970c8-0fcf-4c45-94d6-787647619c61'::uuid, null, null, 0, 250
  )) <> 30 then raise exception 'Turonovo no ve exactamente 30 tareas'; end if;
end
$turono_count$;
reset role;

-- Samuel crea una tarea compartida de prueba de forma atómica.
select set_config('nexo.shared_task_id', gen_random_uuid()::text, true);
select set_config('request.jwt.claim.sub', (
  select id::text from auth.users where lower(email) = '2samuelbc79@gmail.com'
), true);
set local role authenticated;
select public.create_shared_training_task_v1(
  '961970c8-0fcf-4c45-94d6-787647619c61'::uuid,
  current_setting('nexo.shared_task_id')::uuid,
  jsonb_build_object(
    'name', 'VERIFICACIÓN TRANSACCIONAL · NO PERSISTE',
    'objective', 'Comprobar creación y lectura compartida',
    'task_type', 'Otro',
    'stage_keys', '[]'::jsonb,
    'editor_payload', '{}'::jsonb
  )
);
reset role;

-- OWNER y los otros STAFF leen la tarea creada por Samuel mediante RLS real.
select set_config('request.jwt.claim.sub', (
  select id::text from auth.users where lower(email) = 'analisisvigon@gmail.com'
), true);
set local role authenticated;
do $owner_reads_staff_task$
begin
  if (select count(*) from public.training_tasks
      where id = current_setting('nexo.shared_task_id')::uuid) <> 1 then
    raise exception 'OWNER no lee la tarea creada por STAFF';
  end if;
end
$owner_reads_staff_task$;
reset role;

select set_config('request.jwt.claim.sub', (
  select id::text from auth.users where lower(email) = 'almadinacalvillo@gmail.com'
), true);
set local role authenticated;
do $staff_reads_staff_task$
begin
  if (select count(*) from public.training_tasks
      where id = current_setting('nexo.shared_task_id')::uuid) <> 1 then
    raise exception 'Otro STAFF no lee la tarea compartida';
  end if;
end
$staff_reads_staff_task$;
reset role;

-- Una tarea personal del OWNER sin enlace debe permanecer privada.
select set_config('nexo.private_task_id', gen_random_uuid()::text, true);
select set_config('request.jwt.claim.sub', (
  select id::text from auth.users where lower(email) = 'analisisvigon@gmail.com'
), true);
set local role authenticated;
insert into public.training_tasks (
  id, club_id, author_user_id, name, objective, task_type, editor_payload
) values (
  current_setting('nexo.private_task_id')::uuid,
  'ca0da100-0000-4000-8000-000000000001'::uuid,
  auth.uid(), 'VERIFICACIÓN PRIVADA · NO PERSISTE',
  'Comprobar aislamiento personal', 'Otro', '{}'::jsonb
);
reset role;

select set_config('request.jwt.claim.sub', (
  select id::text from auth.users where lower(email) = 'almadinacalvillo@gmail.com'
), true);
set local role authenticated;
do $private_is_hidden$
begin
  if (select count(*) from public.training_tasks
      where id = current_setting('nexo.private_task_id')::uuid) <> 0 then
    raise exception 'Una tarea personal sin enlace quedó visible para STAFF';
  end if;
end
$private_is_hidden$;
reset role;

-- Simula revocación de Turonovo dentro de la transacción. Debe perder lectura
-- de la tarea de Samuel; ROLLBACK restaura el permiso al finalizar.
delete from public.club_team_season_permissions permission
using public.club_memberships membership, auth.users account
where permission.membership_id = membership.id
  and membership.user_id = account.id
  and lower(account.email) = 'turonovo@gmail.com'
  and permission.club_team_season_id = '961970c8-0fcf-4c45-94d6-787647619c61'::uuid;

select set_config('request.jwt.claim.sub', (
  select id::text from auth.users where lower(email) = 'turonovo@gmail.com'
), true);
set local role authenticated;
do $revoked_is_hidden$
begin
  if (select count(*) from public.training_tasks
      where id = current_setting('nexo.shared_task_id')::uuid) <> 0 then
    raise exception 'STAFF revocado conserva acceso compartido';
  end if;
end
$revoked_is_hidden$;
reset role;

rollback;
