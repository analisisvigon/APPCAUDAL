-- APPCAUDAL - Bloque 4.2
-- Catalogo backend de infracciones del Regimen Interno Caudal Deportivo 26/27.
--
-- Este bloque no crea incidencias, multas, pagos, recargos, automatizaciones
-- ni frontend. Los futuros movimientos financieros deberan guardar su propio
-- snapshot de regla, motivo e importe; nunca depender del valor vivo de aqui.

begin;

do $preconditions$
begin
  if auth.uid() is not null then
    raise exception 'Bloque 4.2 debe ejecutarse sin una identidad JWT de aplicacion activa';
  end if;

  if pg_catalog.to_regclass('public.clubs') is null
     or pg_catalog.to_regclass('public.club_seasons') is null
     or pg_catalog.to_regclass('public.fine_subjects') is null
     or pg_catalog.to_regprocedure('public.can_manage_fines()') is null
     or pg_catalog.to_regprocedure('public.current_membership()') is null
     or pg_catalog.to_regprocedure('public.is_app_staff()') is null
     or pg_catalog.to_regprocedure('public.set_club_core_updated_at()') is null then
    raise exception 'Bloque 4.2: faltan objetos validados del Bloque 4.1';
  end if;

  if pg_catalog.to_regclass('public.fine_rules') is not null then
    raise exception 'Bloque 4.2: public.fine_rules ya existe; revisar antes de reemplazar';
  end if;

  if (select pg_catalog.count(*) from public.clubs) <> 1 then
    raise exception 'Bloque 4.2: el seed exige el unico club validado por el Bloque 4.1';
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
    raise exception 'Bloque 4.2: falta la temporada 2026/2027 validada';
  end if;

  if exists (
    select 1
    from public.club_member_permissions permission
    where permission.permission_key = 'fines_manage'
  ) then
    raise exception 'Bloque 4.2: existe una asignacion real fines_manage no prevista';
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    raise exception 'Bloque 4.2: faltan roles Supabase requeridos';
  end if;
end;
$preconditions$;

create table public.fine_rules (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete restrict,
  code text not null,
  name text not null,
  description text null,
  default_amount numeric(10,2) null,
  pricing_mode text not null,
  applies_to_players boolean not null,
  applies_to_staff boolean not null,
  collective_allowed boolean not null default false,
  active boolean not null default true,
  sort_order integer not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint fine_rules_code_not_empty check (
    pg_catalog.char_length(pg_catalog.btrim(code)) > 0
  ),
  constraint fine_rules_name_not_empty check (
    pg_catalog.char_length(pg_catalog.btrim(name)) > 0
  ),
  constraint fine_rules_pricing_mode_check check (
    pricing_mode in ('fixed', 'per_subject', 'unpriced')
  ),
  constraint fine_rules_amount_check check (
    (
      pricing_mode in ('fixed', 'per_subject')
      and default_amount is not null
      and default_amount > 0
      and default_amount <> 'NaN'::numeric
    )
    or (
      pricing_mode = 'unpriced'
      and default_amount is null
    )
  ),
  constraint fine_rules_applicability_check check (
    applies_to_players or applies_to_staff
  ),
  constraint fine_rules_sort_order_check check (sort_order > 0),
  constraint fine_rules_club_code_key unique (club_id, code),
  constraint fine_rules_club_sort_order_key unique (club_id, sort_order)
);

create index fine_rules_club_active_sort_idx
on public.fine_rules (club_id, active, sort_order);

create trigger set_fine_rules_updated_at
before update on public.fine_rules
for each row execute function public.set_club_core_updated_at();

alter table public.fine_rules owner to postgres;
alter table public.fine_rules enable row level security;

create policy "Fines staff can read rules"
on public.fine_rules
for select
to authenticated
using (
  public.is_app_staff()
  and club_id = (
    select membership.club_id
    from public.current_membership() membership
  )
);

revoke all on table public.fine_rules
from public, anon, authenticated, service_role;

grant select on table public.fine_rules
to authenticated;

grant select, insert, update, delete on table public.fine_rules
to service_role;

