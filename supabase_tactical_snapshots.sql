begin;

create table if not exists public.partido_snapshots_tacticos (
  id uuid primary key default gen_random_uuid(),
  partido_id uuid not null references public.partidos(id) on delete cascade,
  minute smallint not null check (minute between 0 and 130),
  period text,
  system text not null check (btrim(system) <> ''),
  reason text,
  is_complete boolean not null default true,
  source_system_event_id uuid unique references public.partido_eventos_sistema(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partido_id, minute)
);

create table if not exists public.partido_snapshot_tactico_slots (
  snapshot_id uuid not null references public.partido_snapshots_tacticos(id) on delete cascade,
  slot smallint not null check (slot between 0 and 10),
  jugador_id uuid references public.jugadores(id) on delete set null,
  player_name_snapshot text,
  created_at timestamptz not null default now(),
  primary key (snapshot_id, slot),
  check (jugador_id is not null or nullif(btrim(player_name_snapshot), '') is not null)
);

create unique index if not exists partido_snapshot_tactico_slots_player_uidx
on public.partido_snapshot_tactico_slots (snapshot_id, jugador_id)
where jugador_id is not null;

create index if not exists partido_snapshots_tacticos_match_minute_idx
on public.partido_snapshots_tacticos (partido_id, minute);

alter table public.partido_snapshots_tacticos enable row level security;
alter table public.partido_snapshot_tactico_slots enable row level security;

drop policy if exists "Authenticated staff can read tactical snapshots" on public.partido_snapshots_tacticos;
create policy "Authenticated staff can read tactical snapshots"
on public.partido_snapshots_tacticos
for select
to authenticated
using (true);

drop policy if exists "Authenticated staff can write tactical snapshots" on public.partido_snapshots_tacticos;
create policy "Authenticated staff can write tactical snapshots"
on public.partido_snapshots_tacticos
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated staff can read tactical snapshot slots" on public.partido_snapshot_tactico_slots;
create policy "Authenticated staff can read tactical snapshot slots"
on public.partido_snapshot_tactico_slots
for select
to authenticated
using (true);

drop policy if exists "Authenticated staff can write tactical snapshot slots" on public.partido_snapshot_tactico_slots;
create policy "Authenticated staff can write tactical snapshot slots"
on public.partido_snapshot_tactico_slots
for all
to authenticated
using (true)
with check (true);

