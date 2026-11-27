-- Solo lectura. Ejecutar después de instalar supabase_training_task_metric_board_v1.sql.
with samples(name, payload, expected) as (
  values
    ('legacy_empty', '{}'::jsonb, true),
    ('metric_full', '{
      "schemaVersion":1,"board":{"pitchType":"full","elements":[
        {"id":"cone-1","type":"cone","x":10,"y":10,"colorKey":"yellow"},
        {"id":"cone-2","type":"cone","x":20,"y":10,"colorKey":"yellow"}
      ],"metricCalibration":{"version":1,"unit":"m","fieldLengthM":105,
        "fieldWidthM":60,"viewOriginXM":0,"viewLengthM":105,"viewWidthM":60,
        "gridStepM":5,"showGrid":true,"snapToGrid":true,
        "showZoneDimensions":true,"showMeasurements":true},"measurements":[{
          "id":"measure-1","from":{"kind":"element","elementId":"cone-1"},
          "to":{"kind":"element","elementId":"cone-2"},"visible":true
        }]}}'::jsonb, true),
    ('unknown_extension', '{"schemaVersion":1,"board":{"pitchType":"full","elements":[],
      "metricCalibration":{"version":1,"unit":"m","fieldLengthM":105,"fieldWidthM":60,
      "viewOriginXM":0,"viewLengthM":105,"viewWidthM":60,"gridStepM":5,
      "showGrid":false,"snapToGrid":false,"showZoneDimensions":true,"showMeasurements":true,
      "unknown":true}}}'::jsonb, false),
    ('embedded_resource', '{"schemaVersion":1,"board":{"pitchType":"full","elements":[],
      "metricCalibration":{"version":1,"unit":"m","fieldLengthM":105,"fieldWidthM":60,
      "viewOriginXM":0,"viewLengthM":105,"viewWidthM":60,"gridStepM":5,
      "showGrid":false,"snapToGrid":false,"showZoneDimensions":true,"showMeasurements":true},
      "measurements":[{"id":"m","from":{"kind":"point","x":1,"y":1},
      "to":{"kind":"point","x":2,"y":2},"label":"data:image/png;base64,AAAA"}]}}'::jsonb, false)
), results as (
  select name, expected,
    public.planned_editor_payload_snapshot_safe(payload) as actual
  from samples
)
select name, expected, actual, actual is not distinct from expected as ok
from results
order by name;

select
  to_regprocedure('public.planned_editor_payload_snapshot_safe(jsonb)') is not null as wrapper_instalado,
  to_regprocedure('public.planned_editor_payload_snapshot_safe_base_v1(jsonb)') is not null as validador_historico_conservado,
  obj_description(to_regprocedure('public.planned_editor_payload_snapshot_safe(jsonb)')::oid, 'pg_proc') as contrato,
  not has_function_privilege('anon', 'public.planned_editor_payload_snapshot_safe(jsonb)', 'EXECUTE') as anon_bloqueado,
  not has_function_privilege('authenticated', 'public.planned_editor_payload_snapshot_safe(jsonb)', 'EXECUTE') as cliente_bloqueado;