-- Seed conservador: no sobreescribe una regla ya existente. La postcondicion
-- posterior compara todo el contrato y aborta si un conflicto no es identico.
insert into public.fine_rules (
  club_id,
  code,
  name,
  description,
  default_amount,
  pricing_mode,
  applies_to_players,
  applies_to_staff,
  collective_allowed,
  active,
  sort_order
)
select
  club.id,
  seed.code,
  seed.name,
  seed.description,
  seed.default_amount,
  seed.pricing_mode,
  seed.applies_to_players,
  seed.applies_to_staff,
  seed.collective_allowed,
  seed.active,
  seed.sort_order
from public.clubs club
cross join (
  values
    ('TRAINING_LATE', 'Llegar tarde al entrenamiento', null, 2.00, 'fixed', true, true, false, true, 1),
    ('MATCH_LATE', 'Llegar tarde al partido', null, 3.00, 'fixed', true, true, false, true, 2),
    ('LOCKER_MATERIAL_FORGOTTEN', 'Dejar material olvidado en el vestuario', null, 2.00, 'fixed', true, true, false, true, 3),
    ('TRAINING_EARRINGS', 'Llevar pendientes durante el entrenamiento', null, 2.00, 'fixed', true, true, false, true, 4),
    ('PHONE_DURING_COACH_TALK', 'Manipular el móvil mientras habla el entrenador', null, 2.00, 'fixed', true, true, false, true, 5),
    ('PHONE_AFTER_TRAINING_TALK', 'Usar el teléfono tras la charla del entrenador', null, 2.00, 'fixed', true, true, false, true, 6),
    ('TRAINING_EXIT_DELAY_AFTER_TALK', 'No salir a entrenar inmediatamente tras la charla', 'El régimen establece un máximo de 2 minutos para salir a entrenar tras la charla.', null, 'unpriced', true, true, false, false, 7),
    ('PHONE_MATCH_AFTER_LINEUP', 'Usar el teléfono en partido tras publicar las alineaciones', null, 2.00, 'fixed', true, true, false, true, 8),
    ('MATCH_WRONG_UNIFORM', 'Acudir al partido sin el uniforme del equipo', null, 2.00, 'fixed', true, true, false, true, 9),
    ('LEAGUE_MATCH_NON_ATTENDANCE_INJURED', 'No acudir al partido de liga estando lesionado o sancionado', 'La obligación es acudir al menos para el grito, sin necesidad de presentarse 1 h 15 min antes.', 2.00, 'fixed', true, false, false, true, 10),
    ('LEAVE_BENCH_WITHOUT_PERMISSION', 'Ausentarse del banquillo tras ser sustituido sin permiso', null, 2.00, 'fixed', true, false, false, true, 11),
    ('MATCH_ABSENCE', 'Ausentarse del partido sin permiso', null, 20.00, 'fixed', true, true, false, true, 12),
    ('LOCKER_BAD_STATE_IDENTIFIED', 'Dejar el vestuario en mal estado', 'Caso con responsable identificado.', 2.00, 'fixed', true, true, false, true, 13),
    ('LOCKER_BAD_STATE_COLLECTIVE', 'Vestuario en mal estado sin responsable identificado', 'El régimen establece 1 euro por cada miembro de la plantilla. La selección de personas será manual.', 1.00, 'per_subject', true, false, true, true, 14),
    ('WEEKLY_MATERIAL_COLLECTIVE', 'Material semanal no recogido u olvidado', 'Aplicable a los miembros del grupo responsables que estuvieran ese día en el entrenamiento. La selección será manual.', 2.00, 'per_subject', true, false, true, true, 15),
    ('MANDATORY_GROUP_EVENT_ABSENCE', 'Ausencia a evento grupal obligatorio', null, 2.00, 'fixed', true, true, false, true, 16),
    ('YOUTH_NAME_NOT_USED', 'No llamar por su nombre a un jugador de cantera', null, 2.00, 'fixed', true, true, false, true, 17),
    ('YELLOW_PROTEST', 'Tarjeta amarilla por protestar', null, 3.00, 'fixed', true, false, false, true, 18),
    ('FIFTH_YELLOW_PROTEST', 'Quinta tarjeta amarilla por protestar', null, 5.00, 'fixed', true, false, false, true, 19),
    ('RED_PROTEST', 'Tarjeta roja por protestar', null, 20.00, 'fixed', true, false, false, true, 20),
    ('TRAINING_NOTICE_UNDER_2H', 'Avisar con menos de 2 horas de que no se entrena con el grupo', null, 2.00, 'fixed', true, false, false, true, 21),
    ('PF_SURVEY_MISSING', 'No realizar la encuesta del preparador físico', null, 2.00, 'fixed', true, false, false, true, 22),
    ('DISRESPECT_TEAMMATE_STAFF', 'Falta de respeto a compañero o miembro del cuerpo técnico', null, 50.00, 'fixed', true, true, false, true, 23)
) as seed(
  code,
  name,
  description,
  default_amount,
  pricing_mode,
  applies_to_players,
  applies_to_staff,
  collective_allowed,
  active,
  sort_order
)
on conflict (club_id, code) do nothing;

