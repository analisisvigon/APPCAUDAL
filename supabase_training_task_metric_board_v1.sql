begin;

do $preflight$
begin
  if to_regprocedure('public.planned_editor_payload_snapshot_safe(jsonb)') is null then
    raise exception 'Falta planned_editor_payload_snapshot_safe(jsonb); no se modifica Supabase';
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
  v_sanitized_elements jsonb := '[]'::jsonb;
  v_sanitized_payload jsonb;
  v_text text;
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
      if (v_element - array[
          'id', 'type', 'x', 'y', 'materialKey', 'colorKey', 'rotation', 'width', 'height'
        ]) <> '{}'::jsonb or
         coalesce(v_element->>'id', '') = '' or
         coalesce(v_element->>'materialKey', '') = '' or
         jsonb_typeof(v_element->'id') is distinct from 'string' or
         jsonb_typeof(v_element->'materialKey') is distinct from 'string' or
         jsonb_typeof(v_element->'x') is distinct from 'number' or
         jsonb_typeof(v_element->'y') is distinct from 'number' or
         (v_element ? 'colorKey' and jsonb_typeof(v_element->'colorKey') is distinct from 'string') or
         (v_element ? 'rotation' and jsonb_typeof(v_element->'rotation') is distinct from 'number') or
         (v_element ? 'width' and jsonb_typeof(v_element->'width') is distinct from 'number') or
         (v_element ? 'height' and jsonb_typeof(v_element->'height') is distinct from 'number') then return false; end if;
      v_sanitized_elements := v_sanitized_elements;
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
      v_sanitized_elements := v_sanitized_elements || jsonb_build_array(
        v_element - array['spatialPosition', 'spatialMode', 'zoneWidthM', 'zoneLengthM']
      );
    end if;
  end loop;

  -- El validador histórico sigue comprobando elementos base, asignaciones y jugadores.
  v_sanitized_payload := jsonb_set(
    p_payload,
    '{board}',
    (v_board - array['metricCalibration', 'measurements']) ||
      jsonb_build_object('elements', v_sanitized_elements)
  );
  if public.planned_editor_payload_snapshot_safe_base_v1(v_sanitized_payload) is not true then
    return false;
  end if;

  -- Ninguna etiqueta o extensión puede introducir rutas, URLs o recursos opacos.
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
    if position('/' in v_text) > 0 or position(chr(92) in v_text) > 0 or
       lower(ltrim(v_text)) like 'blob:%' or lower(ltrim(v_text)) like 'data:%' or
       lower(ltrim(v_text)) like 'file:%' then return false; end if;
  end loop;
  return true;
end
$function$;

alter function public.planned_editor_payload_snapshot_safe(jsonb) owner to postgres;
revoke all on function public.planned_editor_payload_snapshot_safe(jsonb)
  from public, anon, authenticated, service_role;
comment on function public.planned_editor_payload_snapshot_safe(jsonb) is
  'NEXO CLUB Tareas métricas V1: extensión cerrada del validador histórico';

do $postflight$
declare
  v_sample jsonb := '{
    "schemaVersion": 1,
    "board": {
      "pitchType": "full",
      "elements": [
        {"id":"cone-1","type":"cone","x":10,"y":10,"colorKey":"yellow"},
        {"id":"cone-2","type":"cone","x":20,"y":10,"colorKey":"yellow"}
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
begin
  if public.planned_editor_payload_snapshot_safe(v_sample) is not true or
     public.planned_editor_payload_snapshot_safe('{}'::jsonb) is not true then
    raise exception 'El contrato ampliado de snapshots de Tareas no es válido; se revierte todo';
  end if;
end $postflight$;

commit;