create or replace function public.save_match_tactical_snapshot(
  p_partido_id uuid,
  p_minute smallint,
  p_period text,
  p_system text,
  p_reason text,
  p_is_complete boolean,
  p_slots jsonb,
  p_source_system_event_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_snapshot_id uuid;
  v_slots jsonb := coalesce(p_slots, '[]'::jsonb);
  v_slot_count integer;
  v_unique_slot_count integer;
  v_unique_player_count integer;
begin
  if p_partido_id is null then raise exception 'partido_id is required'; end if;
  if p_minute is null or p_minute < 0 or p_minute > 130 then raise exception 'minute must be between 0 and 130'; end if;
  if nullif(btrim(p_system), '') is null then raise exception 'system is required'; end if;
  if jsonb_typeof(v_slots) <> 'array' then raise exception 'slots must be a JSON array'; end if;

  select count(*), count(distinct (item->>'slot')::integer),
    count(distinct coalesce(nullif(item->>'jugador_id', ''), lower(btrim(item->>'player_name_snapshot'))))
  into v_slot_count, v_unique_slot_count, v_unique_player_count
  from jsonb_array_elements(v_slots) item;

  if v_slot_count > 11 then raise exception 'a tactical snapshot cannot contain more than 11 slots'; end if;
  if v_slot_count <> v_unique_slot_count then raise exception 'duplicated tactical slot'; end if;
  if v_slot_count <> v_unique_player_count then raise exception 'duplicated tactical player'; end if;
  if coalesce(p_is_complete, true) and v_slot_count <> 11 then raise exception 'a complete tactical snapshot needs exactly 11 slots'; end if;
  if exists (
    select 1 from jsonb_array_elements(v_slots) item
    where (item->>'slot') is null
      or (item->>'slot')::integer not between 0 and 10
      or (nullif(item->>'jugador_id', '') is null and nullif(btrim(item->>'player_name_snapshot'), '') is null)
  ) then
    raise exception 'invalid tactical snapshot slot';
  end if;

  insert into public.partido_snapshots_tacticos (
    partido_id, minute, period, system, reason, is_complete, source_system_event_id, updated_at
  ) values (
    p_partido_id, p_minute, nullif(btrim(p_period), ''), btrim(p_system), nullif(btrim(p_reason), ''),
    coalesce(p_is_complete, true), p_source_system_event_id, now()
  )
  on conflict (partido_id, minute) do update set
    period = excluded.period,
    system = excluded.system,
    reason = excluded.reason,
    is_complete = excluded.is_complete,
    source_system_event_id = coalesce(excluded.source_system_event_id, partido_snapshots_tacticos.source_system_event_id),
    updated_at = now()
  returning id into v_snapshot_id;

  delete from public.partido_snapshot_tactico_slots where snapshot_id = v_snapshot_id;

  insert into public.partido_snapshot_tactico_slots (snapshot_id, slot, jugador_id, player_name_snapshot)
  select
    v_snapshot_id,
    (item->>'slot')::smallint,
    nullif(item->>'jugador_id', '')::uuid,
    nullif(btrim(item->>'player_name_snapshot'), '')
  from jsonb_array_elements(v_slots) item;

  return v_snapshot_id;
end;
$$;

create or replace function public.save_match_system_change_with_snapshot(
  p_partido_id uuid,
  p_minute smallint,
  p_period text,
  p_from_system text,
  p_to_system text,
  p_note text,
  p_slots jsonb,
  p_is_complete boolean default true,
  p_event_id uuid default null
)
returns table (event_id uuid, snapshot_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_snapshot_id uuid;
  v_previous_to_system text;
begin
  if nullif(btrim(p_to_system), '') is null then raise exception 'to_system is required'; end if;

  if p_event_id is null then
    insert into public.partido_eventos_sistema (
      partido_id, minute, period, from_system, to_system, note
    ) values (
      p_partido_id, p_minute::text, nullif(btrim(p_period), ''), nullif(btrim(p_from_system), ''), btrim(p_to_system), nullif(btrim(p_note), '')
    ) returning id into v_event_id;
  else
    select to_system into v_previous_to_system
    from public.partido_eventos_sistema
    where id = p_event_id and partido_id = p_partido_id
    for update;
    if not found then raise exception 'system event not found for match'; end if;

    if exists (
      select 1
      from public.partido_snapshots_tacticos
      where partido_id = p_partido_id
        and minute = p_minute
        and source_system_event_id is distinct from p_event_id
    ) then
      raise exception 'another tactical snapshot already exists at minute %', p_minute;
    end if;

    update public.partido_eventos_sistema set
      minute = p_minute::text,
      period = nullif(btrim(p_period), ''),
      from_system = nullif(btrim(p_from_system), ''),
      to_system = btrim(p_to_system),
      note = nullif(btrim(p_note), ''),
      updated_at = now()
    where id = p_event_id and partido_id = p_partido_id
    returning id into v_event_id;

    update public.partido_snapshots_tacticos
    set minute = p_minute,
        period = nullif(btrim(p_period), ''),
        system = btrim(p_to_system),
        reason = coalesce(nullif(btrim(p_note), ''), 'Cambio de sistema'),
        is_complete = case
          when btrim(coalesce(v_previous_to_system, '')) = btrim(p_to_system) then is_complete
          else false
        end,
        updated_at = now()
    where source_system_event_id = v_event_id
    returning id into v_snapshot_id;

    if v_snapshot_id is not null then
      return query select v_event_id, v_snapshot_id;
      return;
    end if;
  end if;

  v_snapshot_id := public.save_match_tactical_snapshot(
    p_partido_id,
    p_minute,
    p_period,
    p_to_system,
    coalesce(nullif(btrim(p_note), ''), 'Cambio de sistema'),
    p_is_complete,
    p_slots,
    v_event_id
  );

  return query select v_event_id, v_snapshot_id;
end;
$$;

create or replace function public.delete_match_system_change_with_snapshot(p_event_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.partido_snapshots_tacticos where source_system_event_id = p_event_id;
  delete from public.partido_eventos_sistema where id = p_event_id;
end;
$$;

revoke all on function public.save_match_tactical_snapshot(uuid, smallint, text, text, text, boolean, jsonb, uuid) from public;
grant execute on function public.save_match_tactical_snapshot(uuid, smallint, text, text, text, boolean, jsonb, uuid) to authenticated;

revoke all on function public.save_match_system_change_with_snapshot(uuid, smallint, text, text, text, text, jsonb, boolean, uuid) from public;
grant execute on function public.save_match_system_change_with_snapshot(uuid, smallint, text, text, text, text, jsonb, boolean, uuid) to authenticated;

revoke all on function public.delete_match_system_change_with_snapshot(uuid) from public;
grant execute on function public.delete_match_system_change_with_snapshot(uuid) to authenticated;

comment on table public.partido_snapshots_tacticos is
'Fotografias tacticas completas vigentes desde su minuto hasta el siguiente snapshot. La migracion no crea historico automaticamente.';

comment on table public.partido_snapshot_tactico_slots is
'Slots reales de una fotografia tactica. Un jugador no puede ocupar dos slots en el mismo snapshot.';

commit;
