-- APPCAUDAL - Verificacion de solo lectura del Cambio 2.
-- Ejecutar despues de supabase_club_core_33_club_teams.sql.
-- Todos los resultados ok deben ser true; revisar tambien los inventarios.

-- 1. Identidad legacy: un solo own, nombre esperado y mismo UUID en club_teams.
select
  'caudal_legacy_identity' as check_name,
  (
    (select pg_catalog.count(*) from public.equipos_rivales
     where team_kind = 'own') = 1
    and (select pg_catalog.count(*)
         from public.clubs club
         join public.club_teams club_team on club_team.club_id = club.id
         join public.equipos_rivales legacy_team on legacy_team.id = club_team.id
         where club.id = 'ca0da100-0000-4000-8000-000000000001'::uuid
           and club_team.code = 'caudal'
           and legacy_team.team_kind = 'own'
           and pg_catalog.regexp_replace(
             pg_catalog.lower(pg_catalog.btrim(club.name)), '[^a-z0-9]+', '', 'g'
           ) = 'cdcaudal'
           and pg_catalog.regexp_replace(
             pg_catalog.lower(pg_catalog.btrim(legacy_team.name::text)), '[^a-z0-9]+', '', 'g'
            ) in ('cdcaudal', 'caudaldeportivo', 'caudaldeportivodemieres')) = 1
  ) as ok;

select
  legacy_team.id as legacy_team_id,
  legacy_team.name as legacy_name,
  legacy_team.team_kind,
  club_team.id as club_team_id,
  club_team.club_id,
  club_team.code,
  club_team.is_active,
  club_team.created_at,
  club_team.updated_at
from public.equipos_rivales legacy_team
left join public.club_teams club_team on club_team.id = legacy_team.id
where legacy_team.team_kind = 'own';

-- La segunda consulta permite comparar created_at/updated_at antes y despues
-- de repetir la migracion. La repeticion no debe modificarlos.

select
  'active_season_unchanged' as check_name,
  (select pg_catalog.count(*)
   from public.club_seasons season
   where season.id = 'a858d03b-aa54-49f5-bdb1-8c8b3b533dae'::uuid
     and season.club_id = 'ca0da100-0000-4000-8000-000000000001'::uuid
     and season.code = '2026'
     and season.is_active
     and season.status = 'open'
     and season.closed_at is null
     and season.closed_by_membership_id is null) = 1 as ok;

-- 2. Columnas y defaults.
select
  column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'club_teams'
order by ordinal_position;

select
  'club_teams_column_contract' as check_name,
  (
    (select pg_catalog.count(*)
     from pg_catalog.pg_attribute attribute
     where attribute.attrelid = 'public.club_teams'::regclass
       and attribute.attnum > 0
       and not attribute.attisdropped) = 6
    and (select pg_catalog.count(*)
         from pg_catalog.pg_attribute attribute
         where attribute.attrelid = 'public.club_teams'::regclass
           and attribute.attnum > 0
           and not attribute.attisdropped
           and attribute.attnotnull
           and (
             (attribute.attname in ('id', 'club_id') and attribute.atttypid = 'uuid'::regtype)
             or (attribute.attname = 'code' and attribute.atttypid = 'text'::regtype)
             or (attribute.attname = 'is_active' and attribute.atttypid = 'boolean'::regtype)
             or (attribute.attname in ('created_at', 'updated_at')
                 and attribute.atttypid = 'timestamptz'::regtype)
           )) = 6
  ) as ok;

-- 3. PK, FKs, UNIQUE e indices creados por las restricciones.
select
  constraint_row.conname,
  constraint_row.contype,
  constraint_row.convalidated,
  constraint_row.condeferrable,
  pg_catalog.pg_get_constraintdef(constraint_row.oid, true) as definition
from pg_catalog.pg_constraint constraint_row
where constraint_row.conrelid = 'public.club_teams'::regclass
order by constraint_row.conname;

