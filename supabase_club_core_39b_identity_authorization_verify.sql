-- APPCAUDAL - Cambio 39B
-- Verificacion dinamica de helpers deportivos con identidades reales.
--
-- IMPORTANTE:
--   * ejecutar el archivo COMPLETO en una sesion de confianza de Supabase
--     SQL Editor, sin una identidad JWT de aplicacion ya establecida;
--   * no ejecutar fragmentos aislados;
--   * no sustituir ninguno de los UUID: proceden del inventario real;
--   * no hacer COMMIT. El ROLLBACK final restaura ROLE y GUC/JWT locales;
--   * el script no escribe en tablas ni crea objetos, usuarios o asignaciones.
--
-- Resultado esperado: 40/40 comprobaciones obligatorias PASS y 6 escenarios
-- PENDING por ausencia acreditada de datos reales. Un PENDING opcional no
-- impide GLOBAL PASS; cualquier FAIL/PENDING obligatorio o prueba ausente si.

BEGIN;

-- Los valores y el acumulador JSON son locales a esta transaccion.
DO $setup$
BEGIN
  PERFORM pg_catalog.set_config(
    'appcaudal.verify39b.relation_id',
    '961970c8-0fcf-4c45-94d6-787647619c61',
    true
  );
  PERFORM pg_catalog.set_config(
    'appcaudal.verify39b.match_id',
    '12e019fb-e2bb-4a6d-91ce-f22a04c4f7dc',
    true
  );
  PERFORM pg_catalog.set_config(
    'appcaudal.verify39b.owner_user_id',
    '4fb13f6f-3241-4ccc-8dcc-d6a4e855c3e3',
    true
  );
  PERFORM pg_catalog.set_config(
    'appcaudal.verify39b.staff_user_id',
    '414427ca-2870-4e46-92e7-ca5133e373fc',
    true
  );
  PERFORM pg_catalog.set_config(
    'appcaudal.verify39b.player_user_id',
    '0436e377-83e1-45e9-af9f-74cc017963df',
    true
  );
  PERFORM pg_catalog.set_config(
    'appcaudal.verify39b.nonexistent_uuid',
    '00000000-0000-0000-0000-000000000000',
    true
  );
  PERFORM pg_catalog.set_config('appcaudal.verify39b.results', '[]', true);
  PERFORM pg_catalog.set_config('appcaudal.verify39b.preflight_ok', 'false', true);
END
$setup$;

-- Preflight privilegiado y exclusivamente de lectura. Cada comprobacion se
-- registra por separado para que un fallo nunca quede oculto por un NOTICE.
DO $preflight$
DECLARE
  v_results jsonb := pg_catalog.current_setting('appcaudal.verify39b.results')::jsonb;
  v_relation_id uuid := pg_catalog.current_setting('appcaudal.verify39b.relation_id')::uuid;
  v_match_id uuid := pg_catalog.current_setting('appcaudal.verify39b.match_id')::uuid;
  v_owner uuid := pg_catalog.current_setting('appcaudal.verify39b.owner_user_id')::uuid;
  v_staff uuid := pg_catalog.current_setting('appcaudal.verify39b.staff_user_id')::uuid;
  v_player uuid := pg_catalog.current_setting('appcaudal.verify39b.player_user_id')::uuid;
  v_unknown uuid := pg_catalog.current_setting('appcaudal.verify39b.nonexistent_uuid')::uuid;
  v_club_id constant uuid := 'ca0da100-0000-4000-8000-000000000001';
  v_team_id constant uuid := '85a16f33-9fe5-44d4-b85d-37d73651ebf6';
  v_season_id constant uuid := 'a858d03b-aa54-49f5-bdb1-8c8b3b533dae';
  v_ok boolean;
  v_count bigint;
  v_detail text;
  v_failed bigint;
