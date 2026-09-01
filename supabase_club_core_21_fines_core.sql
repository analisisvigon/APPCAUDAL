-- APPCAUDAL - Bloque 4.3
-- Nucleo financiero de Multas: incidencias y multas individuales.
--
-- Este bloque no crea pagos, recargos, deuda calculada, caja, RPC publicas,
-- automatizaciones ni frontend. Las tablas quedan vacias tras la migracion.

begin;

do $preconditions$
begin
  if auth.uid() is not null then
    raise exception 'Bloque 4.3 debe ejecutarse sin una identidad JWT de aplicacion activa';
  end if;

  if pg_catalog.to_regclass('public.clubs') is null
     or pg_catalog.to_regclass('public.club_memberships') is null
     or pg_catalog.to_regclass('public.club_seasons') is null
     or pg_catalog.to_regclass('public.fine_subjects') is null
     or pg_catalog.to_regclass('public.fine_rules') is null
     or pg_catalog.to_regprocedure('public.can_manage_fines()') is null
     or pg_catalog.to_regprocedure('public.current_membership()') is null
     or pg_catalog.to_regprocedure('public.is_app_staff()') is null then
    raise exception 'Bloque 4.3: faltan objetos validados de los Bloques 4.1/4.2';
  end if;

  if pg_catalog.to_regclass('public.fine_incidents') is not null
     or pg_catalog.to_regclass('public.fines') is not null
     or pg_catalog.to_regprocedure('public.guard_fine_incident_integrity()') is not null
     or pg_catalog.to_regprocedure('public.guard_fine_integrity()') is not null then
    raise exception 'Bloque 4.3: ya existe algun objeto del bloque; revisar antes de reemplazar';
  end if;

  if (select pg_catalog.count(*) from public.fine_rules) <> 23 then
    raise exception 'Bloque 4.3: el catalogo 4.2 no contiene exactamente 23 reglas';
  end if;

  if not exists (
    select 1
    from public.club_seasons season
    where season.code = '2026'
      and season.label = '2026/2027'
      and season.starts_on = date '2026-07-01'
      and season.ends_on = date '2027-06-30'
      and season.is_active
  ) then
    raise exception 'Bloque 4.3: falta la temporada 2026/2027 validada';
  end if;

  if exists (
    select 1
    from public.club_member_permissions permission
    where permission.permission_key = 'fines_manage'
  ) then
    raise exception 'Bloque 4.3: existe una asignacion real fines_manage no prevista';
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    raise exception 'Bloque 4.3: faltan roles Supabase requeridos';
  end if;
end;
$preconditions$;

