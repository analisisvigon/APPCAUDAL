-- APPCAUDAL - Club Core 28 - Fisio V1.
-- Registro descriptivo STAFF de tratamientos. No crea diagnosticos, bajas,
-- medicacion, archivos, automatismos clinicos ni superficie PLAYER.

begin;

do $preconditions$
declare
  club_count integer;
begin
  if auth.uid() is not null then
    raise exception 'Core 28 debe ejecutarse sin una identidad cliente activa';
  end if;

  if pg_catalog.to_regclass('public.physio_treatments') is not null
     or pg_catalog.to_regprocedure('public.guard_physio_treatment_integrity()') is not null
     or pg_catalog.to_regprocedure('public.get_physio_player_summary()') is not null then
    raise exception 'Core 28 ya existe total o parcialmente; no se reemplazara silenciosamente';
  end if;

  if pg_catalog.to_regclass('public.clubs') is null
     or pg_catalog.to_regclass('public.club_memberships') is null
     or pg_catalog.to_regclass('public.jugadores') is null
     or pg_catalog.to_regprocedure('public.current_membership()') is null
     or pg_catalog.to_regprocedure('public.is_app_staff()') is null
     or pg_catalog.to_regprocedure('public.set_club_core_updated_at()') is null then
    raise exception 'Core 28 requiere clubs, memberships, jugadores y los helpers canonicos de Club Core';
  end if;

  select pg_catalog.count(*)::integer into club_count from public.clubs;
  if club_count <> 1 then
    raise exception 'Core 28 conserva el invariante single-club y requiere exactamente un club; encontrados %', club_count;
  end if;
end;
$preconditions$;

create table public.physio_treatments (
  id uuid primary key,
  club_id uuid not null,
  player_id uuid not null,
  treatment_date date not null,
  body_area text not null,
  reason text not null,
  treatment_types text[] not null,
  case_type text not null,
  availability_status text not null,
  duration_minutes integer null,
  notes text null,
  performed_by_user_id uuid not null,
  performed_by_name_snapshot text null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint physio_treatments_club_id_fkey
    foreign key (club_id) references public.clubs(id) on delete restrict,
  constraint physio_treatments_player_id_fkey
    foreign key (player_id) references public.jugadores(id) on delete restrict,
  constraint physio_treatments_performed_by_user_id_fkey
    foreign key (performed_by_user_id) references auth.users(id) on delete restrict,
  constraint physio_treatments_body_area_check check (
    body_area in (
      'head_neck', 'shoulder', 'arm', 'elbow', 'forearm', 'wrist_hand',
      'back', 'lumbar', 'hip', 'groin_adductor', 'glute', 'anterior_thigh',
      'hamstrings', 'knee', 'calf', 'ankle', 'foot', 'other'
    )
  ),
  constraint physio_treatments_reason_check check (
    pg_catalog.char_length(pg_catalog.btrim(reason)) between 1 and 200
  ),
  constraint physio_treatments_treatment_types_check check (
    pg_catalog.cardinality(treatment_types) >= 1
    and treatment_types <@ array[
      'massage_release', 'manual_therapy', 'mobility', 'stretching',
      'cryotherapy', 'heat', 'electrotherapy', 'taping', 'active_work',
      'recovery', 'assessment', 'other'
    ]::text[]
  ),
  constraint physio_treatments_case_type_check check (
    case_type in ('new', 'follow_up')
  ),
  constraint physio_treatments_availability_status_check check (
    availability_status in ('available', 'limited', 'unavailable')
  ),
  constraint physio_treatments_duration_minutes_check check (
    duration_minutes is null or duration_minutes > 0
  ),
  constraint physio_treatments_notes_check check (
    notes is null or pg_catalog.char_length(notes) <= 1000
  ),
  constraint physio_treatments_performed_by_name_check check (
    performed_by_name_snapshot is null
    or pg_catalog.char_length(pg_catalog.btrim(performed_by_name_snapshot)) > 0
  )
);

create index physio_treatments_club_date_idx
on public.physio_treatments (club_id, treatment_date desc, created_at desc);

create index physio_treatments_club_player_date_idx
on public.physio_treatments (club_id, player_id, treatment_date desc);

create index physio_treatments_club_performer_date_idx
on public.physio_treatments (club_id, performed_by_user_id, treatment_date desc);

create function public.guard_physio_treatment_integrity()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  actor_user_id uuid := auth.uid();
  actor_club_id uuid;
  actor_role text;
  actor_active boolean;
  canonical_club_id uuid;
  club_count integer;
  player_active boolean;
  actor_name text;