BEGIN
  -- 1. El SQL Editor no debe aportar una identidad de aplicacion real.
  v_ok := auth.uid() IS NULL;
  v_results := v_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'sequence', 1, 'scenario', 'preflight',
    'check_name', 'trusted_runner_has_no_auth_uid', 'mandatory', true,
    'result', CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END,
    'detail', pg_catalog.format('auth.uid()=%s', coalesce(auth.uid()::text, 'NULL'))
  ));

  -- 2. Las firmas y la politica EXECUTE deben seguir siendo las acordadas.
  SELECT count(*)
  INTO v_count
  FROM (VALUES
    (pg_catalog.to_regprocedure('public.can_read_club_team_season(uuid)')),
    (pg_catalog.to_regprocedure('public.can_write_club_team_season(uuid)')),
    (pg_catalog.to_regprocedure('public.can_read_match(uuid)')),
    (pg_catalog.to_regprocedure('public.can_write_match(uuid)'))
  ) AS helper(function_oid)
  WHERE helper.function_oid IS NOT NULL
    AND pg_catalog.has_function_privilege(
          'authenticated', helper.function_oid, 'EXECUTE'
        )
    AND pg_catalog.has_function_privilege(
          'service_role', helper.function_oid, 'EXECUTE'
        )
    AND NOT pg_catalog.has_function_privilege(
          'anon', helper.function_oid, 'EXECUTE'
        )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS proc
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        coalesce(
          proc.proacl,
          pg_catalog.acldefault('f', proc.proowner)
        )
      ) AS acl
      WHERE proc.oid = helper.function_oid
        AND acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    );
  v_ok := v_count = 4;
  v_results := v_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'sequence', 2, 'scenario', 'preflight',
    'check_name', 'four_helpers_and_execute_contract', 'mandatory', true,
    'result', CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END,
    'detail', pg_catalog.format('conforming_helpers=%s; expected=4', v_count)
  ));

  -- 3. Relacion canonica exacta y temporada abierta.
  SELECT count(*)
  INTO v_count
  FROM public.club_team_seasons AS relation
  JOIN public.club_seasons AS season
    ON season.id = relation.season_id
   AND season.club_id = relation.club_id
  WHERE relation.id = v_relation_id
    AND relation.club_id = v_club_id
    AND relation.team_id = v_team_id
    AND relation.season_id = v_season_id
    AND season.status = 'open';
  v_ok := v_count = 1;
  v_results := v_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'sequence', 3, 'scenario', 'preflight',
    'check_name', 'canonical_relation_is_exact_and_open', 'mandatory', true,
    'result', CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END,
    'detail', pg_catalog.format('matching_rows=%s; expected=1', v_count)
  ));

  -- 4. El partido elegido es real y conserva la vinculacion canonica.
  SELECT count(*)
  INTO v_count
  FROM public.partidos AS partido
  WHERE partido.id = v_match_id
    AND partido.club_team_season_id = v_relation_id;
  v_ok := v_count = 1;
  v_results := v_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'sequence', 4, 'scenario', 'preflight',
    'check_name', 'sample_match_keeps_canonical_relation', 'mandatory', true,
    'result', CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END,
    'detail', pg_catalog.format('matching_rows=%s; expected=1', v_count)
  ));

  -- 5. El inventario acreditaba exactamente 14 partidos, todos vinculados.
  SELECT count(*) FILTER (WHERE club_team_season_id = v_relation_id), count(*)
  INTO v_count, v_failed
  FROM public.partidos;
  v_ok := v_count = 14 AND v_failed = 14;
  v_results := v_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'sequence', 5, 'scenario', 'preflight',
    'check_name', 'fourteen_historical_matches_remain_linked', 'mandatory', true,
    'result', CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END,
    'detail', pg_catalog.format(
      'linked_to_canonical=%s; total_partidos=%s; expected=14/14',
      v_count, v_failed
    )
  ));

  -- 6. Los tres UUID son usuarios reales, distintos entre si.
  SELECT count(*)
  INTO v_count
  FROM auth.users AS app_user
  WHERE app_user.id IN (v_owner, v_staff, v_player);
  v_ok := v_count = 3
    AND (SELECT count(DISTINCT id)
         FROM (VALUES (v_owner), (v_staff), (v_player)) AS ids(id)) = 3;
  v_results := v_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'sequence', 6, 'scenario', 'preflight',
    'check_name', 'three_distinct_real_auth_users', 'mandatory', true,
    'result', CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END,
    'detail', pg_catalog.format('real_auth_users=%s; expected=3 distinct', v_count)
  ));

  -- 7-9. Cada usuario conserva exactamente la membership activa esperada.
  SELECT
    count(*),
    count(*) FILTER (WHERE membership.role = 'owner')
  INTO v_count, v_failed
  FROM public.club_memberships AS membership
  WHERE membership.club_id = v_club_id
    AND membership.user_id = v_owner
    AND membership.is_active;
  v_ok := v_count = 1 AND v_failed = 1;
  v_results := v_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'sequence', 7, 'scenario', 'preflight',
    'check_name', 'owner_active_membership', 'mandatory', true,
    'result', CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END,
    'detail', pg_catalog.format(
      'active_memberships=%s; owner_memberships=%s; expected=1/1',
      v_count, v_failed
    )
  ));

  SELECT
    count(*),
    count(*) FILTER (WHERE membership.role = 'staff')
  INTO v_count, v_failed
  FROM public.club_memberships AS membership
  WHERE membership.club_id = v_club_id
    AND membership.user_id = v_staff
    AND membership.is_active;
  v_ok := v_count = 1 AND v_failed = 1;
  v_results := v_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'sequence', 8, 'scenario', 'preflight',
    'check_name', 'staff_active_membership', 'mandatory', true,
    'result', CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END,
    'detail', pg_catalog.format(
      'active_memberships=%s; staff_memberships=%s; expected=1/1',
      v_count, v_failed
    )
  ));

  SELECT
    count(*),
    count(*) FILTER (WHERE membership.role = 'player')
  INTO v_count, v_failed
  FROM public.club_memberships AS membership
  WHERE membership.club_id = v_club_id
    AND membership.user_id = v_player
    AND membership.is_active;
  v_ok := v_count = 1 AND v_failed = 1;
  v_results := v_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'sequence', 9, 'scenario', 'preflight',
    'check_name', 'player_active_membership', 'mandatory', true,
    'result', CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END,
    'detail', pg_catalog.format(
      'active_memberships=%s; player_memberships=%s; expected=1/1',
      v_count, v_failed
    )
  ));

  -- 10. El staff elegido sigue sin asignacion; no se creara una para probarlo.
  SELECT count(*)
  INTO v_count
  FROM public.club_team_season_permissions AS permission
  JOIN public.club_memberships AS membership
    ON membership.id = permission.membership_id
   AND membership.club_id = permission.club_id
  WHERE permission.club_team_season_id = v_relation_id
    AND membership.user_id = v_staff;
  v_ok := v_count = 0
    AND NOT EXISTS (
      SELECT 1 FROM public.club_team_seasons WHERE id = v_unknown
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.partidos WHERE id = v_unknown
    );
  v_detail := pg_catalog.format(
    'staff_assignments=%s; zero_uuid_unused=%s',
    v_count,
    NOT EXISTS (
      SELECT 1 FROM public.club_team_seasons WHERE id = v_unknown
      UNION ALL
      SELECT 1 FROM public.partidos WHERE id = v_unknown
    )
  );
  v_results := v_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'sequence', 10, 'scenario', 'preflight',
    'check_name', 'staff_unassigned_and_unknown_uuid_unused', 'mandatory', true,
    'result', CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END,
    'detail', v_detail
  ));

  SELECT count(*)
  INTO v_failed
  FROM pg_catalog.jsonb_array_elements(v_results) AS item(value)
  WHERE item.value ->> 'mandatory' = 'true'
    AND item.value ->> 'result' <> 'PASS';

  PERFORM pg_catalog.set_config('appcaudal.verify39b.results', v_results::text, true);
  PERFORM pg_catalog.set_config(
    'appcaudal.verify39b.preflight_ok',
    CASE WHEN v_failed = 0 THEN 'true' ELSE 'false' END,
    true
  );
