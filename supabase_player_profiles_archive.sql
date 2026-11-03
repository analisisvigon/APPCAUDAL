-- NEXO CLUB · Archivado seguro de perfiles globales.
-- Instalar solo tras supabase_player_profiles_delete_lockdown.sql y su verificador.
begin;

do $preflight$
begin
  if to_regclass('public.players_database') is null
     or to_regclass('public.player_team_memberships') is null
     or to_regclass('public.club_memberships') is null
     or to_regprocedure('auth.uid()') is null
     or to_regprocedure('public.is_app_staff()') is null then
    raise exception 'Faltan dependencias del archivado de perfiles';
  end if;
  if has_table_privilege('authenticated', 'public.players_database', 'DELETE')
     or has_table_privilege('anon', 'public.players_database', 'DELETE') then
    raise exception 'Archivado bloqueado: authenticated conserva DELETE directo sobre players_database';
  end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid = to_regprocedure('public.merge_global_player_profiles(uuid,uuid)')
      and p.prosecdef and p.proconfig = array['search_path=pg_catalog']::text[]
      and pg_get_userbyid(p.proowner) = 'nexo_profile_merge_executor'
  ) or not exists (
    select 1 from pg_roles r where r.rolname = 'nexo_profile_merge_executor'
      and not r.rolcanlogin and not r.rolbypassrls
      and has_table_privilege(r.rolname, 'public.players_database', 'DELETE')
  ) or not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'players_database'
      and p.policyname = 'player_perimeter_staff_delete'
      and p.cmd = 'DELETE'
      and regexp_replace(lower(coalesce(p.qual, '')),
        '[[:space:]()]', '', 'g') = 'false'
  ) or not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'players_database'
      and p.policyname = 'player_profile_merge_delete'
      and p.cmd = 'DELETE'
      and p.roles = array['nexo_profile_merge_executor']::name[]
      and regexp_replace(lower(coalesce(p.qual, '')),
        '[[:space:]()]', '', 'g') in ('is_app_staff', 'public.is_app_staff')
  ) then
    raise exception 'Instala y verifica primero el cierre del DELETE directo';
  end if;
  if to_regclass('public.player_profile_archives') is not null
     and obj_description(to_regclass('public.player_profile_archives'), 'pg_class')
       is distinct from 'NEXO CLUB: archivos de perfiles globales sin alterar historial' then
    raise exception 'player_profile_archives existe con otro contrato';
  end if;
  if to_regprocedure('public.archive_global_player_profile(uuid)') is not null
     and obj_description(to_regprocedure('public.archive_global_player_profile(uuid)'), 'pg_proc')
       is distinct from 'NEXO CLUB: archivado de perfil reservado al owner activo' then
    raise exception 'archive_global_player_profile(uuid) existe con otro contrato';
  end if;
  if exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'player_profile_archives'
      and p.policyname = 'player_profile_archives_staff_read'
      and (p.cmd <> 'SELECT' or p.permissive <> 'PERMISSIVE')
  ) then
    raise exception 'La politica de lectura existe con otro comando o modo';
  end if;
end;
$preflight$;

create table if not exists public.player_profile_archives (
  player_id uuid primary key references public.players_database(id) on delete restrict,
  archived_at timestamptz not null default now(),
  archived_by_membership_id uuid not null references public.club_memberships(id) on delete restrict
);
comment on table public.player_profile_archives is
  'NEXO CLUB: archivos de perfiles globales sin alterar historial';

alter table public.player_profile_archives enable row level security;
revoke all on public.player_profile_archives from public, anon, authenticated;
grant select on public.player_profile_archives to authenticated;

do $policy$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'player_profile_archives'
      and policyname = 'player_profile_archives_staff_read'
  ) then
    create policy player_profile_archives_staff_read
      on public.player_profile_archives for select to authenticated
      using (public.is_app_staff());
  end if;
end;
$policy$;
alter policy player_profile_archives_staff_read
  on public.player_profile_archives to authenticated
  using (public.is_app_staff());

create or replace function public.archive_global_player_profile(p_player_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_membership_id uuid;
begin
  if p_player_id is null or auth.uid() is null then
    raise exception using errcode = '42501', message = 'No autorizado';
  end if;

  select membership.id into v_membership_id
  from public.club_memberships membership
  where membership.user_id = auth.uid()
    and membership.role = 'owner'
    and membership.is_active
  order by membership.id
  limit 1;
  if v_membership_id is null then
    raise exception using errcode = '42501', message = 'Solo el propietario activo puede archivar perfiles';
  end if;

  perform 1 from public.players_database player
  where player.id = p_player_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Perfil no encontrado';
  end if;
  if exists (
    select 1 from public.player_team_memberships membership
    where membership.player_id = p_player_id and membership.is_current
  ) then
    raise exception using errcode = '23514',
      message = 'Quita primero al jugador de su equipo actual; el historial se conservará';
  end if;

  insert into public.player_profile_archives(player_id, archived_by_membership_id)
  values (p_player_id, v_membership_id)
  on conflict (player_id) do nothing;
  return 'archived';
end;
$function$;
comment on function public.archive_global_player_profile(uuid) is
  'NEXO CLUB: archivado de perfil reservado al owner activo';
alter function public.archive_global_player_profile(uuid) owner to postgres;
revoke all on function public.archive_global_player_profile(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.archive_global_player_profile(uuid) to authenticated;

do $postflight$
begin
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.player_profile_archives'::regclass
      and c.contype = 'f' and c.confrelid = 'public.players_database'::regclass
      and c.confdeltype = 'r' and c.convalidated
  ) or not exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.player_profile_archives'::regclass
      and c.contype = 'f' and c.confrelid = 'public.club_memberships'::regclass
      and c.confdeltype = 'r' and c.convalidated
  ) or not (select relrowsecurity from pg_class where oid = 'public.player_profile_archives'::regclass)
     or (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = 'player_profile_archives') <> 1
     or has_table_privilege('authenticated', 'public.player_profile_archives', 'INSERT, UPDATE, DELETE')
     or not has_function_privilege('authenticated', 'public.archive_global_player_profile(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.archive_global_player_profile(uuid)', 'EXECUTE')
     or exists (
       select 1 from pg_proc p,
         aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
       where p.oid = 'public.archive_global_player_profile(uuid)'::regprocedure
         and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
     ) then
    raise exception 'Postflight de archivado de perfiles fallido';
  end if;
end;
$postflight$;
commit;
