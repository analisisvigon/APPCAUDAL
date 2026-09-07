-- APPCAUDAL - Multas: transparencia grupal sanitizada para PLAYER y STAFF.
-- Solo crea RPC de lectura. No modifica tablas, RLS, policies ni datos.

begin;

create function public.require_fines_transparency_club()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  actor record;
begin
  select * into actor
  from public.current_membership();

  if actor.membership_id is null
     or actor.is_active is distinct from true
     or actor.role not in ('owner', 'admin', 'staff', 'player')
     or (actor.role = 'player' and actor.jugador_id is null) then
    raise exception 'Fines transparency not available'
      using errcode = '42501';
  end if;

  return actor.club_id;
end;
$function$;

comment on function public.require_fines_transparency_club() is
'Helper interno: resuelve el club de una identidad PLAYER o STAFF activa; VIEWER, ANON y memberships incompletas fallan cerradas.';

create function public.get_fines_transparency_summary()
returns table (
  season_code text,
  total_fines bigint,
  active_fines bigint,
  unpaid_count bigint,
  partial_count bigint,
  paid_count bigint,
  cancelled_count bigint,
  overdue_count bigint,
  generated_total numeric(14,2),
  collected_total numeric(14,2),
  pending_total numeric(14,2)
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  actor_club_id uuid;
  season_id_value uuid;
  resolved_code text;
begin
  actor_club_id := public.require_fines_transparency_club();
  season_id_value := public.resolve_fines_season(actor_club_id, current_date, null);

  select season.code into resolved_code
  from public.club_seasons season
  where season.id = season_id_value
    and season.club_id = actor_club_id;

  return query
  with season_fines as (
    select
      fine.lifecycle_status,
      fine.due_on,
      totals.generated_amount,
      totals.collected_amount,
      totals.pending_amount,
      totals.financial_status
    from public.fines fine
    join public.fine_incidents incident on incident.id = fine.incident_id
    cross join lateral public.get_fine_financial_totals(fine.id) totals
    where fine.club_id = actor_club_id
      and incident.club_id = actor_club_id
      and incident.season_id = season_id_value
  )
  select
    resolved_code,
    pg_catalog.count(*)::bigint,
    pg_catalog.count(*) filter (where data.lifecycle_status = 'active')::bigint,
    pg_catalog.count(*) filter (
      where data.lifecycle_status = 'active' and data.financial_status = 'unpaid'
    )::bigint,
    pg_catalog.count(*) filter (
      where data.lifecycle_status = 'active' and data.financial_status = 'partial'
    )::bigint,
    pg_catalog.count(*) filter (
      where data.lifecycle_status = 'active' and data.financial_status = 'paid'
    )::bigint,
    pg_catalog.count(*) filter (where data.lifecycle_status = 'cancelled')::bigint,
    pg_catalog.count(*) filter (
      where data.lifecycle_status = 'active'
        and current_date > data.due_on
        and data.pending_amount > 0
    )::bigint,
    coalesce(pg_catalog.sum(data.generated_amount) filter (
      where data.lifecycle_status = 'active'
    ), 0)::numeric(14,2),
    coalesce(pg_catalog.sum(data.collected_amount) filter (
      where data.lifecycle_status = 'active'
    ), 0)::numeric(14,2),
    coalesce(pg_catalog.sum(data.pending_amount) filter (
      where data.lifecycle_status = 'active'
    ), 0)::numeric(14,2)
  from season_fines data;
end;
$function$;

comment on function public.get_fines_transparency_summary() is
'Resumen financiero y distribucion de estados de la temporada actual, sin IDs ni actores.';

create function public.get_fines_transparency_subjects()
returns table (
  subject_name text,
  fine_count bigint,
  active_count bigint,
  paid_count bigint,
  overdue_count bigint,
  generated_total numeric(14,2),
  collected_total numeric(14,2),
  pending_total numeric(14,2)
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  actor_club_id uuid;
  season_id_value uuid;
begin
  actor_club_id := public.require_fines_transparency_club();
  season_id_value := public.resolve_fines_season(actor_club_id, current_date, null);

  return query
  select
    coalesce(subject.display_name, pg_catalog.max(fine.subject_name_snapshot)),
    pg_catalog.count(*)::bigint,
    pg_catalog.count(*) filter (where fine.lifecycle_status = 'active')::bigint,
    pg_catalog.count(*) filter (
      where fine.lifecycle_status = 'active' and totals.financial_status = 'paid'
    )::bigint,
    pg_catalog.count(*) filter (
      where fine.lifecycle_status = 'active'
        and current_date > fine.due_on
        and totals.pending_amount > 0
    )::bigint,
    coalesce(pg_catalog.sum(totals.generated_amount) filter (
      where fine.lifecycle_status = 'active'
    ), 0)::numeric(14,2),
    coalesce(pg_catalog.sum(totals.collected_amount) filter (
      where fine.lifecycle_status = 'active'
    ), 0)::numeric(14,2),
    coalesce(pg_catalog.sum(totals.pending_amount) filter (
      where fine.lifecycle_status = 'active'
    ), 0)::numeric(14,2)
  from public.fines fine
  join public.fine_incidents incident on incident.id = fine.incident_id
  join public.fine_subjects subject on subject.id = fine.subject_id
  cross join lateral public.get_fine_financial_totals(fine.id) totals
  where fine.club_id = actor_club_id
    and incident.club_id = actor_club_id
    and subject.club_id = actor_club_id
    and incident.season_id = season_id_value
    and subject.subject_type = 'player'
  group by subject.id, subject.display_name
  order by
    coalesce(pg_catalog.sum(totals.pending_amount) filter (
      where fine.lifecycle_status = 'active'
    ), 0) desc,
    coalesce(pg_catalog.sum(totals.collected_amount) filter (
      where fine.lifecycle_status = 'active'
    ), 0) desc,
    coalesce(subject.display_name, pg_catalog.max(fine.subject_name_snapshot));
end;
$function$;

comment on function public.get_fines_transparency_subjects() is
'Resumen sanitizado por jugador de la temporada actual; no devuelve subject_id, jugador_id ni membership_id.';

create function public.get_fines_transparency_rules()
returns table (
  rule_name text,
  fine_count bigint,
  active_count bigint,
  paid_count bigint,
  generated_total numeric(14,2),
  collected_total numeric(14,2),
  pending_total numeric(14,2)
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  actor_club_id uuid;
  season_id_value uuid;
begin
  actor_club_id := public.require_fines_transparency_club();
  season_id_value := public.resolve_fines_season(actor_club_id, current_date, null);

  return query
  select
    incident.reason_snapshot,
    pg_catalog.count(*)::bigint,
    pg_catalog.count(*) filter (where fine.lifecycle_status = 'active')::bigint,
    pg_catalog.count(*) filter (
      where fine.lifecycle_status = 'active' and totals.financial_status = 'paid'
    )::bigint,
    coalesce(pg_catalog.sum(totals.generated_amount) filter (
      where fine.lifecycle_status = 'active'
    ), 0)::numeric(14,2),
    coalesce(pg_catalog.sum(totals.collected_amount) filter (
      where fine.lifecycle_status = 'active'
    ), 0)::numeric(14,2),
    coalesce(pg_catalog.sum(totals.pending_amount) filter (
      where fine.lifecycle_status = 'active'
    ), 0)::numeric(14,2)
  from public.fines fine
  join public.fine_incidents incident on incident.id = fine.incident_id
  cross join lateral public.get_fine_financial_totals(fine.id) totals
  where fine.club_id = actor_club_id
    and incident.club_id = actor_club_id
    and incident.season_id = season_id_value
  group by incident.fine_rule_id, incident.reason_snapshot
  order by
    coalesce(pg_catalog.sum(totals.generated_amount) filter (
      where fine.lifecycle_status = 'active'
    ), 0) desc,
    pg_catalog.count(*) desc,
    incident.reason_snapshot;
end;
$function$;

comment on function public.get_fines_transparency_rules() is
'Resumen sanitizado por motivo de la temporada actual; no devuelve IDs de regla o incidencia.';

create function public.get_fines_transparency_list(
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  subject_name text,
  rule_name text,
  occurred_on date,
  original_amount numeric(10,2),
  surcharge_amount numeric(10,2),
  generated_amount numeric(10,2),
  collected_amount numeric(10,2),
  pending_amount numeric(10,2),
  due_on date,
  financial_status text,
  lifecycle_status text,
  is_overdue boolean,
  note text
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  actor_club_id uuid;
  season_id_value uuid;
begin
  actor_club_id := public.require_fines_transparency_club();

  if p_limit is null or p_limit < 1 or p_limit > 100
     or p_offset is null or p_offset < 0 then
    raise exception 'Pagination not available' using errcode = '22023';
  end if;

  season_id_value := public.resolve_fines_season(actor_club_id, current_date, null);

  return query
  select
    fine.subject_name_snapshot,
    incident.reason_snapshot,
    incident.occurred_on,
    fine.original_amount,
    fine.surcharge_amount,
    totals.generated_amount,
    totals.collected_amount,
    totals.pending_amount,
    fine.due_on,
    totals.financial_status,
    fine.lifecycle_status,
    (
      fine.lifecycle_status = 'active'
      and current_date > fine.due_on
      and totals.pending_amount > 0
    ),
    incident.note
  from public.fines fine
  join public.fine_incidents incident on incident.id = fine.incident_id
  cross join lateral public.get_fine_financial_totals(fine.id) totals
  where fine.club_id = actor_club_id
    and incident.club_id = actor_club_id
    and incident.season_id = season_id_value
  order by incident.occurred_on desc, fine.created_at desc, fine.id
  limit p_limit
  offset p_offset;
end;
$function$;

comment on function public.get_fines_transparency_list(integer,integer) is
'Listado grupal paginado y sanitizado: nombres, motivos, fechas, importes, estados, vencimiento y nota PLAYER-visible.';

alter function public.require_fines_transparency_club() owner to postgres;
alter function public.get_fines_transparency_summary() owner to postgres;
alter function public.get_fines_transparency_subjects() owner to postgres;
alter function public.get_fines_transparency_rules() owner to postgres;
alter function public.get_fines_transparency_list(integer,integer) owner to postgres;

revoke all on function public.require_fines_transparency_club()
from public, anon, authenticated, service_role;

revoke all on function public.get_fines_transparency_summary()
from public, anon, authenticated, service_role;
revoke all on function public.get_fines_transparency_subjects()
from public, anon, authenticated, service_role;
revoke all on function public.get_fines_transparency_rules()
from public, anon, authenticated, service_role;
revoke all on function public.get_fines_transparency_list(integer,integer)
from public, anon, authenticated, service_role;

grant execute on function public.get_fines_transparency_summary()
to authenticated, service_role;
grant execute on function public.get_fines_transparency_subjects()
to authenticated, service_role;
grant execute on function public.get_fines_transparency_rules()
to authenticated, service_role;
grant execute on function public.get_fines_transparency_list(integer,integer)
to authenticated, service_role;

commit;