EXCEPTION WHEN OTHERS THEN
  v_results := v_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'sequence', 10, 'scenario', 'preflight',
    'check_name', 'unexpected_preflight_error', 'mandatory', true,
    'result', 'FAIL',
    'detail', pg_catalog.format('[%s] %s', SQLSTATE, SQLERRM)
  ));
  PERFORM pg_catalog.set_config('appcaudal.verify39b.results', v_results::text, true);
  PERFORM pg_catalog.set_config('appcaudal.verify39b.preflight_ok', 'false', true);
END
$preflight$;

-- Todas las llamadas positivas y negativas se realizan como authenticated.
SET LOCAL ROLE authenticated;

DO $authenticated_tests$
DECLARE
  v_results jsonb := pg_catalog.current_setting('appcaudal.verify39b.results')::jsonb;
  v_relation_id uuid := pg_catalog.current_setting('appcaudal.verify39b.relation_id')::uuid;
  v_match_id uuid := pg_catalog.current_setting('appcaudal.verify39b.match_id')::uuid;
  v_owner uuid := pg_catalog.current_setting('appcaudal.verify39b.owner_user_id')::uuid;
  v_staff uuid := pg_catalog.current_setting('appcaudal.verify39b.staff_user_id')::uuid;
  v_player uuid := pg_catalog.current_setting('appcaudal.verify39b.player_user_id')::uuid;
  v_unknown uuid := pg_catalog.current_setting('appcaudal.verify39b.nonexistent_uuid')::uuid;
  v_actor record;
  v_test record;
  v_context_ok boolean;
  v_expected boolean;
  v_actual boolean;
  v_sequence integer := 10;
