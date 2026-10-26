-- SOLO LECTURA. Verificador estructural; los permisos por identidad exigen pruebas aparte.
with objects as (
  select to_regclass('public.planned_microcycles') as table_oid,
    to_regprocedure('public.guard_planned_microcycle_2b()') as guard_oid,
    to_regprocedure('public.save_planned_microcycle_2b(uuid,date,integer,jsonb,jsonb)') as save_oid
), checks as (
  select 'Tabla y comentario' as check_name,
    (table_oid is not null and obj_description(table_oid,'pg_class')=
      'NEXO CLUB Microciclos 2B: planificación por CTS y lunes') as ok,
    'Tabla propia de 2B' as detail from objects
  union all select 'RLS activo',coalesce((select relrowsecurity from pg_class where oid=table_oid),false),
    'RLS de lectura por CTS' from objects
  union all select 'Clave CTS + lunes',exists(select 1 from pg_constraint
      where conrelid=table_oid and conname='planned_microcycles_week_key'
        and contype='u' and convalidated and
        conkey=array[
          (select attnum from pg_attribute where attrelid=table_oid and attname='club_team_season_id' and not attisdropped),
          (select attnum from pg_attribute where attrelid=table_oid and attname='week_starts_on' and not attisdropped)
        ]::smallint[]),
    'Una planificación por equipo-temporada y semana' from objects
  union all select 'Checks de lunes, revisión y tamaño',
    (select count(*)=3 from pg_constraint where conrelid=table_oid and contype='c'
      and convalidated and conname in ('planned_microcycles_monday_check',
        'planned_microcycles_revision_check','planned_microcycles_payload_size_check')),
    'Restricciones básicas validadas' from objects
  union all select 'FK CTS validada y RESTRICT',exists(select 1 from pg_constraint
      where conrelid=table_oid and confrelid=to_regclass('public.club_team_seasons')
        and contype='f' and convalidated and confdeltype='r' and
        conkey=array[(select attnum from pg_attribute where attrelid=table_oid
          and attname='club_team_season_id' and not attisdropped)]::smallint[] and
        confkey=array[(select attnum from pg_attribute where
          attrelid=to_regclass('public.club_team_seasons') and attname='id' and not attisdropped)]::smallint[]),
    'Pertenencia canónica' from objects
  union all select 'Índice semanal válido',exists(select 1 from pg_class i join pg_index x on x.indexrelid=i.oid
      where i.relnamespace='public'::regnamespace and i.relname='planned_microcycles_week_idx'
        and x.indrelid=table_oid and x.indisvalid and x.indnkeyatts=2 and not x.indisunique
        and x.indkey[0]=(select attnum from pg_attribute where
          attrelid=table_oid and attname='week_starts_on' and not attisdropped)
        and x.indkey[1]=(select attnum from pg_attribute where
          attrelid=table_oid and attname='club_team_season_id' and not attisdropped)),
    'Índice para consulta semanal' from objects
  union all select 'Guard activo',exists(select 1 from pg_trigger
      where tgrelid=table_oid and tgfoid=guard_oid and tgname='planned_microcycles_guard'
        and not tgisinternal and tgenabled='O'),
    'Validación de identidad, temporada y JSON' from objects
  union all select 'Guard SECURITY DEFINER y search_path',exists(select 1 from pg_proc p
      where p.oid=guard_oid and p.prosecdef and
        p.proconfig @> array['search_path=pg_catalog']::text[] and
        p.proowner=(select oid from pg_roles where rolname='postgres')),
    'Protección de filas con propietario esperado' from objects
  union all select 'Única política SELECT CTS',
    (select count(*)=1 and bool_and(polcmd='r' and polpermissive and
      polroles=array[(select oid from pg_roles where rolname='authenticated')]::oid[] and
      regexp_replace(pg_get_expr(polqual,polrelid),'[[:space:]()]','','g') in
        ('can_read_club_team_seasonclub_team_season_id',
         'public.can_read_club_team_seasonclub_team_season_id'))
      from pg_policy where polrelid=table_oid),
    'Expresión y rol exactos; revisar además con identidades' from objects
  union all select 'Sin escritura directa authenticated',
    case when table_oid is null then false else
      not has_table_privilege('authenticated',table_oid,'INSERT') and
      not has_table_privilege('authenticated',table_oid,'UPDATE') and
      not has_table_privilege('authenticated',table_oid,'DELETE') end,
    'La escritura solo debe pasar por RPC' from objects
  union all select 'Sin acceso SQL anon',
    case when table_oid is null then false else
      not has_table_privilege('anon',table_oid,'SELECT') and
      not has_table_privilege('anon',table_oid,'INSERT') and
      not has_table_privilege('anon',table_oid,'UPDATE') and
      not has_table_privilege('anon',table_oid,'DELETE') end,
    'RLS y privilegios SQL niegan acceso anónimo' from objects
  union all select 'EXECUTE RPC',
    case when save_oid is null then false else
      has_function_privilege('authenticated',save_oid,'EXECUTE') and
      not has_function_privilege('anon',save_oid,'EXECUTE') and
      not exists(select 1 from pg_proc p cross join lateral aclexplode(
        coalesce(p.proacl,acldefault('f',p.proowner))) acl
        where p.oid=save_oid and acl.grantee=0 and acl.privilege_type='EXECUTE') end,
    'Permisos efectivos de ejecución' from objects
  union all select 'SECURITY DEFINER y search_path',exists(select 1 from pg_proc p
      where p.oid=save_oid and p.prosecdef and p.provolatile='v' and
        p.proconfig @> array['search_path=pg_catalog']::text[] and
        p.proowner=(select oid from pg_roles where rolname='postgres')),
    'RPC con catálogo cualificado' from objects
), report as (
  select check_name,case when ok then 'PASS' else 'FAIL' end as result,detail from checks
  union all select 'GLOBAL',case when bool_and(coalesce(ok,false)) then 'PASS' else 'FAIL' end,
    'Solo estructura; faltan pruebas con identidades, no regresión y recarga real' from checks
)
select * from report order by case when check_name='GLOBAL' then 1 else 0 end,check_name;