begin
  select membership.club_id, membership.role, membership.is_active
  into actor_club_id, actor_role, actor_active
  from public.current_membership() membership;

  if actor_user_id is null
     or actor_club_id is null
     or actor_active is not true
     or actor_role not in ('owner', 'admin', 'staff') then
    raise exception 'Physio access not available' using errcode = '42501';
  end if;

  select
    pg_catalog.count(*)::integer,
    (pg_catalog.array_agg(club.id order by club.id))[1]
  into club_count, canonical_club_id
  from public.clubs club;

  if club_count <> 1 or canonical_club_id is distinct from actor_club_id then
    raise exception 'Physio club scope is not available' using errcode = '42501';
  end if;

  select player.active_in_squad
  into player_active
  from public.jugadores player
  where player.id = new.player_id;

  if not found then
    raise exception 'Physio player not available' using errcode = '23503';
  end if;

  if (tg_op = 'INSERT' or new.player_id is distinct from old.player_id)
     and player_active is not true then
    raise exception 'Physio player must belong to the active canonical squad' using errcode = '23514';
  end if;

  new.body_area := pg_catalog.lower(pg_catalog.btrim(new.body_area));
  new.reason := pg_catalog.btrim(new.reason);
  new.case_type := pg_catalog.lower(pg_catalog.btrim(new.case_type));
  new.availability_status := pg_catalog.lower(pg_catalog.btrim(new.availability_status));
  new.notes := nullif(pg_catalog.btrim(new.notes), '');

  select pg_catalog.array_agg(unique_item.normalized order by unique_item.first_ordinality)
  into new.treatment_types
  from (
    select normalized_item.normalized, pg_catalog.min(normalized_item.ordinality) as first_ordinality
    from (
      select
        pg_catalog.lower(pg_catalog.btrim(item.value)) as normalized,
        item.ordinality
      from pg_catalog.unnest(new.treatment_types) with ordinality as item(value, ordinality)
    ) normalized_item
    where normalized_item.normalized <> ''
    group by normalized_item.normalized
  ) unique_item;

  if tg_op = 'INSERT' then
    if new.id is not null then
      raise exception 'Physio id is server-derived' using errcode = '42501';
    end if;
    if new.club_id is not null and new.club_id is distinct from actor_club_id then
      raise exception 'Physio cross-club insert denied' using errcode = '42501';
    end if;
    if new.performed_by_user_id is not null
       and new.performed_by_user_id is distinct from actor_user_id then
      raise exception 'Physio performer impersonation denied' using errcode = '42501';
    end if;

    select coalesce(
      nullif(pg_catalog.btrim(account.raw_user_meta_data ->> 'full_name'), ''),
      nullif(pg_catalog.btrim(account.raw_user_meta_data ->> 'name'), ''),
      nullif(pg_catalog.btrim(account.raw_user_meta_data ->> 'display_name'), '')
    )
    into actor_name
    from auth.users account
    where account.id = actor_user_id;

    new.id := pg_catalog.gen_random_uuid();
    new.club_id := actor_club_id;
    new.performed_by_user_id := actor_user_id;
    new.performed_by_name_snapshot := actor_name;
    new.created_at := pg_catalog.clock_timestamp();
    new.updated_at := new.created_at;
  else
    if old.club_id is distinct from actor_club_id then
      raise exception 'Physio cross-club update denied' using errcode = '42501';
    end if;
    if new.id is distinct from old.id
       or new.club_id is distinct from old.club_id
       or new.performed_by_user_id is distinct from old.performed_by_user_id
       or new.performed_by_name_snapshot is distinct from old.performed_by_name_snapshot
       or new.created_at is distinct from old.created_at then
      raise exception 'Physio protected audit fields are immutable' using errcode = '42501';
    end if;
    new.updated_at := pg_catalog.clock_timestamp();
  end if;

  return new;
end;
$function$;

create trigger guard_physio_treatment_integrity
before insert or update on public.physio_treatments
for each row execute function public.guard_physio_treatment_integrity();