BEGIN
  IF pg_catalog.current_setting('appcaudal.verify39b.preflight_ok', true)
       IS DISTINCT FROM 'true' THEN
    -- Las 30 pruebas dinamicas son obligatorias: si el preflight bloquea su
    -- ejecucion se registran como PENDING obligatorios y GLOBAL sera FAIL.
    FOR v_sequence IN 11..40 LOOP
      v_results := v_results || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'sequence', v_sequence, 'scenario', 'dynamic_tests',
          'check_name', pg_catalog.format('blocked_mandatory_check_%s', v_sequence),
          'mandatory', true, 'result', 'PENDING',
          'detail', 'No ejecutada porque el preflight fallo.'
        )
      );
    END LOOP;
    PERFORM pg_catalog.set_config('appcaudal.verify39b.results', v_results::text, true);
    RETURN;
  END IF;

  -- 11-25: contexto y cuatro helpers para owner, staff y player reales.
  FOR v_actor IN
    SELECT *
    FROM (VALUES
      ('owner_open'::text, v_owner, true),
      ('staff_unassigned'::text, v_staff, false),
      ('player'::text, v_player, false)
    ) AS actor(scenario, user_id, expected_access)
  LOOP
    PERFORM pg_catalog.set_config(
      'request.jwt.claim.sub', v_actor.user_id::text, true
    );
    PERFORM pg_catalog.set_config(
      'request.jwt.claims',
      pg_catalog.json_build_object(
        'sub', v_actor.user_id::text,
        'role', 'authenticated'
      )::text,
      true
    );
    v_context_ok := current_user = 'authenticated'
      AND auth.uid() IS NOT DISTINCT FROM v_actor.user_id;
    v_sequence := v_sequence + 1;
    v_results := v_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'sequence', v_sequence, 'scenario', v_actor.scenario,
      'check_name', 'authenticated_context_matches_real_user', 'mandatory', true,
      'result', CASE WHEN v_context_ok THEN 'PASS' ELSE 'FAIL' END,
      'detail', pg_catalog.format(
        'current_user=%s; auth.uid()=%s; expected=%s',
        current_user, coalesce(auth.uid()::text, 'NULL'), v_actor.user_id
      )
    ));

    -- No helper puede aprobar si el contexto anterior no coincide.
    FOR v_test IN
      SELECT *
      FROM (VALUES
        ('can_read_club_team_season',
          public.can_read_club_team_season(v_relation_id)),
        ('can_write_club_team_season',
          public.can_write_club_team_season(v_relation_id)),
        ('can_read_match', public.can_read_match(v_match_id)),
        ('can_write_match', public.can_write_match(v_match_id))
      ) AS helper(check_name, actual)
    LOOP
      v_actual := v_test.actual;
      v_expected := v_actor.expected_access;
      v_sequence := v_sequence + 1;
      v_results := v_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'sequence', v_sequence, 'scenario', v_actor.scenario,
        'check_name', v_test.check_name, 'mandatory', true,
        'result', CASE
          WHEN v_context_ok AND v_actual IS NOT DISTINCT FROM v_expected
          THEN 'PASS' ELSE 'FAIL'
        END,
        'detail', pg_catalog.format(
          'actual=%s; expected=%s; identity_context_valid=%s',
          coalesce(v_actual::text, 'NULL'), v_expected, v_context_ok
        )
      ));
    END LOOP;
  END LOOP;

  -- 26-30: los cuatro helpers deben devolver FALSE para UUID NULL. Se vuelve
  -- a establecer owner y se valida de nuevo para demostrar el aislamiento.
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', v_owner::text, 'role', 'authenticated')::text,
    true
  );
  v_context_ok := current_user = 'authenticated'
    AND auth.uid() IS NOT DISTINCT FROM v_owner;
  v_sequence := v_sequence + 1;
  v_results := v_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'sequence', v_sequence, 'scenario', 'null_uuid',
    'check_name', 'owner_context_restored', 'mandatory', true,
    'result', CASE WHEN v_context_ok THEN 'PASS' ELSE 'FAIL' END,
    'detail', pg_catalog.format('auth.uid()=%s; expected=%s', auth.uid(), v_owner)
  ));
  FOR v_test IN
    SELECT * FROM (VALUES
      ('can_read_club_team_season', public.can_read_club_team_season(NULL::uuid)),
      ('can_write_club_team_season', public.can_write_club_team_season(NULL::uuid)),
      ('can_read_match', public.can_read_match(NULL::uuid)),
      ('can_write_match', public.can_write_match(NULL::uuid))
    ) AS helper(check_name, actual)
  LOOP
    v_sequence := v_sequence + 1;
    v_results := v_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'sequence', v_sequence, 'scenario', 'null_uuid',
      'check_name', v_test.check_name, 'mandatory', true,
      'result', CASE
        WHEN v_context_ok AND v_test.actual IS FALSE THEN 'PASS' ELSE 'FAIL'
      END,
      'detail', pg_catalog.format(
        'actual=%s; expected=false; identity_context_valid=%s',
        coalesce(v_test.actual::text, 'NULL'), v_context_ok
      )
    ));
  END LOOP;

  -- 31-35: UUID inexistente, manteniendo y revalidando al owner real.
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', v_owner::text, 'role', 'authenticated')::text,
    true
  );
  v_context_ok := current_user = 'authenticated'
    AND auth.uid() IS NOT DISTINCT FROM v_owner;
  v_sequence := v_sequence + 1;
  v_results := v_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'sequence', v_sequence, 'scenario', 'nonexistent_uuid',
    'check_name', 'owner_context_restored', 'mandatory', true,
    'result', CASE WHEN v_context_ok THEN 'PASS' ELSE 'FAIL' END,
    'detail', pg_catalog.format('auth.uid()=%s; expected=%s', auth.uid(), v_owner)
  ));
  FOR v_test IN
    SELECT * FROM (VALUES
      ('can_read_club_team_season', public.can_read_club_team_season(v_unknown)),
      ('can_write_club_team_season', public.can_write_club_team_season(v_unknown)),
      ('can_read_match', public.can_read_match(v_unknown)),
      ('can_write_match', public.can_write_match(v_unknown))
    ) AS helper(check_name, actual)
  LOOP
    v_sequence := v_sequence + 1;
    v_results := v_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'sequence', v_sequence, 'scenario', 'nonexistent_uuid',
      'check_name', v_test.check_name, 'mandatory', true,
      'result', CASE
        WHEN v_context_ok AND v_test.actual IS FALSE THEN 'PASS' ELSE 'FAIL'
      END,
      'detail', pg_catalog.format(
        'actual=%s; expected=false; identity_context_valid=%s',
        coalesce(v_test.actual::text, 'NULL'), v_context_ok
      )
    ));
  END LOOP;

  -- Borrar solamente el JWT transaccional antes de cambiar al rol anon.
  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);
  PERFORM pg_catalog.set_config(
    'request.jwt.claims', '{"role":"anon"}', true
  );
  PERFORM pg_catalog.set_config('appcaudal.verify39b.results', v_results::text, true);