do $postconditions$
declare
  authenticated_role_id oid;
begin
  select role_row.oid into authenticated_role_id
  from pg_catalog.pg_roles role_row
  where role_row.rolname = 'authenticated';

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.fine_rules'::regclass
      and attribute.attnum > 0
      and not attribute.attisdropped
  ) <> 14 then
    raise exception 'Bloque 4.2: numero de columnas de fine_rules incorrecto';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.fine_rules'::regclass
      and constraint_row.convalidated
      and constraint_row.conname in (
        'fine_rules_pkey',
        'fine_rules_club_id_fkey',
        'fine_rules_code_not_empty',
        'fine_rules_name_not_empty',
        'fine_rules_pricing_mode_check',
        'fine_rules_amount_check',
        'fine_rules_applicability_check',
        'fine_rules_sort_order_check',
        'fine_rules_club_code_key',
        'fine_rules_club_sort_order_key'
      )
  ) <> 10 then
    raise exception 'Bloque 4.2: constraints finales de fine_rules incompletas';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.fine_rules'::regclass
      and constraint_row.contype = 'f'
      and constraint_row.confdeltype = 'c'
  ) then
    raise exception 'Bloque 4.2: existe una FK destructiva ON DELETE CASCADE';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class relation
    where relation.oid = 'public.fine_rules'::regclass
      and pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
      and relation.relrowsecurity
      and not relation.relforcerowsecurity
  ) then
    raise exception 'Bloque 4.2: owner o RLS final de fine_rules incorrectos';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_policy policy
    where policy.polrelid = 'public.fine_rules'::regclass
      and policy.polname = 'Fines staff can read rules'
      and policy.polcmd = 'r'
      and policy.polpermissive
      and policy.polroles = array[authenticated_role_id]
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
    where policy.polrelid = 'public.fine_rules'::regclass
  ) <> 1 then
    raise exception 'Bloque 4.2: policy STAFF de fine_rules incorrecta';
  end if;

  if exists (
       select 1
       from pg_catalog.pg_class relation
       cross join lateral pg_catalog.aclexplode(
         coalesce(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
       ) acl
       where relation.oid = 'public.fine_rules'::regclass
         and (
           acl.grantee = 0
           or acl.grantee not in (
             relation.relowner,
             (select oid from pg_catalog.pg_roles where rolname = 'authenticated'),
             (select oid from pg_catalog.pg_roles where rolname = 'service_role')
           )
         )
     )
     or pg_catalog.has_table_privilege('anon', 'public.fine_rules', 'SELECT')
     or not pg_catalog.has_table_privilege('authenticated', 'public.fine_rules', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.fine_rules', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.fine_rules', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.fine_rules', 'DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.fine_rules', 'TRUNCATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.fine_rules', 'REFERENCES')
     or pg_catalog.has_table_privilege('authenticated', 'public.fine_rules', 'TRIGGER')
     or not pg_catalog.has_table_privilege('service_role', 'public.fine_rules', 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', 'public.fine_rules', 'INSERT')
     or not pg_catalog.has_table_privilege('service_role', 'public.fine_rules', 'UPDATE')
     or not pg_catalog.has_table_privilege('service_role', 'public.fine_rules', 'DELETE')
     or pg_catalog.has_table_privilege('service_role', 'public.fine_rules', 'TRUNCATE')
     or pg_catalog.has_table_privilege('service_role', 'public.fine_rules', 'REFERENCES')
     or pg_catalog.has_table_privilege('service_role', 'public.fine_rules', 'TRIGGER') then
    raise exception 'Bloque 4.2: ACL final de fine_rules incorrecta';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.fine_rules'::regclass
      and trigger_row.tgname = 'set_fine_rules_updated_at'
      and trigger_row.tgfoid = 'public.set_club_core_updated_at()'::regprocedure
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled = 'O'
  ) or not exists (
    select 1
    from pg_catalog.pg_index index_row
    join pg_catalog.pg_class index_class on index_class.oid = index_row.indexrelid
    where index_row.indrelid = 'public.fine_rules'::regclass
      and index_class.relname = 'fine_rules_club_active_sort_idx'
      and index_row.indisvalid
  ) then
    raise exception 'Bloque 4.2: trigger updated_at o indice de consulta incorrecto';
  end if;

  if (select pg_catalog.count(*) from public.fine_rules) <> 23 then
    raise exception 'Bloque 4.2: el catalogo debe contener exactamente 23 reglas';
  end if;

  if exists (
    with expected(
      club_id,
      code,
      name,
      description,
      default_amount,
      pricing_mode,
      applies_to_players,
      applies_to_staff,
      collective_allowed,
      active,
      sort_order
    ) as (
      select club.id, seed.*
      from public.clubs club
      cross join (
        values
          ('TRAINING_LATE'::text, 'Llegar tarde al entrenamiento'::text, null::text, 2.00::numeric, 'fixed'::text, true, true, false, true, 1),
          ('MATCH_LATE', 'Llegar tarde al partido', null, 3.00, 'fixed', true, true, false, true, 2),
          ('LOCKER_MATERIAL_FORGOTTEN', 'Dejar material olvidado en el vestuario', null, 2.00, 'fixed', true, true, false, true, 3),
          ('TRAINING_EARRINGS', 'Llevar pendientes durante el entrenamiento', null, 2.00, 'fixed', true, true, false, true, 4),
          ('PHONE_DURING_COACH_TALK', 'Manipular el móvil mientras habla el entrenador', null, 2.00, 'fixed', true, true, false, true, 5),
          ('PHONE_AFTER_TRAINING_TALK', 'Usar el teléfono tras la charla del entrenador', null, 2.00, 'fixed', true, true, false, true, 6),
          ('TRAINING_EXIT_DELAY_AFTER_TALK', 'No salir a entrenar inmediatamente tras la charla', 'El régimen establece un máximo de 2 minutos para salir a entrenar tras la charla.', null, 'unpriced', true, true, false, false, 7),
          ('PHONE_MATCH_AFTER_LINEUP', 'Usar el teléfono en partido tras publicar las alineaciones', null, 2.00, 'fixed', true, true, false, true, 8),
          ('MATCH_WRONG_UNIFORM', 'Acudir al partido sin el uniforme del equipo', null, 2.00, 'fixed', true, true, false, true, 9),
          ('LEAGUE_MATCH_NON_ATTENDANCE_INJURED', 'No acudir al partido de liga estando lesionado o sancionado', 'La obligación es acudir al menos para el grito, sin necesidad de presentarse 1 h 15 min antes.', 2.00, 'fixed', true, false, false, true, 10),
          ('LEAVE_BENCH_WITHOUT_PERMISSION', 'Ausentarse del banquillo tras ser sustituido sin permiso', null, 2.00, 'fixed', true, false, false, true, 11),
          ('MATCH_ABSENCE', 'Ausentarse del partido sin permiso', null, 20.00, 'fixed', true, true, false, true, 12),
          ('LOCKER_BAD_STATE_IDENTIFIED', 'Dejar el vestuario en mal estado', 'Caso con responsable identificado.', 2.00, 'fixed', true, true, false, true, 13),
          ('LOCKER_BAD_STATE_COLLECTIVE', 'Vestuario en mal estado sin responsable identificado', 'El régimen establece 1 euro por cada miembro de la plantilla. La selección de personas será manual.', 1.00, 'per_subject', true, false, true, true, 14),
          ('WEEKLY_MATERIAL_COLLECTIVE', 'Material semanal no recogido u olvidado', 'Aplicable a los miembros del grupo responsables que estuvieran ese día en el entrenamiento. La selección será manual.', 2.00, 'per_subject', true, false, true, true, 15),
          ('MANDATORY_GROUP_EVENT_ABSENCE', 'Ausencia a evento grupal obligatorio', null, 2.00, 'fixed', true, true, false, true, 16),
          ('YOUTH_NAME_NOT_USED', 'No llamar por su nombre a un jugador de cantera', null, 2.00, 'fixed', true, true, false, true, 17),
          ('YELLOW_PROTEST', 'Tarjeta amarilla por protestar', null, 3.00, 'fixed', true, false, false, true, 18),
          ('FIFTH_YELLOW_PROTEST', 'Quinta tarjeta amarilla por protestar', null, 5.00, 'fixed', true, false, false, true, 19),
          ('RED_PROTEST', 'Tarjeta roja por protestar', null, 20.00, 'fixed', true, false, false, true, 20),
          ('TRAINING_NOTICE_UNDER_2H', 'Avisar con menos de 2 horas de que no se entrena con el grupo', null, 2.00, 'fixed', true, false, false, true, 21),
          ('PF_SURVEY_MISSING', 'No realizar la encuesta del preparador físico', null, 2.00, 'fixed', true, false, false, true, 22),
          ('DISRESPECT_TEAMMATE_STAFF', 'Falta de respeto a compañero o miembro del cuerpo técnico', null, 50.00, 'fixed', true, true, false, true, 23)
      ) as seed(
        code,
        name,
        description,
        default_amount,
        pricing_mode,
        applies_to_players,
        applies_to_staff,
        collective_allowed,
        active,
        sort_order
      )
    ), actual as (
      select
        rule.club_id,
        rule.code,
        rule.name,
        rule.description,
        rule.default_amount,
        rule.pricing_mode,
        rule.applies_to_players,
        rule.applies_to_staff,
        rule.collective_allowed,
        rule.active,
        rule.sort_order
      from public.fine_rules rule
    ), missing as (
      select * from expected
      except
      select * from actual
    ), unexpected as (
      select * from actual
      except
      select * from expected
    )
    select 1 from missing
    union all
    select 1 from unexpected
  ) then
    raise exception 'Bloque 4.2: el catalogo existente difiere del contrato 26/27';
  end if;

  if exists (
    select 1
    from public.club_member_permissions permission
    where permission.permission_key = 'fines_manage'
  ) then
    raise exception 'Bloque 4.2: se asigno fines_manage a una identidad real';
  end if;
end;
$postconditions$;

-- YELLOW_PROTEST y FIFTH_YELLOW_PROTEST son entradas independientes del
-- catalogo. Este bloque no decide si sus importes sustituyen o se acumulan.
-- RED_PROTEST tampoco se acumula automaticamente con ninguna amarilla.
-- PF_SURVEY_MISSING no se conecta ni automatiza con Wellness/RPE.

comment on table public.fine_rules is
'Catalogo versionable de infracciones por club. No es una multa ni conserva movimientos financieros.';

comment on column public.fine_rules.code is
'Identificador tecnico estable. Los movimientos futuros conservaran un snapshot y no dependeran del valor vivo.';

comment on column public.fine_rules.default_amount is
'Importe por defecto del catalogo. fixed/per_subject requieren valor positivo; unpriced exige NULL.';

comment on column public.fine_rules.collective_allowed is
'Permite seleccionar varias personas en una incidencia futura; cada persona tendra su propia multa.';

commit;
