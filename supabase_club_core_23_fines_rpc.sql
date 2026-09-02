-- APPCAUDAL - Bloque 4.5
-- RPC seguras de gestion, lectura PLAYER y resumenes del modulo Multas.
--
-- No abre RLS ni grants de tablas. Toda autoridad se deriva de auth.uid(),
-- current_membership(), current_jugador_id() y can_manage_fines().

begin;

do $preconditions$
declare
  rpc_signature text;
begin
  if auth.uid() is not null then
    raise exception 'Bloque 4.5 debe ejecutarse sin una identidad JWT de aplicacion activa';
  end if;

  if pg_catalog.to_regclass('public.club_seasons') is null
     or pg_catalog.to_regclass('public.fine_subjects') is null
     or pg_catalog.to_regclass('public.fine_rules') is null
     or pg_catalog.to_regclass('public.fine_incidents') is null
     or pg_catalog.to_regclass('public.fines') is null
     or pg_catalog.to_regclass('public.fine_payments') is null
     or pg_catalog.to_regprocedure('public.current_membership()') is null
     or pg_catalog.to_regprocedure('public.current_jugador_id()') is null
     or pg_catalog.to_regprocedure('public.is_player()') is null
     or pg_catalog.to_regprocedure('public.can_manage_fines()') is null
     or pg_catalog.to_regprocedure('public.apply_fine_surcharge_if_due(uuid)') is null
     or pg_catalog.to_regprocedure('public.get_fine_financial_totals(uuid)') is null
     or pg_catalog.to_regprocedure('public.guard_fine_payment_integrity()') is null then
    raise exception 'Bloque 4.5: faltan objetos validados de los Bloques 4.1-4.4';
  end if;

  foreach rpc_signature in array array[
    'public.require_fines_manager()',
    'public.resolve_fines_season(uuid,date,text)',
    'public.get_fine_rules_for_management()',
    'public.get_fine_subjects_for_management()',
    'public.create_fine_individual(uuid,uuid,date,text)',
    'public.create_fine_collective(uuid,uuid[],date,text)',
    'public.cancel_fine(uuid,text)',
    'public.record_fine_payment(uuid,numeric,date,text)',
    'public.record_fine_refund(uuid,numeric,date,text)',
    'public.get_my_fines(integer,integer)',
    'public.get_my_fines_summary()',
    'public.get_fines_management_list(text,integer,integer,text)',
    'public.get_fines_financial_summary(text)',
    'public.get_fines_subject_summary(text)'
  ]
  loop
    if pg_catalog.to_regprocedure(rpc_signature) is not null then
      raise exception 'Bloque 4.5: ya existe %, revisar antes de reemplazar', rpc_signature;
    end if;
  end loop;

  if (select pg_catalog.count(*) from public.fine_rules) <> 23
     or (select pg_catalog.count(*) from public.fine_incidents) <> 0
     or (select pg_catalog.count(*) from public.fines) <> 0
     or (select pg_catalog.count(*) from public.fine_payments) <> 0 then
    raise exception 'Bloque 4.5: inventario previo incompatible; no se modificaran datos';
  end if;

  if exists (
    select 1
    from public.club_member_permissions permission
    where permission.permission_key = 'fines_manage'
  ) then
    raise exception 'Bloque 4.5: existe una asignacion real fines_manage no prevista';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc procedure_row
    join pg_catalog.pg_language language on language.oid = procedure_row.prolang
    where procedure_row.oid = 'public.guard_fine_payment_integrity()'::regprocedure
      and pg_catalog.pg_get_userbyid(procedure_row.proowner) = 'postgres'
      and language.lanname = 'plpgsql'
      and procedure_row.prosecdef
      and procedure_row.provolatile = 'v'
      and procedure_row.proconfig = array['search_path=pg_catalog']::text[]
      and pg_catalog.strpos(procedure_row.prosrc, 'for update') > 0
      and pg_catalog.strpos(procedure_row.prosrc, 'actor_role not in') > 0
      and pg_catalog.strpos(procedure_row.prosrc, 'collected_before + new.amount') > 0
      and pg_catalog.strpos(procedure_row.prosrc, 'new.amount > collected_before') > 0
  ) then
    raise exception 'Bloque 4.5: guard financiero 4.4 en drift; no se reemplazara';
  end if;
end;
$preconditions$;