EXCEPTION WHEN OTHERS THEN
  v_results := v_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'sequence', v_sequence + 1, 'scenario', 'authenticated_tests',
    'check_name', 'unexpected_authenticated_test_error', 'mandatory', true,
    'result', 'FAIL',
    'detail', pg_catalog.format('[%s] %s', SQLSTATE, SQLERRM)
  ));
  PERFORM pg_catalog.set_config('appcaudal.verify39b.results', v_results::text, true);
END
$authenticated_tests$;

RESET ROLE;
SET LOCAL ROLE anon;

-- 36-40: identidad anonima real y denegacion EXECUTE de cada helper.
DO $anon_tests$
DECLARE
  v_results jsonb := pg_catalog.current_setting('appcaudal.verify39b.results')::jsonb;
  v_relation_id uuid := pg_catalog.current_setting('appcaudal.verify39b.relation_id')::uuid;
  v_match_id uuid := pg_catalog.current_setting('appcaudal.verify39b.match_id')::uuid;
  v_context_ok boolean;
  v_denied boolean;
  v_error text;
  v_test record;
  v_sequence integer := 35;
BEGIN
  IF pg_catalog.current_setting('appcaudal.verify39b.preflight_ok', true)
       IS DISTINCT FROM 'true' THEN
    -- Ya existen los PENDING obligatorios 36-40 creados por el bloque anterior.
    RETURN;
  END IF;

  v_context_ok := current_user = 'anon' AND auth.uid() IS NULL;
  v_sequence := v_sequence + 1;
  v_results := v_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'sequence', v_sequence, 'scenario', 'anon',
    'check_name', 'anon_context_has_no_auth_uid', 'mandatory', true,
    'result', CASE WHEN v_context_ok THEN 'PASS' ELSE 'FAIL' END,
    'detail', pg_catalog.format(
      'current_user=%s; auth.uid()=%s',
      current_user, coalesce(auth.uid()::text, 'NULL')
    )
  ));

  FOR v_test IN
    SELECT * FROM (VALUES
      ('can_read_club_team_season'::text, 1),
      ('can_write_club_team_season'::text, 2),
      ('can_read_match'::text, 3),
      ('can_write_match'::text, 4)
    ) AS helper(check_name, helper_number)
  LOOP
    v_denied := false;
    v_error := NULL;
    BEGIN
      CASE v_test.helper_number
        WHEN 1 THEN PERFORM public.can_read_club_team_season(v_relation_id);
        WHEN 2 THEN PERFORM public.can_write_club_team_season(v_relation_id);
        WHEN 3 THEN PERFORM public.can_read_match(v_match_id);
        WHEN 4 THEN PERFORM public.can_write_match(v_match_id);
      END CASE;
    EXCEPTION
      WHEN insufficient_privilege THEN
        v_denied := true;
      WHEN OTHERS THEN
        v_error := pg_catalog.format('[%s] %s', SQLSTATE, SQLERRM);
    END;

    v_sequence := v_sequence + 1;
    v_results := v_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'sequence', v_sequence, 'scenario', 'anon',
      'check_name', v_test.check_name || '_execute_denied', 'mandatory', true,
      'result', CASE
        WHEN v_context_ok AND v_denied AND v_error IS NULL THEN 'PASS'
        ELSE 'FAIL'
      END,
      'detail', CASE
        WHEN v_denied THEN 'EXECUTE denegado con SQLSTATE 42501.'
        WHEN v_error IS NOT NULL THEN 'Error inesperado: ' || v_error
        ELSE 'La funcion se ejecuto: anon conserva EXECUTE indebidamente.'
      END
    ));
  END LOOP;

  PERFORM pg_catalog.set_config('appcaudal.verify39b.results', v_results::text, true);
