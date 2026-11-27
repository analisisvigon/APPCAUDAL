begin;

do $preflight$
begin
  if to_regprocedure('public.planned_editor_payload_snapshot_safe(jsonb)') is null then
    raise exception 'Falta planned_editor_payload_snapshot_safe(jsonb); no se modifica Supabase';
  end if;
  if to_regprocedure('public.planned_library_snapshot(uuid)') is null or
     to_regprocedure('public.save_planned_session_03c(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])') is null then
    raise exception 'Faltan los procedimientos 03C reales de snapshots/guardado; no se modifica Supabase';
  end if;

  if to_regprocedure('public.planned_editor_payload_snapshot_safe_base_v1(jsonb)') is null then
    alter function public.planned_editor_payload_snapshot_safe(jsonb)
      rename to planned_editor_payload_snapshot_safe_base_v1;
  elsif obj_description(
      to_regprocedure('public.planned_editor_payload_snapshot_safe(jsonb)')::oid,
      'pg_proc'
    ) is distinct from 'NEXO CLUB Tareas métricas V1: extensión cerrada del validador histórico' then
    raise exception 'Ya existe un validador con nombre público no reconocido; se revierte la migración';
  end if;
end $preflight$;

alter function public.planned_editor_payload_snapshot_safe_base_v1(jsonb) owner to postgres;
revoke all on function public.planned_editor_payload_snapshot_safe_base_v1(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.planned_editor_payload_snapshot_safe(p_payload jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_board jsonb;
  v_calibration jsonb;
  v_measurement jsonb;
  v_endpoint jsonb;
  v_element jsonb;
  v_spatial jsonb;
  v_sanitized_element jsonb;
  v_assignments jsonb;
  v_sanitized_assignments jsonb;
  v_assignment jsonb;
  v_sanitized_assignment jsonb;
  v_sanitized_players jsonb := '[]'::jsonb;
  v_sanitized_elements jsonb := '[]'::jsonb;
  v_sanitized_payload jsonb;
  v_text text;
  v_normalized_text text;
  v_view_length numeric := 100;
  v_view_width numeric := 72;
  v_material_width numeric;
  v_material_height numeric;
  v_material_rotation numeric;
  v_half_x numeric;
  v_half_y numeric;
begin
  -- Conserva íntegramente todos los casos admitidos por el contrato instalado.
  if public.planned_editor_payload_snapshot_safe_base_v1(p_payload) then
    return true;
  end if;

  if jsonb_typeof(p_payload) is distinct from 'object' or
     p_payload->'schemaVersion' is distinct from '1'::jsonb or
     (p_payload - array['schemaVersion', 'board', 'assignments']) <> '{}'::jsonb then
    return false;
  end if;

  v_board := p_payload->'board';
  if jsonb_typeof(v_board) is distinct from 'object' or
     (v_board - array['pitchType', 'elements', 'metricCalibration', 'measurements']) <> '{}'::jsonb or
     coalesce(v_board->>'pitchType', '') not in ('full', 'half', 'blank', 'penalty-area') or
     jsonb_typeof(v_board->'elements') is distinct from 'array' then
    return false;
  end if;

  if v_board ? 'metricCalibration' then
    v_calibration := v_board->'metricCalibration';
    if jsonb_typeof(v_calibration) is distinct from 'object' or
       (v_calibration - array[
         'version', 'unit', 'fieldLengthM', 'fieldWidthM', 'viewOriginXM',
         'viewLengthM', 'viewWidthM', 'gridStepM', 'showGrid', 'snapToGrid',
         'showZoneDimensions', 'showMeasurements'
       ]) <> '{}'::jsonb or
       v_calibration->'version' is distinct from '1'::jsonb or
       v_calibration->>'unit' <> 'm' or
       jsonb_typeof(v_calibration->'fieldLengthM') is distinct from 'number' or
       jsonb_typeof(v_calibration->'fieldWidthM') is distinct from 'number' or
       jsonb_typeof(v_calibration->'viewOriginXM') is distinct from 'number' or
       jsonb_typeof(v_calibration->'viewLengthM') is distinct from 'number' or
       jsonb_typeof(v_calibration->'viewWidthM') is distinct from 'number' or
       jsonb_typeof(v_calibration->'gridStepM') is distinct from 'number' or
       (v_calibration->>'fieldLengthM')::numeric <> 105 or
       (v_calibration->>'fieldWidthM')::numeric <> 60 or
       (v_calibration->>'viewWidthM')::numeric <> 60 or
       (v_calibration->>'gridStepM')::numeric not in (1, 2, 5, 10) or
       jsonb_typeof(v_calibration->'showGrid') is distinct from 'boolean' or
       jsonb_typeof(v_calibration->'snapToGrid') is distinct from 'boolean' or
       jsonb_typeof(v_calibration->'showZoneDimensions') is distinct from 'boolean' or
       jsonb_typeof(v_calibration->'showMeasurements') is distinct from 'boolean' then
      return false;
    end if;
    if v_board->>'pitchType' in ('half', 'penalty-area') then
      if (v_calibration->>'viewOriginXM')::numeric <> 52.5 or
         (v_calibration->>'viewLengthM')::numeric <> 52.5 then return false; end if;
    elsif (v_calibration->>'viewOriginXM')::numeric <> 0 or
          (v_calibration->>'viewLengthM')::numeric <> 105 then
      return false;
    end if;
    v_view_length := (v_calibration->>'viewLengthM')::numeric;
    v_view_width := (v_calibration->>'viewWidthM')::numeric;
  elsif v_board ? 'measurements' then
    return false;
  end if;

  if v_board ? 'measurements' then
    if jsonb_typeof(v_board->'measurements') is distinct from 'array' then return false; end if;
    if exists (
      select 1 from jsonb_array_elements(v_board->'measurements') item
      group by item->>'id' having count(*) > 1
    ) then return false; end if;
    for v_measurement in select value from jsonb_array_elements(v_board->'measurements') loop
      if jsonb_typeof(v_measurement) is distinct from 'object' or
         (v_measurement - array['id', 'from', 'to', 'colorKey', 'label', 'visible']) <> '{}'::jsonb or
         jsonb_typeof(v_measurement->'id') is distinct from 'string' or
         coalesce(v_measurement->>'id', '') = '' or
         jsonb_typeof(v_measurement->'from') is distinct from 'object' or
         jsonb_typeof(v_measurement->'to') is distinct from 'object' or
         (v_measurement ? 'colorKey' and jsonb_typeof(v_measurement->'colorKey') is distinct from 'string') or
         (v_measurement ? 'label' and jsonb_typeof(v_measurement->'label') is distinct from 'string') or
         (v_measurement ? 'visible' and jsonb_typeof(v_measurement->'visible') is distinct from 'boolean') then
        return false;
      end if;
      foreach v_endpoint in array array[v_measurement->'from', v_measurement->'to'] loop
        if v_endpoint->>'kind' = 'point' then
          if (v_endpoint - array['kind', 'x', 'y']) <> '{}'::jsonb or
             jsonb_typeof(v_endpoint->'x') is distinct from 'number' or
             jsonb_typeof(v_endpoint->'y') is distinct from 'number' or
             (v_endpoint->>'x')::numeric < 0 or
             (v_endpoint->>'x')::numeric > (v_calibration->>'viewLengthM')::numeric or
             (v_endpoint->>'y')::numeric < 0 or
             (v_endpoint->>'y')::numeric > 60 then return false; end if;
        elsif v_endpoint->>'kind' = 'element' then
          if (v_endpoint - array['kind', 'elementId']) <> '{}'::jsonb or
             jsonb_typeof(v_endpoint->'elementId') is distinct from 'string' or
             coalesce(v_endpoint->>'elementId', '') = '' or not exists (
               select 1 from jsonb_array_elements(v_board->'elements') candidate
               where candidate->>'id' = v_endpoint->>'elementId'
             ) then return false; end if;
        else
          return false;
        end if;
      end loop;
    end loop;
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_board->'elements') item
    group by item->>'id' having count(*) > 1
  ) then return false; end if;

  for v_element in select value from jsonb_array_elements(v_board->'elements') loop
    if jsonb_typeof(v_element) is distinct from 'object' then return false; end if;
    if v_element->>'type' = 'conditional_material' then
      if (v_element ?& array[
          'id', 'type', 'x', 'y', 'materialKey', 'colorKey', 'rotation', 'width', 'height'
        ]) is not true or (v_element - array[
          'id', 'type', 'x', 'y', 'materialKey', 'colorKey', 'rotation', 'width', 'height'
        ]) <> '{}'::jsonb or
         coalesce(v_element->>'id', '') = '' or
         jsonb_typeof(v_element->'id') is distinct from 'string' or
         jsonb_typeof(v_element->'materialKey') is distinct from 'string' or
         v_element->>'materialKey' not in (
           'dumbbell', 'kettlebell', 'barbell', 'weight_plate', 'medicine_ball',
           'bosu', 'fitball', 'balance_platform', 'coordination_ladder', 'hoops',
           'low_hurdle', 'plyometric_box', 'step', 'low_obstacle',
           'resistance_band', 'resistance_tube', 'trx', 'exercise_mat', 'gym_mat',
           'ab_wheel', 'drag_sled', 'resistance_parachute'
         ) or
         jsonb_typeof(v_element->'colorKey') is distinct from 'string' or
         v_element->>'colorKey' not in ('blue', 'red', 'yellow', 'green', 'orange', 'purple', 'white', 'black') or
         jsonb_typeof(v_element->'x') is distinct from 'number' or
         jsonb_typeof(v_element->'y') is distinct from 'number' or
         jsonb_typeof(v_element->'rotation') is distinct from 'number' or
         jsonb_typeof(v_element->'width') is distinct from 'number' or
         jsonb_typeof(v_element->'height') is distinct from 'number' then return false; end if;
      v_material_width := (v_element->>'width')::numeric;
      v_material_height := (v_element->>'height')::numeric;
      v_material_rotation := (v_element->>'rotation')::numeric;
      if v_material_width < 3 or v_material_width > 56 or
         v_material_height < 3 or v_material_height > 24 or
         v_material_rotation not in (0, 90, 180, 270) then return false; end if;
      if v_material_rotation in (90, 270) then
        v_half_x := v_material_height / 2;
        v_half_y := v_material_width / 2;
      else
        v_half_x := v_material_width / 2;
        v_half_y := v_material_height / 2;
      end if;
      if (v_element->>'x')::numeric < v_half_x or
         (v_element->>'x')::numeric > v_view_length - v_half_x or
         (v_element->>'y')::numeric < v_half_y or
         (v_element->>'y')::numeric > v_view_width - v_half_y then return false; end if;
      -- El validador histórico no conoce este tipo. Se excluye solo después de
      -- validar de forma cerrada el catálogo, la geometría y todos sus campos.
    else
      if v_element ? 'spatialPosition' then
        v_spatial := v_element->'spatialPosition';
        if jsonb_typeof(v_spatial) is distinct from 'object' or
           (v_spatial - array['version', 'widthM', 'lengthM']) <> '{}'::jsonb or
           v_spatial->'version' is distinct from '1'::jsonb or
           jsonb_typeof(v_spatial->'widthM') is distinct from 'number' or
           jsonb_typeof(v_spatial->'lengthM') is distinct from 'number' then return false; end if;
      end if;
      if (v_element ? 'spatialMode' and v_element->>'spatialMode' <> 'measured') or
         (v_element ? 'zoneWidthM' and jsonb_typeof(v_element->'zoneWidthM') is distinct from 'number') or
         (v_element ? 'zoneLengthM' and jsonb_typeof(v_element->'zoneLengthM') is distinct from 'number') then
        return false;
      end if;
      v_sanitized_element := v_element - array[
        'spatialPosition', 'spatialMode', 'zoneWidthM', 'zoneLengthM'
      ];
      -- El validador base conserva todas sus comprobaciones estructurales. Solo
      -- neutralizamos texto visible para que una barra legítima no se confunda
      -- con una ruta; tipos no-string y claves desconocidas permanecen intactos.
      if jsonb_typeof(v_sanitized_element->'label') = 'string' then
        v_sanitized_element := jsonb_set(v_sanitized_element, '{label}', '"texto"'::jsonb);
      end if;
      if jsonb_typeof(v_sanitized_element#>'{playerRef,snapshot}') = 'object' then
        foreach v_text in array array['name', 'number', 'position', 'specificPosition'] loop
          if jsonb_typeof(v_sanitized_element#>array['playerRef','snapshot',v_text]) = 'string' then
            v_sanitized_element := jsonb_set(
              v_sanitized_element, array['playerRef','snapshot',v_text], '"texto"'::jsonb, false
            );
          end if;
        end loop;
      end if;
      v_sanitized_elements := v_sanitized_elements || jsonb_build_array(v_sanitized_element);
    end if;
  end loop;

  v_assignments := p_payload->'assignments';
  v_sanitized_assignments := v_assignments;
  if jsonb_typeof(v_assignments) = 'object' and jsonb_typeof(v_assignments->'players') = 'array' then
    for v_assignment in select value from jsonb_array_elements(v_assignments->'players') loop
      v_sanitized_assignment := v_assignment;
      if jsonb_typeof(v_sanitized_assignment#>'{playerRef,snapshot}') = 'object' then
        foreach v_text in array array['name', 'number', 'position', 'specificPosition'] loop
          if jsonb_typeof(v_sanitized_assignment#>array['playerRef','snapshot',v_text]) = 'string' then
            v_sanitized_assignment := jsonb_set(
              v_sanitized_assignment, array['playerRef','snapshot',v_text], '"texto"'::jsonb, false
            );
          end if;
        end loop;
      end if;
      v_sanitized_players := v_sanitized_players || jsonb_build_array(v_sanitized_assignment);
    end loop;
    v_sanitized_assignments := jsonb_set(v_assignments, '{players}', v_sanitized_players, false);
  end if;

  -- El validador histórico sigue comprobando elementos base, asignaciones y jugadores.
  v_sanitized_payload := jsonb_set(
    p_payload,
    '{board}',
    (v_board - array['metricCalibration', 'measurements']) ||
      jsonb_build_object('elements', v_sanitized_elements)
  );
  if p_payload ? 'assignments' then
    v_sanitized_payload := jsonb_set(
      v_sanitized_payload, '{assignments}', v_sanitized_assignments, false
    );
  end if;
  if public.planned_editor_payload_snapshot_safe_base_v1(v_sanitized_payload) is not true then
    return false;
  end if;

  -- Ninguna etiqueta o extensión puede introducir rutas, URLs o recursos opacos.
  -- Las barras internas son texto legítimo (p. ej. Ataque/Defensa). Se rechazan
  -- únicamente esquemas de recursos, base64 y cadenas con forma de ruta.
  for v_text in
    with recursive nodes(value) as (
      select p_payload
      union all
      select child.value from nodes n cross join lateral (
        select value from jsonb_each(case when jsonb_typeof(n.value) = 'object' then n.value else '{}'::jsonb end)
        union all
        select value from jsonb_array_elements(case when jsonb_typeof(n.value) = 'array' then n.value else '[]'::jsonb end)
      ) child
    )
    select value #>> '{}' from nodes where jsonb_typeof(value) = 'string'
  loop
    v_normalized_text := lower(ltrim(v_text));
    if position('base64,' in v_normalized_text) > 0 or
       v_normalized_text ~ '(data|blob|file):' or
       v_normalized_text ~ '(https?|ftp)://' or
       v_normalized_text ~ '(^|[[:space:]("])/[^[:space:]]' or
       v_normalized_text ~ '(^|[[:space:]("])[.][.]?[\\/]' or
       v_normalized_text ~ '(^|[[:space:]("])[a-z]:[\\/]' or
       position(chr(92) || chr(92) in v_normalized_text) > 0 then return false; end if;
  end loop;
  return true;
end
$function$;

alter function public.planned_editor_payload_snapshot_safe(jsonb) owner to postgres;
revoke all on function public.planned_editor_payload_snapshot_safe(jsonb)
  from public, anon, authenticated, service_role;
comment on function public.planned_editor_payload_snapshot_safe(jsonb) is
  'NEXO CLUB Tareas métricas V1: extensión cerrada del validador histórico';

-- CREATE OR REPLACE con la definición instalada exacta invalida cualquier plan
-- PL/pgSQL previo que todavía apuntase al OID renombrado. No se parchea ni se
-- altera el comportamiento de snapshots o guardado: al recompilar, sus llamadas
-- nominales resuelven el nuevo wrapper público.
do $refresh_callers$
declare
  v_signature text;
  v_definition text;
begin
  foreach v_signature in array array[
    'public.planned_library_snapshot(uuid)',
    'public.save_planned_session_03c(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])'
  ] loop
    select pg_get_functiondef(to_regprocedure(v_signature)::oid) into v_definition;
    if v_definition is null or
       position('public.planned_editor_payload_snapshot_safe' in v_definition) = 0 then
      raise exception 'El procedimiento % no utiliza el validador público esperado', v_signature;
    end if;
    execute v_definition;
  end loop;
end $refresh_callers$;

do $postflight$
declare
  v_sample jsonb := '{
    "schemaVersion": 1,
    "board": {
      "pitchType": "full",
      "elements": [
        {"id":"cone-1","type":"cone","x":10,"y":10,"colorKey":"yellow"},
        {"id":"cone-2","type":"cone","x":20,"y":10,"colorKey":"yellow"},
        {"id":"material-1","type":"conditional_material","x":50,"y":30,
         "materialKey":"dumbbell","colorKey":"yellow","rotation":0,"width":10,"height":7},
        {"id":"text-1","type":"text","x":40,"y":20,"colorKey":"white","label":"Ataque/Defensa"}
      ],
      "metricCalibration": {
        "version":1,"unit":"m","fieldLengthM":105,"fieldWidthM":60,
        "viewOriginXM":0,"viewLengthM":105,"viewWidthM":60,"gridStepM":5,
        "showGrid":true,"snapToGrid":true,"showZoneDimensions":true,"showMeasurements":true
      },
      "measurements": [{
        "id":"measure-1","from":{"kind":"element","elementId":"cone-1"},
        "to":{"kind":"element","elementId":"cone-2"},"visible":true
      }]
    }
  }'::jsonb;
  v_legacy_slash jsonb := '{
    "schemaVersion":1,"board":{"pitchType":"full","elements":[
      {"id":"text-legacy","type":"text","x":30,"y":20,"label":"Ataque/Defensa","colorKey":"white"}
    ]}
  }'::jsonb;
  v_snapshot_definition text;
  v_save_definition text;
begin
  if public.planned_editor_payload_snapshot_safe(v_sample) is not true or
     public.planned_editor_payload_snapshot_safe(v_legacy_slash) is not true or
     public.planned_editor_payload_snapshot_safe('{}'::jsonb) is not true then
    raise exception 'El contrato ampliado de snapshots de Tareas no es válido; se revierte todo';
  end if;
  select pg_get_functiondef(to_regprocedure('public.planned_library_snapshot(uuid)')::oid)
    into v_snapshot_definition;
  select pg_get_functiondef(to_regprocedure(
    'public.save_planned_session_03c(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])'
  )::oid) into v_save_definition;
  if position('public.planned_editor_payload_snapshot_safe' in v_snapshot_definition) = 0 or
     position('public.planned_library_snapshot' in v_save_definition) = 0 or
     position('public.planned_editor_payload_snapshot_safe' in v_save_definition) = 0 then
    raise exception 'Los procedimientos reales de snapshots/guardado no quedaron conectados al wrapper';
  end if;
end $postflight$;

commit;
