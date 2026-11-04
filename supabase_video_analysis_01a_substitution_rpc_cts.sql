-- NEXO CLUB / Videoanalisis 01A: cerrar las policies hijas de sustituciones.
-- PENDIENTE DE REVISION. NO EJECUTAR sin comprobar el verificador previo.
-- Las dos RPC desplegadas ya usan can_read_match/can_write_match y se conservan.
-- No modifica funciones, grants, datos ni la policy de public.partidos.

begin;
lock table public.partido_eventos_sustitucion in share row exclusive mode;
lock table public.partido_estadisticas_jugador in share row exclusive mode;

do $pre$
declare
  v_rpc record;
  v_helper record;
  v_policy record;
  v_stats_old_count integer;
  v_stats_new_count integer;
begin
  if current_user <> 'postgres' or auth.uid() is not null then
    raise exception 'Videoanalisis 01A: ejecutar como postgres sin JWT de usuario';
  end if;
  if pg_catalog.to_regclass('public.partidos') is null
     or pg_catalog.to_regclass('public.partido_eventos_sustitucion') is null
     or pg_catalog.to_regclass('public.partido_estadisticas_jugador') is null then
    raise exception 'Videoanalisis 01A: faltan tablas deportivas';
  end if;

  -- Las huellas son de los cuerpos completos facilitados por el inventario
  -- de produccion. No se acepta un guard textual aislado ni otra sobrecarga.
  for v_rpc in
    select expected.signature, expected.name, expected.source_md5,
           expected.volatility, expected.defaults, expected.arg_names,
           routine.oid, routine.prosrc, routine.prokind, routine.prorettype,
           routine.prolang, routine.provolatile, routine.pronargdefaults,
           routine.proargnames, routine.proowner, routine.prosecdef,
           routine.proconfig
    from (values
      ('public.mutate_match_substitution_atomic(text,uuid,uuid,jsonb,integer)',
       'mutate_match_substitution_atomic',
       '97269e30607ddad0a54900f1b05f5f63','v',1,
       array['p_operation','p_partido_id','p_event_id','p_event',
             'p_match_duration']::text[]),
      ('public.get_match_substitution_events(uuid)',
       'get_match_substitution_events',
       'f86960348fed755eecee4315b75858b8','s',0,
       array['p_partido_id']::text[])
    ) as expected(signature,name,source_md5,volatility,defaults,arg_names)
    left join pg_catalog.pg_proc routine
      on routine.oid = pg_catalog.to_regprocedure(expected.signature)
  loop
    if v_rpc.oid is null
       or (select count(*) from pg_catalog.pg_proc routine
           join pg_catalog.pg_namespace namespace
             on namespace.oid = routine.pronamespace
           where namespace.nspname = 'public'
             and routine.proname = v_rpc.name) <> 1
       or v_rpc.prokind <> 'f'
       or v_rpc.prorettype <> 'jsonb'::regtype
       or v_rpc.prolang <> (select language.oid
           from pg_catalog.pg_language language
           where language.lanname = 'plpgsql')
       or v_rpc.provolatile::text <> v_rpc.volatility
       or v_rpc.pronargdefaults <> v_rpc.defaults
       or v_rpc.proargnames is distinct from v_rpc.arg_names
       or v_rpc.proowner <> 'postgres'::regrole
       or not v_rpc.prosecdef
       or v_rpc.proconfig is distinct from
         array['search_path=pg_catalog']::text[]
       or pg_catalog.md5(pg_catalog.replace(
         v_rpc.prosrc,E'\r\n',E'\n')) <> v_rpc.source_md5
       or not pg_catalog.has_function_privilege(
         'authenticated',v_rpc.oid,'EXECUTE')
       or not pg_catalog.has_function_privilege(
         'service_role',v_rpc.oid,'EXECUTE')
       or pg_catalog.has_function_privilege('anon',v_rpc.oid,'EXECUTE')
       or exists (select 1 from pg_catalog.aclexplode(coalesce(
           (select p.proacl from pg_catalog.pg_proc p where p.oid=v_rpc.oid),
           pg_catalog.acldefault('f',v_rpc.proowner))) acl
           where acl.grantee=0 and acl.privilege_type='EXECUTE') then
      raise exception 'Videoanalisis 01A: RPC desplegada incompatible: %',
        v_rpc.signature;
    end if;
  end loop;

  for v_helper in
    select expected.signature, expected.source_md5, routine.oid,
           routine.prosrc, routine.proowner, routine.prosecdef,
           routine.proconfig
    from (values
      ('public.can_read_club_team_season(uuid)',
       'bbb2e5a9a81767749a2a26504a890442'),
      ('public.can_write_club_team_season(uuid)',
       'fc4a0e2c43689095da249ca834a2bde1'),
      ('public.can_read_match(uuid)',
       'ff69e4e15caed0a5e65f856ddfd94e61'),
      ('public.can_write_match(uuid)',
       '6bab76b45b9983a45a3a3dcb378a0096')
    ) as expected(signature,source_md5)
    left join pg_catalog.pg_proc routine
      on routine.oid=pg_catalog.to_regprocedure(expected.signature)
  loop
    if v_helper.oid is null or not v_helper.prosecdef
       or v_helper.proowner <> 'postgres'::regrole
       or v_helper.proconfig is distinct from
         array['search_path=pg_catalog']::text[]
       or pg_catalog.md5(pg_catalog.replace(
         v_helper.prosrc,E'\r\n',E'\n')) <> v_helper.source_md5
       or not pg_catalog.has_function_privilege(
         'authenticated',v_helper.oid,'EXECUTE')
       or pg_catalog.has_function_privilege('anon',v_helper.oid,'EXECUTE') then
      raise exception 'Videoanalisis 01A: helper incompatible: %',
        v_helper.signature;
    end if;
  end loop;

  if not coalesce((select relation.relrowsecurity
      from pg_catalog.pg_class relation
      where relation.oid='public.partido_eventos_sustitucion'::regclass),false)
     or (select count(*) from pg_catalog.pg_policy policy
       where policy.polrelid='public.partido_eventos_sustitucion'::regclass) <> 1
     or not pg_catalog.has_table_privilege(
       'authenticated','public.partido_eventos_sustitucion','SELECT')
     or pg_catalog.has_table_privilege(
       'authenticated','public.partido_eventos_sustitucion','INSERT')
     or pg_catalog.has_table_privilege(
       'authenticated','public.partido_eventos_sustitucion','UPDATE')
     or pg_catalog.has_table_privilege(
       'authenticated','public.partido_eventos_sustitucion','DELETE')
     or pg_catalog.has_table_privilege(
       'authenticated','public.partido_eventos_sustitucion','TRUNCATE')
     or pg_catalog.has_table_privilege(
       'authenticated','public.partido_eventos_sustitucion','TRIGGER')
     or pg_catalog.has_table_privilege(
       'anon','public.partido_eventos_sustitucion','TRUNCATE') then
    raise exception 'Videoanalisis 01A: RLS o grants de sustituciones incompatibles';
  end if;
  select policy.polname, policy.polcmd::text as command_code,
         policy.polpermissive, policy.polroles,
         lower(pg_catalog.regexp_replace(replace(coalesce(
           pg_catalog.pg_get_expr(policy.polqual,policy.polrelid),''),
           'public.',''),'[[:space:]()]','','g')) as using_normalized,
         lower(pg_catalog.regexp_replace(replace(coalesce(
           pg_catalog.pg_get_expr(policy.polwithcheck,policy.polrelid),''),
           'public.',''),'[[:space:]()]','','g')) as check_normalized
    into v_policy
  from pg_catalog.pg_policy policy
  where policy.polrelid='public.partido_eventos_sustitucion'::regclass;
  if v_policy.polname <> 'substitution_staff_select'
     or v_policy.command_code <> 'r'
     or not v_policy.polpermissive
     or v_policy.polroles <> array['authenticated'::regrole::oid]
     or v_policy.check_normalized <> ''
     or v_policy.using_normalized not in (
       'is_app_staff','can_read_matchpartido_id') then
    raise exception 'Videoanalisis 01A: policy de sustituciones incompatible';
  end if;

  if not coalesce((select relation.relrowsecurity
      from pg_catalog.pg_class relation
      where relation.oid='public.partido_estadisticas_jugador'::regclass),false)
     or (select count(*) from pg_catalog.pg_policy policy
       where policy.polrelid='public.partido_estadisticas_jugador'::regclass) <> 4
     or not (pg_catalog.has_table_privilege(
       'authenticated','public.partido_estadisticas_jugador','SELECT')
       and pg_catalog.has_table_privilege(
       'authenticated','public.partido_estadisticas_jugador','INSERT')
       and pg_catalog.has_table_privilege(
       'authenticated','public.partido_estadisticas_jugador','UPDATE')
       and pg_catalog.has_table_privilege(
       'authenticated','public.partido_estadisticas_jugador','DELETE'))
     or pg_catalog.has_table_privilege(
       'authenticated','public.partido_estadisticas_jugador','TRUNCATE')
     or pg_catalog.has_table_privilege(
       'authenticated','public.partido_estadisticas_jugador','TRIGGER')
     or pg_catalog.has_table_privilege(
       'anon','public.partido_estadisticas_jugador','TRUNCATE') then
    raise exception 'Videoanalisis 01A: RLS o grants de estadisticas incompatibles';
  end if;
  with expected(name,command_code,old_using,old_check,new_using,new_check) as (
    values
      ('player_sports_staff_select','r','is_app_staff','',
       'can_read_matchpartido_id',''),
      ('player_sports_staff_insert','a','','is_app_staff',
       '','can_write_matchpartido_id'),
      ('player_sports_staff_update','w','is_app_staff','is_app_staff',
       'can_write_matchpartido_id','can_write_matchpartido_id'),
      ('player_sports_staff_delete','d','is_app_staff','',
       'can_write_matchpartido_id','')
  ), actual as (
    select policy.polname, policy.polcmd::text as command_code,
           policy.polpermissive, policy.polroles,
           lower(pg_catalog.regexp_replace(replace(coalesce(
             pg_catalog.pg_get_expr(policy.polqual,policy.polrelid),''),
             'public.',''),'[[:space:]()]','','g')) as using_expr,
           lower(pg_catalog.regexp_replace(replace(coalesce(
             pg_catalog.pg_get_expr(policy.polwithcheck,policy.polrelid),''),
             'public.',''),'[[:space:]()]','','g')) as check_expr
    from pg_catalog.pg_policy policy
    where policy.polrelid='public.partido_estadisticas_jugador'::regclass
  )
  select count(*) filter (where actual.polpermissive
      and actual.polroles=array['authenticated'::regrole::oid]
      and actual.using_expr=expected.old_using
      and actual.check_expr=expected.old_check),
         count(*) filter (where actual.polpermissive
      and actual.polroles=array['authenticated'::regrole::oid]
      and actual.using_expr=expected.new_using
      and actual.check_expr=expected.new_check)
  into v_stats_old_count,v_stats_new_count
  from expected
  left join actual on actual.polname=expected.name
    and actual.command_code=expected.command_code;
  if v_stats_old_count <> 4 and v_stats_new_count <> 4 then
    raise exception 'Videoanalisis 01A: policies de estadisticas mixtas o incompatibles';
  end if;
