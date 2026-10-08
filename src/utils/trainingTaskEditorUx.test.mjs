import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sectionSource = await readFile(new URL('../components/training/TrainingTasksSection.jsx', import.meta.url), 'utf8');
const mediaSource = await readFile(new URL('../components/training/TrainingTaskMediaPanel.jsx', import.meta.url), 'utf8');

for (const section of ['Información', 'Organización', 'Contenido', 'Diseño', 'Multimedia', 'POST']) {
  assert.match(sectionSource, new RegExp(`'${section}'`), `la navegación incluye ${section}`);
}
assert.match(sectionSource, /grid-cols-2[\s\S]*sm:grid-cols-3[\s\S]*xl:grid-cols-6/, 'la navegación evita scroll horizontal y adapta sus columnas');
assert.match(sectionSource, /role="tab" aria-selected=\{active === key\} aria-controls=/, 'cada apartado expone estado y relación accesibles');
assert.match(sectionSource, /role="tabpanel" aria-labelledby=/, 'el contenido activo está asociado a su control');

const navigationSource = sectionSource.slice(
  sectionSource.indexOf('function TaskSectionNavigation'),
  sectionSource.indexOf('function TaskSectionPanel'),
);
assert.match(navigationSource, /onClick=\{\(\) => onChange\(key\)\}/, 'cambiar de apartado solo actualiza navegación local');
assert.doesNotMatch(navigationSource, /onSave|setDraft|saveTrainingTask/, 'navegar no guarda ni reconstruye el borrador');
assert.match(sectionSource, /const \[activeSection, setActiveSection\] = useState\('information'\)/, 'el apartado activo no sustituye el estado del draft');

for (const field of ['name', 'taskType', 'taskCode', 'objective', 'description', 'playersSpec', 'playersMin', 'playersMax', 'durationMinutes', 'spaceWidthM', 'spaceLengthM', 'material', 'gamePhase', 'gameMoment', 'technicalContent', 'tacticalContent', 'observations', 'stageKeys', 'variants']) {
  assert.match(sectionSource, new RegExp(`draft\\.${field}`), `se conserva el campo ${field}`);
}
assert.match(sectionSource, /sticky bottom-2[\s\S]*onClick=\{onSave\}/, 'guardar y cancelar permanecen accesibles al final de apartados largos');
assert.match(sectionSource, /disabled=\{saving\}/, 'el guardado mantiene su estado disabled');
assert.match(sectionSource, /TrainingTaskBoardEditor players=\{players\} payload=\{draft\.editorPayload\} onPayloadChange=/, 'la pizarra editable mantiene el mismo editor_payload controlado');
assert.match(sectionSource, /TrainingTaskBoardEditor players=\{players\}[\s\S]*readOnly showEmpty=\{false\}/, 'la consulta conserva la pizarra readonly');

assert.match(sectionSource, /TrainingTaskMediaPanel[^>]+embedded/, 'Multimedia se integra visualmente sin reimplementarse');
assert.match(mediaSource, /embedded = false/, 'el panel multimedia conserva su comportamiento y admite presentación integrada');
assert.match(sectionSource, /FeedbackPanel \{\.\.\.feedback\}/, 'POST está integrado en una tarea editable ya guardada');
assert.match(sectionSource, /summary\.ratingAverage[\s\S]*rows\.length/, 'POST muestra valoración media y número de registros');
assert.match(sectionSource, /canManage && showForm/, 'el formulario POST no aparece en readonly');
assert.match(sectionSource, /canManage && entry\.author_user_id === userId/, 'editar y eliminar experiencias exige modo editable y autoría');
assert.match(sectionSource, /canManage=\{selected\.author_user_id === userId\}/, 'detalle compartido propaga readonly a Multimedia y POST');
assert.doesNotMatch(sectionSource, /autosave|autoSave/i, 'el pulido no introduce autosave');

console.log('training task editor UX tests passed');
