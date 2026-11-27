import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TRAINING_CONDITIONAL_MATERIALS } from '../src/utils/trainingTaskBoardElements.js';

const migration = fs.readFileSync(new URL('../supabase_training_task_metric_board_v1.sql', import.meta.url), 'utf8');
const verifier = fs.readFileSync(new URL('../supabase_training_task_metric_board_v1_verify.sql', import.meta.url), 'utf8');

assert.match(migration, /^begin;/i, 'la migración debe ser transaccional');
assert.match(migration, /commit;\s*$/i, 'la migración debe cerrar la transacción');
assert.match(migration, /rename to planned_editor_payload_snapshot_safe_base_v1/i, 'conserva el validador instalado');
assert.match(migration, /planned_editor_payload_snapshot_safe_base_v1\(p_payload\)/i, 'el contrato histórico sigue siendo la primera validación');
assert.match(migration, /metricCalibration/);
assert.match(migration, /measurements/);
assert.match(migration, /conditional_material/);
for (const material of TRAINING_CONDITIONAL_MATERIALS) {
  assert.match(migration, new RegExp(`'${material.id}'`), `incluye el material real ${material.id}`);
}
assert.equal(TRAINING_CONDITIONAL_MATERIALS.length, 22, 'el contrato SQL cubre el catálogo actual completo');
assert.match(migration, /v_material_width < 3[\s\S]*v_material_width > 56/i);
assert.match(migration, /v_material_rotation not in \(0, 90, 180, 270\)/i);
assert.match(migration, /v_view_length - v_half_x/i, 'la huella completa debe quedar dentro del campo');
assert.match(migration, /Ataque\/Defensa/, 'una barra interna legítima forma parte del postflight positivo');
assert.doesNotMatch(migration, /position\('\/' in v_text\)/i, 'no rechaza cualquier barra de forma indiscriminada');
assert.match(migration, /\(data\|blob\|file\):/i);
assert.match(migration, /\(https\?\|ftp\):\/\//i);
assert.match(migration, /position\('base64,' in v_normalized_text\)/i);
assert.match(migration, /do \$refresh_callers\$/i);
assert.match(migration, /execute v_definition/i, 'recompila las definiciones instaladas exactas sin parchearlas');
assert.match(migration, /planned_library_snapshot\(uuid\)/i);
assert.match(migration, /save_planned_session_03c\(uuid,integer,date,jsonb,jsonb,integer,uuid\[\],uuid\[\]\)/i);
assert.match(migration, /revoke all on function public\.planned_editor_payload_snapshot_safe\(jsonb\)/i);
assert.doesNotMatch(migration, /disable\s+row\s+level\s+security/i);
assert.doesNotMatch(migration, /grant\s+execute[\s\S]*service_role/i, 'no concede ejecución a clientes ni service_role');

for (const sample of ['metric_known_material_and_slash', 'unknown_material', 'material_outside_field',
  'material_invalid_width', 'material_invalid_rotation', 'material_unknown_field',
  'material_unknown_color',
  'external_https_resource', 'embedded_base64_resource', 'windows_file_path', 'posix_file_path']) {
  assert.match(verifier, new RegExp(sample), `el verificador cubre ${sample}`);
}
assert.match(verifier, /usa_validador_publico/);
assert.match(verifier, /guardado_usa_snapshot_real/);
assert.match(verifier, /anon_bloqueado/);
assert.match(verifier, /cliente_bloqueado/);

console.log('training task metric board SQL static audit passed (not PostgreSQL execution)');
