-- Disponibilidad persistente de la plantilla y consumo idempotente de sanciones.
-- Migracion aditiva. Debe aplicarse manualmente en Supabase despues de revisar.

alter table public.jugadores
  add column if not exists availability_status text not null default 'available',
  add column if not exists suspension_matches_remaining integer not null default 0,
  add column if not exists suspension_cycle_id uuid,
  add column if not exists suspension_started_at timestamptz;

update public.jugadores
set availability_status = 'available'
where availability_status is null;

update public.jugadores
set suspension_matches_remaining = 0,
    suspension_cycle_id = null,
    suspension_started_at = null
where suspension_matches_remaining is null;

alter table public.jugadores
  alter column availability_status set default 'available',
  alter column availability_status set not null,
  alter column suspension_matches_remaining set default 0,
  alter column suspension_matches_remaining set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'jugadores_availability_status_check' and conrelid = 'public.jugadores'::regclass) then
    alter table public.jugadores add constraint jugadores_availability_status_check
      check (availability_status in ('available', 'injured', 'suspended', 'unavailable'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'jugadores_suspension_matches_remaining_check' and conrelid = 'public.jugadores'::regclass) then
    alter table public.jugadores add constraint jugadores_suspension_matches_remaining_check
      check (suspension_matches_remaining >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'jugadores_suspension_state_check' and conrelid = 'public.jugadores'::regclass) then
    alter table public.jugadores add constraint jugadores_suspension_state_check
      check (
        (
          availability_status = 'suspended'
          and suspension_matches_remaining > 0
          and suspension_cycle_id is not null
          and suspension_started_at is not null
        )
        or
        (
          availability_status <> 'suspended'
          and suspension_matches_remaining = 0
          and suspension_cycle_id is null
          and suspension_started_at is null
        )
      );
  end if;
end $$;

create table if not exists public.jugador_suspension_consumptions (
  id uuid primary key default gen_random_uuid(),
  jugador_id uuid not null references public.jugadores(id) on delete cascade,
  partido_id uuid not null references public.partidos(id) on delete cascade,
  suspension_cycle_id uuid not null,
  matches_remaining_before integer not null,
  matches_remaining_after integer not null,
  consumed_at timestamptz not null default now(),
  constraint jugador_suspension_consumptions_counter_check check (
    matches_remaining_before > 0
    and matches_remaining_after >= 0
    and matches_remaining_after = matches_remaining_before - 1
  ),
  constraint jugador_suspension_consumptions_unique_cycle_match
    unique (jugador_id, partido_id, suspension_cycle_id)
);

create index if not exists jugador_suspension_consumptions_jugador_idx
  on public.jugador_suspension_consumptions (jugador_id, consumed_at desc);
create index if not exists jugador_suspension_consumptions_partido_idx
  on public.jugador_suspension_consumptions (partido_id);

alter table public.jugador_suspension_consumptions enable row level security;

drop policy if exists "Authenticated staff can read suspension consumptions"
  on public.jugador_suspension_consumptions;
create policy "Authenticated staff can read suspension consumptions"
  on public.jugador_suspension_consumptions
  for select
  to authenticated
  using (true);

-- La escritura directa queda cerrada: solo las funciones transaccionales pueden
-- crear consumos o modificar un ciclo. No se concede acceso a anon.
revoke insert, update, delete on public.jugador_suspension_consumptions from authenticated, anon;
grant select on public.jugador_suspension_consumptions to authenticated;

create or replace function public.set_player_availability(
  p_jugador_id uuid,
  p_availability_status text,
  p_suspension_matches_remaining integer default 0
)
returns table (
  jugador_id uuid,
  availability_status text,
  suspension_matches_remaining integer,
  suspension_cycle_id uuid,
  suspension_started_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_player public.jugadores%rowtype;
  v_status text := lower(trim(coalesce(p_availability_status, '')));
  v_remaining integer := coalesce(p_suspension_matches_remaining, 0);
  v_cycle_id uuid;
  v_started_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if v_status not in ('available', 'injured', 'suspended', 'unavailable') then
    raise exception 'Invalid availability status: %', p_availability_status;
  end if;

  if v_status = 'suspended' and v_remaining <= 0 then
    -- Contador 0 cierra de forma segura la sancion en vez de dejar un estado invalido.
    v_status := 'available';
    v_remaining := 0;
  elsif v_status <> 'suspended' then
    v_remaining := 0;
  end if;

  select * into v_player
  from public.jugadores
  where id = p_jugador_id
  for update;

  if not found then
    raise exception 'Player not found: %', p_jugador_id;
  end if;

  if v_status = 'suspended' then
    if v_player.availability_status = 'suspended'
      and v_player.suspension_cycle_id is not null then
      v_cycle_id := v_player.suspension_cycle_id;
      v_started_at := v_player.suspension_started_at;
    else
      v_cycle_id := gen_random_uuid();
      v_started_at := now();
    end if;
  else
    v_cycle_id := null;
    v_started_at := null;
  end if;

  update public.jugadores
  set availability_status = v_status,
      suspension_matches_remaining = v_remaining,
      suspension_cycle_id = v_cycle_id,
      suspension_started_at = v_started_at
  where id = p_jugador_id;

  return query
  select j.id, j.availability_status, j.suspension_matches_remaining,
         j.suspension_cycle_id, j.suspension_started_at
  from public.jugadores j
  where j.id = p_jugador_id;
end;
$$;

create or replace function public.consume_player_suspensions_for_match(
  p_partido_id uuid
)
returns table (
  jugador_id uuid,
  matches_remaining_before integer,
  matches_remaining_after integer,
  suspension_cycle_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_match public.partidos%rowtype;
  v_match_start timestamptz;
  v_status text;
  v_played boolean;
  v_player record;
  v_inserted_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_match
  from public.partidos
  where id = p_partido_id
  for update;

  if not found then
    raise exception 'Match not found: %', p_partido_id;
  end if;

  -- Lista oficial cerrada y auditada en el catalogo actual. friendly y claves
  -- desconocidas nunca consumen sancion.
  if coalesce(v_match.competition_key, '') not in ('league', 'copa_rfef', 'playoff') then
    return;
  end if;

  v_status := lower(trim(coalesce(v_match.status, '')));
  if v_status in ('aplazado', 'postponed', 'suspendido', 'suspended',
                  'cancelado', 'cancelled', 'canceled') then
    return;
  end if;

  if v_match.date::date > (now() at time zone 'Europe/Madrid')::date then
    return;
  end if;

  v_played := v_status in ('finalizado', 'jugado', 'played', 'finished',
                           'cerrado', 'closed', 'revisado', 'reviewed')
    or (
      nullif(trim(coalesce(v_match.home_score::text, '')), '') is not null
      and nullif(trim(coalesce(v_match.away_score::text, '')), '') is not null
    )
    or (
      nullif(trim(coalesce(v_match.goals_for::text, '')), '') is not null
      and nullif(trim(coalesce(v_match.goals_against::text, '')), '') is not null
    )
    or lower(coalesce(to_jsonb(v_match)->>'played', 'false')) = 'true'
    or coalesce(to_jsonb(v_match)->>'result', '') ~ '^\s*[0-9]+\s*[-:]\s*[0-9]+\s*$'
    or exists (
      select 1 from public.partido_eventos_gol e where e.partido_id = p_partido_id
    );

  if not v_played then
    return;
  end if;

  -- Una hora ausente o no valida se trata como 00:00; asi una sancion creada
  -- durante ese mismo dia tampoco se descuenta contra un partido previo ambiguo.
  v_match_start := (v_match.date::date + case
    when coalesce(v_match.time::text, '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]'
      then substring(v_match.time::text from 1 for 5)::time
    else time '00:00'
  end) at time zone 'Europe/Madrid';

  for v_player in
    select j.id, j.suspension_matches_remaining, j.suspension_cycle_id,
           j.suspension_started_at
    from public.jugadores j
    where j.availability_status = 'suspended'
      and j.suspension_matches_remaining > 0
      and j.suspension_cycle_id is not null
      and j.suspension_started_at is not null
      and v_match_start > j.suspension_started_at
    order by j.id
    for update
  loop
    v_inserted_id := null;
    insert into public.jugador_suspension_consumptions (
      jugador_id, partido_id, suspension_cycle_id,
      matches_remaining_before, matches_remaining_after
    ) values (
      v_player.id, p_partido_id, v_player.suspension_cycle_id,
      v_player.suspension_matches_remaining,
      v_player.suspension_matches_remaining - 1
    )
    on conflict on constraint jugador_suspension_consumptions_unique_cycle_match do nothing
    returning id into v_inserted_id;

    if v_inserted_id is not null then
      update public.jugadores
      set suspension_matches_remaining = v_player.suspension_matches_remaining - 1,
          availability_status = case
            when v_player.suspension_matches_remaining - 1 = 0 then 'available'
            else 'suspended'
          end,
          suspension_cycle_id = case
            when v_player.suspension_matches_remaining - 1 = 0 then null
            else v_player.suspension_cycle_id
          end,
          suspension_started_at = case
            when v_player.suspension_matches_remaining - 1 = 0 then null
            else v_player.suspension_started_at
          end
      where id = v_player.id;

      jugador_id := v_player.id;
      matches_remaining_before := v_player.suspension_matches_remaining;
      matches_remaining_after := v_player.suspension_matches_remaining - 1;
      suspension_cycle_id := v_player.suspension_cycle_id;
      return next;
    end if;
  end loop;
end;
$$;

revoke all on function public.set_player_availability(uuid, text, integer) from public, anon;
revoke all on function public.consume_player_suspensions_for_match(uuid) from public, anon;
grant execute on function public.set_player_availability(uuid, text, integer) to authenticated;
grant execute on function public.consume_player_suspensions_for_match(uuid) to authenticated;

comment on column public.jugadores.availability_status is
  'Fuente de verdad actual: available, injured, suspended o unavailable.';
comment on column public.jugadores.suspension_started_at is
  'Inicio del ciclo vigente; impide descontar partidos historicos anteriores.';
comment on table public.jugador_suspension_consumptions is
  'Auditoria idempotente por jugador, partido y ciclo de sancion.';
comment on function public.set_player_availability(uuid, text, integer) is
  'Transicion atomica de disponibilidad; cada nueva sancion abre un UUID nuevo.';
comment on function public.consume_player_suspensions_for_match(uuid) is
  'Consume una vez cada sancion vigente al cerrar un partido oficial posterior.';