create function public.require_fines_manager()
returns table (
  membership_id uuid,
  club_id uuid,
  membership_role text
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
begin
  if not public.can_manage_fines() then
    raise exception 'Fines management not available'
      using errcode = '42501';
  end if;

  return query
  select membership.membership_id, membership.club_id, membership.role
  from public.current_membership() membership;

  if not found then
    raise exception 'Fines management not available'
      using errcode = '42501';
  end if;
end;
$function$;

create function public.create_fine_individual(
  p_rule_id uuid,
  p_subject_id uuid,
  p_occurred_on date,
  p_note text default null
)
returns table (
  fine_id uuid,
  occurred_on date,
  rule_name text,
  subject_name text,
  original_amount numeric(10,2),
  due_on date,
  lifecycle_status text,
  financial_status text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  actor record;
  season_id_value uuid;
  rule_row record;
  subject_row record;
  incident_id_value uuid;
  fine_id_value uuid;
  normalized_note text;
begin
  select * into actor from public.require_fines_manager();

  if p_rule_id is null or p_subject_id is null or p_occurred_on is null then
    raise exception 'Fine input not available' using errcode = '22023';
  end if;

  if p_note is not null and pg_catalog.char_length(p_note) > 500 then
    raise exception 'Fine note exceeds 500 characters' using errcode = '22001';
  end if;
  normalized_note := nullif(pg_catalog.btrim(p_note), '');

  select
    rule.id,
    rule.name,
    rule.active,
    rule.default_amount,
    rule.pricing_mode,
    rule.applies_to_players,
    rule.applies_to_staff
  into rule_row
  from public.fine_rules rule
  where rule.id = p_rule_id
    and rule.club_id = actor.club_id;

  if not found
     or not rule_row.active
     or rule_row.default_amount is null
     or rule_row.pricing_mode = 'unpriced' then
    raise exception 'Fine rule not available' using errcode = 'P4502';
  end if;

  select subject.id, subject.subject_type, subject.display_name
  into subject_row
  from public.fine_subjects subject
  where subject.id = p_subject_id
    and subject.club_id = actor.club_id
    and subject.active;

  if not found
     or subject_row.display_name is null
     or pg_catalog.char_length(pg_catalog.btrim(subject_row.display_name)) = 0 then
    raise exception 'Fine subject not available' using errcode = 'P4503';
  end if;

  if (subject_row.subject_type = 'player' and not rule_row.applies_to_players)
     or (subject_row.subject_type = 'staff' and not rule_row.applies_to_staff)
     or subject_row.subject_type not in ('player', 'staff') then
    raise exception 'Fine rule not applicable to subject' using errcode = '23514';
  end if;

  season_id_value := public.resolve_fines_season(
    actor.club_id,
    p_occurred_on,
    null
  );

  insert into public.fine_incidents (
    club_id,
    season_id,
    fine_rule_id,
    incident_kind,
    occurred_on,
    rule_code_snapshot,
    reason_snapshot,
    note,
    created_by_membership_id
  ) values (
    actor.club_id,
    season_id_value,
    p_rule_id,
    'individual',
    p_occurred_on,
    'DERIVED_BY_GUARD',
    'DERIVED_BY_GUARD',
    normalized_note,
    actor.membership_id
  ) returning id into incident_id_value;

  insert into public.fines (
    club_id,
    incident_id,
    subject_id,
    subject_name_snapshot,
    original_amount,
    due_on
  ) values (
    actor.club_id,
    incident_id_value,
    p_subject_id,
    'DERIVED_BY_GUARD',
    rule_row.default_amount,
    p_occurred_on
  ) returning id into fine_id_value;

  return query
  select
    fine.id,
    incident.occurred_on,
    incident.reason_snapshot,
    fine.subject_name_snapshot,
    fine.original_amount,
    fine.due_on,
    fine.lifecycle_status,
    totals.financial_status
  from public.fines fine
  join public.fine_incidents incident on incident.id = fine.incident_id
  cross join lateral public.get_fine_financial_totals(fine.id) totals
  where fine.id = fine_id_value;
end;
$function$;

create function public.create_fine_collective(
  p_rule_id uuid,
  p_subject_ids uuid[],
  p_occurred_on date,
  p_note text default null
)
returns table (
  incident_id uuid,
  occurred_on date,
  rule_name text,
  subjects_count integer,
  amount_per_subject numeric(10,2),
  generated_original_total numeric(12,2)
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  actor record;
  season_id_value uuid;
  rule_row record;
  incident_id_value uuid;
  normalized_note text;
  requested_count integer;
  distinct_count integer;
  valid_count integer;
begin
  select * into actor from public.require_fines_manager();

  if p_rule_id is null or p_occurred_on is null or p_subject_ids is null then
    raise exception 'Collective fine input not available' using errcode = '22023';
  end if;

  requested_count := pg_catalog.cardinality(p_subject_ids);
  if requested_count < 1 or requested_count > 100 then
    raise exception 'Collective fine requires between 1 and 100 subjects'
      using errcode = '22023';
  end if;

  if p_note is not null and pg_catalog.char_length(p_note) > 500 then
    raise exception 'Fine note exceeds 500 characters' using errcode = '22001';
  end if;
  normalized_note := nullif(pg_catalog.btrim(p_note), '');

  select pg_catalog.count(*), pg_catalog.count(distinct input.subject_id)
  into valid_count, distinct_count
  from pg_catalog.unnest(p_subject_ids) input(subject_id)
  where input.subject_id is not null;

  if valid_count <> requested_count or distinct_count <> requested_count then
    raise exception 'Collective fine contains null or duplicate subjects'
      using errcode = '23514';
  end if;

  select
    rule.id,
    rule.name,
    rule.active,
    rule.default_amount,
    rule.pricing_mode,
    rule.applies_to_players,
    rule.applies_to_staff,
    rule.collective_allowed
  into rule_row
  from public.fine_rules rule
  where rule.id = p_rule_id
    and rule.club_id = actor.club_id;

  if not found
     or not rule_row.active
     or not rule_row.collective_allowed
     or rule_row.default_amount is null
     or rule_row.pricing_mode = 'unpriced' then
    raise exception 'Collective fine rule not available' using errcode = 'P4502';
  end if;

  select pg_catalog.count(*)
  into valid_count
  from public.fine_subjects subject
  where subject.id = any(p_subject_ids)
    and subject.club_id = actor.club_id
    and subject.active
    and subject.display_name is not null
    and pg_catalog.char_length(pg_catalog.btrim(subject.display_name)) > 0
    and (
      (subject.subject_type = 'player' and rule_row.applies_to_players)
      or (subject.subject_type = 'staff' and rule_row.applies_to_staff)
    );

  if valid_count <> requested_count then
    raise exception 'Collective fine subjects not available or not applicable'
      using errcode = '23514';
  end if;

  season_id_value := public.resolve_fines_season(
    actor.club_id,
    p_occurred_on,
    null
  );

  insert into public.fine_incidents (
    club_id,
    season_id,
    fine_rule_id,
    incident_kind,
    occurred_on,
    rule_code_snapshot,
    reason_snapshot,
    note,
    created_by_membership_id
  ) values (
    actor.club_id,
    season_id_value,
    p_rule_id,
    'collective',
    p_occurred_on,
    'DERIVED_BY_GUARD',
    'DERIVED_BY_GUARD',
    normalized_note,
    actor.membership_id
  ) returning id into incident_id_value;

  insert into public.fines (
    club_id,
    incident_id,
    subject_id,
    subject_name_snapshot,
    original_amount,
    due_on
  )
  select
    actor.club_id,
    incident_id_value,
    subject.id,
    'DERIVED_BY_GUARD',
    rule_row.default_amount,
    p_occurred_on
  from public.fine_subjects subject
  where subject.id = any(p_subject_ids)
  order by subject.id;

  return query
  select
    incident_id_value,
    p_occurred_on,
    rule_row.name::text,
    requested_count,
    rule_row.default_amount::numeric(10,2),
    (rule_row.default_amount * requested_count)::numeric(12,2);
end;
$function$;

create function public.resolve_fines_season(
  p_club_id uuid,
  p_reference_on date,
  p_season_code text default null
)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  season_id_value uuid;
  season_count integer;
begin
  if p_club_id is null or p_reference_on is null then
    raise exception 'Season not available'
      using errcode = '22023';
  end if;

  if p_season_code is null then
    select
      pg_catalog.count(*),
      (pg_catalog.array_agg(season.id order by season.id))[1]
    into season_count, season_id_value
    from public.club_seasons season
    where season.club_id = p_club_id
      and season.starts_on <= p_reference_on
      and season.ends_on >= p_reference_on;
  else
    if pg_catalog.char_length(pg_catalog.btrim(p_season_code)) = 0
       or pg_catalog.char_length(p_season_code) > 50 then
      raise exception 'Season not available'
        using errcode = '22023';
    end if;

    select
      pg_catalog.count(*),
      (pg_catalog.array_agg(season.id order by season.id))[1]
    into season_count, season_id_value
    from public.club_seasons season
    where season.club_id = p_club_id
      and season.code = pg_catalog.btrim(p_season_code);
  end if;

  if season_count <> 1 then
    raise exception 'Season not available'
      using errcode = 'P4501';
  end if;

  return season_id_value;
end;
$function$;

-- Compatibilidad 4.5: conserva integramente el guard financiero 4.4 y admite
-- como registrador al PLAYER actual exclusivamente cuando can_manage_fines().
create or replace function public.guard_fine_payment_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  fine_club_id uuid;
  fine_lifecycle_status text;
  fine_due_on date;
  fine_surcharge_applied_at timestamptz;
  generated_amount numeric(10,2);
  collected_before numeric(10,2);
  actor_club_id uuid;
  actor_role text;
  actor_active boolean;
  current_actor_matches boolean;
begin
  if tg_when = 'AFTER' then
    if new.payment_kind = 'refund' then
      perform public.apply_fine_surcharge_if_due(new.fine_id);
    end if;
    return null;
  end if;

  if tg_op <> 'INSERT' then
    raise exception 'El ledger financiero es inmutable; use un movimiento compensatorio'
      using errcode = '23514';
  end if;

  select
    fine.club_id,
    fine.lifecycle_status,
    fine.due_on,
    fine.surcharge_applied_at,
    fine.original_amount + fine.surcharge_amount
  into
    fine_club_id,
    fine_lifecycle_status,
    fine_due_on,
    fine_surcharge_applied_at,
    generated_amount
  from public.fines fine
  where fine.id = new.fine_id
  for update;

  if not found then
    raise exception 'La multa del movimiento no existe'
      using errcode = '23503';
  end if;

  if fine_club_id is distinct from new.club_id then
    raise exception 'La multa no pertenece al club del movimiento'
      using errcode = '23514';
  end if;

  if fine_lifecycle_status <> 'active' then
    raise exception 'Una multa cancelada no acepta movimientos financieros'
      using errcode = '23514';
  end if;

  select membership.club_id, membership.role, membership.is_active
  into actor_club_id, actor_role, actor_active
  from public.club_memberships membership
  where membership.id = new.recorded_by_membership_id;

  if not found then
    raise exception 'La membership registradora no existe'
      using errcode = '23503';
  end if;

  select coalesce(pg_catalog.bool_or(
    membership.membership_id = new.recorded_by_membership_id
    and membership.club_id = new.club_id
    and membership.role = 'player'
  ), false)
  into current_actor_matches
  from public.current_membership() membership;

  if actor_club_id is distinct from new.club_id
     or not actor_active
     or not (
       actor_role in ('owner', 'admin', 'staff')
       or (
         actor_role = 'player'
         and current_actor_matches
         and public.can_manage_fines()
       )
     ) then
    raise exception 'La membership registradora no puede gestionar multas'
      using errcode = '23514';
  end if;

  if current_date > fine_due_on
     and fine_surcharge_applied_at is null then
    perform public.apply_fine_surcharge_if_due(new.fine_id);

    select fine.original_amount + fine.surcharge_amount
    into generated_amount
    from public.fines fine
    where fine.id = new.fine_id;
  end if;

  select coalesce(pg_catalog.sum(
    case movement.payment_kind
      when 'payment' then movement.amount
      when 'refund' then -movement.amount
    end
  ), 0)::numeric(10,2)
  into collected_before
  from public.fine_payments movement
  where movement.fine_id = new.fine_id;

  if new.payment_kind = 'payment'
     and collected_before + new.amount > generated_amount then
    raise exception 'El pago supera la deuda generada pendiente'
      using errcode = '23514';
  end if;

  if new.payment_kind = 'refund'
     and new.amount > collected_before then
    raise exception 'El reembolso supera el dinero neto previamente cobrado'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

create function public.get_fine_rules_for_management()
returns table (
  fine_rule_id uuid,
  code text,
  name text,
  description text,
  default_amount numeric(10,2),
  pricing_mode text,
  applies_to_players boolean,
  applies_to_staff boolean,
  collective_allowed boolean,
  sort_order integer
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  actor record;
begin
  select * into actor from public.require_fines_manager();

  return query
  select
    rule.id,
    rule.code,
    rule.name,
    rule.description,
    rule.default_amount,
    rule.pricing_mode,
    rule.applies_to_players,
    rule.applies_to_staff,
    rule.collective_allowed,
    rule.sort_order
  from public.fine_rules rule
  where rule.club_id = actor.club_id
    and rule.active
    and rule.default_amount is not null
    and rule.pricing_mode <> 'unpriced'
  order by rule.sort_order;
end;
$function$;

create function public.get_fine_subjects_for_management()
returns table (
  subject_id uuid,
  subject_type text,
  display_name text
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  actor record;
begin
  select * into actor from public.require_fines_manager();

  return query
  select subject.id, subject.subject_type, subject.display_name
  from public.fine_subjects subject
  where subject.club_id = actor.club_id
    and subject.active
    and subject.display_name is not null
    and pg_catalog.char_length(pg_catalog.btrim(subject.display_name)) > 0
  order by subject.display_name, subject.id;
end;
$function$;

create function public.cancel_fine(
  p_fine_id uuid,
  p_reason text
)
returns table (
  fine_id uuid,
  lifecycle_status text,
  cancellation_reason text,
  generated_amount numeric(10,2),
  collected_amount numeric(10,2),
  pending_amount numeric(10,2),
  financial_status text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  actor record;
  fine_status text;
  normalized_reason text;
  collected_value numeric(10,2);
begin
  select * into actor from public.require_fines_manager();

  if p_fine_id is null or p_reason is null then
    raise exception 'Fine cancellation not available' using errcode = '22023';
  end if;

  if pg_catalog.char_length(p_reason) > 500 then
    raise exception 'Cancellation reason exceeds 500 characters' using errcode = '22001';
  end if;
  normalized_reason := nullif(pg_catalog.btrim(p_reason), '');
  if normalized_reason is null then
    raise exception 'Cancellation reason is required' using errcode = '22023';
  end if;

  select fine.lifecycle_status
  into fine_status
  from public.fines fine
  where fine.id = p_fine_id
    and fine.club_id = actor.club_id
  for update;

  if not found or fine_status <> 'active' then
    raise exception 'Fine not available' using errcode = 'P4504';
  end if;

  select coalesce(pg_catalog.sum(
    case movement.payment_kind
      when 'payment' then movement.amount
      when 'refund' then -movement.amount
    end
  ), 0)::numeric(10,2)
  into collected_value
  from public.fine_payments movement
  where movement.fine_id = p_fine_id;

  if collected_value <> 0 then
    raise exception 'Fine has unresolved financial movements'
      using errcode = '23514';
  end if;

  update public.fines
  set lifecycle_status = 'cancelled',
      cancelled_at = pg_catalog.clock_timestamp(),
      cancelled_by_membership_id = actor.membership_id,
      cancellation_reason = normalized_reason
  where id = p_fine_id;

  return query
  select
    fine.id,
    fine.lifecycle_status,
    fine.cancellation_reason,
    totals.generated_amount,
    totals.collected_amount,
    totals.pending_amount,
    totals.financial_status
  from public.fines fine
  cross join lateral public.get_fine_financial_totals(fine.id) totals
  where fine.id = p_fine_id;
end;
$function$;

create function public.record_fine_payment(
  p_fine_id uuid,
  p_amount numeric,
  p_paid_on date,
  p_note text default null
)
returns table (
  fine_id uuid,
  payment_id uuid,
  payment_kind text,
  generated_amount numeric(10,2),
  collected_amount numeric(10,2),
  pending_amount numeric(10,2),
  financial_status text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  actor record;
  incident_date date;
  payment_id_value uuid;
  normalized_note text;
begin
  select * into actor from public.require_fines_manager();

  if p_fine_id is null
     or p_amount is null
     or p_amount <= 0
     or p_amount = 'NaN'::numeric
     or p_amount in ('Infinity'::numeric, '-Infinity'::numeric)
     or p_amount <> pg_catalog.round(p_amount, 2) then
    raise exception 'Payment amount must be positive with at most two decimals'
      using errcode = '22023';
  end if;

  if p_paid_on is null or p_paid_on > current_date then
    raise exception 'Payment date not available' using errcode = '22023';
  end if;

  if p_note is not null and pg_catalog.char_length(p_note) > 500 then
    raise exception 'Payment note exceeds 500 characters' using errcode = '22001';
  end if;
  normalized_note := nullif(pg_catalog.btrim(p_note), '');

  select incident.occurred_on
  into incident_date
  from public.fines fine
  join public.fine_incidents incident on incident.id = fine.incident_id
  where fine.id = p_fine_id
    and fine.club_id = actor.club_id
    and fine.lifecycle_status = 'active'
  for update of fine;

  if not found then
    raise exception 'Fine not available' using errcode = 'P4504';
  end if;

  if p_paid_on < incident_date then
    raise exception 'Payment date not available' using errcode = '22023';
  end if;

  perform public.apply_fine_surcharge_if_due(p_fine_id);

  insert into public.fine_payments (
    club_id,
    fine_id,
    payment_kind,
    amount,
    paid_on,
    note,
    recorded_by_membership_id
  ) values (
    actor.club_id,
    p_fine_id,
    'payment',
    p_amount,
    p_paid_on,
    normalized_note,
    actor.membership_id
  ) returning id into payment_id_value;

  return query
  select
    p_fine_id,
    payment_id_value,
    'payment'::text,
    totals.generated_amount,
    totals.collected_amount,
    totals.pending_amount,
    totals.financial_status
  from public.get_fine_financial_totals(p_fine_id) totals;
end;
$function$;

create function public.record_fine_refund(
  p_fine_id uuid,
  p_amount numeric,
  p_paid_on date,
  p_note text default null
)
returns table (
  fine_id uuid,
  payment_id uuid,
  payment_kind text,
  generated_amount numeric(10,2),
  collected_amount numeric(10,2),
  pending_amount numeric(10,2),
  financial_status text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  actor record;
  incident_date date;
  payment_id_value uuid;
  normalized_note text;
begin
  select * into actor from public.require_fines_manager();

  if p_fine_id is null
     or p_amount is null
     or p_amount <= 0
     or p_amount = 'NaN'::numeric
     or p_amount in ('Infinity'::numeric, '-Infinity'::numeric)
     or p_amount <> pg_catalog.round(p_amount, 2) then
    raise exception 'Refund amount must be positive with at most two decimals'
      using errcode = '22023';
  end if;

  if p_paid_on is null or p_paid_on > current_date then
    raise exception 'Refund date not available' using errcode = '22023';
  end if;

  if p_note is not null and pg_catalog.char_length(p_note) > 500 then
    raise exception 'Refund note exceeds 500 characters' using errcode = '22001';
  end if;
  normalized_note := nullif(pg_catalog.btrim(p_note), '');

  select incident.occurred_on
  into incident_date
  from public.fines fine
  join public.fine_incidents incident on incident.id = fine.incident_id
  where fine.id = p_fine_id
    and fine.club_id = actor.club_id
    and fine.lifecycle_status = 'active'
  for update of fine;

  if not found then
    raise exception 'Fine not available' using errcode = 'P4504';
  end if;

  if p_paid_on < incident_date then
    raise exception 'Refund date not available' using errcode = '22023';
  end if;

  insert into public.fine_payments (
    club_id,
    fine_id,
    payment_kind,
    amount,
    paid_on,
    note,
    recorded_by_membership_id
  ) values (
    actor.club_id,
    p_fine_id,
    'refund',
    p_amount,
    p_paid_on,
    normalized_note,
    actor.membership_id
  ) returning id into payment_id_value;

  return query
  select
    p_fine_id,
    payment_id_value,
    'refund'::text,
    totals.generated_amount,
    totals.collected_amount,
    totals.pending_amount,
    totals.financial_status
  from public.get_fine_financial_totals(p_fine_id) totals;
end;
$function$;

create function public.get_my_fines(
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  fine_id uuid,
  occurred_on date,
  rule_name text,
  rule_description text,
  note text,
  original_amount numeric(10,2),
  surcharge_amount numeric(10,2),
  generated_amount numeric(10,2),
  collected_amount numeric(10,2),
  pending_amount numeric(10,2),
  financial_status text,
  lifecycle_status text,
  due_on date,
  surcharge_applied_at timestamptz,
  currency text,
  cancellation_reason text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  actor_jugador_id uuid;
  actor_club_id uuid;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100
     or p_offset is null or p_offset < 0 then
    raise exception 'Pagination not available' using errcode = '22023';
  end if;

  if not public.is_player() then
    raise exception 'Player fines not available' using errcode = '42501';
  end if;

  actor_jugador_id := public.current_jugador_id();
  select membership.club_id into actor_club_id
  from public.current_membership() membership
  where membership.role = 'player'
    and membership.jugador_id = actor_jugador_id;

  if actor_jugador_id is null or actor_club_id is null then
    raise exception 'Player fines not available' using errcode = '42501';
  end if;

  return query
  select
    fine.id,
    incident.occurred_on,
    incident.reason_snapshot,
    incident.description_snapshot,
    incident.note,
    fine.original_amount,
    fine.surcharge_amount,
    totals.generated_amount,
    totals.collected_amount,
    totals.pending_amount,
    totals.financial_status,
    fine.lifecycle_status,
    fine.due_on,
    fine.surcharge_applied_at,
    fine.currency,
    fine.cancellation_reason,
    fine.created_at
  from public.fines fine
  join public.fine_incidents incident on incident.id = fine.incident_id
  join public.fine_subjects subject on subject.id = fine.subject_id
  cross join lateral public.get_fine_financial_totals(fine.id) totals
  where fine.club_id = actor_club_id
    and subject.club_id = actor_club_id
    and subject.subject_type = 'player'
    and subject.jugador_id = actor_jugador_id
  order by incident.occurred_on desc, fine.created_at desc, fine.id
  limit p_limit
  offset p_offset;
end;
$function$;

create function public.get_my_fines_summary()
returns table (
  total_fines bigint,
  active_fines bigint,
  unpaid_count bigint,
  partial_count bigint,
  paid_count bigint,
  cancelled_count bigint,
  original_total numeric(14,2),
  surcharge_total numeric(14,2),
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
  actor_jugador_id uuid;
  actor_club_id uuid;
begin
  if not public.is_player() then
    raise exception 'Player fines not available' using errcode = '42501';
  end if;

  actor_jugador_id := public.current_jugador_id();
  select membership.club_id into actor_club_id
  from public.current_membership() membership
  where membership.role = 'player'
    and membership.jugador_id = actor_jugador_id;

  if actor_jugador_id is null or actor_club_id is null then
    raise exception 'Player fines not available' using errcode = '42501';
  end if;

  return query
  with own_fines as (
    select
      fine.id,
      fine.lifecycle_status,
      fine.original_amount,
      fine.surcharge_amount,
      totals.generated_amount,
      totals.collected_amount,
      totals.pending_amount,
      totals.financial_status
    from public.fines fine
    join public.fine_subjects subject on subject.id = fine.subject_id
    cross join lateral public.get_fine_financial_totals(fine.id) totals
    where fine.club_id = actor_club_id
      and subject.club_id = actor_club_id
      and subject.subject_type = 'player'
      and subject.jugador_id = actor_jugador_id
  )
  select
    pg_catalog.count(*)::bigint,
    pg_catalog.count(*) filter (where own.lifecycle_status = 'active')::bigint,
    pg_catalog.count(*) filter (
      where own.lifecycle_status = 'active' and own.financial_status = 'unpaid'
    )::bigint,
    pg_catalog.count(*) filter (
      where own.lifecycle_status = 'active' and own.financial_status = 'partial'
    )::bigint,
    pg_catalog.count(*) filter (
      where own.lifecycle_status = 'active' and own.financial_status = 'paid'
    )::bigint,
    pg_catalog.count(*) filter (where own.lifecycle_status = 'cancelled')::bigint,
    coalesce(pg_catalog.sum(own.original_amount) filter (
      where own.lifecycle_status = 'active'
    ), 0)::numeric(14,2),
    coalesce(pg_catalog.sum(own.surcharge_amount) filter (
      where own.lifecycle_status = 'active'
    ), 0)::numeric(14,2),
    coalesce(pg_catalog.sum(own.generated_amount) filter (
      where own.lifecycle_status = 'active'
    ), 0)::numeric(14,2),
    coalesce(pg_catalog.sum(own.collected_amount) filter (
      where own.lifecycle_status = 'active'
    ), 0)::numeric(14,2),
    coalesce(pg_catalog.sum(own.pending_amount) filter (
      where own.lifecycle_status = 'active'
    ), 0)::numeric(14,2)
  from own_fines own;
end;
$function$;

create function public.get_fines_management_list(
  p_status text default 'all',
  p_limit integer default 100,
  p_offset integer default 0,
  p_season_code text default null
)
returns table (
  fine_id uuid,
  occurred_on date,
  subject_name text,
  subject_type text,
  rule_name text,
  original_amount numeric(10,2),
  surcharge_amount numeric(10,2),
  generated_amount numeric(10,2),
  collected_amount numeric(10,2),
  pending_amount numeric(10,2),
  financial_status text,
  lifecycle_status text,
  due_on date,
  is_overdue boolean,
  note text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  actor record;
  season_id_value uuid;
  normalized_status text;
begin
  select * into actor from public.require_fines_manager();

  normalized_status := pg_catalog.lower(coalesce(pg_catalog.btrim(p_status), ''));
  if normalized_status not in ('all', 'unpaid', 'partial', 'paid', 'cancelled', 'overdue') then
    raise exception 'Fine status filter not available' using errcode = '22023';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 200
     or p_offset is null or p_offset < 0 then
    raise exception 'Pagination not available' using errcode = '22023';
  end if;

  if p_season_code is not null then
    season_id_value := public.resolve_fines_season(
      actor.club_id,
      current_date,
      p_season_code
    );
  end if;

  return query
  select
    fine.id,
    incident.occurred_on,
    fine.subject_name_snapshot,
    subject.subject_type,
    incident.reason_snapshot,
    fine.original_amount,
    fine.surcharge_amount,
    totals.generated_amount,
    totals.collected_amount,
    totals.pending_amount,
    totals.financial_status,
    fine.lifecycle_status,
    fine.due_on,
    (
      fine.lifecycle_status = 'active'
      and current_date > fine.due_on
      and totals.pending_amount > 0
    ),
    incident.note,
    fine.created_at
  from public.fines fine
  join public.fine_incidents incident on incident.id = fine.incident_id
  join public.fine_subjects subject on subject.id = fine.subject_id
  cross join lateral public.get_fine_financial_totals(fine.id) totals
  where fine.club_id = actor.club_id
    and (season_id_value is null or incident.season_id = season_id_value)
    and (
      normalized_status = 'all'
      or (normalized_status = 'cancelled' and fine.lifecycle_status = 'cancelled')
      or (
        normalized_status in ('unpaid', 'partial', 'paid')
        and fine.lifecycle_status = 'active'
        and totals.financial_status = normalized_status
      )
      or (
        normalized_status = 'overdue'
        and fine.lifecycle_status = 'active'
        and current_date > fine.due_on
        and totals.pending_amount > 0
      )
    )
  order by incident.occurred_on desc, fine.created_at desc, fine.id
  limit p_limit
  offset p_offset;
end;
$function$;

create function public.get_fines_financial_summary(
  p_season_code text default null
)
returns table (
  season_code text,
  total_fines bigint,
  active_fines bigint,
  cancelled_fines bigint,
  unpaid_count bigint,
  partial_count bigint,
  paid_count bigint,
  overdue_count bigint,
  original_total numeric(14,2),
  surcharge_total numeric(14,2),
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
  actor record;
  season_id_value uuid;
  resolved_code text;
begin
  select * into actor from public.require_fines_manager();
  season_id_value := public.resolve_fines_season(
    actor.club_id,
    current_date,
    p_season_code
  );

  select season.code into resolved_code
  from public.club_seasons season
  where season.id = season_id_value
    and season.club_id = actor.club_id;

  return query
  with season_fines as (
    select
      fine.lifecycle_status,
      fine.due_on,
      fine.original_amount,
      fine.surcharge_amount,
      totals.generated_amount,
      totals.collected_amount,
      totals.pending_amount,
      totals.financial_status
    from public.fines fine
    join public.fine_incidents incident on incident.id = fine.incident_id
    cross join lateral public.get_fine_financial_totals(fine.id) totals
    where fine.club_id = actor.club_id
      and incident.season_id = season_id_value
  )
  select
    resolved_code,
    pg_catalog.count(*)::bigint,
    pg_catalog.count(*) filter (where data.lifecycle_status = 'active')::bigint,
    pg_catalog.count(*) filter (where data.lifecycle_status = 'cancelled')::bigint,
    pg_catalog.count(*) filter (
      where data.lifecycle_status = 'active' and data.financial_status = 'unpaid'
    )::bigint,
    pg_catalog.count(*) filter (
      where data.lifecycle_status = 'active' and data.financial_status = 'partial'
    )::bigint,
    pg_catalog.count(*) filter (
      where data.lifecycle_status = 'active' and data.financial_status = 'paid'
    )::bigint,
    pg_catalog.count(*) filter (
      where data.lifecycle_status = 'active'
        and current_date > data.due_on
        and data.pending_amount > 0
    )::bigint,
    coalesce(pg_catalog.sum(data.original_amount) filter (
      where data.lifecycle_status = 'active'
    ), 0)::numeric(14,2),
    coalesce(pg_catalog.sum(data.surcharge_amount) filter (
      where data.lifecycle_status = 'active'
    ), 0)::numeric(14,2),
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

create function public.get_fines_subject_summary(
  p_season_code text default null
)
returns table (
  subject_name text,
  subject_type text,
  fine_count bigint,
  original_total numeric(14,2),
  surcharge_total numeric(14,2),
  generated_total numeric(14,2),
  collected_total numeric(14,2),
  pending_total numeric(14,2),
  unpaid_count bigint,
  partial_count bigint,
  paid_count bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  actor record;
  season_id_value uuid;
begin
  select * into actor from public.require_fines_manager();
  season_id_value := public.resolve_fines_season(
    actor.club_id,
    current_date,
    p_season_code
  );

  return query
  select
    coalesce(subject.display_name, pg_catalog.max(fine.subject_name_snapshot)),
    subject.subject_type,
    pg_catalog.count(*)::bigint,
    coalesce(pg_catalog.sum(fine.original_amount), 0)::numeric(14,2),
    coalesce(pg_catalog.sum(fine.surcharge_amount), 0)::numeric(14,2),
    coalesce(pg_catalog.sum(totals.generated_amount), 0)::numeric(14,2),
    coalesce(pg_catalog.sum(totals.collected_amount), 0)::numeric(14,2),
    coalesce(pg_catalog.sum(totals.pending_amount), 0)::numeric(14,2),
    pg_catalog.count(*) filter (where totals.financial_status = 'unpaid')::bigint,
    pg_catalog.count(*) filter (where totals.financial_status = 'partial')::bigint,
    pg_catalog.count(*) filter (where totals.financial_status = 'paid')::bigint
  from public.fines fine
  join public.fine_incidents incident on incident.id = fine.incident_id
  join public.fine_subjects subject on subject.id = fine.subject_id
  cross join lateral public.get_fine_financial_totals(fine.id) totals
  where fine.club_id = actor.club_id
    and incident.season_id = season_id_value
    and fine.lifecycle_status = 'active'
  group by subject.id, subject.display_name, subject.subject_type
  order by
    coalesce(pg_catalog.sum(totals.pending_amount), 0) desc,
    coalesce(pg_catalog.sum(totals.generated_amount), 0) desc,
    coalesce(subject.display_name, pg_catalog.max(fine.subject_name_snapshot));
end;
$function$;

alter function public.require_fines_manager() owner to postgres;
alter function public.resolve_fines_season(uuid,date,text) owner to postgres;
alter function public.guard_fine_payment_integrity() owner to postgres;
alter function public.get_fine_rules_for_management() owner to postgres;
alter function public.get_fine_subjects_for_management() owner to postgres;
alter function public.create_fine_individual(uuid,uuid,date,text) owner to postgres;
alter function public.create_fine_collective(uuid,uuid[],date,text) owner to postgres;
alter function public.cancel_fine(uuid,text) owner to postgres;
alter function public.record_fine_payment(uuid,numeric,date,text) owner to postgres;
alter function public.record_fine_refund(uuid,numeric,date,text) owner to postgres;
alter function public.get_my_fines(integer,integer) owner to postgres;
alter function public.get_my_fines_summary() owner to postgres;
alter function public.get_fines_management_list(text,integer,integer,text) owner to postgres;
alter function public.get_fines_financial_summary(text) owner to postgres;
alter function public.get_fines_subject_summary(text) owner to postgres;

revoke all on function public.require_fines_manager()
from public, anon, authenticated, service_role;
revoke all on function public.resolve_fines_season(uuid,date,text)
from public, anon, authenticated, service_role;
revoke all on function public.guard_fine_payment_integrity()
from public, anon, authenticated, service_role;

revoke all on function public.get_fine_rules_for_management()
from public, anon, authenticated, service_role;
revoke all on function public.get_fine_subjects_for_management()
from public, anon, authenticated, service_role;
revoke all on function public.create_fine_individual(uuid,uuid,date,text)
from public, anon, authenticated, service_role;
revoke all on function public.create_fine_collective(uuid,uuid[],date,text)
from public, anon, authenticated, service_role;
revoke all on function public.cancel_fine(uuid,text)
from public, anon, authenticated, service_role;
revoke all on function public.record_fine_payment(uuid,numeric,date,text)
from public, anon, authenticated, service_role;
revoke all on function public.record_fine_refund(uuid,numeric,date,text)
from public, anon, authenticated, service_role;
revoke all on function public.get_my_fines(integer,integer)
from public, anon, authenticated, service_role;
revoke all on function public.get_my_fines_summary()
from public, anon, authenticated, service_role;
revoke all on function public.get_fines_management_list(text,integer,integer,text)
from public, anon, authenticated, service_role;
revoke all on function public.get_fines_financial_summary(text)
from public, anon, authenticated, service_role;
revoke all on function public.get_fines_subject_summary(text)
from public, anon, authenticated, service_role;

grant execute on function public.get_fine_rules_for_management()
to authenticated, service_role;
grant execute on function public.get_fine_subjects_for_management()
to authenticated, service_role;
grant execute on function public.create_fine_individual(uuid,uuid,date,text)
to authenticated, service_role;
grant execute on function public.create_fine_collective(uuid,uuid[],date,text)
to authenticated, service_role;
grant execute on function public.cancel_fine(uuid,text)
to authenticated, service_role;
grant execute on function public.record_fine_payment(uuid,numeric,date,text)
to authenticated, service_role;
grant execute on function public.record_fine_refund(uuid,numeric,date,text)
to authenticated, service_role;
grant execute on function public.get_my_fines(integer,integer)
to authenticated, service_role;
grant execute on function public.get_my_fines_summary()
to authenticated, service_role;
grant execute on function public.get_fines_management_list(text,integer,integer,text)
to authenticated, service_role;
grant execute on function public.get_fines_financial_summary(text)
to authenticated, service_role;
grant execute on function public.get_fines_subject_summary(text)
to authenticated, service_role;

do $postconditions$
declare
  public_rpc text;
  public_rpc_oid oid;
begin
  foreach public_rpc in array array[
    'public.get_fine_rules_for_management()',
    'public.get_fine_subjects_for_management()',
    'public.create_fine_individual(uuid,uuid,date,text)',
    'public.create_fine_collective(uuid,uuid[],date,text)',
    'public.cancel_fine(uuid,text)',
    'public.record_fine_payment(uuid,numeric,date,text)',
    'public.record_fine_refund(uuid,numeric,date,text)',
    'public.get_my_fines(integer,integer)',
    'public.get_my_fines_summary()',
    'public.get_fines_management_list(text,integer,integer,text)',
    'public.get_fines_financial_summary(text)',
    'public.get_fines_subject_summary(text)'
  ]
  loop
    public_rpc_oid := pg_catalog.to_regprocedure(public_rpc);
    if public_rpc_oid is null or not exists (
      select 1
      from pg_catalog.pg_proc procedure_row
      where procedure_row.oid = public_rpc_oid
        and pg_catalog.pg_get_userbyid(procedure_row.proowner) = 'postgres'
        and procedure_row.prosecdef
        and procedure_row.proconfig = array['search_path=pg_catalog']::text[]
        and not pg_catalog.has_function_privilege('anon', public_rpc_oid, 'EXECUTE')
        and pg_catalog.has_function_privilege('authenticated', public_rpc_oid, 'EXECUTE')
        and pg_catalog.has_function_privilege('service_role', public_rpc_oid, 'EXECUTE')
        and not exists (
          select 1
          from pg_catalog.aclexplode(
            coalesce(
              procedure_row.proacl,
              pg_catalog.acldefault('f', procedure_row.proowner)
            )
          ) acl
          where acl.privilege_type = 'EXECUTE'
            and acl.grantee not in (
              procedure_row.proowner,
              (select role_row.oid from pg_catalog.pg_roles role_row
               where role_row.rolname = 'authenticated'),
              (select role_row.oid from pg_catalog.pg_roles role_row
               where role_row.rolname = 'service_role')
            )
        )
    ) then
      raise exception 'Bloque 4.5: contrato o ACL incorrecto en %', public_rpc;
    end if;
  end loop;

  if pg_catalog.has_function_privilege(
       'authenticated', 'public.require_fines_manager()'::regprocedure, 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.resolve_fines_season(uuid,date,text)'::regprocedure,
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.guard_fine_payment_integrity()'::regprocedure,
       'EXECUTE'
     ) then
    raise exception 'Bloque 4.5: helper interno ejecutable por authenticated';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc procedure_row
    where procedure_row.oid = 'public.guard_fine_payment_integrity()'::regprocedure
      and pg_catalog.strpos(procedure_row.prosrc, 'public.can_manage_fines()') > 0
      and pg_catalog.strpos(procedure_row.prosrc, 'current_actor_matches') > 0
      and pg_catalog.strpos(procedure_row.prosrc, 'for update') > 0
      and pg_catalog.strpos(procedure_row.prosrc, 'collected_before + new.amount') > 0
      and pg_catalog.strpos(procedure_row.prosrc, 'new.amount > collected_before') > 0
  ) then
    raise exception 'Bloque 4.5: compatibilidad segura PLAYER manager incompleta';
  end if;

  if (select pg_catalog.count(*) from public.fine_rules) <> 23
     or (select pg_catalog.count(*) from public.fine_incidents) <> 0
     or (select pg_catalog.count(*) from public.fines) <> 0
     or (select pg_catalog.count(*) from public.fine_payments) <> 0
     or exists (
       select 1
       from public.club_member_permissions permission
       where permission.permission_key = 'fines_manage'
     ) then
    raise exception 'Bloque 4.5: regresion en inventario o permisos';
  end if;
end;
$postconditions$;

comment on function public.create_fine_individual(uuid,uuid,date,text) is
'Crea atomicamente incidencia y multa individual. Club, temporada, actor, snapshots, importe y vencimiento son derivados en backend.';

comment on function public.create_fine_collective(uuid,uuid[],date,text) is
'Crea atomicamente una incidencia colectiva y una multa por sujeto, sin deduplicacion silenciosa.';

comment on function public.get_my_fines(integer,integer) is
'Historial sanitizado del PLAYER actual. fine_incidents.note es texto visible tambien para la persona sancionada.';

comment on function public.get_my_fines_summary() is
'Resumen propio: counts historicos, pero importes financieros exclusivamente de multas active.';

comment on function public.get_fines_management_list(text,integer,integer,text) is
'Listado manager sin filtro de temporada por defecto; p_season_code permite acotarlo de forma segura.';

comment on function public.get_fines_financial_summary(text) is
'Resumen manager de una temporada segura; NULL resuelve la temporada que contiene current_date. Importes solo active.';

comment on function public.get_fines_subject_summary(text) is
'Ranking manager por sujeto y temporada; solo multas active y sin exponer subject_id.';

commit;
