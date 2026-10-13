-- APPCAUDAL - Bloque 5.1
-- Ciclo de vida de temporadas: separa la temporada activa de su estado
-- operativo abierto/cerrado.
--
-- Migracion aditiva e idempotente. No modifica policies, grants ni datos
-- deportivos. En una instalacion normal, las temporadas existentes reciben
-- status = 'open' al anadir la columna y conservan intacto is_active.

begin;

do $preconditions$
declare
  seasons_is_active_fingerprint text;
  seasons_security_fingerprint text;
begin
  if auth.uid() is not null then
    raise exception 'Bloque 5.1 debe ejecutarse sin una identidad JWT de aplicacion activa';
  end if;

  if pg_catalog.to_regclass('public.club_seasons') is null
     or pg_catalog.to_regclass('public.clubs') is null
     or pg_catalog.to_regclass('public.club_memberships') is null then
    raise exception 'Bloque 5.1: faltan tablas Club Core requeridas';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.club_seasons'::regclass
      and attribute.attnum > 0
      and not attribute.attisdropped
      and (
        (attribute.attname = 'id' and attribute.atttypid = 'uuid'::regtype and attribute.attnotnull)
        or (attribute.attname = 'club_id' and attribute.atttypid = 'uuid'::regtype and attribute.attnotnull)
        or (attribute.attname = 'code' and attribute.atttypid = 'text'::regtype and attribute.attnotnull)
        or (attribute.attname = 'label' and attribute.atttypid = 'text'::regtype and attribute.attnotnull)
        or (attribute.attname = 'starts_on' and attribute.atttypid = 'date'::regtype and attribute.attnotnull)
        or (attribute.attname = 'ends_on' and attribute.atttypid = 'date'::regtype and attribute.attnotnull)
        or (attribute.attname = 'is_active' and attribute.atttypid = 'boolean'::regtype and attribute.attnotnull)
        or (attribute.attname = 'created_at' and attribute.atttypid = 'timestamptz'::regtype and attribute.attnotnull)
        or (attribute.attname = 'updated_at' and attribute.atttypid = 'timestamptz'::regtype and attribute.attnotnull)
      )
  ) <> 9 then
    raise exception 'Bloque 5.1: contrato heredado de public.club_seasons incompatible';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.club_seasons'::regclass
      and constraint_row.contype = 'p'
      and constraint_row.conkey = array[
        (
          select attribute.attnum
          from pg_catalog.pg_attribute attribute
          where attribute.attrelid = 'public.club_seasons'::regclass
            and attribute.attname = 'id'
            and not attribute.attisdropped
        )
      ]::smallint[]
  ) then
    raise exception 'Bloque 5.1: club_seasons.id debe conservar su primary key';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.club_memberships'::regclass
      and constraint_row.contype = 'p'
  ) then
    raise exception 'Bloque 5.1: club_memberships debe conservar su primary key';
  end if;

  select pg_catalog.md5(
    coalesce(
      pg_catalog.string_agg(
        season.id::text || ':' || season.is_active::text,
        ',' order by season.id
      ),
      ''
    )
  )
  into seasons_is_active_fingerprint
  from public.club_seasons season;

  select pg_catalog.md5(
    relation.relrowsecurity::text
    || ':' || relation.relforcerowsecurity::text
    || ':' || coalesce(relation.relacl::text, '')
    || ':' || coalesce((
      select pg_catalog.string_agg(
        policy.polname
        || ':' || policy.polcmd
        || ':' || coalesce(policy.polroles::text, '')
        || ':' || coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')
        || ':' || coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), ''),
        '|' order by policy.polname
      )
      from pg_catalog.pg_policy policy
      where policy.polrelid = relation.oid
    ), '')
  )
  into seasons_security_fingerprint
  from pg_catalog.pg_class relation
  where relation.oid = 'public.club_seasons'::regclass;

  perform pg_catalog.set_config(
    'appcaudal.block_5_1_is_active_before',
    seasons_is_active_fingerprint,
    true
  );
  perform pg_catalog.set_config(
    'appcaudal.block_5_1_security_before',
    seasons_security_fingerprint,
    true
  );
