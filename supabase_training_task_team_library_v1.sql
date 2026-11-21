-- NEXO CLUB · Biblioteca de Tareas compartida por equipo V1
-- Instalar después de revisar el inventario y antes del backfill de las 30 tareas.
-- Aditiva, idempotente y transaccional. No modifica tareas ni snapshots existentes.
begin;

do $preflight$
declare
  v_existing_table oid;
begin
  if to_regclass('public.training_tasks') is null
     or to_regclass('public.training_task_shares') is null
     or to_regclass('public.training_task_feedback') is null
     or to_regclass('public.training_task_media') is null
     or to_regclass('public.club_teams') is null
     or to_regclass('public.club_team_seasons') is null
     or to_regclass('public.club_team_season_permissions') is null
     or to_regclass('public.club_seasons') is null then
    raise exception 'Biblioteca por equipo: faltan tablas requeridas';
  end if;
  if to_regprocedure('public.training_task_authorized(uuid,text)') is null
     or to_regprocedure('public.training_task_storage_allowed(text,text)') is null
     or to_regprocedure('public.training_task_media_path_matches(text,uuid,uuid,uuid,uuid)') is null
     or to_regprocedure('public.can_read_club_team_season(uuid)') is null
     or to_regprocedure('public.can_write_club_team_season(uuid)') is null then
    raise exception 'Biblioteca por equipo: faltan helpers de autorización';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'training_tasks'
      and column_name = 'library_visibility'
  ) or to_regprocedure('public.set_training_task_sharing_v1(uuid,text,uuid[])') is not null then
    raise exception 'Biblioteca por equipo: se detectó la propuesta club-wide; no instalar encima sin revisión';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'training_tasks'
      and column_name = 'task_code'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'training_tasks'
      and column_name = 'series_count'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'training_tasks'
      and column_name = 'exercise_rules'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'training_tasks'
      and column_name = 'stage_keys'
  ) then
    raise exception 'Biblioteca por equipo: training_tasks no tiene el contrato funcional completo';
  end if;

  v_existing_table := to_regclass('public.training_task_library_links')::oid;
  if v_existing_table is not null
     and obj_description(v_existing_table, 'pg_class') is distinct from
       'NEXO CLUB team-scoped shared training task libraries V1' then
    raise exception 'Biblioteca por equipo: training_task_library_links existe con contrato desconocido';
  end if;
end
$preflight$;

