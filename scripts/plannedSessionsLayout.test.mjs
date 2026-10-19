import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const section = readFileSync(new URL('../src/components/training/PlannedSessionsSection.jsx', import.meta.url), 'utf8');
const document = readFileSync(new URL('../src/components/training/PlannedSessionDocument.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/components/training/plannedSessionDocument.css', import.meta.url), 'utf8');

assert.match(section, /<PlannedSessionDocument editor=\{editor\}/,
  'el editor activo usa la plantilla visual');
assert.match(document, /slot\.items\.map\(\(task, index\) => \{/,
  'ambas tareas se editan dentro del ejercicio');
assert.match(css, /\.planned-sheet-task-columns-dual \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
  'dos tareas tienen columnas equivalentes');
assert.match(css, /width: 297mm; min-height: 210mm/,
  'la hoja conserva el formato A4 horizontal');
assert.match(css, /background: #fff; color: #111/,
  'la hoja es blanca con tipografía oscura');
assert.match(document, /<div className="planned-sheet-cover-notes">[\s\S]*?field\('Material'[\s\S]*?field\('Observaciones del cuerpo técnico'/,
  'material y observaciones del cuerpo técnico están en la primera hoja');
assert.equal((document.match(/field\('Material'/g) || []).length, 1,
  'material no se repite en hojas posteriores');
assert.equal((document.match(/field\('Observaciones del cuerpo técnico'/g) || []).length, 1,
  'observaciones del cuerpo técnico no se repiten');
assert.doesNotMatch(document, /Pendiente de integración · sin datos guardados|Plantilla actual pendiente|planned-sheet-library-pending/,
  'las zonas reservadas no imprimen avisos repetitivos');
assert.match(document, /<option value="fit">Ajustar a pantalla<\/option>/,
  'el zoom manual conserva una opción de ajuste a pantalla');
assert.match(css, /\.planned-document-pages \{ zoom: 100% !important/,
  'el zoom de pantalla no cambia la escala de impresión');
assert.match(css, /@media print \{[^{}]*\.planned-sheet-reserved-hint[^{}]*\{ display: none !important/,
  'las indicaciones de zonas reservadas se ocultan al imprimir');
assert.match(css, /@media print \{[^{}]*\.planned-sheet-library-picker[^{}]*\{ display: none !important/,
  'el selector de Biblioteca no se imprime');
assert.match(document, /\+ Añadir segunda tarea/);
assert.match(document, /Retirar segunda tarea/);
assert.match(document, /<LibraryTaskPicker task=\{task\}/,
  'cada tarea del ejercicio permite elegir una actividad de Biblioteca');
assert.match(document, /<TrainingTaskBoardPreview payload=\{getPlannedLibraryValue\(task, 'editor_payload'\)/,
  'la copia usa el renderer ya existente de Biblioteca');
assert.match(document, /\['empty', 'v1'\]\.includes\(boardKind\)/,
  'la pizarra desconocida o inválida no se ofrece para edición');
assert.match(document, /!task\.snapshot \? <p className="planned-sheet-copy-note">Vista previa/,
  'la edición de la copia espera al snapshot generado por el servidor');
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
