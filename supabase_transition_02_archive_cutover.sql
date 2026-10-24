-- TRANSICION 02 / CORTE FUTURO. NO INSTALAR AHORA.
-- Requiere: CTS Libia creado, respaldo restaurable, 03C instalado y verificado,
-- todas las rutas historicas ajenas al perimetro 03C cerradas y ensayos
-- negativos de SQL directo y RPC completados. Este archivo solo restringe el
-- helper comun del perimetro 03C al CTS unico de operational_cts_v1.
-- No crea clubes, no modifica datos y no cambia politicas.
begin;

do $preflight$
declare helper record; target text; write_guard text; policy_row record;
  expected_trigger text;
begin
  -- Interbloqueo deliberado: el perimetro 03C no cubre todas las rutas
  -- indirectas de perfiles, documentos, Storage y modulos deportivos.
  -- Retirar este bloqueo solo en una revision posterior con pruebas negativas
  -- de esas rutas y del portal PLAYER documentadas y aprobadas.
  raise exception 'ARCHIVE_CUTOVER_BLOCKED_PENDING_INDIRECT_WRITE_PROTECTION';
  if auth.uid() is not null then raise exception 'Instalar sin JWT de usuario'; end if;
  if to_regclass('public.operational_cts_v1') is null
    or to_regclass('public.operational_guard_versions_v1') is null
    or (select count(*) from public.operational_cts_v1) <> 1 then
    raise exception 'Debe existir exactamente un CTS operativo designado';
  end if;
  if exists (select 1 from public.operational_cts_v1 where writes_enabled) then
    raise exception 'La activacion operativa ya se realizo';
  end if;
  if exists (select 1 from public.operational_guard_versions_v1) then
    raise exception 'Marcador de guard ya instalado: revisar';
  end if;
  if not exists (
    select 1 from public.operational_cts_v1 active
    join public.club_team_seasons cts on cts.id = active.club_team_season_id
    join public.club_seasons season on season.id = cts.season_id
      and season.club_id = cts.club_id and season.status = 'open'
      and season.is_active
    join public.club_memberships membership on membership.user_id = active.owner_user_id
      and membership.club_id = cts.club_id and membership.role = 'owner'
      and membership.is_active
  ) then raise exception 'CTS operativo/propietario no valido'; end if;
  select prosecdef, proowner, proconfig, prosrc into helper from pg_proc
    where oid = to_regprocedure('public.can_write_club_team_season(uuid)');
  if not found or not helper.prosecdef or helper.proowner <> 'postgres'::regrole
    or not coalesce('search_path=pg_catalog' = any(helper.proconfig),false)
    or position('public.can_read_club_team_season(target_club_team_season_id)' in helper.prosrc) = 0
    or position('season.status = ''open''' in helper.prosrc) = 0
    or position('public.operational_cts_v1' in helper.prosrc) > 0 then
    raise exception 'Contrato de can_write_club_team_season inesperado';
  end if;
  -- El corte RLS 03C debe haberse realizado antes. La ausencia de una tabla
  -- o de una de sus politicas impide este paso por completo.
  foreach target in array array[
    'jugadores','partidos','partido_estadisticas_jugador',
    'partido_eventos_gol','match_quick_events','partido_alineacion_slots',
    'partido_eventos_sistema','partido_snapshots_tacticos',
    'partido_snapshot_tactico_slots','partido_eventos_post',
    'partido_convocados','partido_notas_individuales_pre',
    'partido_eventos_sustitucion','match_set_piece_takers',
    'match_set_piece_notes','match_set_piece_diagrams'
  ] loop
    if to_regclass(format('public.%I',target)) is null
      or not exists (select 1 from pg_policy p
        where p.polrelid = to_regclass(format('public.%I',target))
          and p.polname = 'multiclub_03_read')
      or (select count(*) from pg_policy p
          where p.polrelid = to_regclass(format('public.%I',target))) <>
        case when target = 'partido_eventos_sustitucion' then 1 else 4 end
      or (target <> 'partido_eventos_sustitucion' and
        (select count(*) from pg_policy p
         where p.polrelid = to_regclass(format('public.%I',target))
           and p.polname in ('multiclub_03_insert','multiclub_03_update',
                             'multiclub_03_delete')) <> 3) then
      raise exception 'Corte RLS 03C incompleto en %',target;
    end if;
    if target = 'partido_eventos_sustitucion' then
      continue;
    end if;
    write_guard := case
      when target = 'jugadores' then 'can_write_legacy_jugador_v1'
      when target = 'partidos' then 'can_write_club_team_season'
      when target = 'partido_snapshot_tactico_slots'
        then 'can_write_match_snapshot_v1'
      else 'can_write_match' end;
    for policy_row in
      select polname, polcmd, polpermissive, polroles,
        coalesce(pg_get_expr(polqual,polrelid),'') as using_expression,
        coalesce(pg_get_expr(polwithcheck,polrelid),'') as check_expression
      from pg_policy where polrelid = to_regclass(format('public.%I',target))
        and polname in ('multiclub_03_insert','multiclub_03_update',
                        'multiclub_03_delete')
    loop
      if not policy_row.polpermissive
        or policy_row.polroles <> array['authenticated'::regrole::oid]::oid[]
        or (policy_row.polname = 'multiclub_03_insert'
            and policy_row.polcmd <> 'a')
        or (policy_row.polname = 'multiclub_03_update'
            and policy_row.polcmd <> 'w')
        or (policy_row.polname = 'multiclub_03_delete'
            and policy_row.polcmd <> 'd')
        or (target = 'jugadores' and policy_row.polname = 'multiclub_03_insert'
            and policy_row.check_expression <> 'false')
        or (not (target = 'jugadores'
                 and policy_row.polname = 'multiclub_03_insert')
            and position(write_guard in policy_row.using_expression
              || ' ' || policy_row.check_expression) = 0) then
        raise exception 'Politica de escritura 03C inesperada: %.%',
          target, policy_row.polname;
      end if;
    end loop;
  end loop;
  if not exists (
    select 1 from pg_proc p where p.oid =
      to_regprocedure('public.mutate_match_substitution_atomic(text,uuid,uuid,jsonb,integer)')
      and p.prosecdef and p.proowner = 'postgres'::regrole
      and position('public.can_write_match(p_partido_id)' in p.prosrc) > 0
  ) then raise exception 'RPC de sustituciones no protegida por CTS'; end if;
  if not exists (select 1 from pg_proc p
    where p.oid=to_regprocedure('public.transition_02_row_write_guard_v1()')
      and p.prosecdef and p.proowner='postgres'::regrole
      and 'search_path=pg_catalog'=any(p.proconfig))
    or has_table_privilege('authenticated',
      'public.operational_guard_versions_v1'::regclass,'INSERT') then
    raise exception 'Contrato de guardas de Transicion 02 invalido';
  end if;
  foreach target in array array[
    'jugadores','partidos','partido_estadisticas_jugador',
    'partido_eventos_gol','match_quick_events','partido_alineacion_slots',
    'partido_eventos_sistema','partido_snapshots_tacticos',
    'partido_snapshot_tactico_slots','partido_eventos_post',
    'partido_convocados','partido_notas_individuales_pre',
    'partido_eventos_sustitucion','match_set_piece_takers',
    'match_set_piece_notes','match_set_piece_diagrams',
    'club_team_season_players','legacy_jugador_cts_links_v1',
    'player_team_memberships','players_database','player_positions',
    'player_sources','player_scouting_traits','legacy_own_player_migration',
    'equipos_rivales','jugadores_rivales','equipo_rival_alineacion',
    'equipo_rival_banquillo','competitions'
  ] loop
    expected_trigger := case when target='jugadores'
      then 'transition_02_ficha_change_guard'
      when target='player_team_memberships'
      then 'transition_02_stage_change_guard'
      when target in ('players_database','player_positions','player_sources',
        'player_scouting_traits','legacy_own_player_migration')
      then 'transition_02_change_guard'
      when target in ('equipos_rivales','jugadores_rivales',
        'equipo_rival_alineacion','equipo_rival_banquillo','competitions')
      then 'transition_02_global_freeze_guard'
      else 'transition_02_row_write_guard' end;
    if not exists (select 1 from pg_trigger t
      where t.tgrelid=to_regclass(format('public.%I',target))
        and t.tgname=expected_trigger and t.tgenabled in ('O','A')
        and t.tgfoid=to_regprocedure('public.transition_02_row_write_guard_v1()')) then
      raise exception 'Guarda de escritura ausente o desactivada: %',target;
    end if;
    if target in ('jugadores','player_team_memberships','players_database',
       'player_positions','player_sources','player_scouting_traits',
       'legacy_own_player_migration') and not exists (
      select 1 from pg_trigger t
      where t.tgrelid=to_regclass(format('public.%I',target))
        and t.tgname=case when target='jugadores'
          then 'transition_02_ficha_insert_guard'
          when target='player_team_memberships'
          then 'transition_02_stage_insert_guard'
          else 'transition_02_insert_guard' end
        and t.tgenabled in ('O','A') and t.tgdeferrable and t.tginitdeferred
        and t.tgfoid=to_regprocedure('public.transition_02_row_write_guard_v1()')
    ) then raise exception 'Guarda diferida ausente: %',target; end if;
  end loop;
