import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(new URL('../supabase_training_task_metric_board_v1.sql', import.meta.url), 'utf8');
const verifier = fs.readFileSync(new URL('../supabase_training_task_metric_board_v1_verify.sql', import.meta.url), 'utf8');

assert.match(migration, /^begin;/i, 'la migración debe ser transaccional');
assert.match(migration, /commit;\s*$/i, 'la migración debe cerrar la transacción');
assert.match(migration, /rename to planned_editor_payload_snapshot_safe_base_v1/i, 'conserva el validador instalado');
assert.match(migration, /planned_editor_payload_snapshot_safe_base_v1\(p_payload\)/i, 'el contrato histórico sigue siendo la primera validación');
assert.match(migration, /metricCalibration/);
assert.match(migration, /measurements/);
assert.match(migration, /conditional_material/);
assert.match(migration, /position\('\/' in v_text\)/i, 'las extensiones mantienen el rechazo de rutas y recursos');
assert.match(migration, /revoke all on function public\.planned_editor_payload_snapshot_safe\(jsonb\)/i);
assert.doesNotMatch(migration, /disable\s+row\s+level\s+security/i);
assert.doesNotMatch(migration, /grant\s+execute[\s\S]*service_role/i, 'no concede ejecución a clientes ni service_role');

assert.match(verifier, /unknown_extension/);
assert.match(verifier, /embedded_resource/);
assert.match(verifier, /anon_bloqueado/);
assert.match(verifier, /cliente_bloqueado/);

console.log('training task metric board SQL static audit passed (not PostgreSQL execution)');