end;
$preconditions$;

alter table public.club_seasons
  add column if not exists status text not null default 'open',
  add column if not exists closed_at timestamptz null,
  add column if not exists closed_by_membership_id uuid null;

-- Una ejecucion interrumpida anterior podria haber dejado status nullable.
-- Solo se completa ese estado parcial; las filas ya inicializadas no cambian.
update public.club_seasons
set status = 'open'
where status is null;

alter table public.club_seasons
  alter column status set default 'open',
  alter column status set not null;

do $column_contract$
begin
  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = 'public.club_seasons'::regclass
      and attribute.attnum > 0
      and not attribute.attisdropped
      and (
        (
          attribute.attname = 'status'
          and attribute.atttypid = 'text'::regtype
          and attribute.attnotnull
        )
        or (
          attribute.attname = 'closed_at'
          and attribute.atttypid = 'timestamptz'::regtype
          and not attribute.attnotnull
        )
        or (
          attribute.attname = 'closed_by_membership_id'
          and attribute.atttypid = 'uuid'::regtype
          and not attribute.attnotnull
        )
      )
  ) <> 3 then
    raise exception 'Bloque 5.1: columnas de ciclo de vida incompatibles';
  end if;
end;
$column_contract$;

do $constraints$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.club_seasons'::regclass
      and constraint_row.conname = 'club_seasons_status_check'
  ) then
    alter table public.club_seasons
      add constraint club_seasons_status_check
      check (status in ('open', 'closed'));
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.club_seasons'::regclass
      and constraint_row.conname = 'club_seasons_lifecycle_consistency_check'
  ) then
    alter table public.club_seasons
      add constraint club_seasons_lifecycle_consistency_check
      check (
        (
          status = 'open'
          and closed_at is null
          and closed_by_membership_id is null
        )
        or
        (
          status = 'closed'
          and closed_at is not null
          and closed_by_membership_id is not null
        )
      );
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.club_memberships'::regclass
      and constraint_row.conname = 'club_memberships_id_club_key'
  ) then
    alter table public.club_memberships
      add constraint club_memberships_id_club_key unique (id, club_id);
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.club_seasons'::regclass
      and constraint_row.conname = 'club_seasons_closed_by_membership_club_fkey'
  ) then
    alter table public.club_seasons
      add constraint club_seasons_closed_by_membership_club_fkey
      foreign key (closed_by_membership_id, club_id)
      references public.club_memberships (id, club_id)
      on delete restrict;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.club_seasons'::regclass
      and constraint_row.conname = 'club_seasons_id_club_key'
  ) then
    alter table public.club_seasons
      add constraint club_seasons_id_club_key unique (id, club_id);
  end if;
end;
$constraints$;

comment on column public.club_seasons.status is
'Estado operativo independiente de is_active: open admite futuras mutaciones deportivas y closed representa solo lectura.';

comment on column public.club_seasons.closed_at is
'Instante de cierre; obligatorio exclusivamente cuando status = closed.';

comment on column public.club_seasons.closed_by_membership_id is
'Membership STAFF responsable del cierre, obligatoriamente perteneciente al mismo club.';

do $postconditions$
declare
  seasons_is_active_fingerprint text;
  seasons_security_fingerprint text;
  constraint_name text;
  season_id_attnum smallint;
  season_club_id_attnum smallint;
  season_status_attnum smallint;
  season_closed_at_attnum smallint;
  season_closed_by_attnum smallint;
  membership_id_attnum smallint;
  membership_club_id_attnum smallint;
