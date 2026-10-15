-- APPCAUDAL - Cambio 39B
-- Inventario previo de identidades reales para las pruebas de autorizacion.
--
-- SOLO LECTURA:
--   * no cambia datos, roles, JWT, RLS ni privilegios;
--   * no muestra correos, nombres ni otros datos personales;
--   * devuelve UUID tecnicos, roles y relaciones imprescindibles para preparar
--     el verificador dinamico de identidad.
--
-- Ejecutar el archivo completo en Supabase SQL Editor y exportar la unica
-- tabla de resultados a CSV. No usar sus resultados como prueba de RLS: este
-- inventario solo determina que escenarios reales existen y que identidades
-- pueden utilizarse posteriormente bajo SET LOCAL ROLE authenticated.

WITH
expected AS (
  SELECT
    'ca0da100-0000-4000-8000-000000000001'::uuid AS club_id,
    '85a16f33-9fe5-44d4-b85d-37d73651ebf6'::uuid AS team_id,
    'a858d03b-aa54-49f5-bdb1-8c8b3b533dae'::uuid AS season_id,
    '961970c8-0fcf-4c45-94d6-787647619c61'::uuid AS club_team_season_id,
    '00000000-0000-0000-0000-000000000000'::uuid AS nonexistent_uuid
),
target_relation AS (
  SELECT
    cts.id,
    cts.club_id,
    cts.team_id,
    cts.season_id,
    cs.status
  FROM public.club_team_seasons AS cts
  JOIN public.club_seasons AS cs
    ON cs.id = cts.season_id
   AND cs.club_id = cts.club_id
  JOIN expected AS e
    ON e.club_team_season_id = cts.id
),
club_members AS (
  SELECT
    cm.id AS membership_id,
    cm.club_id,
    cm.user_id,
    cm.role,
    cm.is_active,
    (au.id IS NOT NULL) AS auth_user_exists
  FROM public.club_memberships AS cm
  JOIN expected AS e
    ON e.club_id = cm.club_id
  LEFT JOIN auth.users AS au
    ON au.id = cm.user_id
),
active_real_members AS (
  SELECT *
  FROM club_members
  WHERE is_active
    AND auth_user_exists
),
current_assignments AS (
  SELECT
    p.id AS permission_id,
    p.club_team_season_id,
    p.membership_id,
    m.club_id,
    m.user_id,
    m.role,
    m.is_active,
    m.auth_user_exists
  FROM public.club_team_season_permissions AS p
  JOIN club_members AS m
    ON m.membership_id = p.membership_id
   AND m.club_id = p.club_id
  JOIN expected AS e
    ON e.club_team_season_id = p.club_team_season_id
),
all_staff_assignments AS (
  SELECT
    p.id AS permission_id,
    p.club_team_season_id,
    p.membership_id,
    m.club_id,
    m.user_id,
    m.role,
    m.is_active,
    m.auth_user_exists,
    cts.team_id,
    cts.season_id,
    cs.status AS season_status
  FROM public.club_team_season_permissions AS p
  JOIN club_members AS m
    ON m.membership_id = p.membership_id
   AND m.club_id = p.club_id
  JOIN public.club_team_seasons AS cts
    ON cts.id = p.club_team_season_id
   AND cts.club_id = p.club_id
  JOIN public.club_seasons AS cs
    ON cs.id = cts.season_id
   AND cs.club_id = cts.club_id
),
target_matches AS (
  SELECT p.id AS match_id, p.club_team_season_id
  FROM public.partidos AS p
  JOIN expected AS e
    ON e.club_team_season_id = p.club_team_season_id
),
target_match_sample AS (
  SELECT tm.match_id, tm.club_team_season_id
  FROM target_matches AS tm
  ORDER BY tm.match_id::text
  LIMIT 1
),
unlinked_matches AS (
  SELECT p.id AS match_id
  FROM public.partidos AS p
  WHERE p.club_team_season_id IS NULL
),
closed_scopes AS (
  SELECT
    cts.id AS club_team_season_id,
    cts.club_id,
    cts.team_id,
    cts.season_id,
    (
      SELECT p.id
      FROM public.partidos AS p
      WHERE p.club_team_season_id = cts.id
      ORDER BY p.id::text
      LIMIT 1
    ) AS sample_match_id
  FROM public.club_team_seasons AS cts
  JOIN public.club_seasons AS cs
    ON cs.id = cts.season_id
   AND cs.club_id = cts.club_id
  JOIN expected AS e
    ON e.club_id = cts.club_id
  WHERE cs.status = 'closed'
),
helper_catalog AS (
  SELECT *
  FROM (VALUES
    ('can_read_club_team_season(uuid)'::text,
      to_regprocedure('public.can_read_club_team_season(uuid)')),
    ('can_write_club_team_season(uuid)'::text,
      to_regprocedure('public.can_write_club_team_season(uuid)')),
    ('can_read_match(uuid)'::text,
      to_regprocedure('public.can_read_match(uuid)')),
    ('can_write_match(uuid)'::text,
      to_regprocedure('public.can_write_match(uuid)'))
  ) AS h(signature, function_oid)
),
helper_privileges AS (
  SELECT
    h.signature,
    h.function_oid,
    CASE
      WHEN h.function_oid IS NULL THEN false
      ELSE has_function_privilege('authenticated', h.function_oid, 'EXECUTE')
    END AS authenticated_execute,
    CASE
      WHEN h.function_oid IS NULL THEN false
      ELSE has_function_privilege('anon', h.function_oid, 'EXECUTE')
    END AS anon_execute,
    CASE
      WHEN h.function_oid IS NULL THEN false
      ELSE has_function_privilege('service_role', h.function_oid, 'EXECUTE')
    END AS service_role_execute,
    COALESCE((
      SELECT bool_or(x.grantee = 0 AND x.privilege_type = 'EXECUTE')
      FROM pg_catalog.pg_proc AS p
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
      ) AS x
      WHERE p.oid = h.function_oid
    ), false) AS public_execute
  FROM helper_catalog AS h
),
scenario_counts AS (
  SELECT
    (SELECT count(*) FROM active_real_members WHERE role = 'owner') AS owner_count,
    (
      SELECT count(*)
      FROM current_assignments
      WHERE role = 'staff' AND is_active AND auth_user_exists
    ) AS assigned_staff_count,
    (
      SELECT count(*)
      FROM active_real_members AS m
      WHERE m.role = 'staff'
        AND NOT EXISTS (
          SELECT 1
          FROM current_assignments AS a
          WHERE a.membership_id = m.membership_id
        )
    ) AS unassigned_staff_count,
    (
      SELECT count(DISTINCT a.membership_id)
      FROM all_staff_assignments AS a
      JOIN expected AS e ON true
      WHERE a.role = 'staff'
        AND a.is_active
        AND a.auth_user_exists
        AND a.club_team_season_id <> e.club_team_season_id
        AND NOT EXISTS (
          SELECT 1
          FROM current_assignments AS current_a
          WHERE current_a.membership_id = a.membership_id
        )
    ) AS other_scope_staff_count,
    (SELECT count(*) FROM active_real_members WHERE role = 'player') AS player_count,
    (SELECT count(*) FROM active_real_members WHERE role = 'viewer') AS viewer_count,
    (SELECT count(*) FROM closed_scopes) AS closed_scope_count,
    (SELECT count(*) FROM closed_scopes WHERE sample_match_id IS NOT NULL)
      AS closed_scope_with_match_count,
    (SELECT count(*) FROM unlinked_matches) AS unlinked_match_count
),
results (
  section,
  check_name,
  result,
  user_id,
  membership_id,
  membership_role,
  club_team_season_id,
  match_id,
  detail
) AS (
  SELECT
    '00_PREFLIGHT',
    'canonical_team_season_identity',
    CASE
      WHEN count(tr.id) = 1
       AND bool_and(tr.club_id = e.club_id)
       AND bool_and(tr.team_id = e.team_id)
       AND bool_and(tr.season_id = e.season_id)
      THEN 'PASS' ELSE 'BLOCKED'
    END,
    NULL::uuid, NULL::uuid, NULL::text,
    e.club_team_season_id, NULL::uuid,
    format(
      'rows=%s; expected club=%s team=%s season=%s',
      count(tr.id), e.club_id, e.team_id, e.season_id
    )
  FROM expected AS e
  LEFT JOIN target_relation AS tr ON true
  GROUP BY e.club_id, e.team_id, e.season_id, e.club_team_season_id

  UNION ALL

  SELECT
    '00_PREFLIGHT',
    'canonical_season_is_open',
    CASE
      WHEN count(tr.id) = 1 AND bool_and(tr.status = 'open')
      THEN 'PASS' ELSE 'BLOCKED'
    END,
    NULL::uuid, NULL::uuid, NULL::text,
    e.club_team_season_id, NULL::uuid,
    format('rows=%s; status=%s', count(tr.id), COALESCE(min(tr.status), '<missing>'))
  FROM expected AS e
  LEFT JOIN target_relation AS tr ON true
  GROUP BY e.club_team_season_id

  UNION ALL

  SELECT
    '00_PREFLIGHT',
    'fourteen_historical_matches_remain_linked',
    CASE WHEN count(tm.match_id) = 14 THEN 'PASS' ELSE 'BLOCKED' END,
    NULL::uuid, NULL::uuid, NULL::text,
    e.club_team_season_id, NULL::uuid,
    format('linked_match_count=%s; expected=14', count(tm.match_id))
  FROM expected AS e
  LEFT JOIN target_matches AS tm ON true
  GROUP BY e.club_team_season_id

  UNION ALL

  SELECT
    '00_PREFLIGHT',
    'nonexistent_uuid_is_unused',
    CASE
      WHEN NOT EXISTS (
             SELECT 1 FROM public.club_team_seasons AS cts
             WHERE cts.id = e.nonexistent_uuid
           )
       AND NOT EXISTS (
             SELECT 1 FROM public.partidos AS p
             WHERE p.id = e.nonexistent_uuid
           )
      THEN 'PASS' ELSE 'BLOCKED'
    END,
    NULL::uuid, NULL::uuid, NULL::text,
    e.nonexistent_uuid, e.nonexistent_uuid,
    'El UUID cero solo podra usarse en pruebas negativas si no identifica ningun objeto real.'
  FROM expected AS e

  UNION ALL

  SELECT
    '00_PREFLIGHT',
    'assignment_integrity_active_staff_only',
    CASE
      WHEN count(*) FILTER (
        WHERE role IS DISTINCT FROM 'staff'
           OR NOT is_active
           OR NOT auth_user_exists
      ) = 0
      THEN 'PASS' ELSE 'BLOCKED'
    END,
    NULL::uuid, NULL::uuid, NULL::text,
    NULL::uuid, NULL::uuid,
    format(
      'invalid_assignment_count=%s',
      count(*) FILTER (
        WHERE role IS DISTINCT FROM 'staff'
           OR NOT is_active
           OR NOT auth_user_exists
      )
    )
  FROM all_staff_assignments

  UNION ALL

  SELECT
    '00_HELPER_EXECUTE',
    hp.signature,
    CASE
      WHEN hp.function_oid IS NOT NULL
       AND hp.authenticated_execute
       AND hp.service_role_execute
       AND NOT hp.anon_execute
       AND NOT hp.public_execute
      THEN 'PASS' ELSE 'BLOCKED'
    END,
    NULL::uuid, NULL::uuid, NULL::text,
    NULL::uuid, NULL::uuid,
    format(
      'exists=%s; authenticated=%s; service_role=%s; anon=%s; PUBLIC_acl=%s',
      hp.function_oid IS NOT NULL,
      hp.authenticated_execute,
      hp.service_role_execute,
      hp.anon_execute,
      hp.public_execute
    )
  FROM helper_privileges AS hp

  UNION ALL

  SELECT
    '01_REAL_IDENTITY',
    'active_membership_candidate',
    CASE WHEN m.auth_user_exists THEN 'CANDIDATE' ELSE 'BLOCKED' END,
    m.user_id,
    m.membership_id,
    m.role,
    NULL::uuid,
    NULL::uuid,
    format('club_id=%s; active=%s; auth_user_exists=%s',
           m.club_id, m.is_active, m.auth_user_exists)
  FROM club_members AS m
  WHERE m.is_active

  UNION ALL

  SELECT
    '02_SCENARIO_SUMMARY',
    'owner_open_scope',
    CASE
      WHEN sc.owner_count = 1 THEN 'READY'
      WHEN sc.owner_count = 0 THEN 'PENDING'
      ELSE 'REVIEW'
    END,
    NULL::uuid, NULL::uuid, 'owner',
    e.club_team_season_id, tms.match_id,
    format('real_active_owner_count=%s', sc.owner_count)
  FROM scenario_counts AS sc
  CROSS JOIN expected AS e
  LEFT JOIN target_match_sample AS tms ON true

  UNION ALL

  SELECT
    '02_SCENARIO_SUMMARY',
    'staff_assigned_open_scope',
    CASE
      WHEN sc.assigned_staff_count = 1 THEN 'READY'
      WHEN sc.assigned_staff_count = 0 THEN 'PENDING'
      ELSE 'REVIEW'
    END,
    NULL::uuid, NULL::uuid, 'staff',
    e.club_team_season_id, tms.match_id,
    format('real_active_assigned_staff_count=%s', sc.assigned_staff_count)
  FROM scenario_counts AS sc
  CROSS JOIN expected AS e
  LEFT JOIN target_match_sample AS tms ON true

  UNION ALL

  SELECT
    '02_SCENARIO_SUMMARY',
    'staff_unassigned_open_scope',
    CASE
      WHEN sc.unassigned_staff_count = 1 THEN 'READY'
      WHEN sc.unassigned_staff_count = 0 THEN 'PENDING'
      ELSE 'REVIEW'
    END,
    NULL::uuid, NULL::uuid, 'staff',
    e.club_team_season_id, tms.match_id,
    format('real_active_unassigned_staff_count=%s', sc.unassigned_staff_count)
  FROM scenario_counts AS sc
  CROSS JOIN expected AS e
  LEFT JOIN target_match_sample AS tms ON true

  UNION ALL

  SELECT
    '02_SCENARIO_SUMMARY',
    'staff_assigned_only_to_other_scope',
    CASE
      WHEN sc.other_scope_staff_count = 1 THEN 'READY'
      WHEN sc.other_scope_staff_count = 0 THEN 'PENDING'
      ELSE 'REVIEW'
    END,
    NULL::uuid, NULL::uuid, 'staff',
    e.club_team_season_id, tms.match_id,
    format('real_staff_other_scope_only_count=%s', sc.other_scope_staff_count)
  FROM scenario_counts AS sc
  CROSS JOIN expected AS e
  LEFT JOIN target_match_sample AS tms ON true

  UNION ALL

  SELECT
    '02_SCENARIO_SUMMARY',
    'player_general_access_denied',
    CASE
      WHEN sc.player_count = 1 THEN 'READY'
      WHEN sc.player_count = 0 THEN 'PENDING'
      ELSE 'REVIEW'
    END,
    NULL::uuid, NULL::uuid, 'player',
    e.club_team_season_id, tms.match_id,
    format('real_active_player_count=%s', sc.player_count)
  FROM scenario_counts AS sc
  CROSS JOIN expected AS e
  LEFT JOIN target_match_sample AS tms ON true

  UNION ALL

  SELECT
    '02_SCENARIO_SUMMARY',
    'viewer_general_access_denied',
    CASE
      WHEN sc.viewer_count = 1 THEN 'READY'
      WHEN sc.viewer_count = 0 THEN 'PENDING'
      ELSE 'REVIEW'
    END,
    NULL::uuid, NULL::uuid, 'viewer',
    e.club_team_season_id, tms.match_id,
    format('real_active_viewer_count=%s', sc.viewer_count)
  FROM scenario_counts AS sc
  CROSS JOIN expected AS e
  LEFT JOIN target_match_sample AS tms ON true

  UNION ALL

  SELECT
    '02_SCENARIO_SUMMARY',
    'closed_team_season_read_yes_write_no',
    CASE
      WHEN sc.closed_scope_count > 0 AND sc.owner_count > 0 THEN 'READY'
      ELSE 'PENDING'
    END,
    NULL::uuid, NULL::uuid, NULL::text,
    NULL::uuid, NULL::uuid,
    format(
      'closed_scope_count=%s; closed_scope_with_match_count=%s; active_owner_count=%s',
      sc.closed_scope_count, sc.closed_scope_with_match_count, sc.owner_count
    )
  FROM scenario_counts AS sc

  UNION ALL

  SELECT
    '02_SCENARIO_SUMMARY',
    'match_without_team_season_returns_false',
    CASE
      WHEN sc.unlinked_match_count > 0 AND sc.owner_count > 0 THEN 'READY'
      ELSE 'PENDING'
    END,
    NULL::uuid, NULL::uuid, NULL::text,
    NULL::uuid, NULL::uuid,
    format(
      'real_unlinked_match_count=%s; active_owner_count=%s',
      sc.unlinked_match_count, sc.owner_count
    )
  FROM scenario_counts AS sc

  UNION ALL

  SELECT
    '03_OWNER_CANDIDATE',
    'owner_open_scope',
    'CANDIDATE',
    m.user_id,
    m.membership_id,
    m.role,
    e.club_team_season_id,
    tms.match_id,
    'Identidad real activa; el comportamiento de los helpers aun debe probarse como authenticated.'
  FROM active_real_members AS m
  CROSS JOIN expected AS e
  LEFT JOIN target_match_sample AS tms ON true
  WHERE m.role = 'owner'

  UNION ALL

  SELECT
    '04_ASSIGNED_STAFF_CANDIDATE',
    'staff_assigned_open_scope',
    'CANDIDATE',
    a.user_id,
    a.membership_id,
    a.role,
    a.club_team_season_id,
    tms.match_id,
    format('permission_id=%s', a.permission_id)
  FROM current_assignments AS a
  LEFT JOIN target_match_sample AS tms ON true
  WHERE a.role = 'staff'
    AND a.is_active
    AND a.auth_user_exists

  UNION ALL

  SELECT
    '05_UNASSIGNED_STAFF_CANDIDATE',
    'staff_unassigned_open_scope',
    'CANDIDATE',
    m.user_id,
    m.membership_id,
    m.role,
    e.club_team_season_id,
    tms.match_id,
    'No existe una asignacion actual para la relacion canonica.'
  FROM active_real_members AS m
  CROSS JOIN expected AS e
  LEFT JOIN target_match_sample AS tms ON true
  WHERE m.role = 'staff'
    AND NOT EXISTS (
      SELECT 1
      FROM current_assignments AS a
      WHERE a.membership_id = m.membership_id
    )

  UNION ALL

  SELECT
    '06_OTHER_SCOPE_STAFF_CANDIDATE',
    'staff_assigned_only_to_other_scope',
    'CANDIDATE',
    a.user_id,
    a.membership_id,
    a.role,
    a.club_team_season_id,
    NULL::uuid,
    format(
      'assigned team=%s season=%s status=%s; no assignment to canonical scope',
      a.team_id, a.season_id, a.season_status
    )
  FROM all_staff_assignments AS a
  JOIN expected AS e ON true
  WHERE a.role = 'staff'
    AND a.is_active
    AND a.auth_user_exists
    AND a.club_team_season_id <> e.club_team_season_id
    AND NOT EXISTS (
      SELECT 1
      FROM current_assignments AS current_a
      WHERE current_a.membership_id = a.membership_id
    )

  UNION ALL

  SELECT
    '07_PLAYER_CANDIDATE',
    'player_general_access_denied',
    'CANDIDATE',
    m.user_id,
    m.membership_id,
    m.role,
    e.club_team_season_id,
    tms.match_id,
    'Identidad real activa; los cuatro helpers deben devolver false.'
  FROM active_real_members AS m
  CROSS JOIN expected AS e
  LEFT JOIN target_match_sample AS tms ON true
  WHERE m.role = 'player'

  UNION ALL

  SELECT
    '08_VIEWER_CANDIDATE',
    'viewer_general_access_denied',
    'CANDIDATE',
    m.user_id,
    m.membership_id,
    m.role,
    e.club_team_season_id,
    tms.match_id,
    'Identidad real activa; los cuatro helpers deben devolver false.'
  FROM active_real_members AS m
  CROSS JOIN expected AS e
  LEFT JOIN target_match_sample AS tms ON true
  WHERE m.role = 'viewer'

  UNION ALL

  SELECT
    '09_CLOSED_SCOPE_CANDIDATE',
    'closed_team_season_read_yes_write_no',
    'CANDIDATE',
    NULL::uuid,
    NULL::uuid,
    NULL::text,
    cs.club_team_season_id,
    cs.sample_match_id,
    format(
      'club=%s team=%s season=%s; requiere una identidad realmente autorizada para este club',
      cs.club_id, cs.team_id, cs.season_id
    )
  FROM closed_scopes AS cs

  UNION ALL

  SELECT
    '10_UNLINKED_MATCH_CANDIDATE',
    'match_without_team_season_returns_false',
    'CANDIDATE',
    NULL::uuid,
    NULL::uuid,
    NULL::text,
    NULL::uuid,
    um.match_id,
    'Partido real sin asociacion; no se modifica y solo podra usarse en una prueba de lectura del helper.'
  FROM unlinked_matches AS um
)
SELECT
  section,
  check_name,
  result,
  user_id,
  membership_id,
  membership_role,
  club_team_season_id,
  match_id,
  detail
FROM results
ORDER BY section, check_name, user_id::text NULLS FIRST,
         club_team_season_id::text NULLS FIRST, match_id::text NULLS FIRST;
