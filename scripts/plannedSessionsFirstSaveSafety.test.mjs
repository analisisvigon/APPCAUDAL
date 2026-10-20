import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/training/PlannedSessionsSection.jsx', import.meta.url), 'utf8');

assert.match(source, /let creating = false;[\s\S]*?creating = true;\s*const id = await createPlannedDraft\([\s\S]*?creating = false;/,
  'el primer guardado reconoce si falló antes de recibir el UUID del borrador');
assert.match(source, /else if \(creating\) \{\s*setCreationUncertain\(true\);/,
  'una respuesta incierta bloquea el reintento de creación');
assert.match(source, /creating && \['42501', '23514', '22023'\]\.includes\(cause\?\.code\)/,
  'un rechazo explícito de permisos o validación no se confunde con una respuesta incierta');
assert.match(source, /operationRef\.current \|\| creationUncertain\) return;/,
  'Guardar no vuelve a crear un borrador tras una respuesta incierta');
assert.match(source, /disabled=\{busy \|\| !editorDirty \|\| conflict \|\| creationUncertain \|\| dateNeedsReconciliation\}/,
  'el botón Guardar comunica el bloqueo');
assert.match(source, /const revision = await savePlannedSession\([\s\S]*?const data = await loadPlannedSession\([\s\S]*?setNotice\('Sesión guardada y recargada desde el servidor\.'\)/,
  'el éxito completo solo se muestra después de confirmar y recargar el snapshot');
assert.match(source, /if \(use03c\) setCreationUncertain\(true\);/,
  'si 03C confirma pero falla la recarga se bloquean nuevos guardados hasta verificar el snapshot');
assert.match(source, /if \(dateNeedsReconciliation\) \{[\s\S]*?return;[\s\S]*?const issues = getPlannedEditorIssues/,
  'el guardado 03A/03C no envía una fecha de plantilla congelada');
assert.match(source, /reconcilePlannedDate\(client, editor\.id, editor\.revision, editor\.session_date/,
  'la conciliación de fecha utiliza la revisión CAS de 04B');

console.log('planned sessions first-save safety audit passed');
