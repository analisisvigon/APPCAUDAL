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

-- 3. No existen estados incoherentes.
select pg_catalog.count(*) as incoherent_seasons
from public.club_seasons season
where season.status not in ('open', 'closed')
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

-- 5. Inventario RLS. La migracion no debe cambiar este resultado respecto
-- al inventario anterior a su aplicacion.
select
  policy.schemaname,
  policy.tablename,
  policy.policyname,
  policy.roles,
  policy.cmd,
  policy.qual,
  policy.with_check
from pg_catalog.pg_policies policy
where policy.schemaname = 'public'
  and policy.tablename = 'club_seasons'
order by policy.policyname;

-- 6. RLS y ACL efectivas para revision manual.
select
  relation.relrowsecurity as rls_enabled,
  relation.relforcerowsecurity as force_rls,
  relation.relacl
from pg_catalog.pg_class relation
where relation.oid = 'public.club_seasons'::regclass;

-- 7. Resumen final. Todas las temporadas existentes deben quedar abiertas en
-- la primera aplicacion; futuras ejecuciones respetaran cierres ya coherentes.
select
  status,
  is_active,
  pg_catalog.count(*) as seasons
from public.club_seasons
group by status, is_active
order by status, is_active desc;