end $preflight$;

create or replace function public.can_write_club_team_season(
  target_club_team_season_id uuid
) returns boolean language sql stable security definer set search_path = pg_catalog
as $function$
  select coalesce(
    auth.uid() is not null
    and target_club_team_season_id is not null
    and public.can_read_club_team_season(target_club_team_season_id)
    and exists (
      select 1 from public.club_team_seasons relation
      join public.club_seasons season on season.id = relation.season_id
        and season.club_id = relation.club_id
      join public.operational_cts_v1 active
        on active.club_team_season_id = relation.id and active.singleton
      join public.club_memberships owner_membership
        on owner_membership.user_id = active.owner_user_id
        and owner_membership.club_id = relation.club_id
        and owner_membership.role = 'owner' and owner_membership.is_active
      where relation.id = target_club_team_season_id
        and season.status = 'open' and season.is_active
        and active.writes_enabled
    ), false
  );
$function$;
alter function public.can_write_club_team_season(uuid) owner to postgres;
revoke all on function public.can_write_club_team_season(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.can_write_club_team_season(uuid)
  to authenticated, service_role;

-- Las altas canonicas solo pasan por RPC SECURITY DEFINER con controles CTS.
-- Revocar el DML de tabla impide que un JWT inserte una etapa o CTSP para un
-- UUID privado conocido, aun cuando su RLS de lectura fuera permisivo.
create temporary table transition_02_service_acl_before on commit drop as
with target(name) as (values
  ('players_database'),('player_positions'),('player_sources'),
  ('player_scouting_traits'),('player_team_memberships'),
  ('club_team_season_players'),('legacy_jugador_cts_links_v1'),
  ('legacy_own_player_migration')
), operation(privilege) as (values ('INSERT'),('UPDATE'),('DELETE'))
select target.name, operation.privilege,
  has_table_privilege('service_role',
    to_regclass(format('public.%I',target.name)),operation.privilege) as was_allowed
from target cross join operation;

revoke insert, update, delete on table
  public.players_database, public.player_positions, public.player_sources,
  public.player_scouting_traits, public.player_team_memberships,
  public.club_team_season_players, public.legacy_jugador_cts_links_v1,
  public.legacy_own_player_migration
from public, anon, authenticated;

do $acl_check$
declare row_before record;
begin
  for row_before in select * from transition_02_service_acl_before loop
    if has_table_privilege('service_role',
      to_regclass(format('public.%I',row_before.name)),row_before.privilege)
      is distinct from row_before.was_allowed then
      raise exception 'Cambio inesperado del permiso service_role: %.%',
        row_before.name,row_before.privilege;
    end if;
    if has_table_privilege('authenticated',
      to_regclass(format('public.%I',row_before.name)),row_before.privilege)
      or has_table_privilege('anon',
      to_regclass(format('public.%I',row_before.name)),row_before.privilege) then
      raise exception 'DML directo sigue abierto: %.%',
        row_before.name,row_before.privilege;
    end if;
  end loop;
end $acl_check$;

-- TRUNCATE no dispara triggers de fila. Se revoca en todo el perimetro
-- protegido y se conserva el permiso efectivo previo de service_role.
create temporary table transition_02_truncate_acl_before on commit drop as
with target(name) as (values
  ('jugadores'),('partidos'),('partido_estadisticas_jugador'),
  ('partido_eventos_gol'),('match_quick_events'),('partido_alineacion_slots'),
  ('partido_eventos_sistema'),('partido_snapshots_tacticos'),
  ('partido_snapshot_tactico_slots'),('partido_eventos_post'),
  ('partido_convocados'),('partido_notas_individuales_pre'),
  ('partido_eventos_sustitucion'),('match_set_piece_takers'),
  ('match_set_piece_notes'),('match_set_piece_diagrams'),
  ('club_team_season_players'),('legacy_jugador_cts_links_v1'),
  ('player_team_memberships'),('players_database'),('player_positions'),
  ('player_sources'),('player_scouting_traits'),
  ('legacy_own_player_migration'),('equipos_rivales'),('jugadores_rivales'),
  ('equipo_rival_alineacion'),('equipo_rival_banquillo'),('competitions')
)
select target.name,
  has_table_privilege('service_role',
    to_regclass(format('public.%I',target.name)),'TRUNCATE') as service_was_allowed
from target;

do $revoke_truncate$
declare target record;
begin
  for target in select * from transition_02_truncate_acl_before loop
    execute format('revoke truncate on table public.%I from public, anon, authenticated',
      target.name);
    if has_table_privilege('service_role',
      to_regclass(format('public.%I',target.name)),'TRUNCATE')
      is distinct from target.service_was_allowed
      or has_table_privilege('authenticated',
        to_regclass(format('public.%I',target.name)),'TRUNCATE')
      or has_table_privilege('anon',
        to_regclass(format('public.%I',target.name)),'TRUNCATE') then
      raise exception 'Permiso TRUNCATE inesperado en public.%', target.name;
    end if;
  end loop;
end $revoke_truncate$;

-- El permiso de las RPC de Transicion 02 se habilita en el mismo COMMIT que
-- el helper de escritura historica. Si algo falla, ambos cambios revierten.
insert into public.operational_guard_versions_v1(version) values (1);
update public.operational_cts_v1
set guard_version = 1, writes_enabled = true where singleton;

do $post$
begin
  if not exists (select 1 from public.operational_cts_v1
    where singleton and writes_enabled and guard_version=1)
    or not exists (select 1 from public.operational_guard_versions_v1
      where version=1) then
    raise exception 'Corte operativo incompleto';
  end if;
end $post$;
commit;