EXCEPTION WHEN OTHERS THEN
  v_results := v_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'sequence', v_sequence + 1, 'scenario', 'anon',
    'check_name', 'unexpected_anon_test_error', 'mandatory', true,
    'result', 'FAIL',
    'detail', pg_catalog.format('[%s] %s', SQLSTATE, SQLERRM)
  ));
  PERFORM pg_catalog.set_config('appcaudal.verify39b.results', v_results::text, true);
END
$anon_tests$;

RESET ROLE;

-- Escenarios expresamente no ejecutables con el inventario real actual.
DO $pending_scenarios$
DECLARE
  v_results jsonb := pg_catalog.current_setting('appcaudal.verify39b.results')::jsonb;
  v_pending record;
  v_sequence integer := 40;
BEGIN
  FOR v_pending IN
    SELECT * FROM (VALUES
      ('staff_assigned'::text,
       'No existe ningun staff asignado a la relacion canonica.'::text),
      ('staff_other_team_or_season'::text,
       'No existe una asignacion real acreditada a otro equipo-temporada.'::text),
      ('closed_season'::text,
       'El inventario confirma cero temporadas cerradas.'::text),
      ('match_without_association'::text,
       'El inventario confirma cero partidos sin club_team_season_id.'::text),
      ('admin'::text,
       'No se ha acreditado una identidad admin real.'::text),
      ('viewer'::text,
       'No se ha acreditado una identidad viewer real.'::text)
    ) AS pending(scenario, reason)
  LOOP
    v_sequence := v_sequence + 1;
    v_results := v_results || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'sequence', v_sequence, 'scenario', v_pending.scenario,
      'check_name', 'identity_authorization', 'mandatory', false,
      'result', 'PENDING', 'detail', v_pending.reason
    ));
  END LOOP;
  PERFORM pg_catalog.set_config('appcaudal.verify39b.results', v_results::text, true);
