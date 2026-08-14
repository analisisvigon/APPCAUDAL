begin;

-- Orden extensible de capitanes para la etapa vigente de cada jugador.
-- `captain` se conserva por compatibilidad; `captain_priority` aporta el orden.
alter table public.player_team_memberships
  add column if not exists captain_priority integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'player_team_memberships_captain_priority_check'
      and conrelid = 'public.player_team_memberships'::regclass
  ) then
    alter table public.player_team_memberships
      add constraint player_team_memberships_captain_priority_check
      check (captain_priority is null or captain_priority > 0);
  end if;
end $$;

create unique index if not exists player_team_memberships_current_captain_priority_uidx
on public.player_team_memberships (team_id, captain_priority)
where is_current and captain_priority is not null;

-- Conserva los capitanes booleanos existentes al activar por primera vez el
-- orden. El desempate es técnico y estable; después el staff puede reordenar.
with current_maximums as (
  select team_id, coalesce(max(captain_priority), 0) as maximum_priority
  from public.player_team_memberships
  where is_current
  group by team_id
), legacy_captains as (
  select membership.id,
    coalesce(current_maximums.maximum_priority, 0)
      + row_number() over (partition by membership.team_id order by membership.created_at, membership.id) as next_priority
  from public.player_team_memberships membership
  left join current_maximums on current_maximums.team_id = membership.team_id
  where membership.is_current
    and membership.captain
    and membership.captain_priority is null
)
update public.player_team_memberships membership
set captain_priority = legacy_captains.next_priority
from legacy_captains
where membership.id = legacy_captains.id;

comment on column public.player_team_memberships.captain_priority is
  'Prioridad extensible de capitanía dentro de la etapa vigente: 1 es la prioridad más alta; null significa que no pertenece al orden.';

-- Reordena toda la lista en una única transacción. Es SECURITY INVOKER: no
-- introduce bypass de RLS ni cambia las políticas existentes.
create or replace function public.save_own_captain_priorities(
  p_membership_ids uuid[]
)
returns table (
  membership_id uuid,
  player_id uuid,
  jugador_id uuid,
  captain_priority integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  own_team_id uuid;
  requested_count integer := coalesce(cardinality(p_membership_ids), 0);
  valid_count integer;
begin
  select team.id
  into own_team_id
  from public.equipos_rivales team
  where team.team_kind = 'own'
  order by team.created_at, team.id
  limit 1;

  if own_team_id is null then
    raise exception 'No existe un equipo propio activo para guardar el orden de capitanes.';
  end if;

  if exists (
    select requested.membership_id
    from unnest(coalesce(p_membership_ids, array[]::uuid[])) requested(membership_id)
    group by requested.membership_id
    having count(*) > 1
  ) then
    raise exception 'El orden de capitanes contiene relaciones duplicadas.';
  end if;

  select count(*)
  into valid_count
  from public.player_team_memberships membership
  where membership.id = any(coalesce(p_membership_ids, array[]::uuid[]))
    and membership.team_id = own_team_id
    and membership.is_current;

  if valid_count <> requested_count then
    raise exception 'Todos los capitanes deben pertenecer a la plantilla propia vigente.';
  end if;

  update public.player_team_memberships membership
  set captain_priority = null,
      captain = false
  where membership.team_id = own_team_id
    and membership.is_current
    and (membership.captain_priority is not null or membership.captain);

  update public.player_team_memberships membership
  set captain_priority = requested.priority::integer,
      captain = true
  from unnest(coalesce(p_membership_ids, array[]::uuid[])) with ordinality
    requested(membership_id, priority)
  where membership.id = requested.membership_id
    and membership.team_id = own_team_id
    and membership.is_current;

  return query
  select membership.id,
    membership.player_id,
    own_player.id,
    membership.captain_priority
  from public.player_team_memberships membership
  left join public.jugadores own_player on own_player.membership_id = membership.id
  where membership.team_id = own_team_id
    and membership.is_current
    and membership.captain_priority is not null
  order by membership.captain_priority;
end $$;

comment on function public.save_own_captain_priorities(uuid[]) is
  'Reemplaza de forma atómica el orden de capitanes del equipo propio mediante UUID de player_team_memberships.';

commit;
