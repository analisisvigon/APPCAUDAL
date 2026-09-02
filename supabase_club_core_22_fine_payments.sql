-- APPCAUDAL - Bloque 4.4
-- Pagos, deuda derivada y recargo unico del modulo Multas.
--
-- Este bloque no crea RPC publicas de gestion, cron, gastos, caja ni frontend.
-- Las tablas financieras deben seguir vacias al terminar la migracion.

begin;

do $preconditions$
begin
  if auth.uid() is not null then
    raise exception 'Bloque 4.4 debe ejecutarse sin una identidad JWT de aplicacion activa';
  end if;

  if pg_catalog.to_regclass('public.fine_incidents') is null
     or pg_catalog.to_regclass('public.fines') is null
     or pg_catalog.to_regclass('public.club_memberships') is null
     or pg_catalog.to_regprocedure('public.guard_fine_integrity()') is null
     or pg_catalog.to_regprocedure('public.current_membership()') is null
     or pg_catalog.to_regprocedure('public.is_app_staff()') is null then
    raise exception 'Bloque 4.4: faltan objetos validados de los Bloques 4.1-4.3';
  end if;

  if pg_catalog.to_regclass('public.fine_payments') is not null
     or pg_catalog.to_regprocedure('public.guard_fine_financial_integrity()') is not null
     or pg_catalog.to_regprocedure('public.apply_fine_surcharge_if_due(uuid)') is not null
     or pg_catalog.to_regprocedure('public.guard_fine_payment_integrity()') is not null
     or pg_catalog.to_regprocedure('public.get_fine_financial_totals(uuid)') is not null then
    raise exception 'Bloque 4.4: ya existe algun objeto del bloque; revisar antes de reemplazar';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.fines'::regclass
      and attribute.attname in (
        'due_on',
        'surcharge_amount',
        'surcharge_base_amount',
        'surcharge_applied_at'
      )
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) then
    raise exception 'Bloque 4.4: fines ya contiene algun campo financiero del bloque';
  end if;

  if (select pg_catalog.count(*) from public.fine_incidents) <> 0
     or (select pg_catalog.count(*) from public.fines) <> 0 then
    raise exception 'Bloque 4.4: existen incidencias o multas; no se inventara un backfill financiero';
  end if;

  if (select pg_catalog.count(*) from public.fine_rules) <> 23 then
    raise exception 'Bloque 4.4: el catalogo debe conservar exactamente 23 reglas';
  end if;

  if exists (
    select 1
    from public.club_member_permissions permission
    where permission.permission_key = 'fines_manage'
  ) then
    raise exception 'Bloque 4.4: existe una asignacion real fines_manage no prevista';
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    raise exception 'Bloque 4.4: faltan roles Supabase requeridos';
  end if;
end;
$preconditions$;

alter table public.fines
  add column due_on date not null,
  add column surcharge_amount numeric(10,2) not null default 0,
  add column surcharge_base_amount numeric(10,2) null,
  add column surcharge_applied_at timestamptz null,
  add constraint fines_surcharge_contract_check check (
    (
      surcharge_amount = 0
      and surcharge_base_amount is null
      and surcharge_applied_at is null
    )
    or (
      surcharge_amount > 0
      and surcharge_amount <> 'NaN'::numeric
      and surcharge_base_amount > 0
      and surcharge_base_amount <> 'NaN'::numeric
      and surcharge_base_amount <= original_amount
      and surcharge_applied_at is not null
      and surcharge_amount = pg_catalog.round(surcharge_base_amount * 0.50, 2)
    )
  );

