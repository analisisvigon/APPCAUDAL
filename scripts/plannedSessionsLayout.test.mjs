import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const section = readFileSync(new URL('../src/components/training/PlannedSessionsSection.jsx', import.meta.url), 'utf8');
const document = readFileSync(new URL('../src/components/training/PlannedSessionDocument.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/components/training/plannedSessionDocument.css', import.meta.url), 'utf8');

assert.match(section, /<PlannedSessionDocument editor=\{editor\}/,
  'el editor activo usa la plantilla visual');
assert.match(document, /slot\.items\.map\(\(task, index\) =>/,
  'ambas tareas se editan dentro del ejercicio');
assert.match(css, /\.planned-sheet-task-columns-dual \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
  'dos tareas tienen columnas equivalentes');
assert.match(css, /width: 297mm; min-height: 210mm/,
  'la hoja conserva el formato A4 horizontal');
assert.match(css, /background: #fff; color: #111/,
  'la hoja es blanca con tipografía oscura');
assert.match(document, /\+ Añadir segunda tarea/);
assert.match(document, /Retirar segunda tarea/);
assert.match(section, /window\.confirm\('¿Retirar la segunda tarea al guardar\?/,
  'retirar la segunda tarea exige confirmación');
assert.match(document, /↑ Subir ejercicio/);
assert.match(document, /↓ Bajar ejercicio/);
assert.match(document, /Retirar ejercicio/);
assert.match(css, /@media print \{ \.planned-document-toolbar, \.planned-document-note, \.planned-sheet-tools/,
  'las herramientas de edición quedan fuera de la impresión');
assert.match(section, /setValidationIssues\(issues\); setExpandedSlotId\(issues\.find\(\(issue\) => issue\.slotId\)/,
  'la validación local identifica el ejercicio afectado');
assert.doesNotMatch(document, /ROBERTO JARA|JAVI MORAL|MIGUEL VIGÓN/i,
  'no se reutilizan nombres de la plantilla histórica como datos reales');

console.log('planned sessions layout audit passed');