create function public.get_physio_player_summary()
returns table (
  player_id uuid,
  player_name text,
  player_shirt_name text,
  player_number text,
  total_treatments bigint,
  total_treatment_days bigint,
  last_treatment_date date,
  body_area_counts jsonb,
  new_count bigint,
  follow_up_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  actor_club_id uuid;
  actor_role text;
  canonical_club_id uuid;
  club_count integer;
begin
  select membership.club_id, membership.role
  into actor_club_id, actor_role
  from public.current_membership() membership;

  if auth.uid() is null
     or actor_club_id is null
     or actor_role not in ('owner', 'admin', 'staff') then
    raise exception 'Physio summary not available' using errcode = '42501';
  end if;

  select
    pg_catalog.count(*)::integer,
    (pg_catalog.array_agg(club.id order by club.id))[1]
  into club_count, canonical_club_id
  from public.clubs club;

  if club_count <> 1 or canonical_club_id is distinct from actor_club_id then
    raise exception 'Physio summary club scope not available' using errcode = '42501';
  end if;

  return query
  select
    treatment.player_id,
    player.name::text,
    player.shirt_name::text,
    player.number::text,
    pg_catalog.count(*)::bigint,
    pg_catalog.count(distinct treatment.treatment_date)::bigint,
    pg_catalog.max(treatment.treatment_date),
    coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'body_area', counted.body_area,
          'treatment_count', counted.treatment_count
        )
        order by counted.treatment_count desc, counted.body_area
      )
      from (
        select area_treatment.body_area, pg_catalog.count(*)::bigint as treatment_count
        from public.physio_treatments area_treatment
        where area_treatment.club_id = actor_club_id
          and area_treatment.player_id = treatment.player_id
        group by area_treatment.body_area
      ) counted
    ), '[]'::jsonb),
    pg_catalog.count(*) filter (where treatment.case_type = 'new')::bigint,
    pg_catalog.count(*) filter (where treatment.case_type = 'follow_up')::bigint
  from public.physio_treatments treatment
  join public.jugadores player on player.id = treatment.player_id
  where treatment.club_id = actor_club_id
  group by treatment.player_id, player.name, player.shirt_name, player.number
  order by pg_catalog.count(*) desc, player.name, treatment.player_id;
end;
$function$;

comment on table public.physio_treatments is
'Registro descriptivo STAFF de sesiones de fisioterapia; no constituye historia clinica, diagnostico ni recomendacion medica.';
comment on column public.physio_treatments.treatment_date is
'Fecha real del tratamiento; created_at solo conserva la auditoria tecnica.';
comment on column public.physio_treatments.performed_by_user_id is
'Identidad Auth derivada por trigger desde auth.uid(); el cliente no puede elegirla ni modificarla.';
comment on column public.physio_treatments.performed_by_name_snapshot is
'Nombre opcional derivado de metadatos Auth en el momento del alta; nunca se acepta desde el cliente.';
comment on function public.get_physio_player_summary() is
'Resumen descriptivo STAFF por jugador: tratamientos, dias distintos, ultima fecha, zonas y tipos de caso.';

alter table public.physio_treatments owner to postgres;
alter function public.guard_physio_treatment_integrity() owner to postgres;
alter function public.get_physio_player_summary() owner to postgres;

revoke all on table public.physio_treatments
from public, anon, authenticated, service_role;
revoke all on function public.guard_physio_treatment_integrity()
from public, anon, authenticated, service_role;
revoke all on function public.get_physio_player_summary()
from public, anon, authenticated, service_role;

alter table public.physio_treatments enable row level security;

create policy physio_staff_select
on public.physio_treatments
for select
to authenticated
using (
  public.is_app_staff()
  and club_id = (
    select membership.club_id
    from public.current_membership() membership
  )
);

create policy physio_staff_insert
on public.physio_treatments
for insert
to authenticated
with check (
  public.is_app_staff()
  and club_id = (
    select membership.club_id
    from public.current_membership() membership
  )
  and performed_by_user_id = auth.uid()
);

create policy physio_staff_update
on public.physio_treatments
for update
to authenticated
using (
  public.is_app_staff()
  and club_id = (
    select membership.club_id
    from public.current_membership() membership
  )
)
with check (
  public.is_app_staff()
  and club_id = (
    select membership.club_id
    from public.current_membership() membership
  )
);

grant select, insert, update on table public.physio_treatments
to authenticated, service_role;
grant execute on function public.get_physio_player_summary()
to authenticated;

do $postconditions$
declare
  policy_count integer;
begin
  select pg_catalog.count(*)::integer into policy_count
  from pg_catalog.pg_policy policy
  where policy.polrelid = 'public.physio_treatments'::regclass;

  if policy_count <> 3
     or exists (
       select 1 from pg_catalog.pg_policy policy
       where policy.polrelid = 'public.physio_treatments'::regclass
         and policy.polcmd = 'd'
     ) then
    raise exception 'Core 28: el contrato RLS debe tener SELECT/INSERT/UPDATE y ninguna policy DELETE';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.physio_treatments', 'SELECT')
     or pg_catalog.has_table_privilege('anon', 'public.physio_treatments', 'INSERT')
     or pg_catalog.has_table_privilege('anon', 'public.physio_treatments', 'UPDATE')
     or pg_catalog.has_table_privilege('anon', 'public.physio_treatments', 'DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.physio_treatments', 'DELETE')
     or pg_catalog.has_table_privilege('service_role', 'public.physio_treatments', 'DELETE') then
    raise exception 'Core 28: se detecto un grant no permitido, incluido DELETE';
  end if;
end;
$postconditions$;

commit;