with att as (
  select
    pg_catalog.max(attnum) filter (where attrelid = 'public.club_teams'::regclass and attname = 'id')::smallint as team_id,
    pg_catalog.max(attnum) filter (where attrelid = 'public.club_teams'::regclass and attname = 'club_id')::smallint as team_club,
    pg_catalog.max(attnum) filter (where attrelid = 'public.club_teams'::regclass and attname = 'code')::smallint as team_code,
    pg_catalog.max(attnum) filter (where attrelid = 'public.equipos_rivales'::regclass and attname = 'id')::smallint as legacy_id,
    pg_catalog.max(attnum) filter (where attrelid = 'public.clubs'::regclass and attname = 'id')::smallint as club_id
  from pg_catalog.pg_attribute
  where attnum > 0 and not attisdropped
), checks as (
  select
    exists (
      select 1 from pg_catalog.pg_constraint c, att
      where c.conrelid = 'public.club_teams'::regclass
        and c.conname = 'club_teams_pkey' and c.contype = 'p'
        and c.convalidated and not c.condeferrable
        and c.conkey = array[att.team_id]::smallint[]
    ) as pk_ok,
    exists (
      select 1 from pg_catalog.pg_constraint c, att
      where c.conrelid = 'public.club_teams'::regclass
        and c.conname = 'club_teams_club_code_key' and c.contype = 'u'
        and c.convalidated and not c.condeferrable
        and c.conkey = array[att.team_club, att.team_code]::smallint[]
    ) as club_code_unique_ok,
    exists (
      select 1 from pg_catalog.pg_constraint c, att
      where c.conrelid = 'public.club_teams'::regclass
        and c.conname = 'club_teams_id_club_key' and c.contype = 'u'
        and c.convalidated and not c.condeferrable
        and c.conkey = array[att.team_id, att.team_club]::smallint[]
    ) as id_club_unique_ok,
    exists (
      select 1 from pg_catalog.pg_constraint c, att
      where c.conrelid = 'public.club_teams'::regclass
        and c.conname = 'club_teams_id_fkey' and c.contype = 'f'
        and c.convalidated and not c.condeferrable
        and c.conkey = array[att.team_id]::smallint[]
        and c.confrelid = 'public.equipos_rivales'::regclass
        and c.confkey = array[att.legacy_id]::smallint[]
        and c.confdeltype = 'r' and c.confupdtype = 'a'
    ) as legacy_fk_ok,
    exists (
      select 1 from pg_catalog.pg_constraint c, att
      where c.conrelid = 'public.club_teams'::regclass
        and c.conname = 'club_teams_club_id_fkey' and c.contype = 'f'
        and c.convalidated and not c.condeferrable
        and c.conkey = array[att.team_club]::smallint[]
        and c.confrelid = 'public.clubs'::regclass
        and c.confkey = array[att.club_id]::smallint[]
        and c.confdeltype = 'r' and c.confupdtype = 'a'
    ) as club_fk_ok,
    exists (
      select 1 from pg_catalog.pg_constraint c, att
      where c.conrelid = 'public.club_teams'::regclass
        and c.conname = 'club_teams_code_not_empty' and c.contype = 'c'
        and c.convalidated and not c.connoinherit
        and c.conkey = array[att.team_code]::smallint[]
    ) as code_check_ok
)
select 'pk' as check_name, pk_ok as ok from checks
union all select 'club_code_unique', club_code_unique_ok from checks
union all select 'id_club_unique', id_club_unique_ok from checks
union all select 'legacy_fk_restrict', legacy_fk_ok from checks
union all select 'club_fk_restrict', club_fk_ok from checks
union all select 'code_check', code_check_ok from checks;

select
  'club_teams_constraint_indexes' as check_name,
  (select pg_catalog.count(*)
   from pg_catalog.pg_constraint constraint_row
   join pg_catalog.pg_index index_row
     on index_row.indexrelid = constraint_row.conindid
   where constraint_row.conrelid = 'public.club_teams'::regclass
     and constraint_row.conname in (
       'club_teams_pkey', 'club_teams_club_code_key', 'club_teams_id_club_key'
     )
     and index_row.indisunique
     and index_row.indisvalid
     and index_row.indisready
     and index_row.indislive
     and index_row.indnatts = index_row.indnkeyatts) = 3 as ok;

-- 4. Datos: ningun equipo propio registrado apunta a un rival o a otro club.
select
  'club_team_rows_consistent' as check_name,
  not exists (
    select 1 from public.club_teams club_team
    left join public.equipos_rivales legacy_team on legacy_team.id = club_team.id
    left join public.clubs club on club.id = club_team.club_id
    where legacy_team.id is null
       or legacy_team.team_kind <> 'own'
       or club.id is null
       or club_team.code <> pg_catalog.btrim(club_team.code)
       or club_team.code = ''
  ) as ok;

-- 5. RLS, policies y privilegios. No debe existir policy DELETE.
select
  policy.policyname, policy.permissive, policy.roles, policy.cmd,
  policy.qual, policy.with_check
from pg_catalog.pg_policies policy
where policy.schemaname = 'public'
  and policy.tablename = 'club_teams'
order by policy.policyname;