create table if not exists public.training_task_library_links (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.training_tasks(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete restrict,
  team_id uuid not null,
  shared_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint training_task_library_links_task_team_key unique (task_id, team_id),
  constraint training_task_library_links_team_club_fkey
    foreign key (team_id, club_id)
    references public.club_teams(id, club_id)
    on update no action on delete restrict
);

comment on table public.training_task_library_links is
  'NEXO CLUB team-scoped shared training task libraries V1';
comment on column public.training_task_library_links.team_id is
  'Equipo propietario de la biblioteca compartida; independiente de temporada.';
comment on column public.training_task_library_links.club_id is
  'Club del equipo compartido; puede diferir del club de origen de una tarea personal reutilizada.';

create index if not exists training_task_library_links_team_task_idx
  on public.training_task_library_links(team_id, task_id);
create index if not exists training_task_library_links_task_idx
  on public.training_task_library_links(task_id);

-- OWNER/ADMIN activos leen la biblioteca de un equipo activo. STAFF necesita
-- un permiso CTS del mismo equipo cuya temporada siga abierta y activa.
create or replace function public.training_task_team_authorized(
  p_team_id uuid,
  p_action text default 'read'
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(
    auth.uid() is not null
    and p_team_id is not null
    and p_action in ('read', 'write')
    and exists (
      select 1
      from public.club_teams team
      join public.club_memberships actor
        on actor.club_id = team.club_id
       and actor.user_id = auth.uid()
       and actor.is_active
      where team.id = p_team_id
        and team.is_active
        and (
          (
            actor.role in ('owner', 'admin')
            and (
              p_action = 'read'
              or exists (
                select 1
                from public.club_team_seasons relation
                join public.club_seasons season
                  on season.id = relation.season_id
                 and season.club_id = relation.club_id
                where relation.team_id = team.id
                  and relation.club_id = team.club_id
                  and season.status = 'open'
                  and season.is_active
              )
            )
          )
          or (
            actor.role = 'staff'
            and exists (
              select 1
              from public.club_team_seasons relation
              join public.club_seasons season
                on season.id = relation.season_id
               and season.club_id = relation.club_id
              join public.club_team_season_permissions permission
                on permission.club_id = relation.club_id
               and permission.club_team_season_id = relation.id
               and permission.membership_id = actor.id
              where relation.team_id = team.id
                and relation.club_id = team.club_id
                and season.status = 'open'
                and season.is_active
            )
          )
        )
    ),
    false
  );
$function$;
alter function public.training_task_team_authorized(uuid, text) owner to postgres;

-- Personal: el autor conserva lectura. Las mutaciones siguen siendo solo del
-- autor y, si la tarea está compartida, requieren escritura vigente en todos
-- los equipos enlazados. Lectura compartida deriva siempre del team_id.
create or replace function public.training_task_authorized(p_task_id uuid, p_action text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(exists (
    select 1
    from public.training_tasks task
    where task.id = p_task_id
      and auth.uid() is not null
      and p_action in ('read', 'write', 'share')
      and (
        (
          task.author_user_id = auth.uid()
          and (
            p_action = 'read'
            or not exists (
              select 1
              from public.training_task_library_links linked
              where linked.task_id = task.id
                and not public.training_task_team_authorized(linked.team_id, 'write')
            )
          )
        )
        or (
          p_action = 'read'
          and exists (
            select 1
            from public.training_task_library_links linked
            where linked.task_id = task.id
              and public.training_task_team_authorized(linked.team_id, 'read')
          )
        )
        or (
          p_action = 'read'
          and exists (
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
  ), false);
$function$;
alter function public.training_task_authorized(uuid, text) owner to postgres;

-- Devuelve solo IDs del ámbito solicitado: biblioteca personal completa del
-- autor más biblioteca compartida del equipo del CTS. La paginación evita
-- límites de URL y mantiene exportaciones grandes.
create or replace function public.training_task_library_scope_v1(
  p_cts_id uuid,
  p_created_from timestamptz default null,
  p_created_until timestamptz default null,
  p_offset integer default 0,
  p_limit integer default 250
)
returns table (
  task_id uuid,
  is_personal boolean,
  is_shared_with_team boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_team_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Biblioteca de Tareas: autenticación requerida' using errcode = '42501';
  end if;
  if p_offset < 0 or p_limit < 1 or p_limit > 250 then
    raise exception 'Biblioteca de Tareas: paginación no válida' using errcode = '22023';
  end if;
  if p_created_from is not null and p_created_until is not null
     and p_created_from >= p_created_until then
    raise exception 'Biblioteca de Tareas: intervalo no válido' using errcode = '22023';
  end if;

  select relation.team_id into v_team_id
  from public.club_team_seasons relation
  where relation.id = p_cts_id
    and public.can_read_club_team_season(relation.id);
  if v_team_id is null
     or not public.training_task_team_authorized(v_team_id, 'read') then
    raise exception 'Biblioteca de Tareas: equipo no autorizado' using errcode = '42501';
  end if;

  return query
  with scoped as (
    select
      task.id,
      task.author_user_id = auth.uid() as personal,
      exists (
        select 1 from public.training_task_library_links linked
        where linked.task_id = task.id and linked.team_id = v_team_id
      ) as shared_with_team,
      task.updated_at
    from public.training_tasks task
    where (p_created_from is null or task.created_at >= p_created_from)
      and (p_created_until is null or task.created_at < p_created_until)
      and (
        task.author_user_id = auth.uid()
        or exists (
          select 1 from public.training_task_library_links linked
          where linked.task_id = task.id and linked.team_id = v_team_id
        )
      )
  )
  select scoped.id, scoped.personal, scoped.shared_with_team,
    count(*) over ()::bigint
  from scoped
  order by scoped.updated_at desc, scoped.id
  offset p_offset limit p_limit;
end
$function$;
alter function public.training_task_library_scope_v1(uuid, timestamptz, timestamptz, integer, integer) owner to postgres;

-- Creación atómica de tarea + enlace a la biblioteca del equipo seleccionado.
create or replace function public.create_shared_training_task_v1(
  p_cts_id uuid,
  p_task_id uuid,
  p_task_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_relation record;
  v_candidate public.training_tasks%rowtype;
  v_created public.training_tasks%rowtype;
  v_unknown_keys text[];
begin
  if auth.uid() is null then
    raise exception 'Biblioteca de Tareas: autenticación requerida' using errcode = '42501';
  end if;
  if p_task_id is null or jsonb_typeof(p_task_payload) <> 'object' then
    raise exception 'Biblioteca de Tareas: tarea no válida' using errcode = '22023';
  end if;

  select relation.id, relation.club_id, relation.team_id
  into v_relation
  from public.club_team_seasons relation
  join public.club_teams team
    on team.id = relation.team_id and team.club_id = relation.club_id and team.is_active
  join public.club_seasons season
    on season.id = relation.season_id and season.club_id = relation.club_id
  where relation.id = p_cts_id
    and season.status = 'open'
    and season.is_active
    and public.can_write_club_team_season(relation.id);
  if v_relation.id is null then
    raise exception 'Biblioteca de Tareas: CTS abierto no autorizado' using errcode = '42501';
  end if;

  select array_agg(key order by key) into v_unknown_keys
  from jsonb_object_keys(p_task_payload) key
  where key <> all (array[
    'name','task_code','description','objective','task_type','players_spec',
    'players_min','players_max','duration_minutes','series_count','minutes_per_series',
    'space_width_m','space_length_m','material','technical_content','tactical_content',
    'exercise_rules','tactical_content_offensive','tactical_content_defensive',
    'game_phase','game_moment','observations','stage_keys','variants',
    'preview_path','attachment_path','attachment_name','attachment_mime','attachment_size',
    'editor_payload'
  ]::text[]);
  if v_unknown_keys is not null then
    raise exception 'Biblioteca de Tareas: campos no permitidos %', v_unknown_keys using errcode = '22023';
  end if;
  if exists (select 1 from public.training_tasks task where task.id = p_task_id) then
    raise exception 'Biblioteca de Tareas: identificador de tarea ya utilizado' using errcode = '23505';
  end if;

  v_candidate := jsonb_populate_record(null::public.training_tasks, p_task_payload);

  insert into public.training_tasks (
    id, club_id, author_user_id, name, task_code, description, objective, task_type,
    players_spec, players_min, players_max, duration_minutes, series_count, minutes_per_series,
    space_width_m, space_length_m, material, technical_content, tactical_content,
    exercise_rules, tactical_content_offensive, tactical_content_defensive,
    game_phase, game_moment, observations, stage_keys, variants,
    preview_path, attachment_path, attachment_name, attachment_mime, attachment_size,
    editor_payload
  ) values (
    p_task_id, v_relation.club_id, auth.uid(), v_candidate.name, v_candidate.task_code,
    v_candidate.description, v_candidate.objective, coalesce(v_candidate.task_type, 'Otro'),
    v_candidate.players_spec, v_candidate.players_min, v_candidate.players_max,
    v_candidate.duration_minutes, v_candidate.series_count, v_candidate.minutes_per_series,
    v_candidate.space_width_m, v_candidate.space_length_m, v_candidate.material,
    v_candidate.technical_content, v_candidate.tactical_content, v_candidate.exercise_rules,
    v_candidate.tactical_content_offensive, v_candidate.tactical_content_defensive,
    v_candidate.game_phase, v_candidate.game_moment, v_candidate.observations,
    coalesce(v_candidate.stage_keys, '{}'::text[]), v_candidate.variants,
    null, null, null, null, null, coalesce(v_candidate.editor_payload, '{}'::jsonb)
  ) returning * into v_created;

  insert into public.training_task_library_links (
    task_id, club_id, team_id, shared_by_user_id
  ) values (
    v_created.id, v_relation.club_id, v_relation.team_id, auth.uid()
  );

  return to_jsonb(v_created) || jsonb_build_object(
    'is_shared_with_team', true,
    'library_team_ids', jsonb_build_array(v_relation.team_id)
  );
end
$function$;
alter function public.create_shared_training_task_v1(uuid, uuid, jsonb) owner to postgres;

-- Promoción o retirada explícita de una tarea personal en el equipo actual.
create or replace function public.set_training_task_team_link_v1(
  p_task_id uuid,
  p_cts_id uuid,
  p_shared boolean
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_task public.training_tasks%rowtype;
  v_relation record;
begin
  if auth.uid() is null or p_shared is null then
    raise exception 'Biblioteca de Tareas: solicitud no válida' using errcode = '42501';
  end if;

  select task.* into v_task
  from public.training_tasks task
  where task.id = p_task_id
  for update;
  if not found or v_task.author_user_id <> auth.uid() then
    raise exception 'Biblioteca de Tareas: solo el autor puede cambiar el enlace' using errcode = '42501';
  end if;

  select relation.id, relation.club_id, relation.team_id
  into v_relation
  from public.club_team_seasons relation
  join public.club_teams team
    on team.id = relation.team_id and team.club_id = relation.club_id and team.is_active
  join public.club_seasons season
    on season.id = relation.season_id and season.club_id = relation.club_id
  where relation.id = p_cts_id
    and season.status = 'open'
    and season.is_active
    and public.can_write_club_team_season(relation.id);
  if v_relation.id is null then
    raise exception 'Biblioteca de Tareas: CTS abierto no autorizado' using errcode = '42501';
  end if;

  if p_shared then
    insert into public.training_task_library_links (
      task_id, club_id, team_id, shared_by_user_id
    ) values (
      p_task_id, v_relation.club_id, v_relation.team_id, auth.uid()
    ) on conflict (task_id, team_id) do nothing;
  else
    delete from public.training_task_library_links linked
    where linked.task_id = p_task_id and linked.team_id = v_relation.team_id;
  end if;
  return true;
end
$function$;
alter function public.set_training_task_team_link_v1(uuid, uuid, boolean) owner to postgres;

-- Storage se apoya en la misma autorización de la tarea, incluso si la tarea
-- personal procede de otro club. Solo el autor autorizado conserva escritura.
create or replace function public.training_task_storage_allowed(p_path text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select
    exists (
      select 1 from public.training_tasks task
      where public.training_task_path_matches(p_path, task.club_id, task.id, task.author_user_id)
        and auth.uid() is not null
        and (
          (p_action = 'read' and (task.preview_path = p_path or task.attachment_path = p_path)
            and public.training_task_authorized(task.id, 'read'))
          or (p_action = 'write' and public.training_task_authorized(task.id, 'write'))
        )
    )
    or exists (
      select 1
      from public.training_task_media media
      where media.source = 'upload'
        and media.storage_path = p_path
        and public.training_task_media_path_matches(
          p_path, media.club_id, media.task_id, media.author_user_id, media.id
        )
        and (
          (p_action = 'read' and public.training_task_authorized(media.task_id, 'read'))
          or (p_action = 'write' and media.author_user_id = auth.uid()
            and public.training_task_authorized(media.task_id, 'write'))
        )
    );
$function$;
alter function public.training_task_storage_allowed(text, text) owner to postgres;

alter table public.training_task_library_links enable row level security;

drop policy if exists training_task_library_links_select on public.training_task_library_links;
create policy training_task_library_links_select
on public.training_task_library_links for select to authenticated
using (
  public.training_task_team_authorized(team_id, 'read')
  or shared_by_user_id = auth.uid()
);

alter policy training_tasks_select on public.training_tasks
  to authenticated using (public.training_task_authorized(id, 'read'));
alter policy training_tasks_update on public.training_tasks
  to authenticated
  using (public.training_task_authorized(id, 'write'))
  with check (public.training_task_authorized(id, 'write'));
alter policy training_tasks_delete on public.training_tasks
  to authenticated using (public.training_task_authorized(id, 'write'));

-- El guard de feedback deriva club y autor. Eliminar can_edit_club_data(club_id)
-- permite POST a un receptor autorizado por equipo sin ampliar otras tareas.
drop policy if exists training_task_feedback_insert on public.training_task_feedback;
create policy training_task_feedback_insert
on public.training_task_feedback for insert to authenticated
with check (
  author_user_id = auth.uid()
  and public.training_task_authorized(task_id, 'read')
);

revoke all on table public.training_task_library_links from public, anon, authenticated;
grant select on table public.training_task_library_links to authenticated;
grant select, insert, update, delete on table public.training_task_library_links to service_role;

revoke all on function public.training_task_team_authorized(uuid, text),
  public.training_task_library_scope_v1(uuid, timestamptz, timestamptz, integer, integer),
  public.create_shared_training_task_v1(uuid, uuid, jsonb),
  public.set_training_task_team_link_v1(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.training_task_team_authorized(uuid, text),
  public.training_task_library_scope_v1(uuid, timestamptz, timestamptz, integer, integer),
  public.create_shared_training_task_v1(uuid, uuid, jsonb),
  public.set_training_task_team_link_v1(uuid, uuid, boolean)
  to authenticated;

do $postcheck$
begin
  if to_regclass('public.training_task_library_links') is null
     or to_regprocedure('public.training_task_team_authorized(uuid,text)') is null
     or to_regprocedure('public.training_task_library_scope_v1(uuid,timestamptz,timestamptz,integer,integer)') is null
     or to_regprocedure('public.create_shared_training_task_v1(uuid,uuid,jsonb)') is null
     or to_regprocedure('public.set_training_task_team_link_v1(uuid,uuid,boolean)') is null then
    raise exception 'Biblioteca por equipo: contrato incompleto; se revierte';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.training_task_library_links'::regclass
      and constraint_row.conname = 'training_task_library_links_team_club_fkey'
      and constraint_row.contype = 'f'
      and constraint_row.convalidated
  ) or not exists (
    select 1 from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.training_task_library_links'::regclass
      and constraint_row.conname = 'training_task_library_links_task_team_key'
      and constraint_row.contype = 'u'
  ) then
    raise exception 'Biblioteca por equipo: FK o unicidad no válidas; se revierte';
  end if;
end
$postcheck$;

commit;
