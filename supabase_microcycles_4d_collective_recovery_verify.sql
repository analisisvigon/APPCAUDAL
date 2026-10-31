-- Solo lectura. Ejecutar antes y despues de instalar 4D en Supabase SQL Editor.
-- READY_TO_APPLY: dependencias presentes y 4D ausente. PASS: estructura instalada.
-- No lee respuestas, nombres, notas ni datos personales.
with dependencies as (
  select count(*)=9 as ok from (values
    ('public.rpe_entries'),('public.wellness_entries'),('public.jugadores'),
    ('public.legacy_jugador_cts_links_v1'),('public.player_team_memberships'),
    ('public.club_team_season_players'),('public.club_team_seasons'),
    ('public.club_seasons'),('public.microcycle_physical_session_links')
  ) t(name) where pg_catalog.to_regclass(t.name) is not null
), objects as (
  select pg_catalog.to_regprocedure('public.attribute_collective_recovery_cts_4d()') as trigger_function,
    pg_catalog.to_regprocedure('public.get_microcycle_collective_recovery_4d(uuid,date)') as rpc,
    pg_catalog.to_regclass('public.rpe_entries') as rpe_table,
    pg_catalog.to_regclass('public.wellness_entries') as wellness_table
), checks as (
  select 'Dependencias canonicas'::text as name,(select ok from dependencies) as ok,true as prerequisite
  union all select 'Helper CTS de lectura',
    pg_catalog.to_regprocedure('public.can_read_club_team_season(uuid)') is not null,true
  union all select 'Columnas CTS nullable y UUID',
    (select count(*) from pg_catalog.pg_attribute a, objects o
      where a.attrelid in (o.rpe_table,o.wellness_table)
        and a.attname='club_team_season_id' and a.atttypid='uuid'::regtype
        and not a.attnotnull and not a.attisdropped)=2,false
  union all select 'FK CTS validadas y ON DELETE RESTRICT',
    (select count(*) from (values ('rpe_entries'),('wellness_entries')) e(name)
      join pg_catalog.pg_constraint c
        on c.conrelid=pg_catalog.to_regclass('public.' || e.name)
       and c.conname=e.name || '_cts_4d_fkey'
      where c.contype='f' and c.confrelid=pg_catalog.to_regclass('public.club_team_seasons')
        and c.convalidated and c.confdeltype='r' and c.conkey=array[(select a.attnum
          from pg_catalog.pg_attribute a where a.attrelid=c.conrelid
            and a.attname='club_team_season_id')]::smallint[])=2,false
  union all select 'Indices CTS/fecha validos',
    (select count(*) from (values ('rpe_entries'),('wellness_entries')) e(name)
      join pg_catalog.pg_index i
        on i.indexrelid=pg_catalog.to_regclass('public.' || e.name || '_cts_date_4d_idx')
       and i.indrelid=pg_catalog.to_regclass('public.' || e.name)
      where i.indisvalid and i.indisready and i.indnkeyatts=2 and not i.indisunique
        and i.indkey[0]=(select a.attnum from pg_catalog.pg_attribute a
          where a.attrelid=i.indrelid and a.attname='club_team_season_id')
        and i.indkey[1]=(select a.attnum from pg_catalog.pg_attribute a
          where a.attrelid=i.indrelid and a.attname='entry_date')
        and pg_catalog.regexp_replace(pg_catalog.lower(
          pg_catalog.pg_get_expr(i.indpred,i.indrelid)),
          '[[:space:]()]','','g')='club_team_season_idisnotnull')=2,false
  union all select 'Triggers activos y ligados al helper',
    (select count(*) from (values ('rpe_entries'),('wellness_entries')) e(name)
      join pg_catalog.pg_trigger t
        on t.tgrelid=pg_catalog.to_regclass('public.' || e.name)
       and t.tgname=e.name || '_attribute_cts_4d'
      cross join objects o
      where t.tgfoid=o.trigger_function and not t.tgisinternal and t.tgenabled='O'
        and (t.tgtype & 1)=1 and (t.tgtype & 2)=2
        and (t.tgtype & 4)=4 and (t.tgtype & 16)=16)=2,false
  union all select 'Funcion trigger PRIVADA, postgres y search_path fijo',
    coalesce((select p.prosecdef and p.proconfig=array['search_path=pg_catalog']::text[]
      and p.proowner=(select oid from pg_catalog.pg_roles where rolname='postgres')
      and p.prorettype='trigger'::regtype
      from pg_catalog.pg_proc p,objects o where p.oid=o.trigger_function),false),false
  union all select 'RPC STABLE y SECURITY DEFINER de postgres',
    coalesce((select p.prosecdef and p.provolatile='s'
      and p.proconfig=array['search_path=pg_catalog']::text[]
      and p.proowner=(select oid from pg_catalog.pg_roles where rolname='postgres')
      from pg_catalog.pg_proc p,objects o where p.oid=o.rpc),false),false
  union all select 'Firma de retorno: solo siete campos colectivos',
    coalesce((select pg_catalog.pg_get_function_result(o.rpc)=
      'TABLE(day_date date, rpe_average numeric, rpe_responses integer, rpe_state text, wellness_average numeric, wellness_responses integer, wellness_state text)'
      from objects o),false),false
  union all select 'Sin sobrecargas RPC',
    (select count(*) from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='get_microcycle_collective_recovery_4d')=1,false
  union all select 'Sin sobrecargas del trigger',
    (select count(*) from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='attribute_collective_recovery_cts_4d')=1,false
  union all select 'EXECUTE RPC: authenticated si, anon y PUBLIC no',
    coalesce((select pg_catalog.has_function_privilege('authenticated',o.rpc,'EXECUTE')
      and not pg_catalog.has_function_privilege('anon',o.rpc,'EXECUTE')
      and not exists(select 1 from pg_catalog.pg_proc p,
        pg_catalog.aclexplode(p.proacl) acl where p.oid=o.rpc
        and acl.grantee=0 and acl.privilege_type='EXECUTE')
      from objects o),false),false
  union all select 'EXECUTE trigger: clientes no',
    coalesce((select not pg_catalog.has_function_privilege('authenticated',o.trigger_function,'EXECUTE')
      and not pg_catalog.has_function_privilege('anon',o.trigger_function,'EXECUTE')
      and not exists(select 1 from pg_catalog.pg_proc p,
        pg_catalog.aclexplode(p.proacl) acl where p.oid=o.trigger_function
        and acl.grantee=0 and acl.privilege_type='EXECUTE')
      from objects o),false),false
  union all select 'RLS original sigue activa',
    (select count(*) from pg_catalog.pg_class c,objects o
      where c.oid in (o.rpe_table,o.wellness_table) and c.relrowsecurity)=2,true
  union all select 'Politicas 4D nuevas: ninguna',
    not exists(select 1 from pg_catalog.pg_policy p,objects o
      where p.polrelid in (o.rpe_table,o.wellness_table)
        and p.polname like '%4d%'),true
), summary as (
  select count(*) filter(where prerequisite and not ok) as blocked,
    count(*) filter(where not prerequisite and ok) as installed,
    count(*) filter(where not prerequisite) as required
  from checks
), result as (
  select 0 as position,'GLOBAL'::text as name,
    case when blocked>0 then 'BLOCKED'
      when installed=0 then 'READY_TO_APPLY'
      when installed=required then 'PASS' else 'BLOCKED' end as status,
    pg_catalog.format('%s/%s comprobaciones de instalacion',installed,required) as detail
  from summary
  union all
  select 1,name,case when ok then 'PASS' else
    case when prerequisite then 'BLOCKED' else 'PENDING' end end,
    case when prerequisite then 'Dependencia necesaria para instalar 4D'
      else 'Comprobacion estructural; no sustituye pruebas con identidades reales' end
  from checks
)
select name,status,detail from result order by position,name;