begin
  if exists (
    select 1
    from public.club_seasons season
    where season.status not in ('open', 'closed')
       or (
         season.status = 'open'
         and (season.closed_at is not null or season.closed_by_membership_id is not null)
       )
       or (
         season.status = 'closed'
         and (season.closed_at is null or season.closed_by_membership_id is null)
       )
  ) then
    raise exception 'Bloque 5.1: existe una temporada con ciclo de vida incoherente';
  end if;

  foreach constraint_name in array array[
    'club_seasons_status_check',
    'club_seasons_lifecycle_consistency_check',
    'club_seasons_closed_by_membership_club_fkey',
    'club_seasons_id_club_key'
  ]
  loop
    if not exists (
      select 1
      from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid = 'public.club_seasons'::regclass
        and constraint_row.conname = constraint_name
        and constraint_row.convalidated
    ) then
      raise exception 'Bloque 5.1: falta constraint validada %', constraint_name;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.club_memberships'::regclass
      and constraint_row.conname = 'club_memberships_id_club_key'
      and constraint_row.convalidated
  ) then
    raise exception 'Bloque 5.1: falta club_memberships_id_club_key validada';
  end if;

  select attribute.attnum into season_id_attnum
  from pg_catalog.pg_attribute attribute
  where attribute.attrelid = 'public.club_seasons'::regclass
    and attribute.attname = 'id'
    and not attribute.attisdropped;

  select attribute.attnum into season_club_id_attnum
  from pg_catalog.pg_attribute attribute
  where attribute.attrelid = 'public.club_seasons'::regclass
    and attribute.attname = 'club_id'
    and not attribute.attisdropped;

  select attribute.attnum into season_status_attnum
  from pg_catalog.pg_attribute attribute
  where attribute.attrelid = 'public.club_seasons'::regclass
    and attribute.attname = 'status'
    and not attribute.attisdropped;

  select attribute.attnum into season_closed_at_attnum
  from pg_catalog.pg_attribute attribute
  where attribute.attrelid = 'public.club_seasons'::regclass
    and attribute.attname = 'closed_at'
    and not attribute.attisdropped;

  select attribute.attnum into season_closed_by_attnum
  from pg_catalog.pg_attribute attribute
  where attribute.attrelid = 'public.club_seasons'::regclass
    and attribute.attname = 'closed_by_membership_id'
    and not attribute.attisdropped;

  select attribute.attnum into membership_id_attnum
  from pg_catalog.pg_attribute attribute
  where attribute.attrelid = 'public.club_memberships'::regclass
    and attribute.attname = 'id'
    and not attribute.attisdropped;

  select attribute.attnum into membership_club_id_attnum
  from pg_catalog.pg_attribute attribute
  where attribute.attrelid = 'public.club_memberships'::regclass
    and attribute.attname = 'club_id'
    and not attribute.attisdropped;

  if not exists (
    select 1
    from pg_catalog.pg_attrdef default_row
    where default_row.adrelid = 'public.club_seasons'::regclass
      and default_row.adnum = season_status_attnum
      and pg_catalog.pg_get_expr(default_row.adbin, default_row.adrelid) = '''open''::text'
  ) then
    raise exception 'Bloque 5.1: default de club_seasons.status incompatible';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.club_seasons'::regclass
      and constraint_row.conname = 'club_seasons_status_check'
      and constraint_row.contype = 'c'
      and constraint_row.convalidated
      and constraint_row.conkey = array[season_status_attnum]::smallint[]
      and pg_catalog.strpos(
        pg_catalog.pg_get_expr(constraint_row.conbin, constraint_row.conrelid),
        '''open''::text'
      ) > 0
      and pg_catalog.strpos(
        pg_catalog.pg_get_expr(constraint_row.conbin, constraint_row.conrelid),
        '''closed''::text'
      ) > 0
  ) then
    raise exception 'Bloque 5.1: club_seasons_status_check incompatible';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.club_seasons'::regclass
      and constraint_row.conname = 'club_seasons_lifecycle_consistency_check'
      and constraint_row.contype = 'c'
      and constraint_row.convalidated
      and constraint_row.conkey @> array[
        season_status_attnum,
        season_closed_at_attnum,
        season_closed_by_attnum
      ]::smallint[]
      and pg_catalog.strpos(
        pg_catalog.pg_get_expr(constraint_row.conbin, constraint_row.conrelid),
        'closed_at'
      ) > 0
      and pg_catalog.strpos(
        pg_catalog.pg_get_expr(constraint_row.conbin, constraint_row.conrelid),
        'closed_by_membership_id'
      ) > 0
  ) then
    raise exception 'Bloque 5.1: club_seasons_lifecycle_consistency_check incompatible';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.club_seasons'::regclass
      and constraint_row.conname = 'club_seasons_id_club_key'
      and constraint_row.contype = 'u'
      and constraint_row.convalidated
      and constraint_row.conkey = array[
        season_id_attnum,
        season_club_id_attnum
      ]::smallint[]
  ) then
    raise exception 'Bloque 5.1: club_seasons_id_club_key incompatible';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.club_memberships'::regclass
      and constraint_row.conname = 'club_memberships_id_club_key'
      and constraint_row.contype = 'u'
      and constraint_row.convalidated
      and constraint_row.conkey = array[
        membership_id_attnum,
        membership_club_id_attnum
      ]::smallint[]
  ) then
    raise exception 'Bloque 5.1: club_memberships_id_club_key incompatible';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.club_seasons'::regclass
      and constraint_row.conname = 'club_seasons_closed_by_membership_club_fkey'
      and constraint_row.contype = 'f'
      and constraint_row.convalidated
      and constraint_row.confrelid = 'public.club_memberships'::regclass
      and constraint_row.conkey = array[
        season_closed_by_attnum,
        season_club_id_attnum
      ]::smallint[]
      and constraint_row.confkey = array[
        membership_id_attnum,
        membership_club_id_attnum
      ]::smallint[]
      and constraint_row.confdeltype = 'r'
  ) then
    raise exception 'Bloque 5.1: FK de responsable y club incompatible';
  end if;

  select pg_catalog.md5(
    coalesce(
      pg_catalog.string_agg(
        season.id::text || ':' || season.is_active::text,
        ',' order by season.id
      ),
      ''
    )
  )
  into seasons_is_active_fingerprint
  from public.club_seasons season;

  if seasons_is_active_fingerprint is distinct from pg_catalog.current_setting(
    'appcaudal.block_5_1_is_active_before',
    true
  ) then
    raise exception 'Bloque 5.1: is_active fue alterado inesperadamente';
  end if;

  select pg_catalog.md5(
    relation.relrowsecurity::text
    || ':' || relation.relforcerowsecurity::text
    || ':' || coalesce(relation.relacl::text, '')
    || ':' || coalesce((
      select pg_catalog.string_agg(
        policy.polname
        || ':' || policy.polcmd
        || ':' || coalesce(policy.polroles::text, '')
        || ':' || coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')
        || ':' || coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), ''),
        '|' order by policy.polname
      )
      from pg_catalog.pg_policy policy
      where policy.polrelid = relation.oid
    ), '')
  )
  into seasons_security_fingerprint
  from pg_catalog.pg_class relation
  where relation.oid = 'public.club_seasons'::regclass;

  if seasons_security_fingerprint is distinct from pg_catalog.current_setting(
    'appcaudal.block_5_1_security_before',
    true
  ) then
    raise exception 'Bloque 5.1: RLS, policies o grants de club_seasons cambiaron';
  end if;
end;
$postconditions$;

commit;

-- REVERSIÓN MANUAL (no ejecutar si existen cierres reales o dependencias):
-- begin;
-- alter table public.club_seasons
--   drop constraint if exists club_seasons_closed_by_membership_club_fkey,
--   drop constraint if exists club_seasons_lifecycle_consistency_check,
--   drop constraint if exists club_seasons_status_check,
--   drop constraint if exists club_seasons_id_club_key,
--   drop column if exists closed_by_membership_id,
--   drop column if exists closed_at,
--   drop column if exists status;
-- alter table public.club_memberships
--   drop constraint if exists club_memberships_id_club_key;
-- commit;
