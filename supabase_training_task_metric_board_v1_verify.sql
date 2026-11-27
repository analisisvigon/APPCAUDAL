-- Solo lectura. Ejecutar después de instalar supabase_training_task_metric_board_v1.sql.
with fixtures as (
  select '{
    "schemaVersion":1,
    "board":{
      "pitchType":"full",
      "elements":[
        {"id":"cone-1","type":"cone","x":10,"y":10,"colorKey":"yellow"},
        {"id":"material-1","type":"conditional_material","x":50,"y":30,
         "materialKey":"dumbbell","colorKey":"yellow","rotation":0,"width":10,"height":7},
        {"id":"text-1","type":"text","x":40,"y":20,"colorKey":"white","label":"Ataque/Defensa"}
      ],
      "metricCalibration":{"version":1,"unit":"m","fieldLengthM":105,
        "fieldWidthM":60,"viewOriginXM":0,"viewLengthM":105,"viewWidthM":60,
        "gridStepM":5,"showGrid":true,"snapToGrid":true,
        "showZoneDimensions":true,"showMeasurements":true},
      "measurements":[{"id":"measure-1",
        "from":{"kind":"element","elementId":"cone-1"},
        "to":{"kind":"element","elementId":"material-1"},
        "label":"Ataque/Defensa","visible":true}]
    }
  }'::jsonb as metric
), samples(name, payload, expected) as (
  select 'legacy_empty', '{}'::jsonb, true
  union all select 'legacy_text_with_slash', '{"schemaVersion":1,"board":{"pitchType":"full","elements":[
    {"id":"text-legacy","type":"text","x":30,"y":20,"colorKey":"white","label":"Ataque/Defensa"}
  ]}}'::jsonb, true
  union all select 'metric_known_material_and_slash', metric, true from fixtures
  union all select 'unknown_material',
    jsonb_set(metric, '{board,elements,1,materialKey}', '"unknown_material"'::jsonb), false from fixtures
  union all select 'material_outside_field',
    jsonb_set(metric, '{board,elements,1,x}', '1'::jsonb), false from fixtures
  union all select 'material_invalid_width',
    jsonb_set(metric, '{board,elements,1,width}', '0'::jsonb), false from fixtures
  union all select 'material_invalid_rotation',
    jsonb_set(metric, '{board,elements,1,rotation}', '45'::jsonb), false from fixtures
  union all select 'material_unknown_color',
    jsonb_set(metric, '{board,elements,1,colorKey}', '"transparent"'::jsonb), false from fixtures
  union all select 'material_unknown_field',
    jsonb_set(metric, '{board,elements,1}', (metric#>'{board,elements,1}') || '{"resource":"x"}'::jsonb), false from fixtures
  union all select 'unknown_calibration_extension',
    jsonb_set(metric, '{board,metricCalibration}', (metric#>'{board,metricCalibration}') || '{"unknown":true}'::jsonb), false from fixtures
  union all select 'external_https_resource',
    jsonb_set(metric, '{board,measurements,0,label}', '"Consultar https://example.com/image.png"'::jsonb), false from fixtures
  union all select 'embedded_base64_resource',
    jsonb_set(metric, '{board,measurements,0,label}', '"data:image/png;base64,AAAA"'::jsonb), false from fixtures
  union all select 'file_uri_resource',
    jsonb_set(metric, '{board,measurements,0,label}', '"file:///tmp/board.png"'::jsonb), false from fixtures
  union all select 'windows_file_path',
    jsonb_set(metric, '{board,measurements,0,label}', '"Ruta C:\\temp\\board.png"'::jsonb), false from fixtures
  union all select 'relative_file_path',
    jsonb_set(metric, '{board,measurements,0,label}', '"Ruta ../private/board.png"'::jsonb), false from fixtures
  union all select 'posix_file_path',
    jsonb_set(metric, '{board,measurements,0,label}', '"Ruta /tmp/private/board.png"'::jsonb), false from fixtures
), results as (
  select name, expected,
    public.planned_editor_payload_snapshot_safe(payload) as actual
  from samples
)
select name, expected, actual, actual is not distinct from expected as ok
from results
order by name;

with callers(signature, definition) as (
  values
    ('public.planned_library_snapshot(uuid)',
      pg_get_functiondef(to_regprocedure('public.planned_library_snapshot(uuid)')::oid)),
    ('public.save_planned_session_03c(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])',
      pg_get_functiondef(to_regprocedure(
        'public.save_planned_session_03c(uuid,integer,date,jsonb,jsonb,integer,uuid[],uuid[])'
      )::oid))
)
select signature,
  position('public.planned_editor_payload_snapshot_safe' in definition) > 0 as usa_validador_publico,
  case when signature like 'public.save_planned_session_03c%'
    then position('public.planned_library_snapshot' in definition) > 0
    else true end as guardado_usa_snapshot_real
from callers
order by signature;

select
  to_regprocedure('public.planned_editor_payload_snapshot_safe(jsonb)') is not null as wrapper_instalado,
  to_regprocedure('public.planned_editor_payload_snapshot_safe_base_v1(jsonb)') is not null as validador_historico_conservado,
  obj_description(to_regprocedure('public.planned_editor_payload_snapshot_safe(jsonb)')::oid, 'pg_proc') as contrato,
  not has_function_privilege('anon', 'public.planned_editor_payload_snapshot_safe(jsonb)', 'EXECUTE') as anon_bloqueado,
  not has_function_privilege('authenticated', 'public.planned_editor_payload_snapshot_safe(jsonb)', 'EXECUTE') as cliente_bloqueado;