create table public.fine_incidents (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  season_id uuid not null references public.club_seasons(id) on delete restrict,
  fine_rule_id uuid not null references public.fine_rules(id) on delete restrict,
  incident_kind text not null,
  occurred_on date not null,
  rule_code_snapshot text not null,
  reason_snapshot text not null,
  description_snapshot text null,
  note text null,
  created_by_membership_id uuid not null
    references public.club_memberships(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  constraint fine_incidents_kind_check check (
    incident_kind in ('individual', 'collective')
  ),
  constraint fine_incidents_rule_code_snapshot_not_empty check (
    pg_catalog.char_length(pg_catalog.btrim(rule_code_snapshot)) > 0
  ),
  constraint fine_incidents_reason_snapshot_not_empty check (
    pg_catalog.char_length(pg_catalog.btrim(reason_snapshot)) > 0
  )
);

create index fine_incidents_club_occurred_idx
on public.fine_incidents (club_id, occurred_on desc, created_at desc);

create index fine_incidents_rule_idx
on public.fine_incidents (fine_rule_id);

create table public.fines (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  incident_id uuid not null references public.fine_incidents(id) on delete restrict,
  subject_id uuid not null references public.fine_subjects(id) on delete restrict,
  subject_name_snapshot text not null,
  original_amount numeric(10,2) not null,
  currency text not null default 'EUR',
  lifecycle_status text not null default 'active',
  cancelled_at timestamptz null,
  cancelled_by_membership_id uuid null
    references public.club_memberships(id) on delete restrict,
  cancellation_reason text null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint fines_subject_name_snapshot_not_empty check (
    pg_catalog.char_length(pg_catalog.btrim(subject_name_snapshot)) > 0
  ),
  constraint fines_original_amount_positive check (
    original_amount > 0
    and original_amount <> 'NaN'::numeric
  ),
  constraint fines_currency_eur_check check (currency = 'EUR'),
  constraint fines_lifecycle_status_check check (
    lifecycle_status in ('active', 'cancelled')
  ),
  constraint fines_cancellation_consistency_check check (
    (
      lifecycle_status = 'active'
      and cancelled_at is null
      and cancelled_by_membership_id is null
      and cancellation_reason is null
    )
    or (
      lifecycle_status = 'cancelled'
      and cancelled_at is not null
      and cancelled_by_membership_id is not null
      and cancellation_reason is not null
      and pg_catalog.char_length(pg_catalog.btrim(cancellation_reason)) > 0
    )
  ),
  constraint fines_incident_subject_key unique (incident_id, subject_id)
);

create index fines_club_created_idx
on public.fines (club_id, created_at desc);

create index fines_subject_created_idx
on public.fines (subject_id, created_at desc);

create function public.guard_fine_incident_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  season_club_id uuid;
  season_starts_on date;
  season_ends_on date;
  rule_club_id uuid;
  rule_code text;
  rule_name text;
  rule_description text;
  rule_pricing_mode text;
  rule_default_amount numeric(10,2);
  rule_collective_allowed boolean;
  rule_active boolean;
  actor_club_id uuid;
begin
  if tg_op = 'UPDATE' then
    if new.club_id is distinct from old.club_id
       or new.season_id is distinct from old.season_id
       or new.fine_rule_id is distinct from old.fine_rule_id
       or new.incident_kind is distinct from old.incident_kind
       or new.occurred_on is distinct from old.occurred_on
       or new.rule_code_snapshot is distinct from old.rule_code_snapshot
       or new.reason_snapshot is distinct from old.reason_snapshot
       or new.description_snapshot is distinct from old.description_snapshot
       or new.created_by_membership_id is distinct from old.created_by_membership_id
       or new.created_at is distinct from old.created_at then
      raise exception 'La identidad y los snapshots de una incidencia son inmutables'
        using errcode = '23514';
    end if;

    return new;
  end if;

  select season.club_id, season.starts_on, season.ends_on
  into season_club_id, season_starts_on, season_ends_on
  from public.club_seasons season
  where season.id = new.season_id;

  if not found then
    raise exception 'La temporada de la incidencia no existe'
      using errcode = '23503';
  end if;

  if season_club_id is distinct from new.club_id then
    raise exception 'La temporada no pertenece al club de la incidencia'
      using errcode = '23514';
  end if;

  if new.occurred_on < season_starts_on or new.occurred_on > season_ends_on then
    raise exception 'La fecha de la infraccion queda fuera de la temporada'
      using errcode = '23514';
  end if;

  select
    rule.club_id,
    rule.code,
    rule.name,
    rule.description,
    rule.pricing_mode,
    rule.default_amount,
    rule.collective_allowed,
    rule.active
  into
    rule_club_id,
    rule_code,
    rule_name,
    rule_description,
    rule_pricing_mode,
    rule_default_amount,
    rule_collective_allowed,
    rule_active
  from public.fine_rules rule
  where rule.id = new.fine_rule_id;

  if not found then
    raise exception 'La regla de la incidencia no existe'
      using errcode = '23503';
  end if;

  if rule_club_id is distinct from new.club_id then
    raise exception 'La regla no pertenece al club de la incidencia'
      using errcode = '23514';
  end if;

  if new.incident_kind = 'collective' and not rule_collective_allowed then
    raise exception 'La regla seleccionada no admite incidencias colectivas'
      using errcode = '23514';
  end if;

  if not rule_active
     or rule_pricing_mode not in ('fixed', 'per_subject')
     or rule_default_amount is null
     or rule_default_amount <= 0
     or rule_default_amount = 'NaN'::numeric then
    raise exception 'La regla seleccionada no puede generar multas'
      using errcode = '23514';
  end if;

  select membership.club_id
  into actor_club_id
  from public.club_memberships membership
  where membership.id = new.created_by_membership_id;

  if not found then
    raise exception 'La membership creadora no existe'
      using errcode = '23503';
  end if;

  if actor_club_id is distinct from new.club_id then
    raise exception 'La membership creadora no pertenece al club de la incidencia'
      using errcode = '23514';
  end if;

  new.rule_code_snapshot := rule_code;
  new.reason_snapshot := rule_name;
  new.description_snapshot := rule_description;

  return new;
end;
$function$;

create function public.guard_fine_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  incident_club_id uuid;
  incident_rule_id uuid;
  incident_rule_code text;
  incident_reason text;
  incident_description text;
  subject_club_id uuid;
  subject_display_name text;
  rule_club_id uuid;
  rule_code text;
  rule_name text;
  rule_description text;
  rule_pricing_mode text;
  rule_default_amount numeric(10,2);
  rule_active boolean;
  canceller_club_id uuid;
begin
  if tg_op = 'UPDATE' then
    if new.club_id is distinct from old.club_id
       or new.incident_id is distinct from old.incident_id
       or new.subject_id is distinct from old.subject_id
       or new.subject_name_snapshot is distinct from old.subject_name_snapshot
       or new.original_amount is distinct from old.original_amount
       or new.currency is distinct from old.currency
       or new.created_at is distinct from old.created_at then
      raise exception 'La identidad, el importe y los snapshots de una multa son inmutables'
        using errcode = '23514';
    end if;
  else
    select
      incident.club_id,
      incident.fine_rule_id,
      incident.rule_code_snapshot,
      incident.reason_snapshot,
      incident.description_snapshot
    into
      incident_club_id,
      incident_rule_id,
      incident_rule_code,
      incident_reason,
      incident_description
    from public.fine_incidents incident
    where incident.id = new.incident_id;

    if not found then
      raise exception 'La incidencia de la multa no existe'
        using errcode = '23503';
    end if;

    if incident_club_id is distinct from new.club_id then
      raise exception 'La incidencia no pertenece al club de la multa'
        using errcode = '23514';
    end if;

    select subject.club_id, subject.display_name
    into subject_club_id, subject_display_name
    from public.fine_subjects subject
    where subject.id = new.subject_id;

    if not found then
      raise exception 'El sujeto de la multa no existe'
        using errcode = '23503';
    end if;

    if subject_club_id is distinct from new.club_id then
      raise exception 'El sujeto no pertenece al club de la multa'
        using errcode = '23514';
    end if;

    if subject_display_name is null
       or pg_catalog.char_length(pg_catalog.btrim(subject_display_name)) = 0 then
      raise exception 'El sujeto carece de nombre canonico para el snapshot'
        using errcode = '23514';
    end if;

    select
      rule.club_id,
      rule.code,
      rule.name,
      rule.description,
      rule.pricing_mode,
      rule.default_amount,
      rule.active
    into
      rule_club_id,
      rule_code,
      rule_name,
      rule_description,
      rule_pricing_mode,
      rule_default_amount,
      rule_active
    from public.fine_rules rule
    where rule.id = incident_rule_id;

    if not found
       or rule_club_id is distinct from new.club_id
       or rule_code is distinct from incident_rule_code
       or rule_name is distinct from incident_reason
       or rule_description is distinct from incident_description then
      raise exception 'La regla viva ya no coincide con el snapshot de la incidencia'
        using errcode = '23514';
    end if;

    if not rule_active
       or rule_pricing_mode not in ('fixed', 'per_subject')
       or rule_default_amount is null
       or rule_default_amount <= 0
       or rule_default_amount = 'NaN'::numeric then
      raise exception 'La regla de la incidencia no puede generar multas'
        using errcode = '23514';
    end if;

    new.subject_name_snapshot := subject_display_name;
    new.original_amount := rule_default_amount;
    new.currency := 'EUR';
  end if;

  if new.cancelled_by_membership_id is not null then
    select membership.club_id
    into canceller_club_id
    from public.club_memberships membership
    where membership.id = new.cancelled_by_membership_id;

    if not found then
      raise exception 'La membership canceladora no existe'
        using errcode = '23503';
    end if;

    if canceller_club_id is distinct from new.club_id then
      raise exception 'La membership canceladora no pertenece al club de la multa'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$;

create trigger guard_fine_incident_integrity
before insert or update on public.fine_incidents
for each row execute function public.guard_fine_incident_integrity();

create trigger guard_fine_integrity
before insert or update on public.fines
for each row execute function public.guard_fine_integrity();

alter function public.guard_fine_incident_integrity() owner to postgres;
alter function public.guard_fine_integrity() owner to postgres;
alter table public.fine_incidents owner to postgres;
alter table public.fines owner to postgres;

revoke all on function public.guard_fine_incident_integrity()
from public, anon, authenticated, service_role;
revoke all on function public.guard_fine_integrity()
from public, anon, authenticated, service_role;

alter table public.fine_incidents enable row level security;
alter table public.fines enable row level security;

create policy "Fines staff can read incidents"
on public.fine_incidents
for select
to authenticated
using (
  public.is_app_staff()
  and club_id = (
    select membership.club_id
    from public.current_membership() membership
  )
);

create policy "Fines staff can read individual fines"
on public.fines
for select
to authenticated
using (
  public.is_app_staff()
  and club_id = (
    select membership.club_id
    from public.current_membership() membership
  )
);

revoke all on table public.fine_incidents, public.fines
from public, anon, authenticated, service_role;

grant select on table public.fine_incidents, public.fines
to authenticated;

grant select, insert, update, delete
on table public.fine_incidents, public.fines
to service_role;

do $postconditions$
declare
  relation_name text;
  guard_name text;
  relation_oid oid;
begin
  foreach relation_name in array array['fine_incidents', 'fines']
  loop
    relation_oid := pg_catalog.to_regclass('public.' || relation_name);

    if not exists (
      select 1
      from pg_catalog.pg_class relation
      where relation.oid = relation_oid
        and pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
        and relation.relrowsecurity
        and not relation.relforcerowsecurity
    ) then
      raise exception 'Bloque 4.3: owner o RLS incorrectos en %', relation_name;
    end if;

    if exists (
         select 1
         from pg_catalog.pg_class relation
         cross join lateral pg_catalog.aclexplode(
           coalesce(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
         ) acl
         where relation.oid = relation_oid
           and (
             acl.grantee = 0
             or acl.grantee not in (
               relation.relowner,
               (select oid from pg_catalog.pg_roles where rolname = 'authenticated'),
               (select oid from pg_catalog.pg_roles where rolname = 'service_role')
             )
           )
       )
       or pg_catalog.has_table_privilege('anon', relation_oid, 'SELECT')
       or not pg_catalog.has_table_privilege('authenticated', relation_oid, 'SELECT')
       or pg_catalog.has_table_privilege('authenticated', relation_oid, 'INSERT')
       or pg_catalog.has_table_privilege('authenticated', relation_oid, 'UPDATE')
       or pg_catalog.has_table_privilege('authenticated', relation_oid, 'DELETE')
       or not pg_catalog.has_table_privilege('service_role', relation_oid, 'SELECT')
       or not pg_catalog.has_table_privilege('service_role', relation_oid, 'INSERT')
       or not pg_catalog.has_table_privilege('service_role', relation_oid, 'UPDATE')
       or not pg_catalog.has_table_privilege('service_role', relation_oid, 'DELETE') then
      raise exception 'Bloque 4.3: ACL incorrecta en %', relation_name;
    end if;

    if (
      select pg_catalog.count(*)
      from pg_catalog.pg_policy policy
    where policy.polrelid = relation_oid
      and policy.polcmd = 'r'
      and policy.polpermissive
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
        and policy.polwithcheck is null
    ) <> 1 or (
      select pg_catalog.count(*)
      from pg_catalog.pg_policy policy
      where policy.polrelid = relation_oid
    ) <> 1 then
      raise exception 'Bloque 4.3: policy STAFF incorrecta en %', relation_name;
    end if;
  end loop;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.fine_incidents'::regclass
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) <> 12 or (
    select pg_catalog.count(*)
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.fines'::regclass
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) <> 12 then
    raise exception 'Bloque 4.3: columnas finales incorrectas';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid in (
      'public.fine_incidents'::regclass,
      'public.fines'::regclass
    )
      and constraint_row.contype = 'f'
      and constraint_row.confdeltype = 'c'
  ) then
    raise exception 'Bloque 4.3: existe una FK destructiva ON DELETE CASCADE';
  end if;

  foreach guard_name in array array[
    'public.guard_fine_incident_integrity()',
    'public.guard_fine_integrity()'
  ]
  loop
    if not exists (
      select 1
      from pg_catalog.pg_proc procedure_row
      join pg_catalog.pg_language language on language.oid = procedure_row.prolang
      where procedure_row.oid = guard_name::regprocedure
        and pg_catalog.pg_get_userbyid(procedure_row.proowner) = 'postgres'
        and language.lanname = 'plpgsql'
        and procedure_row.prosecdef
        and procedure_row.provolatile = 'v'
        and procedure_row.proconfig = array['search_path=pg_catalog']::text[]
        and not pg_catalog.has_function_privilege('anon', procedure_row.oid, 'EXECUTE')
        and not pg_catalog.has_function_privilege('authenticated', procedure_row.oid, 'EXECUTE')
        and not pg_catalog.has_function_privilege('service_role', procedure_row.oid, 'EXECUTE')
    ) then
      raise exception 'Bloque 4.3: contrato incorrecto para %', guard_name;
    end if;
  end loop;

  if (select pg_catalog.count(*) from public.fine_incidents) <> 0
     or (select pg_catalog.count(*) from public.fines) <> 0 then
    raise exception 'Bloque 4.3: las tablas financieras deben quedar vacias';
  end if;

  if (select pg_catalog.count(*) from public.fine_rules) <> 23
     or exists (
       select 1
       from public.club_member_permissions permission
       where permission.permission_key = 'fines_manage'
     ) then
    raise exception 'Bloque 4.3: regresion en catalogo o permisos heredados';
  end if;
end;
$postconditions$;

comment on table public.fine_incidents is
'Hecho sancionador y snapshot inmutable de la regla. Incluso una multa individual requiere incidencia.';

comment on table public.fines is
'Deuda individual original derivada de una incidencia. Pagos, recargos y saldo pertenecen a bloques posteriores.';

comment on column public.fine_incidents.occurred_on is
'Dia real de la infraccion, no dia de registro.';

comment on column public.fines.original_amount is
'Snapshot positivo derivado en backend de fine_rules.default_amount al crear la multa.';

comment on constraint fines_incident_subject_key on public.fines is
'Una persona solo puede recibir una multa dentro de la misma incidencia.';

-- La futura RPC atomica debera crear exactamente una fine para cada incidente
-- individual y una fine por cada sujeto seleccionado en un incidente colectivo.

commit;
