-- BLOQUE 2.1b - Auditoria remota READ ONLY de las 12 RPC mutadoras.
--
-- Ejecutar el archivo COMPLETO en Supabase SQL Editor.
-- Es una unica consulta de catalogo: no ejecuta ninguna RPC y no modifica nada.

with targets(
  target_order,
  expected_signature,
  expected_source_md5
) as (
  values
    (1,  'public.set_player_availability(uuid,text,integer)', '466c8d47470aaa5acee20cf44fa7d502'),
    (2,  'public.consume_player_suspensions_for_match(uuid)', '3b02b9eb3bbe11a3a21bfe06cb783e1c'),
    (3,  'public.apply_rival_tactical_placements(uuid,jsonb)', 'be25e6a1de65150ee8a911eb7a11ccd7'),
    (4,  'public.assign_global_player_to_team(uuid,uuid,text,text,date)', 'fd794865119cc8d26ffe13d6b0b73862'),
    (5,  'public.create_own_player_atomic(uuid,jsonb,jsonb,jsonb,jsonb)', 'aad1e4eaf3cd1fa7e30e1d630f641076'),
    (6,  'public.merge_global_player_profiles(uuid,uuid)', '5c5121dbebf1c75b2ec013693c2e5a2e'),
    (7,  'public.remove_global_player_from_current_team(uuid,date)', '0cd47394f23797cdefa3578eb84e2be9'),
    (8,  'public.remove_rival_player_from_team_atomic(uuid,uuid,uuid,text)', '128aa60b5ecf5c96f79a61f821e40bc9'),
    (9,  'public.save_global_player_profile(jsonb,jsonb,jsonb,jsonb,jsonb)', 'a638f6ca4d202abbcb562b5261b4b6e4'),
    (10, 'public.save_match_squad_lineup_atomic(uuid,text,jsonb,jsonb)', '63bb815b9ea846b7ec90465ccfc06369'),
    (11, 'public.save_own_captain_priorities(uuid[])', 'ea72384385e286c5df3f71666d3d2581'),
    (12, 'public.save_rival_lineup_atomic(uuid,text,jsonb,jsonb,jsonb,jsonb)', 'cb8a5da84addcf1f34934380a03a725c')
),
resolved as (
  select
    target.*,
    pg_catalog.to_regprocedure(target.expected_signature)::oid as function_oid
  from targets target
)
select
  target.target_order,
  target.expected_signature,
  function_row.oid is not null as exists,
  case
    when function_row.oid is null then null
    else pg_catalog.format(
      '%I.%I(%s)',
      namespace.nspname,
      function_row.proname,
      pg_catalog.pg_get_function_identity_arguments(function_row.oid)
    )
  end as catalog_signature,
  pg_catalog.pg_get_userbyid(function_row.proowner) as owner,
  language.lanname as language,
  case
    when function_row.oid is null then null
    when function_row.prosecdef then 'SECURITY DEFINER'
    else 'SECURITY INVOKER'
  end as security_mode,
  case function_row.provolatile
    when 'i' then 'IMMUTABLE'
    when 's' then 'STABLE'
    when 'v' then 'VOLATILE'
    else null
  end as volatility,
  coalesce(pg_catalog.to_jsonb(function_row.proconfig), '[]'::jsonb) as proconfig,
  (
    select config.config_entry
    from pg_catalog.unnest(
      coalesce(function_row.proconfig, array[]::text[])
    ) as config(config_entry)
    where config.config_entry like 'search_path=%'
    limit 1
  ) as search_path_config,
  function_row.proacl is null as raw_acl_is_null,
  function_row.proacl::text as raw_acl,
  case
    when function_row.oid is null then '[]'::jsonb
    else coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'grantee', case
              when acl.grantee = 0 then 'PUBLIC'
              else pg_catalog.pg_get_userbyid(acl.grantee)
            end,
            'privilege', acl.privilege_type,
            'grantor', pg_catalog.pg_get_userbyid(acl.grantor),
            'is_grantable', acl.is_grantable
          )
          order by
            case
              when acl.grantee = 0 then 'PUBLIC'
              else pg_catalog.pg_get_userbyid(acl.grantee)
            end,
            acl.privilege_type
        )
        from pg_catalog.aclexplode(
          coalesce(
            function_row.proacl,
            pg_catalog.acldefault('f', function_row.proowner)
          )
        ) acl
      ),
      '[]'::jsonb
    )
  end as acl_expanded,
  case
    when function_row.oid is null then false
    else pg_catalog.has_function_privilege(
      'authenticated',
      function_row.oid,
      'EXECUTE'
    )
  end as authenticated_execute,
  target.expected_source_md5,
  case
    when function_row.oid is null then null
    else pg_catalog.md5(
      pg_catalog.replace(function_row.prosrc, chr(13), '')
    )
  end as remote_source_md5,
  case
    when function_row.oid is null then 'MISSING'
    when pg_catalog.md5(
      pg_catalog.replace(function_row.prosrc, chr(13), '')
    ) = target.expected_source_md5 then 'MATCH'
    else 'DRIFT'
  end as comparison,
  function_row.prosrc as remote_prosrc,
  case
    when function_row.oid is null then null
    else pg_catalog.pg_get_functiondef(function_row.oid)
  end as remote_function_definition
from resolved target
left join pg_catalog.pg_proc function_row
  on function_row.oid = target.function_oid
left join pg_catalog.pg_namespace namespace
  on namespace.oid = function_row.pronamespace
left join pg_catalog.pg_language language
  on language.oid = function_row.prolang
order by target.target_order;