end
$pre$;

alter policy substitution_staff_select on public.partido_eventos_sustitucion
  to authenticated using (public.can_read_match(partido_id));
alter policy player_sports_staff_select on public.partido_estadisticas_jugador
  to authenticated using (public.can_read_match(partido_id));
alter policy player_sports_staff_insert on public.partido_estadisticas_jugador
  to authenticated with check (public.can_write_match(partido_id));
alter policy player_sports_staff_update on public.partido_estadisticas_jugador
  to authenticated
  using (public.can_write_match(partido_id))
  with check (public.can_write_match(partido_id));
alter policy player_sports_staff_delete on public.partido_estadisticas_jugador
  to authenticated using (public.can_write_match(partido_id));

do $post$
declare
  v_count integer;
begin
  -- No se toca el cuerpo ni los privilegios de las RPC ya instaladas.
  if not exists (select 1 from pg_catalog.pg_proc routine
      where routine.oid=pg_catalog.to_regprocedure(
        'public.mutate_match_substitution_atomic(text,uuid,uuid,jsonb,integer)')
        and pg_catalog.md5(pg_catalog.replace(
          routine.prosrc,E'\r\n',E'\n'))='97269e30607ddad0a54900f1b05f5f63')
     or not exists (select 1 from pg_catalog.pg_proc routine
      where routine.oid=pg_catalog.to_regprocedure(
        'public.get_match_substitution_events(uuid)')
        and pg_catalog.md5(pg_catalog.replace(
          routine.prosrc,E'\r\n',E'\n'))='f86960348fed755eecee4315b75858b8') then
    raise exception 'Videoanalisis 01A: RPC cambiada durante la transaccion';
  end if;
  if (select count(*) from pg_catalog.pg_policy policy
      where policy.polrelid='public.partido_eventos_sustitucion'::regclass) <> 1
     or not exists (select 1 from pg_catalog.pg_policy policy
      where policy.polrelid='public.partido_eventos_sustitucion'::regclass
        and policy.polname='substitution_staff_select'
        and policy.polcmd::text='r' and policy.polpermissive
        and policy.polroles=array['authenticated'::regrole::oid]
        and lower(pg_catalog.regexp_replace(replace(coalesce(
          pg_catalog.pg_get_expr(policy.polqual,policy.polrelid),''),
          'public.',''),'[[:space:]()]','','g'))='can_read_matchpartido_id'
        and policy.polwithcheck is null) then
    raise exception 'Videoanalisis 01A: policy de sustituciones no protegida';
  end if;
  with expected(name,command_code,using_expr,check_expr) as (
    values
      ('player_sports_staff_select','r','can_read_matchpartido_id',''),
      ('player_sports_staff_insert','a','','can_write_matchpartido_id'),
      ('player_sports_staff_update','w','can_write_matchpartido_id',
       'can_write_matchpartido_id'),
      ('player_sports_staff_delete','d','can_write_matchpartido_id','')
  )
  select count(*) into v_count
  from expected
  join pg_catalog.pg_policy policy
    on policy.polrelid='public.partido_estadisticas_jugador'::regclass
   and policy.polname=expected.name
   and policy.polcmd::text=expected.command_code
   and policy.polpermissive
   and policy.polroles=array['authenticated'::regrole::oid]
   and lower(pg_catalog.regexp_replace(replace(coalesce(
     pg_catalog.pg_get_expr(policy.polqual,policy.polrelid),''),
     'public.',''),'[[:space:]()]','','g'))=expected.using_expr
   and lower(pg_catalog.regexp_replace(replace(coalesce(
     pg_catalog.pg_get_expr(policy.polwithcheck,policy.polrelid),''),
     'public.',''),'[[:space:]()]','','g'))=expected.check_expr;
  if v_count <> 4
     or (select count(*) from pg_catalog.pg_policy policy
       where policy.polrelid='public.partido_estadisticas_jugador'::regclass) <> 4
     or not coalesce((select relation.relrowsecurity
       from pg_catalog.pg_class relation
       where relation.oid='public.partido_estadisticas_jugador'::regclass),false)
     or not coalesce((select relation.relrowsecurity
       from pg_catalog.pg_class relation
       where relation.oid='public.partido_eventos_sustitucion'::regclass),false) then
    raise exception 'Videoanalisis 01A: postcondicion RLS de tablas hijas incumplida';
  end if;
end
$post$;

commit;
