-- APPCAUDAL - Verificacion de solo lectura del Bloque 5.1.
-- Puede ejecutarse despues de supabase_club_core_32_season_lifecycle.sql.
-- No crea, actualiza ni elimina datos u objetos.

-- 1. Contrato de las tres columnas nuevas.
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'club_seasons'
  and column_name in ('status', 'closed_at', 'closed_by_membership_id')
order by ordinal_position;

-- Esperado:
-- status text NOT NULL default 'open'; closed_at timestamptz nullable;
-- closed_by_membership_id uuid nullable.

with lifecycle_columns as (
  select
    attribute.attname,
    attribute.atttypid,
    attribute.attnotnull,
    attribute.attnum
  from pg_catalog.pg_attribute attribute
  where attribute.attrelid = 'public.club_seasons'::regclass
    and attribute.attname in ('status', 'closed_at', 'closed_by_membership_id')
    and attribute.attnum > 0
    and not attribute.attisdropped
)
select
  'lifecycle_columns_contract' as check_name,
  (
    (select pg_catalog.count(*) from lifecycle_columns) = 3
    and exists (
      select 1 from lifecycle_columns column_row
      where column_row.attname = 'status'
        and column_row.atttypid = 'text'::regtype
        and column_row.attnotnull
        and exists (
          select 1
          from pg_catalog.pg_attrdef default_row
          where default_row.adrelid = 'public.club_seasons'::regclass
            and default_row.adnum = column_row.attnum
            and pg_catalog.pg_get_expr(default_row.adbin, default_row.adrelid) = '''open''::text'
        )
    )
    and exists (
      select 1 from lifecycle_columns column_row
      where column_row.attname = 'closed_at'
        and column_row.atttypid = 'timestamptz'::regtype
        and not column_row.attnotnull
    )
    and exists (
      select 1 from lifecycle_columns column_row
      where column_row.attname = 'closed_by_membership_id'
        and column_row.atttypid = 'uuid'::regtype
        and not column_row.attnotnull
    )
  ) as ok;

-- Esperado: ok = true.

-- 2. Temporada inicial: permanece activa y abierta.
select
  id,
  club_id,
  code,
  label,
  starts_on,
  ends_on,
  is_active,
  status,
  closed_at,
  closed_by_membership_id
from public.club_seasons
where code = '2026'
  and label = '2026/2027';

-- Esperado: exactamente una fila, is_active = true, status = 'open' y
-- closed_at/closed_by_membership_id nulos.

select
  'season_2026_2027_active_and_open' as check_name,
  (
    pg_catalog.count(*) = 1
    and coalesce(pg_catalog.bool_and(
      is_active
      and status = 'open'
      and closed_at is null
      and closed_by_membership_id is null
    ), false)
  ) as ok
from public.club_seasons
where code = '2026'
  and label = '2026/2027';

-- Esperado: ok = true.

-- 3. No existen estados incoherentes.
select pg_catalog.count(*) as incoherent_seasons
from public.club_seasons season
where season.status is null
   or season.status not in ('open', 'closed')
   or (
     season.status = 'open'
     and (season.closed_at is not null or season.closed_by_membership_id is not null)
   )
   or (
     season.status = 'closed'
     and (season.closed_at is null or season.closed_by_membership_id is null)
   );

-- Esperado: 0.

-- 4. Constraints incorporadas y validadas.
select
  constraint_row.conname,
  constraint_row.contype,
  constraint_row.convalidated,
  pg_catalog.pg_get_constraintdef(constraint_row.oid, true) as definition
from pg_catalog.pg_constraint constraint_row
where (
    constraint_row.conrelid = 'public.club_seasons'::regclass
    and constraint_row.conname in (
      'club_seasons_status_check',
      'club_seasons_lifecycle_consistency_check',
      'club_seasons_closed_by_membership_club_fkey',
      'club_seasons_id_club_key'
    )
  )
  or (
    constraint_row.conrelid = 'public.club_memberships'::regclass
    and constraint_row.conname = 'club_memberships_id_club_key'
  )
order by constraint_row.conrelid::regclass::text, constraint_row.conname;

-- Esperado: cinco filas, todas con convalidated = true.

with attribute_numbers as (
  select
    pg_catalog.max(attribute.attnum) filter (
      where attribute.attrelid = 'public.club_seasons'::regclass
        and attribute.attname = 'id'
    )::smallint as season_id,
    pg_catalog.max(attribute.attnum) filter (
      where attribute.attrelid = 'public.club_seasons'::regclass
        and attribute.attname = 'club_id'
    )::smallint as season_club_id,
    pg_catalog.max(attribute.attnum) filter (
      where attribute.attrelid = 'public.club_seasons'::regclass
        and attribute.attname = 'status'
    )::smallint as season_status,
    pg_catalog.max(attribute.attnum) filter (
      where attribute.attrelid = 'public.club_seasons'::regclass
        and attribute.attname = 'closed_at'
    )::smallint as season_closed_at,
    pg_catalog.max(attribute.attnum) filter (
      where attribute.attrelid = 'public.club_seasons'::regclass
        and attribute.attname = 'closed_by_membership_id'
    )::smallint as season_closed_by,
    pg_catalog.max(attribute.attnum) filter (
      where attribute.attrelid = 'public.club_memberships'::regclass
        and attribute.attname = 'id'
    )::smallint as membership_id,
    pg_catalog.max(attribute.attnum) filter (
      where attribute.attrelid = 'public.club_memberships'::regclass
        and attribute.attname = 'club_id'
    )::smallint as membership_club_id
  from pg_catalog.pg_attribute attribute
  where attribute.attnum > 0
    and not attribute.attisdropped
    and attribute.attrelid in (
      'public.club_seasons'::regclass,
      'public.club_memberships'::regclass
    )
), constraint_contract as (
  select
    exists (
      select 1
      from pg_catalog.pg_constraint constraint_row, attribute_numbers attributes
      where constraint_row.conrelid = 'public.club_seasons'::regclass
        and constraint_row.conname = 'club_seasons_status_check'
        and constraint_row.contype = 'c'
        and constraint_row.convalidated
        and not constraint_row.connoinherit
        and constraint_row.conkey = array[attributes.season_status]::smallint[]
        and pg_catalog.regexp_replace(
          pg_catalog.lower(pg_catalog.pg_get_expr(constraint_row.conbin, constraint_row.conrelid)),
          '[[:space:]()]', '', 'g'
        ) = 'status=anyarray[''open''::text,''closed''::text]'
    ) as status_check_ok,
    exists (
      select 1
      from pg_catalog.pg_constraint constraint_row, attribute_numbers attributes
      where constraint_row.conrelid = 'public.club_seasons'::regclass
        and constraint_row.conname = 'club_seasons_lifecycle_consistency_check'
        and constraint_row.contype = 'c'
        and constraint_row.convalidated
        and not constraint_row.connoinherit
        and constraint_row.conkey @> array[
          attributes.season_status,
          attributes.season_closed_at,
          attributes.season_closed_by
        ]::smallint[]
        and constraint_row.conkey <@ array[
          attributes.season_status,
          attributes.season_closed_at,
          attributes.season_closed_by
        ]::smallint[]
        and pg_catalog.regexp_replace(
          pg_catalog.lower(pg_catalog.pg_get_expr(constraint_row.conbin, constraint_row.conrelid)),
          '[[:space:]()]', '', 'g'
        ) = 'status=''open''::textandclosed_atisnullandclosed_by_membership_idisnullorstatus=''closed''::textandclosed_atisnotnullandclosed_by_membership_idisnotnull'
    ) as lifecycle_check_ok,
    exists (
      select 1
      from pg_catalog.pg_constraint constraint_row, attribute_numbers attributes
      where constraint_row.conrelid = 'public.club_seasons'::regclass
        and constraint_row.conname = 'club_seasons_id_club_key'
        and constraint_row.contype = 'u'
        and constraint_row.convalidated
        and not constraint_row.condeferrable
        and not constraint_row.condeferred
        and constraint_row.conkey = array[
          attributes.season_id,
          attributes.season_club_id
        ]::smallint[]
    ) as season_unique_ok,
    exists (
      select 1
      from pg_catalog.pg_constraint constraint_row, attribute_numbers attributes
      where constraint_row.conrelid = 'public.club_memberships'::regclass
        and constraint_row.conname = 'club_memberships_id_club_key'
        and constraint_row.contype = 'u'
        and constraint_row.convalidated
        and not constraint_row.condeferrable
        and not constraint_row.condeferred
        and constraint_row.conkey = array[
          attributes.membership_id,
          attributes.membership_club_id
        ]::smallint[]
    ) as membership_unique_ok,
    exists (
      select 1
      from pg_catalog.pg_constraint constraint_row, attribute_numbers attributes
      where constraint_row.conrelid = 'public.club_seasons'::regclass
        and constraint_row.conname = 'club_seasons_closed_by_membership_club_fkey'
        and constraint_row.contype = 'f'
        and constraint_row.convalidated
        and not constraint_row.condeferrable
        and not constraint_row.condeferred
        and constraint_row.confrelid = 'public.club_memberships'::regclass
        and constraint_row.conkey = array[
          attributes.season_closed_by,
          attributes.season_club_id
        ]::smallint[]
        and constraint_row.confkey = array[
          attributes.membership_id,
          attributes.membership_club_id
        ]::smallint[]
        and constraint_row.confmatchtype = 's'
        and constraint_row.confupdtype = 'a'
        and constraint_row.confdeltype = 'r'
    ) as closed_by_fk_ok
)
select 'status_check_contract' as check_name, status_check_ok as ok
from constraint_contract
union all
select 'lifecycle_check_contract', lifecycle_check_ok
from constraint_contract
union all
select 'season_id_club_unique_contract', season_unique_ok
from constraint_contract
union all
select 'membership_id_club_unique_contract', membership_unique_ok
from constraint_contract
union all
select 'closed_by_composite_fk_contract', closed_by_fk_ok
from constraint_contract;

-- Esperado: cinco filas con ok = true.

-- 5. Inventario RLS. La migracion no debe cambiar este resultado para ninguna
-- de las dos tablas que bloquea para anadir constraints.
select
  policy.schemaname,
  policy.tablename,
  policy.policyname,
  policy.permissive,
  policy.roles,
  policy.cmd,
  policy.qual,
  policy.with_check
from pg_catalog.pg_policies policy
where policy.schemaname = 'public'
  and policy.tablename in ('club_seasons', 'club_memberships')
order by policy.tablename, policy.policyname;

-- 6. RLS y ACL efectivas para revision manual.
select
  relation.relname as table_name,
  pg_catalog.pg_get_userbyid(relation.relowner) as owner_name,
  relation.relrowsecurity as rls_enabled,
  relation.relforcerowsecurity as force_rls,
  relation.relacl
from pg_catalog.pg_class relation
where relation.oid in (
  'public.club_seasons'::regclass,
  'public.club_memberships'::regclass
)
order by relation.relname;

select
  'club_seasons_security_contract' as check_name,
  (
    relation.relrowsecurity
    and not relation.relforcerowsecurity
    and (
      select pg_catalog.count(*)
      from pg_catalog.pg_policy policy
      where policy.polrelid = relation.oid
    ) = 1
    and exists (
      select 1
      from pg_catalog.pg_policy policy
      where policy.polrelid = relation.oid
        and policy.polname = 'Fines staff can read club seasons'
        and policy.polpermissive
        and policy.polcmd = 'r'
        and policy.polroles = array[
          (select role_row.oid from pg_catalog.pg_roles role_row where role_row.rolname = 'authenticated')
        ]::oid[]
    )
    and not pg_catalog.has_table_privilege('anon', 'public.club_seasons', 'SELECT')
    and pg_catalog.has_table_privilege('authenticated', 'public.club_seasons', 'SELECT')
    and not pg_catalog.has_table_privilege('authenticated', 'public.club_seasons', 'INSERT')
    and not pg_catalog.has_table_privilege('authenticated', 'public.club_seasons', 'UPDATE')
    and not pg_catalog.has_table_privilege('authenticated', 'public.club_seasons', 'DELETE')
    and pg_catalog.has_table_privilege('service_role', 'public.club_seasons', 'SELECT')
    and pg_catalog.has_table_privilege('service_role', 'public.club_seasons', 'INSERT')
    and pg_catalog.has_table_privilege('service_role', 'public.club_seasons', 'UPDATE')
    and pg_catalog.has_table_privilege('service_role', 'public.club_seasons', 'DELETE')
  ) as ok
from pg_catalog.pg_class relation
where relation.oid = 'public.club_seasons'::regclass;

-- Esperado: ok = true. La propia migracion compara ademas la huella exacta
-- antes/despues de RLS, policies y ACL de club_seasons y club_memberships.

-- 6.b. El indice parcial heredado sigue imponiendo una sola temporada activa
-- por club; status no interviene en esa semantica.
select
  'one_active_season_index_preserved' as check_name,
  exists (
    select 1
    from pg_catalog.pg_class index_relation
    join pg_catalog.pg_index index_row on index_row.indexrelid = index_relation.oid
    where index_row.indrelid = 'public.club_seasons'::regclass
      and index_relation.relname = 'club_seasons_one_active_per_club_uidx'
      and index_row.indisunique
      and index_row.indisvalid
      and index_row.indisready
      and index_row.indislive
      and index_row.indnkeyatts = 1
      and index_row.indnatts = 1
      and index_row.indkey::smallint[] = array[
        (
          select attribute.attnum
          from pg_catalog.pg_attribute attribute
          where attribute.attrelid = 'public.club_seasons'::regclass
            and attribute.attname = 'club_id'
            and attribute.attnum > 0
            and not attribute.attisdropped
        )
      ]::smallint[]
      and index_row.indpred is not null
      and pg_catalog.regexp_replace(
        pg_catalog.lower(
          pg_catalog.pg_get_expr(index_row.indpred, index_row.indrelid)
        ),
        '[[:space:]()]', '', 'g'
      ) = 'is_active'
  ) as ok;

-- Esperado: ok = true.

-- 7. Resumen final. Todas las temporadas existentes deben quedar abiertas en
-- la primera aplicacion; futuras ejecuciones respetaran cierres ya coherentes.
select
  status,
  is_active,
  pg_catalog.count(*) as seasons
from public.club_seasons
group by status, is_active
order by status, is_active desc;