END
$pending_scenarios$;

-- Una unica tabla final. GLOBAL PASS exige exactamente 40 pruebas obligatorias,
-- todas ejecutadas y superadas. Los seis PENDING opcionales se muestran pero
-- no se convierten en resultados inventados ni bloquean ese global.
WITH detail AS (
  SELECT *
  FROM pg_catalog.jsonb_to_recordset(
    pg_catalog.current_setting('appcaudal.verify39b.results')::jsonb
  ) AS result_row(
    sequence integer,
    scenario text,
    check_name text,
    mandatory boolean,
    result text,
    detail text
  )
),
summary AS (
  SELECT
    count(*) FILTER (WHERE mandatory) AS mandatory_total,
    count(*) FILTER (WHERE mandatory AND result = 'PASS') AS mandatory_pass,
    count(*) FILTER (WHERE mandatory AND result = 'FAIL') AS mandatory_fail,
    count(*) FILTER (WHERE mandatory AND result = 'PENDING') AS mandatory_pending,
    count(*) FILTER (WHERE NOT mandatory AND result = 'PENDING') AS optional_pending
  FROM detail
),
output AS (
  SELECT
    sequence,
    scenario,
    check_name,
    mandatory,
    result,
    detail
  FROM detail

  UNION ALL

  SELECT
    999,
    'GLOBAL',
    'identity_authorization_helpers',
    true,
    CASE
      WHEN mandatory_total = 40
       AND mandatory_pass = 40
       AND mandatory_fail = 0
       AND mandatory_pending = 0
       AND optional_pending = 6
      THEN 'PASS' ELSE 'FAIL'
    END,
    pg_catalog.format(
      'mandatory PASS=%s FAIL=%s PENDING=%s TOTAL=%s EXPECTED=40; optional PENDING=%s EXPECTED=6',
      mandatory_pass,
      mandatory_fail,
      mandatory_pending,
      mandatory_total,
      optional_pending
    )
  FROM summary
)
SELECT
  sequence,
  scenario,
  check_name,
  mandatory,
  result,
  detail
FROM output
ORDER BY sequence, scenario, check_name;

-- No hay escrituras persistentes. Tambien revierte ROLE y JWT/GUC locales.
ROLLBACK;
