-- Solo lectura. Ejecutar antes y después de instalar la migración.
with objects as (
  select to_regclass('public.planned_training_sessions') as sessions_oid,
    to_regprocedure('public.save_planned_session_mc_v4(uuid,integer,integer)') as rpc_oid,
    to_regprocedure('public.guard_planned_session_mc_v4()') as guard_oid
), structure as (
  select o.*,
    exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=o.sessions_oid
      and a.attname='mc_number' and a.atttypid='pg_catalog.int4'::regtype
      and not a.attisdropped and not a.attnotnull) as column_ok,
    exists(select 1 from pg_catalog.pg_constraint c where c.conrelid=o.sessions_oid
      and c.conname='planned_sessions_mc_v4_check' and c.contype='c' and c.convalidated) as check_ok,
    exists(select 1 from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid=i.indexrelid
      where i.indrelid=o.sessions_oid and c.relname='planned_sessions_mc_v4_idx'
        and i.indisvalid and i.indisready and not i.indisunique and i.indnkeyatts=3
        and pg_catalog.pg_get_indexdef(i.indexrelid,1,true)='club_team_season_id'
        and pg_catalog.pg_get_indexdef(i.indexrelid,2,true)='mc_number'
        and pg_catalog.pg_get_indexdef(i.indexrelid,3,true)='session_date'
        and i.indpred is not null) as index_ok,
    exists(select 1 from pg_catalog.pg_trigger t where t.tgrelid=o.sessions_oid
      and t.tgname='planned_sessions_mc_v4_guard' and not t.tgisinternal
      and t.tgenabled='O' and t.tgfoid=o.guard_oid) as trigger_ok,
    exists(select 1 from pg_catalog.pg_proc p where p.oid=o.rpc_oid
      and p.prosecdef and p.proconfig @> array['search_path=pg_catalog']::text[]
      and pg_catalog.pg_get_userbyid(p.proowner)='postgres') as rpc_security_ok,
    exists(select 1 from pg_catalog.pg_proc p where p.oid=o.guard_oid
      and p.prosecdef and p.proconfig @> array['search_path=pg_catalog']::text[]
      and pg_catalog.pg_get_userbyid(p.proowner)='postgres') as guard_security_ok,
    coalesce(pg_catalog.has_function_privilege('authenticated',o.rpc_oid::oid,'EXECUTE'),false) as authenticated_execute,
    coalesce(pg_catalog.has_function_privilege('service_role',o.rpc_oid::oid,'EXECUTE'),false) as service_execute,
    coalesce(pg_catalog.has_function_privilege('anon',o.rpc_oid::oid,'EXECUTE'),false) as anon_execute,
    exists(select 1 from pg_catalog.pg_proc p,
      lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl
      where p.oid=o.rpc_oid and acl.grantee=0 and acl.privilege_type='EXECUTE') as public_execute
  from objects o
), assigned as (
  select s.id,s.club_team_season_id,s.session_date,
    (to_jsonb(s)->>'mc_number')::integer as mc_number,
    pg_catalog.date_trunc('week',s.session_date::timestamp)::date as monday
  from public.planned_training_sessions s
), checks as (
  select 'Columna nullable mc_number' as comprobacion,column_ok as ok from structure
  union all select 'CHECK validado',check_ok from structure
  union all select 'Índice válido',index_ok from structure
  union all select 'Trigger activo y vinculado',trigger_ok from structure
  union all select 'RPC SECURITY DEFINER segura',rpc_security_ok from structure
  union all select 'Guard SECURITY DEFINER seguro',guard_security_ok from structure
  union all select 'EXECUTE authenticated',authenticated_execute from structure
  union all select 'EXECUTE service_role',service_execute from structure
  union all select 'EXECUTE anon denegado',not anon_execute from structure
  union all select 'EXECUTE PUBLIC denegado',not public_execute from structure
  union all select 'MC sin rango inválido',not exists(select 1 from assigned
    where mc_number is not null and (mc_number<1 or mc_number>9999))
  union all select 'Una semana, un número',not exists(select 1 from assigned a
    join assigned b on b.club_team_season_id=a.club_team_season_id
      and b.monday=a.monday and b.id>a.id
    where a.mc_number is not null and b.mc_number is not null
      and a.mc_number<>b.mc_number)
  union all select 'Un número, una semana',not exists(select 1 from assigned a
    join assigned b on b.club_team_season_id=a.club_team_season_id
      and b.mc_number=a.mc_number and b.monday<>a.monday and b.id>a.id
    where a.mc_number is not null)
), summary as (
  select case when (select column_ok and rpc_oid is not null and guard_oid is not null from structure)
      and count(*) filter(where not ok)=0 then 'PASS'
    when (select not column_ok and rpc_oid is null and guard_oid is null
      and not check_ok and not index_ok and not trigger_ok from structure)
      then 'READY_TO_APPLY' else 'BLOCKED' end as estado,
    count(*) filter(where ok) as superadas,count(*) filter(where not ok) as fallidas
  from checks
)
select 'GLOBAL' as comprobacion,estado,
  format('%s comprobaciones correctas; %s pendientes o fallidas. Las pruebas por identidad siguen PENDING.',
    superadas,fallidas) as detalle from summary
union all
select comprobacion,case when ok then 'PASS' else 'FAIL' end,
  case when ok then 'Condición comprobada por catálogo o datos.' else 'Revisar antes de activar V4.' end
from checks
order by case when comprobacion='GLOBAL' then 0 else 1 end,comprobacion;
