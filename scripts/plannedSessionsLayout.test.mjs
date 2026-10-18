import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const component = readFileSync(new URL('../src/components/training/PlannedSessionsSection.jsx', import.meta.url), 'utf8');

assert.match(component, /slot\.items\.length === 2 \? 'lg:grid-cols-2' : 'grid-cols-1'/,
  'una tarea ocupa todo el ancho y dos tareas forman columnas en escritorio');
assert.match(component, /slot\.items\.map\(\(item, index\) =>[\s\S]*?item\.title\.trim\(\)/,
  'la tarjeta cerrada muestra los títulos de cada tarea');
assert.match(component, /\+ Añadir segunda tarea/);
assert.match(component, /Retirar segunda tarea/);
assert.match(component, /window\.confirm\('¿Retirar la segunda tarea al guardar\?/,
  'retirar la segunda tarea exige confirmación');
assert.match(component, /↑ Subir/);
assert.match(component, /↓ Bajar/);
assert.match(component, /Retirar ejercicio/);
assert.match(component, /setValidationIssues\(issues\); setExpandedSlotId\(issues\.find\(\(issue\) => issue\.slotId\)/,
  'la validación despliega el ejercicio afectado');

console.log('planned sessions layout audit passed');
