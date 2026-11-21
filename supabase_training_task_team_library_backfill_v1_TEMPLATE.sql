-- NEXO CLUB · Backfill revisable de las 31 tareas de Al-Madina SC
-- NO EJECUTAR hasta sustituir v_task_ids por los 31 UUID exactos del inventario.
-- No modifica training_tasks: solo crea enlaces idempotentes al team_id indicado.
begin;

do $backfill$
declare
  v_club_id constant uuid := 'ca0da100-0000-4000-8000-000000000001'::uuid;
  v_team_id constant uuid := '85a16f33-9fe5-44d4-b85d-37d73651ebf6'::uuid;
  v_cts_id constant uuid := '961970c8-0fcf-4c45-94d6-787647619c61'::uuid;
  v_expected_owner_id constant uuid := '4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3'::uuid;
  v_required_task_id constant uuid := '31f43e5c-e988-4c88-9d6c-8c67e58c5c7e'::uuid;
  v_owner_id uuid;
  v_task_ids uuid[] := array[
    -- PEGAR AQUÍ LOS 31 UUID REVISADOS, por ejemplo:
    -- '00000000-0000-4000-8000-000000000000'::uuid
  ]::uuid[];
  v_distinct_count integer;
  v_actual_ids uuid[];
begin
  if to_regclass('public.training_task_library_links') is null then
    raise exception 'Backfill: instala primero supabase_training_task_team_library_v1.sql';
  end if;

  select min(id::text)::uuid into v_owner_id
  from auth.users
  where lower(email) = 'analisisvigon@gmail.com'
  having count(*) = 1;
  if v_owner_id is distinct from v_expected_owner_id then
    raise exception 'Backfill: la identidad propietaria no coincide con el inventario';
  end if;

  if cardinality(v_task_ids) <> 31 or array_position(v_task_ids, null) is not null then
    raise exception 'Backfill: se requieren exactamente 31 UUID no nulos, recibidos %', cardinality(v_task_ids);
  end if;
  select count(distinct item) into v_distinct_count from unnest(v_task_ids) item;
  if v_distinct_count <> 31 then
    raise exception 'Backfill: la lista contiene UUID duplicados';
  end if;
  if array_position(v_task_ids, v_required_task_id) is null then
    raise exception 'Backfill: falta la tarea adicional revisada %', v_required_task_id;
  end if;

  -- Congela durante esta transacción el conjunto revisado y sus comparticiones;
  -- una creación o compartición concurrente espera y no invalida el preflight.
  lock table public.training_tasks, public.training_task_shares in share mode;

  perform 1
    from public.club_team_seasons relation
    join public.club_teams team
      on team.id = relation.team_id and team.club_id = relation.club_id and team.is_active
    join public.club_seasons season
      on season.id = relation.season_id and season.club_id = relation.club_id
    where relation.id = v_cts_id
      and relation.club_id = v_club_id
      and relation.team_id = v_team_id
      and season.label = '2026/2027'
      and season.status = 'open'
      and season.is_active
    for share of relation, team, season;
  if not found then
    raise exception 'Backfill: club, equipo o CTS objetivo ya no coinciden con el inventario';
  end if;

  select array_agg(task.id order by task.id) into v_actual_ids
  from public.training_tasks task
  where task.club_id = v_club_id;
  if coalesce(v_actual_ids, '{}'::uuid[]) is distinct from (
    select array_agg(item order by item) from unnest(v_task_ids) item
  ) then
    raise exception 'Backfill: el conjunto completo de tareas del club cambió desde la revisión';
  end if;
  if exists (
    select 1 from public.training_tasks task
    where task.id = any(v_task_ids)
      and (task.club_id <> v_club_id or task.author_user_id <> v_owner_id)
  ) or (select count(*) from public.training_tasks task where task.id = any(v_task_ids)) <> 31 then
    raise exception 'Backfill: club, autor o conjunto de tareas no coincide';
  end if;
  if exists (
    select 1 from public.training_task_shares share where share.task_id = any(v_task_ids)
  ) then
    raise exception 'Backfill: aparecieron comparticiones legacy no revisadas';
  end if;

  insert into public.training_task_library_links (
    task_id, club_id, team_id, shared_by_user_id
  )
  select task_id, v_club_id, v_team_id, v_owner_id
  from unnest(v_task_ids) task_id
  on conflict (task_id, team_id) do nothing;

  if (
    select count(*) from public.training_task_library_links linked
    where linked.team_id = v_team_id and linked.task_id = any(v_task_ids)
  ) <> 31 then
    raise exception 'Backfill: no quedaron enlazadas exactamente las 31 tareas; se revierte';
  end if;
end
$backfill$;

commit;