select
  'club_teams_security_contract' as check_name,
  (
    relation.relowner = 'postgres'::regrole
    and
    relation.relrowsecurity
    and not relation.relforcerowsecurity
    and (select pg_catalog.count(*) from pg_catalog.pg_policy p
         where p.polrelid = relation.oid) = 3
    and (select pg_catalog.count(*) from pg_catalog.pg_policy p
         where p.polrelid = relation.oid
           and p.polpermissive
           and p.polroles = array[
             (select role_row.oid from pg_catalog.pg_roles role_row
              where role_row.rolname = 'authenticated')
           ]::oid[]
           and (
             (p.polname = 'club_teams_staff_select' and p.polcmd = 'r')
             or (p.polname = 'club_teams_manager_insert' and p.polcmd = 'a')
             or (p.polname = 'club_teams_manager_update' and p.polcmd = 'w')
           )) = 3
    and not pg_catalog.has_table_privilege('anon', 'public.club_teams', 'SELECT')
    and not pg_catalog.has_table_privilege('anon', 'public.club_teams', 'INSERT')
    and not pg_catalog.has_table_privilege('anon', 'public.club_teams', 'UPDATE')
    and not pg_catalog.has_table_privilege('anon', 'public.club_teams', 'DELETE')
    and pg_catalog.has_table_privilege('authenticated', 'public.club_teams', 'SELECT')
    and pg_catalog.has_table_privilege('authenticated', 'public.club_teams', 'INSERT')
    and not pg_catalog.has_table_privilege('authenticated', 'public.club_teams', 'DELETE')
    and not pg_catalog.has_table_privilege('authenticated', 'public.club_teams', 'TRUNCATE')
    and not pg_catalog.has_column_privilege('authenticated', 'public.club_teams', 'id', 'UPDATE')
    and not pg_catalog.has_column_privilege('authenticated', 'public.club_teams', 'club_id', 'UPDATE')
    and pg_catalog.has_column_privilege('authenticated', 'public.club_teams', 'code', 'UPDATE')
    and pg_catalog.has_column_privilege('authenticated', 'public.club_teams', 'is_active', 'UPDATE')
  ) as ok
from pg_catalog.pg_class relation
where relation.oid = 'public.club_teams'::regclass;

-- Revisar en el inventario que SELECT llama a can_edit_club_data(club_id),
-- INSERT/UPDATE a can_manage_club(club_id) y sus WITH CHECK comprueban own.

-- 6. Trigger de updated_at.
select
  'club_teams_updated_at_trigger' as check_name,
  exists (
    select 1 from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.club_teams'::regclass
      and trigger_row.tgname = 'set_club_teams_updated_at'
      and trigger_row.tgfoid = 'public.set_club_core_updated_at()'::regprocedure
      and trigger_row.tgenabled = 'O'
      and trigger_row.tgtype = 19
      and not trigger_row.tgisinternal
  ) as ok;

-- 7. Huellas de no regresion. Guardar este resultado y compararlo con el
-- obtenido al repetir la migracion. club_teams no debe duplicar la fila;
-- las demas huellas no deben cambiar por efecto del Cambio 2.
select 'clubs' as table_name, pg_catalog.count(*) as row_count,
  pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(source)::text,
    '|' order by pg_catalog.to_jsonb(source)::text), '')) as fingerprint
from public.clubs source
union all
select 'club_seasons', pg_catalog.count(*),
  pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(source)::text,
    '|' order by pg_catalog.to_jsonb(source)::text), ''))
from public.club_seasons source
union all
select 'equipos_rivales', pg_catalog.count(*),
  pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(source)::text,
    '|' order by pg_catalog.to_jsonb(source)::text), ''))
from public.equipos_rivales source
union all
select 'player_team_memberships', pg_catalog.count(*),
  pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(source)::text,
    '|' order by pg_catalog.to_jsonb(source)::text), ''))
from public.player_team_memberships source
union all
select 'partidos', pg_catalog.count(*),
  pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(source)::text,
    '|' order by pg_catalog.to_jsonb(source)::text), ''))
from public.partidos source
union all
select 'training_sessions', pg_catalog.count(*),
  pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(source)::text,
    '|' order by pg_catalog.to_jsonb(source)::text), ''))
from public.training_sessions source
union all
select 'training_tasks', pg_catalog.count(*),
  pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(source)::text,
    '|' order by pg_catalog.to_jsonb(source)::text), ''))
from public.training_tasks source
union all
select 'rpe_entries', pg_catalog.count(*),
  pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(source)::text,
    '|' order by pg_catalog.to_jsonb(source)::text), ''))
from public.rpe_entries source
union all
select 'competitions', pg_catalog.count(*),
  pg_catalog.md5(coalesce(pg_catalog.string_agg(pg_catalog.to_jsonb(source)::text,
    '|' order by pg_catalog.to_jsonb(source)::text), ''))
from public.competitions source;

-- Inventario de seguridad heredada para comparar con una captura previa.
select
  relation.relname as table_name,
  relation.relrowsecurity,
  relation.relforcerowsecurity,
  relation.relacl,
  pg_catalog.md5(coalesce((
    select pg_catalog.string_agg(
      policy.polname || ':' || policy.polpermissive::text || ':' ||
      policy.polcmd::text || ':' || policy.polroles::text || ':' ||
      coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '') || ':' ||
      coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), ''),
      '|' order by policy.polname
    )
    from pg_catalog.pg_policy policy
    where policy.polrelid = relation.oid
  ), '')) as policy_fingerprint
from pg_catalog.pg_class relation
where relation.oid in (
  'public.clubs'::regclass,
  'public.club_seasons'::regclass,
  'public.equipos_rivales'::regclass
)
order by relation.relname;
