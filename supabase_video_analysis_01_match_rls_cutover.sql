-- NEXO CLUB / Videoanalisis 01: aislamiento RLS de public.partidos.
-- PENDIENTE DE REVISION. NO EJECUTAR mientras existan partidos sin CTS
-- o el owner operativo no conserve membresia activa en todos los clubes
-- historicos afectados. Las precondiciones abortan en ambos casos.
-- No modifica datos, hijos de partidos ni funciones de autorizacion existentes.
begin;
-- Congela las escrituras mientras se comprueba que no entran nuevos partidos
-- sin CTS entre el preflight y el cambio de politica.
lock table public.partidos in share row exclusive mode;

do $pre$
declare
  v_policy record;
  v_helper record;
  v_old text;
  v_expected_count integer;
begin
  if auth.uid() is not null then
    raise exception 'Videoanalisis 01: ejecutar como administrador, sin JWT de usuario';
  end if;
  if current_user <> 'postgres' then
    raise exception 'Videoanalisis 01: ejecutar como postgres para conservar el propietario previsto del trigger';
  end if;
  if to_regclass('public.partidos') is null
     or to_regclass('public.club_team_seasons') is null
     or to_regclass('public.club_seasons') is null
     or to_regclass('public.club_memberships') is null
     or to_regclass('public.operational_cts_v1') is null then
    raise exception 'Videoanalisis 01: faltan tablas canónicas';
  end if;
  if to_regprocedure('public.can_read_club_team_season(uuid)') is null
     or to_regprocedure('public.can_write_club_team_season(uuid)') is null
     or to_regprocedure('public.can_read_match(uuid)') is null
     or to_regprocedure('public.can_write_match(uuid)') is null then
    raise exception 'Videoanalisis 01: faltan helpers de autorizacion';
  end if;
  for v_helper in
    select expected.signature, proc.oid, proc.prosecdef, proc.proowner,
           proc.proconfig
    from (values
      ('public.can_read_club_team_season(uuid)'),
      ('public.can_write_club_team_season(uuid)'),
      ('public.can_read_match(uuid)'),
      ('public.can_write_match(uuid)')
    ) as expected(signature)
    left join pg_catalog.pg_proc proc
      on proc.oid = to_regprocedure(expected.signature)
  loop
    if v_helper.oid is null or not v_helper.prosecdef
       or v_helper.proowner <> 'postgres'::regrole
       or not coalesce('search_path=pg_catalog' = any(v_helper.proconfig), false)
       or not pg_catalog.has_function_privilege(
         'authenticated', v_helper.oid, 'EXECUTE')
       or pg_catalog.has_function_privilege('anon', v_helper.oid, 'EXECUTE') then
      raise exception 'Videoanalisis 01: contrato de seguridad incompatible: %',
        v_helper.signature;
    end if;
  end loop;
  if not (select c.relrowsecurity from pg_catalog.pg_class c
          where c.oid = 'public.partidos'::regclass) then
    raise exception 'Videoanalisis 01: RLS de partidos no esta activado';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = 'public.partidos'::regclass
      and a.attname = 'club_team_season_id'
      and a.atttypid = 'uuid'::regtype and not a.attisdropped
  ) or not exists (
    select 1 from pg_catalog.pg_constraint fk
    where fk.conrelid = 'public.partidos'::regclass
      and fk.confrelid = 'public.club_team_seasons'::regclass
      and fk.contype = 'f' and fk.convalidated
      and fk.conkey = array[(select a.attnum from pg_catalog.pg_attribute a
        where a.attrelid = 'public.partidos'::regclass
          and a.attname = 'club_team_season_id' and not a.attisdropped)]::smallint[]
      and fk.confkey = array[(select a.attnum from pg_catalog.pg_attribute a
        where a.attrelid = 'public.club_team_seasons'::regclass
          and a.attname = 'id' and not a.attisdropped)]::smallint[]
      and fk.confdeltype = 'r'
  ) then
    raise exception 'Videoanalisis 01: falta columna UUID o FK validada a CTS';
  end if;
  if exists (select 1 from public.partidos p where p.club_team_season_id is null) then
    raise exception 'Videoanalisis 01 BLOQUEADA: existen partidos sin CTS; conciliarlos expresamente antes del corte';
  end if;
  -- can_read_club_team_season exige membresia activa en el club del CTS.
  -- Este guard impide ocultar partidos historicos al owner operativo.
  if (select count(*) from public.operational_cts_v1) <> 1 then
    raise exception 'Videoanalisis 01 BLOQUEADA: owner operativo no designado univocamente';
  end if;
  if exists (
    select 1
    from public.partidos match_row
    join public.club_team_seasons cts
      on cts.id = match_row.club_team_season_id
    cross join public.operational_cts_v1 active
    where not exists (
      select 1 from public.club_memberships membership
      where membership.user_id = active.owner_user_id
        and membership.club_id = cts.club_id
        and membership.role = 'owner' and membership.is_active
    )
  ) then
    raise exception 'Videoanalisis 01 BLOQUEADA: owner operativo perderia acceso a partidos historicos de otro club';
  end if;
  select count(*) into v_expected_count
  from pg_catalog.pg_policy p where p.polrelid = 'public.partidos'::regclass;
  if v_expected_count <> 4 then
    raise exception 'Videoanalisis 01: se esperaban exactamente cuatro politicas de partidos; hay %', v_expected_count;
  end if;
  for v_policy in
    select p.*, pg_catalog.pg_get_expr(p.polqual, p.polrelid) as using_expr,
           pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) as check_expr
    from pg_catalog.pg_policy p
    where p.polrelid = 'public.partidos'::regclass
  loop
    if not v_policy.polpermissive
       or v_policy.polroles <> array['authenticated'::regrole::oid]
       or (v_policy.polname, v_policy.polcmd::text) not in (
         ('player_sports_staff_select', 'r'),
         ('player_sports_staff_insert', 'a'),
         ('player_sports_staff_update', 'w'),
         ('player_sports_staff_delete', 'd')) then
      raise exception 'Videoanalisis 01: politica inesperada %', v_policy.polname;
    end if;
    v_old := lower(pg_catalog.regexp_replace(
      replace(coalesce(v_policy.using_expr, v_policy.check_expr, ''), 'public.', ''),
      '[[:space:]()]', '', 'g'));
    if v_old <> 'is_app_staff' then
      raise exception 'Videoanalisis 01: expresion anterior inesperada en %: %',
        v_policy.polname, v_old;
    end if;
    if v_policy.polcmd::text = 'w' and lower(pg_catalog.regexp_replace(
      replace(coalesce(v_policy.check_expr, ''), 'public.', ''),
      '[[:space:]()]', '', 'g')) <> 'is_app_staff' then
      raise exception 'Videoanalisis 01: WITH CHECK anterior inesperado en UPDATE';
    end if;
  end loop;
  if to_regprocedure('public.video_analysis_01_guard_match_cts()') is not null
     or exists (select 1 from pg_catalog.pg_trigger t
                where t.tgrelid = 'public.partidos'::regclass
                  and t.tgname = 'video_analysis_01_guard_match_cts') then
    raise exception 'Videoanalisis 01: guard CTS de este cambio ya existe o es incompatible';
  end if;
  if exists (select 1 from pg_catalog.pg_trigger t
             where t.tgrelid = 'public.partidos'::regclass
               and not t.tgisinternal
               and pg_catalog.pg_get_triggerdef(t.oid) ilike '%update of club_team_season_id%') then
    raise exception 'Videoanalisis 01: ya existe un trigger sobre cambios CTS; revisar antes de duplicarlo';
  end if;
