-- TRANSICION 02 / CORTE FUTURO. NO INSTALAR AHORA.
-- Requiere: CTS Libia creado, respaldo restaurable, 03C instalado y verificado,
-- todas las rutas historicas ajenas al perimetro 03C cerradas y ensayos
-- negativos de SQL directo y RPC completados. Este archivo solo restringe el
-- helper comun del perimetro 03C al CTS unico de operational_cts_v1.
-- No crea clubes, no modifica datos y no cambia politicas.
begin;

do $preflight$
declare helper record; target text; write_guard text; policy_row record;
begin
  -- Interbloqueo deliberado: el perimetro 03C no cubre todas las rutas
  -- indirectas de perfiles, documentos, Storage y modulos deportivos.
  -- Retirar este bloqueo solo en una revision posterior con pruebas negativas
  -- de esas rutas y del portal PLAYER documentadas y aprobadas.
  raise exception 'ARCHIVE_CUTOVER_BLOCKED_PENDING_INDIRECT_WRITE_PROTECTION';
  if auth.uid() is not null then raise exception 'Instalar sin JWT de usuario'; end if;
  if to_regclass('public.operational_cts_v1') is null
    or (select count(*) from public.operational_cts_v1) <> 1 then
    raise exception 'Debe existir exactamente un CTS operativo designado';
  end if;
  if exists (select 1 from public.operational_cts_v1 where writes_enabled) then
    raise exception 'La activacion operativa ya se realizo';
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
        and season.status = 'open'
    ), false
  );
$function$;
alter function public.can_write_club_team_season(uuid) owner to postgres;
revoke all on function public.can_write_club_team_season(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.can_write_club_team_season(uuid)
  to authenticated, service_role;

-- El permiso de las RPC de Transicion 02 se habilita en el mismo COMMIT que
-- el helper de escritura historica. Si algo falla, ambos cambios revierten.
update public.operational_cts_v1 set writes_enabled = true where singleton;

do $post$
begin
  if position('public.operational_cts_v1' in
    (select prosrc from pg_proc where oid =
      to_regprocedure('public.can_write_club_team_season(uuid)'))) = 0 then
    raise exception 'Helper operativo no instalado';
  end if;
end $post$;
commit;
