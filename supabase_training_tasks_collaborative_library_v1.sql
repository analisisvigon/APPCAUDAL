-- NEXO CLUB · Biblioteca colaborativa de Tareas V1
-- REVISAR antes de instalar. No migra ni publica automáticamente tareas existentes.
-- Las tareas existentes quedan privadas; las nuevas nacen en la biblioteca común del club.
begin;

do $$
declare
  v_authorization_definition text;
begin
  if to_regclass('public.training_tasks') is null
     or to_regclass('public.training_task_shares') is null
     or to_regclass('public.club_memberships') is null then
    raise exception 'Biblioteca colaborativa: faltan tablas requeridas';
  end if;
  if to_regprocedure('public.training_task_authorized(uuid,text)') is null
     or to_regprocedure('public.can_edit_club_data(uuid)') is null then
    raise exception 'Biblioteca colaborativa: faltan helpers de autorización';
  end if;
  if to_regprocedure('public.set_training_task_sharing_v1(uuid,text,uuid[])') is not null then
    raise exception 'Biblioteca colaborativa: set_training_task_sharing_v1 ya existe; revisar antes de sobrescribir';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_policy policy_row
    where policy_row.polrelid = 'public.training_tasks'::regclass
      and policy_row.polname = 'training_tasks_select'
      and policy_row.polcmd = 'r'
  ) then
    raise exception 'Biblioteca colaborativa: falta la policy training_tasks_select esperada';
  end if;
  select pg_catalog.pg_get_functiondef('public.training_task_authorized(uuid,text)'::regprocedure)
  into v_authorization_definition;
  if v_authorization_definition !~ 'author_user_id'
     or v_authorization_definition !~ 'can_edit_club_data'
     or v_authorization_definition !~ 'training_task_shares' then
    raise exception 'Biblioteca colaborativa: contrato de autorización desconocido; revisar inventario antes de instalar';
  end if;
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'training_tasks'
      and column_name = 'library_visibility'
  ) then
    raise exception 'Biblioteca colaborativa: library_visibility ya existe; no reinstalar esta migración';
  end if;
end;
$$;

-- El DEFAULT inicial preserva la privacidad de todas las filas preexistentes.
alter table public.training_tasks
  add column library_visibility text not null default 'private';

alter table public.training_tasks
  add constraint training_tasks_library_visibility_check
  check (library_visibility in ('private', 'club'));

-- Solo las inserciones posteriores a esta migración serán comunes por defecto.
alter table public.training_tasks
  alter column library_visibility set default 'club';

comment on column public.training_tasks.library_visibility is
  'private: autor o receptores explícitos; club: OWNER/ADMIN/STAFF activos del club. No depende de temporada.';

-- Conserva íntegramente WRITE/SHARE para el autor. READ añade la biblioteca común
-- y mantiene las comparticiones individuales legacy.
create or replace function public.training_task_authorized(p_task_id uuid, p_action text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.training_tasks task
    where task.id = p_task_id
      and auth.uid() is not null
      and public.can_edit_club_data(task.club_id)
      and p_action in ('read', 'write', 'share')
      and (
        task.author_user_id = auth.uid()
        or (
          p_action = 'read'
          and (
            task.library_visibility = 'club'
            or exists (
              select 1
              from public.training_task_shares share
              join public.club_memberships recipient
                on recipient.id = share.membership_id
              where share.task_id = task.id
                and recipient.club_id = task.club_id
                and recipient.user_id = auth.uid()
                and recipient.is_active
                and recipient.role in ('owner', 'admin', 'staff')
            )
          )
        )
      )
  );
$$;
alter function public.training_task_authorized(uuid, text) owner to postgres;

-- La policy queda consolidada en el helper. Los recursos dependientes (media,
-- feedback y Storage) ya reutilizan el mismo helper de lectura.
alter policy training_tasks_select on public.training_tasks
  to authenticated
  using (public.training_task_authorized(id, 'read'));

-- Cambio atómico de visibilidad y receptores legacy. Solo el autor activo del
-- club puede ejecutarlo. No concede UPDATE/DELETE de la tarea a los receptores.
create or replace function public.set_training_task_sharing_v1(
  p_task_id uuid,
  p_library_visibility text,
  p_membership_ids uuid[] default '{}'::uuid[]
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_task public.training_tasks%rowtype;
  v_membership_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'Biblioteca de Tareas: autenticación requerida';
  end if;
  if p_library_visibility not in ('private', 'club') then
    raise exception 'Biblioteca de Tareas: visibilidad no válida';
  end if;
  if exists (select 1 from unnest(coalesce(p_membership_ids, '{}'::uuid[])) item where item is null) then
    raise exception 'Biblioteca de Tareas: receptor no válido';
  end if;

  select task.*
  into v_task
  from public.training_tasks task
  where task.id = p_task_id
  for update;

  if not found then
    raise exception 'Biblioteca de Tareas: tarea no encontrada';
  end if;
  if v_task.author_user_id <> auth.uid()
     or not public.can_edit_club_data(v_task.club_id) then
    raise exception 'Biblioteca de Tareas: solo el autor autorizado puede cambiar la compartición';
  end if;

  select coalesce(array_agg(distinct item order by item), '{}'::uuid[])
  into v_membership_ids
  from unnest(coalesce(p_membership_ids, '{}'::uuid[])) item;

  if exists (
    select 1
    from unnest(v_membership_ids) requested(membership_id)
    left join public.club_memberships recipient
      on recipient.id = requested.membership_id
    where recipient.id is null
       or recipient.club_id <> v_task.club_id
       or recipient.user_id = auth.uid()
       or not recipient.is_active
       or recipient.role not in ('owner', 'admin', 'staff')
  ) then
    raise exception 'Biblioteca de Tareas: existe un receptor no autorizado o de otro club';
  end if;

  update public.training_tasks
  set library_visibility = p_library_visibility
  where id = p_task_id;

  delete from public.training_task_shares
  where task_id = p_task_id;

  insert into public.training_task_shares (task_id, membership_id, shared_by_user_id)
  select p_task_id, membership_id, auth.uid()
  from unnest(v_membership_ids) requested(membership_id);

  return true;
end;
$$;
alter function public.set_training_task_sharing_v1(uuid, text, uuid[]) owner to postgres;

revoke all on function public.set_training_task_sharing_v1(uuid, text, uuid[])
  from public, anon, authenticated;
grant execute on function public.set_training_task_sharing_v1(uuid, text, uuid[])
  to authenticated;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'training_tasks'
      and column_name = 'library_visibility'
      and is_nullable = 'NO'
      and column_default = '''club''::text'
  ) then
    raise exception 'Biblioteca colaborativa: contrato de columna no válido';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_policy policy_row
    where policy_row.polrelid = 'public.training_tasks'::regclass
      and policy_row.polname = 'training_tasks_select'
      and pg_catalog.pg_get_expr(policy_row.polqual, policy_row.polrelid)
          ~ 'training_task_authorized'
  ) then
    raise exception 'Biblioteca colaborativa: policy SELECT no consolidada';
  end if;
end;
$$;

commit;