end
$pre$;

-- Una politica UPDATE no puede comparar OLD y NEW. AFTER UPDATE observa la
-- fila final, incluso si otro trigger BEFORE modifica el CTS indirectamente.
create function public.video_analysis_01_guard_match_cts()
returns trigger language plpgsql set search_path = pg_catalog
as $function$
begin
  if new.club_team_season_id is distinct from old.club_team_season_id then
    raise exception 'PARTIDO_CTS_IMMUTABLE' using errcode = '23514';
  end if;
  return new;
end
$function$;
revoke all on function public.video_analysis_01_guard_match_cts()
  from public, anon, authenticated, service_role;
create trigger video_analysis_01_guard_match_cts
after update on public.partidos
for each row execute function public.video_analysis_01_guard_match_cts();

alter policy player_sports_staff_select on public.partidos
  to authenticated using (public.can_read_club_team_season(club_team_season_id));
alter policy player_sports_staff_insert on public.partidos
  to authenticated with check (public.can_write_club_team_season(club_team_season_id));
alter policy player_sports_staff_update on public.partidos
  to authenticated
  using (public.can_write_club_team_season(club_team_season_id))
  with check (public.can_write_club_team_season(club_team_season_id));
alter policy player_sports_staff_delete on public.partidos
  to authenticated using (public.can_write_club_team_season(club_team_season_id));

do $post$
declare
  v_count integer;
begin
  select count(*) into v_count from pg_catalog.pg_policy p
  where p.polrelid = 'public.partidos'::regclass
    and p.polpermissive and p.polroles = array['authenticated'::regrole::oid]
    and (
      (p.polname = 'player_sports_staff_select' and p.polcmd::text = 'r'
        and lower(pg_catalog.regexp_replace(replace(pg_catalog.pg_get_expr(p.polqual,p.polrelid),'public.',''),'[[:space:]()]','','g')) = 'can_read_club_team_seasonclub_team_season_id')
      or (p.polname = 'player_sports_staff_insert' and p.polcmd::text = 'a'
        and lower(pg_catalog.regexp_replace(replace(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),'public.',''),'[[:space:]()]','','g')) = 'can_write_club_team_seasonclub_team_season_id')
      or (p.polname = 'player_sports_staff_update' and p.polcmd::text = 'w'
        and lower(pg_catalog.regexp_replace(replace(pg_catalog.pg_get_expr(p.polqual,p.polrelid),'public.',''),'[[:space:]()]','','g')) = 'can_write_club_team_seasonclub_team_season_id'
        and lower(pg_catalog.regexp_replace(replace(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),'public.',''),'[[:space:]()]','','g')) = 'can_write_club_team_seasonclub_team_season_id')
      or (p.polname = 'player_sports_staff_delete' and p.polcmd::text = 'd'
        and lower(pg_catalog.regexp_replace(replace(pg_catalog.pg_get_expr(p.polqual,p.polrelid),'public.',''),'[[:space:]()]','','g')) = 'can_write_club_team_seasonclub_team_season_id')
    );
  if v_count <> 4 or (select count(*) from pg_catalog.pg_policy p
                      where p.polrelid = 'public.partidos'::regclass) <> 4 then
    raise exception 'Videoanalisis 01: postcondicion RLS incumplida';
  end if;
  if exists (select 1 from public.partidos where club_team_season_id is null) then
    raise exception 'Videoanalisis 01: partido sin CTS detectado en postcondicion';
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger t
                 where t.tgrelid = 'public.partidos'::regclass
                   and t.tgname = 'video_analysis_01_guard_match_cts'
                   and not t.tgisinternal and t.tgenabled in ('O','A')
                   and t.tgtype = 17
                   and t.tgfoid = 'public.video_analysis_01_guard_match_cts()'::regprocedure)
  then raise exception 'Videoanalisis 01: trigger de identidad CTS ausente'; end if;
end
$post$;
commit;