create table public.fine_payments (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  fine_id uuid not null references public.fines(id) on delete restrict,
  payment_kind text not null,
  amount numeric(10,2) not null,
  paid_on date not null,
  note text null,
  recorded_by_membership_id uuid not null
    references public.club_memberships(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  constraint fine_payments_kind_check check (
    payment_kind in ('payment', 'refund')
  ),
  constraint fine_payments_amount_positive_check check (
    amount > 0
    and amount <> 'NaN'::numeric
  )
);

create index fine_payments_fine_created_idx
on public.fine_payments (fine_id, created_at, id);

create index fine_payments_club_paid_idx
on public.fine_payments (club_id, paid_on desc, created_at desc);

create function public.guard_fine_financial_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  incident_occurred_on date;
  collected_before numeric(10,2);
  expected_base numeric(10,2);
  surcharge_context text;
begin
  if tg_op = 'INSERT' then
    select incident.occurred_on
    into incident_occurred_on
    from public.fine_incidents incident
    where incident.id = new.incident_id;

    if not found then
      raise exception 'La incidencia de la multa no existe'
        using errcode = '23503';
    end if;

    new.due_on := (
      pg_catalog.date_trunc('month', incident_occurred_on::timestamp)
      + interval '1 month'
      - interval '1 day'
    )::date;
    new.surcharge_amount := 0;
    new.surcharge_base_amount := null;
    new.surcharge_applied_at := null;
    return new;
  end if;

  if new.due_on is distinct from old.due_on then
    raise exception 'La fecha limite financiera de una multa es inmutable'
      using errcode = '23514';
  end if;

  if new.surcharge_amount is not distinct from old.surcharge_amount
     and new.surcharge_base_amount is not distinct from old.surcharge_base_amount
     and new.surcharge_applied_at is not distinct from old.surcharge_applied_at then
    return new;
  end if;

  if old.surcharge_applied_at is not null
     or old.surcharge_amount <> 0
     or old.surcharge_base_amount is not null then
    raise exception 'El recargo ya aplicado es inmutable y no puede repetirse'
      using errcode = '23514';
  end if;

  surcharge_context := pg_catalog.current_setting(
    'appcaudal.applying_fine_surcharge',
    true
  );

  if surcharge_context is distinct from new.id::text then
    raise exception 'Los campos de recargo solo pueden modificarse mediante la funcion interna autorizada'
      using errcode = '42501';
  end if;

  if new.lifecycle_status <> 'active'
     or current_date <= new.due_on then
    raise exception 'El recargo solo puede aplicarse a una multa activa y vencida'
      using errcode = '23514';
  end if;

  select coalesce(pg_catalog.sum(
    case movement.payment_kind
      when 'payment' then movement.amount
      when 'refund' then -movement.amount
    end
  ), 0)::numeric(10,2)
  into collected_before
  from public.fine_payments movement
  where movement.fine_id = new.id;

  expected_base := case
    when new.original_amount - collected_before > 0
      then new.original_amount - collected_before
    else 0::numeric
  end::numeric(10,2);

  if expected_base <= 0
     or new.surcharge_base_amount is distinct from expected_base
     or new.surcharge_amount is distinct from pg_catalog.round(expected_base * 0.50, 2)
     or new.surcharge_applied_at is null then
    raise exception 'La base o el importe del recargo no coincide con la deuda original pendiente'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

create function public.apply_fine_surcharge_if_due(p_fine_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $function$
declare
  fine_row record;
  collected_before numeric(10,2);
  original_outstanding numeric(10,2);
  previous_context text;
begin
  select
    fine.id,
    fine.lifecycle_status,
    fine.due_on,
    fine.original_amount,
    fine.surcharge_amount,
    fine.surcharge_base_amount,
    fine.surcharge_applied_at
  into fine_row
  from public.fines fine
  where fine.id = p_fine_id
  for update;

  if not found then
    raise exception 'La multa no existe'
      using errcode = '23503';
  end if;

  if fine_row.lifecycle_status <> 'active'
     or current_date <= fine_row.due_on
     or fine_row.surcharge_applied_at is not null then
    return false;
  end if;

  select coalesce(pg_catalog.sum(
    case movement.payment_kind
      when 'payment' then movement.amount
      when 'refund' then -movement.amount
    end
  ), 0)::numeric(10,2)
  into collected_before
  from public.fine_payments movement
  where movement.fine_id = p_fine_id;

  original_outstanding := case
    when fine_row.original_amount - collected_before > 0
      then fine_row.original_amount - collected_before
    else 0::numeric
  end::numeric(10,2);

  if original_outstanding <= 0 then
    return false;
  end if;

  previous_context := pg_catalog.current_setting(
    'appcaudal.applying_fine_surcharge',
    true
  );
  perform pg_catalog.set_config(
    'appcaudal.applying_fine_surcharge',
    p_fine_id::text,
    true
  );

  begin
    update public.fines
    set surcharge_base_amount = original_outstanding,
        surcharge_amount = pg_catalog.round(original_outstanding * 0.50, 2),
        surcharge_applied_at = pg_catalog.clock_timestamp()
    where id = p_fine_id;
  exception
    when others then
      perform pg_catalog.set_config(
        'appcaudal.applying_fine_surcharge',
        coalesce(previous_context, ''),
        true
      );
      raise;
  end;

  perform pg_catalog.set_config(
    'appcaudal.applying_fine_surcharge',
    coalesce(previous_context, ''),
    true
  );

  return true;
end;
$function$;

create function public.guard_fine_payment_integrity()
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
begin
  if tg_when = 'AFTER' then
    -- Un refund puede reabrir deuda original. Tras insertarlo, la funcion ve
    -- ya el neto reducido y materializa el recargo en esta misma sentencia.
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

  if actor_club_id is distinct from new.club_id
     or not actor_active
     or actor_role not in ('owner', 'admin', 'staff') then
    raise exception 'La membership registradora no es STAFF activo del club'
      using errcode = '23514';
  end if;

  -- La fecha paid_on es informativa. Si hoy ya vencio la multa, el recargo se
  -- materializa antes del movimiento y no puede evitarse declarando otra fecha.
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

create function public.get_fine_financial_totals(p_fine_id uuid)
returns table (
  fine_id uuid,
  lifecycle_status text,
  original_amount numeric(10,2),
  surcharge_amount numeric(10,2),
  generated_amount numeric(10,2),
  collected_amount numeric(10,2),
  pending_amount numeric(10,2),
  financial_status text
)
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select
    fine.id,
    fine.lifecycle_status,
    fine.original_amount,
    fine.surcharge_amount,
    (fine.original_amount + fine.surcharge_amount)::numeric(10,2),
    totals.collected_amount,
    case
      when fine.original_amount + fine.surcharge_amount - totals.collected_amount > 0
        then fine.original_amount + fine.surcharge_amount - totals.collected_amount
      else 0::numeric
    end::numeric(10,2),
    case
      when totals.collected_amount <= 0 then 'unpaid'
      when totals.collected_amount < fine.original_amount + fine.surcharge_amount then 'partial'
      else 'paid'
    end
  from public.fines fine
  cross join lateral (
    select coalesce(pg_catalog.sum(
      case movement.payment_kind
        when 'payment' then movement.amount
        when 'refund' then -movement.amount
      end
    ), 0)::numeric(10,2) as collected_amount
    from public.fine_payments movement
    where movement.fine_id = fine.id
  ) totals
  where fine.id = p_fine_id;
$function$;

create trigger guard_fine_financial_integrity
before insert or update on public.fines
for each row execute function public.guard_fine_financial_integrity();

create trigger guard_fine_payment_integrity
before insert or update or delete on public.fine_payments
for each row execute function public.guard_fine_payment_integrity();

create trigger apply_fine_surcharge_after_refund
after insert on public.fine_payments
for each row
when (new.payment_kind = 'refund')
execute function public.guard_fine_payment_integrity();

alter function public.guard_fine_financial_integrity() owner to postgres;
alter function public.apply_fine_surcharge_if_due(uuid) owner to postgres;
alter function public.guard_fine_payment_integrity() owner to postgres;
alter function public.get_fine_financial_totals(uuid) owner to postgres;
alter table public.fine_payments owner to postgres;

revoke all on function public.guard_fine_financial_integrity()
from public, anon, authenticated, service_role;
revoke all on function public.apply_fine_surcharge_if_due(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.guard_fine_payment_integrity()
from public, anon, authenticated, service_role;
revoke all on function public.get_fine_financial_totals(uuid)
from public, anon, authenticated, service_role;

grant execute on function public.apply_fine_surcharge_if_due(uuid)
to service_role;
grant execute on function public.get_fine_financial_totals(uuid)
to service_role;

alter table public.fine_payments enable row level security;

create policy "Fines staff can read payments"
on public.fine_payments
for select
to authenticated
using (
  public.is_app_staff()
  and club_id = (
    select membership.club_id
    from public.current_membership() membership
  )
);

revoke all on table public.fine_payments
from public, anon, authenticated, service_role;

grant select on table public.fine_payments
to authenticated;

grant select, insert, update, delete on table public.fine_payments
to service_role;

do $postconditions$
declare
  helper_signature text;
  helper_oid oid;
begin
  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.fines'::regclass
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) <> 16 then
    raise exception 'Bloque 4.4: fines no contiene exactamente 16 columnas';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.fine_payments'::regclass
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) <> 9 then
    raise exception 'Bloque 4.4: fine_payments no contiene exactamente 9 columnas';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid in (
      'public.fines'::regclass,
      'public.fine_payments'::regclass
    )
      and constraint_row.contype = 'f'
      and constraint_row.confdeltype = 'c'
  ) then
    raise exception 'Bloque 4.4: existe una FK destructiva ON DELETE CASCADE';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class relation
    where relation.oid = 'public.fine_payments'::regclass
      and pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
      and relation.relrowsecurity
      and not relation.relforcerowsecurity
  ) then
    raise exception 'Bloque 4.4: owner o RLS incorrectos en fine_payments';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.fine_payments', 'SELECT')
     or not pg_catalog.has_table_privilege('authenticated', 'public.fine_payments', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.fine_payments', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.fine_payments', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.fine_payments', 'DELETE')
     or not pg_catalog.has_table_privilege('service_role', 'public.fine_payments', 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', 'public.fine_payments', 'INSERT')
     or not pg_catalog.has_table_privilege('service_role', 'public.fine_payments', 'UPDATE')
     or not pg_catalog.has_table_privilege('service_role', 'public.fine_payments', 'DELETE')
     or exists (
       select 1
       from pg_catalog.pg_class relation
       cross join lateral pg_catalog.aclexplode(
         coalesce(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
       ) acl
       where relation.oid = 'public.fine_payments'::regclass
         and acl.grantee not in (
           relation.relowner,
           (select oid from pg_catalog.pg_roles where rolname = 'authenticated'),
           (select oid from pg_catalog.pg_roles where rolname = 'service_role')
         )
     ) then
    raise exception 'Bloque 4.4: ACL incorrecta en fine_payments';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_policy policy
    where policy.polrelid = 'public.fine_payments'::regclass
      and policy.polcmd = 'r'
      and policy.polroles = array[
        (select oid from pg_catalog.pg_roles where rolname = 'authenticated')
      ]
      and pg_catalog.strpos(
        pg_catalog.pg_get_expr(policy.polqual, policy.polrelid),
        'is_app_staff()'
      ) > 0
      and pg_catalog.strpos(
        pg_catalog.pg_get_expr(policy.polqual, policy.polrelid),
        'current_membership()'
      ) > 0
  ) <> 1 or (
    select pg_catalog.count(*)
    from pg_catalog.pg_policy policy
    where policy.polrelid = 'public.fine_payments'::regclass
  ) <> 1 then
    raise exception 'Bloque 4.4: policy STAFF incorrecta en fine_payments';
  end if;

  foreach helper_signature in array array[
    'public.guard_fine_financial_integrity()',
    'public.apply_fine_surcharge_if_due(uuid)',
    'public.guard_fine_payment_integrity()',
    'public.get_fine_financial_totals(uuid)'
  ]
  loop
    helper_oid := pg_catalog.to_regprocedure(helper_signature);

    if helper_oid is null or not exists (
      select 1
      from pg_catalog.pg_proc procedure_row
      join pg_catalog.pg_language language
        on language.oid = procedure_row.prolang
      where procedure_row.oid = helper_oid
        and pg_catalog.pg_get_userbyid(procedure_row.proowner) = 'postgres'
        and language.lanname in ('plpgsql', 'sql')
        and procedure_row.proconfig = array['search_path=pg_catalog']::text[]
        and procedure_row.prosecdef
        and not pg_catalog.has_function_privilege('anon', helper_oid, 'EXECUTE')
        and not pg_catalog.has_function_privilege('authenticated', helper_oid, 'EXECUTE')
    ) then
      raise exception 'Bloque 4.4: contrato base incorrecto para %', helper_signature;
    end if;
  end loop;

  if (
       select procedure_row.provolatile
       from pg_catalog.pg_proc procedure_row
       where procedure_row.oid = 'public.guard_fine_financial_integrity()'::regprocedure
     ) <> 'v'
     or (
       select procedure_row.provolatile
       from pg_catalog.pg_proc procedure_row
       where procedure_row.oid = 'public.apply_fine_surcharge_if_due(uuid)'::regprocedure
     ) <> 'v'
     or (
       select procedure_row.provolatile
       from pg_catalog.pg_proc procedure_row
       where procedure_row.oid = 'public.guard_fine_payment_integrity()'::regprocedure
     ) <> 'v'
     or (
       select procedure_row.provolatile
       from pg_catalog.pg_proc procedure_row
       where procedure_row.oid = 'public.get_fine_financial_totals(uuid)'::regprocedure
     ) <> 's' then
    raise exception 'Bloque 4.4: volatilidad incorrecta en funciones internas';
  end if;

  if pg_catalog.has_function_privilege(
       'service_role',
       'public.guard_fine_financial_integrity()'::regprocedure,
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'service_role',
       'public.guard_fine_payment_integrity()'::regprocedure,
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.apply_fine_surcharge_if_due(uuid)'::regprocedure,
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.get_fine_financial_totals(uuid)'::regprocedure,
       'EXECUTE'
     ) then
    raise exception 'Bloque 4.4: EXECUTE interno incorrecto';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc procedure_row
    cross join lateral pg_catalog.aclexplode(
      coalesce(
        procedure_row.proacl,
        pg_catalog.acldefault('f', procedure_row.proowner)
      )
    ) acl
    where procedure_row.oid in (
      'public.guard_fine_financial_integrity()'::regprocedure,
      'public.apply_fine_surcharge_if_due(uuid)'::regprocedure,
      'public.guard_fine_payment_integrity()'::regprocedure,
      'public.get_fine_financial_totals(uuid)'::regprocedure
    )
      and acl.grantee not in (
        procedure_row.proowner,
        (select oid from pg_catalog.pg_roles where rolname = 'service_role')
      )
  ) then
    raise exception 'Bloque 4.4: existe un EXECUTE explicito para un rol no previsto';
  end if;

  if (select pg_catalog.count(*) from public.fine_incidents) <> 0
     or (select pg_catalog.count(*) from public.fines) <> 0
     or (select pg_catalog.count(*) from public.fine_payments) <> 0
     or (select pg_catalog.count(*) from public.fine_rules) <> 23
     or exists (
       select 1
       from public.club_member_permissions permission
       where permission.permission_key = 'fines_manage'
     ) then
    raise exception 'Bloque 4.4: regresion en inventario financiero o permisos';
  end if;
end;
$postconditions$;

comment on column public.fines.due_on is
'Ultimo dia natural del mes de fine_incidents.occurred_on, derivado e inmutable en backend.';

comment on column public.fines.surcharge_amount is
'Recargo unico materializado: 50 por ciento de surcharge_base_amount, sin capitalizacion.';

comment on column public.fines.surcharge_base_amount is
'Snapshot de deuda original pendiente usado como base al materializar el recargo unico.';

comment on table public.fine_payments is
'Ledger financiero inmutable. payment suma cobrado y refund lo resta; paid_on es fecha economica informativa.';

comment on function public.apply_fine_surcharge_if_due(uuid) is
'Funcion interna lazy y serializada. Materializa como maximo una vez el 50 por ciento de la deuda original pendiente.';

comment on function public.get_fine_financial_totals(uuid) is
'Helper interno de solo lectura: original, recargo, generado, cobrado, pendiente y estado financiero derivado.';

commit;
