-- Solo lectura. Ejecutar antes y despues de la migracion.
with checks as (
  select 'tabla de archivado' as check_name,
         to_regclass('public.player_profile_archives') is not null as ok
  union all select 'RPC de archivado', to_regprocedure('public.archive_global_player_profile(uuid)') is not null
  union all select 'RLS activo', coalesce((select relrowsecurity from pg_class
    where oid = to_regclass('public.player_profile_archives')), false)
  union all select 'owner de RPC postgres', coalesce((select pg_get_userbyid(proowner) = 'postgres'
    from pg_proc where oid = to_regprocedure('public.archive_global_player_profile(uuid)')), false)
  union all select 'RPC SECURITY DEFINER', coalesce((select prosecdef from pg_proc
    where oid = to_regprocedure('public.archive_global_player_profile(uuid)')), false)
  union all select 'RPC search_path seguro', coalesce((select proconfig @> array['search_path=pg_catalog']::text[]
    from pg_proc where oid = to_regprocedure('public.archive_global_player_profile(uuid)')), false)
  union all select 'authenticated EXECUTE', coalesce(has_function_privilege('authenticated', to_regprocedure('public.archive_global_player_profile(uuid)'), 'EXECUTE'), false)
  union all select 'anon sin EXECUTE', not coalesce(has_function_privilege('anon', to_regprocedure('public.archive_global_player_profile(uuid)'), 'EXECUTE'), true)
  union all select 'PUBLIC sin EXECUTE', not exists (
    select 1 from pg_proc p,
      aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where p.oid = to_regprocedure('public.archive_global_player_profile(uuid)')
      and acl.grantee = 0 and acl.privilege_type = 'EXECUTE')
  union all select 'authenticated sin escritura directa',
    not coalesce(has_table_privilege('authenticated', to_regclass('public.player_profile_archives'), 'INSERT, UPDATE, DELETE'), true)
  union all select 'FK restrict validada', exists (
    select 1 from pg_constraint c
    where c.conrelid = to_regclass('public.player_profile_archives') and c.contype = 'f'
      and c.confrelid = to_regclass('public.players_database') and c.confdeltype = 'r' and c.convalidated)
  union all select 'FK membership restrict validada', exists (
    select 1 from pg_constraint c
    where c.conrelid = to_regclass('public.player_profile_archives') and c.contype = 'f'
      and c.confrelid = to_regclass('public.club_memberships') and c.confdeltype = 'r' and c.convalidated)
  union all select 'una sola politica', (select count(*) = 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'player_profile_archives')
  union all select 'politica SELECT staff', exists (
    select 1 from pg_policies p where p.schemaname = 'public'
      and p.tablename = 'player_profile_archives'
      and p.policyname = 'player_profile_archives_staff_read'
      and p.cmd = 'SELECT' and p.roles = array['authenticated']::name[]
      and replace(replace(p.qual, ' ', ''), '(', '') like '%is_app_staff%')
)
select check_name, case when ok then 'PASS' else 'FAIL' end as result
from checks
union all
select 'GLOBAL', case when bool_and(ok) then 'PASS' else 'BLOCKED' end
from checks;
