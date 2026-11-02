-- Solo lectura. Ejecutar antes y después de la instalación manual.
with objects as (
  select to_regclass('public.planned_training_sessions') as sessions_oid,
    to_regprocedure('public.save_planned_session_material(uuid,integer,jsonb)') as rpc_oid
), checks as (
  select 'Columna material_state JSONB nullable' as comprobacion,
    exists(select 1 from pg_catalog.pg_attribute a,objects o
      where a.attrelid=o.sessions_oid and a.attname='material_state'
        and a.atttypid='pg_catalog.jsonb'::regtype and not a.attisdropped
        and not a.attnotnull and not a.atthasdef
        and pg_catalog.col_description(a.attrelid,a.attnum)=
          'NEXO CLUB Sesiones: procedencia manual y exclusiones de Material') as ok
  union all select 'RPC SECURITY DEFINER y search_path seguro',
    exists(select 1 from pg_catalog.pg_proc p,objects o where p.oid=o.rpc_oid
      and p.prosecdef and p.proconfig @> array['search_path=pg_catalog']::text[]
      and pg_catalog.pg_get_userbyid(p.proowner)='postgres'
      and pg_catalog.obj_description(p.oid,'pg_proc')=
        'NEXO CLUB Sesiones: sincronización de Material por snapshot y CAS')
  union all select 'EXECUTE authenticated',coalesce(
    pg_catalog.has_function_privilege('authenticated',(select rpc_oid::oid from objects),'EXECUTE'),false)
  union all select 'EXECUTE service_role',coalesce(
    pg_catalog.has_function_privilege('service_role',(select rpc_oid::oid from objects),'EXECUTE'),false)
  union all select 'EXECUTE anon denegado',not coalesce(
    pg_catalog.has_function_privilege('anon',(select rpc_oid::oid from objects),'EXECUTE'),false)
  union all select 'EXECUTE PUBLIC directo denegado',not exists(
    select 1 from pg_catalog.pg_proc p,objects o,
      lateral pg_catalog.aclexplode(coalesce(p.proacl,
        pg_catalog.acldefault('f',p.proowner))) acl
      where p.oid=o.rpc_oid and acl.grantee=0 and acl.privilege_type='EXECUTE')
  union all select 'Sin sobrecargas de RPC',not exists(
    select 1 from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='save_planned_session_material'
        and p.oid<>coalesce((select rpc_oid::oid from objects),'0'::oid))
  union all select 'Histórico sin activación implícita',not exists(
    select 1 from public.planned_training_sessions s
      where (to_jsonb(s)->'material_state') is not null and
        (to_jsonb(s)->'material_state')<>'null'::jsonb and
        (to_jsonb(s)->'material_state'->>'version') is distinct from '1')
), summary as (
  select case when count(*) filter(where not ok)=0 then 'PASS'
    when (select rpc_oid is null from objects) and
      (select not exists(select 1 from pg_catalog.pg_attribute a
        where a.attrelid=o.sessions_oid and a.attname='material_state'
          and not a.attisdropped) from objects o) then 'READY_TO_APPLY'
    else 'BLOCKED' end as estado,
    count(*) filter(where ok) as superadas,
    count(*) filter(where not ok) as fallidas from checks
)
select 'GLOBAL' as comprobacion,estado,
  format('%s correctas; %s pendientes o fallidas. Identidades y CAS: PENDING.',superadas,fallidas) as detalle
  from summary
union all
select comprobacion,case when ok then 'PASS' else 'FAIL' end,
  case when ok then 'Comprobado en catálogo o datos.' else 'Revisar antes de activar.' end
  from checks
order by case when comprobacion='GLOBAL' then 0 else 1 end,comprobacion;
