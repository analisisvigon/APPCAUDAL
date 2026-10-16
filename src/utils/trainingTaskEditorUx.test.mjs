import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sectionSource = await readFile(new URL('../components/training/TrainingTasksSection.jsx', import.meta.url), 'utf8');
const detailSource = await readFile(new URL('../components/training/TrainingTaskDetail.jsx', import.meta.url), 'utf8');
const boardSource = await readFile(new URL('../components/training/TrainingTaskBoardEditor.jsx', import.meta.url), 'utf8');
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
assert.match(detailSource, /TrainingTaskBoardEditor[^>]+players=\{players\}[^>]+readOnly/, 'la consulta conserva la pizarra readonly');
assert.doesNotMatch(detailSource, /TaskSectionNavigation|role="tablist"/, 'la consulta unificada no introduce las seis pestañas');
assert.match(detailSource, /lg:grid-cols-\[minmax\(0,0\.43fr\)_minmax\(0,0\.57fr\)\]/, 'el panel principal reserva aproximadamente 57 % a la pizarra');
assert.match(detailSource, /xl:w-\[min\(96rem,calc\(100vw-4rem\)\)\]/, 'solo el detalle puede aprovechar más ancho que el contenedor global');
assert.doesNotMatch(detailSource, /max-w-4xl/, 'la cabecera no limita artificialmente el ancho útil');
assert.match(boardSource, /readOnly \? 'min-w-0' : 'min-w-\[520px\]'/, 'la pizarra readonly no fuerza scroll horizontal en móvil');

assert.match(detailSource, /TrainingTaskMediaPanel[^>]+canManage=\{false\}[^>]+embedded/, 'Multimedia se consulta sin reimplementarse ni habilitar gestión');
assert.match(mediaSource, /embedded = false/, 'el panel multimedia conserva su comportamiento y admite presentación integrada');
assert.match(sectionSource, /FeedbackPanel \{\.\.\.feedback\}/, 'POST está integrado en una tarea editable ya guardada');
assert.match(sectionSource, /summary\.ratingAverage[\s\S]*rows\.length/, 'POST muestra valoración media y número de registros');
assert.match(sectionSource, /canManage && showForm/, 'el formulario POST no aparece en readonly');
assert.match(sectionSource, /canManage && entry\.author_user_id === userId/, 'editar y eliminar experiencias exige modo editable y autoría');
assert.match(sectionSource, /feedbackContent=\{<FeedbackPanel[\s\S]*canManage=\{false\}/, 'la ficha consulta POST sin habilitar formularios');
assert.match(detailSource, /canEdit \? <button[^>]+onClick=\{\(\) => onEdit/, 'Editar solo aparece para la autoría real');
assert.match(sectionSource, /setSelected\(savedTask\);[\s\S]*setDraft\(null\)/, 'guardar vuelve a la ficha unificada actualizada');
assert.match(sectionSource, /Hay cambios sin guardar[\s\S]*setDraft\(null\)/, 'cancelar protege y descarta únicamente el borrador no confirmado');
assert.match(sectionSource, /<TrainingTaskDetail[\s\S]*key=\{selected\.id\}/, 'cada tarea reinicia de forma segura el estado local de sus acordeones');
assert.doesNotMatch(sectionSource, /autosave|autoSave/i, 'el pulido no introduce autosave');

for (const section of ['organization', 'content', 'media', 'post', 'additional']) {
  assert.match(detailSource, new RegExp(`isOpen=\\{Boolean\\(openSections\\.${section}\\)\\}`), `el acordeón ${section} conserva estado independiente`);
}
assert.match(detailSource, /aria-expanded=\{isOpen\}[\s\S]*aria-controls=\{panelId\}/, 'los acordeones comunican apertura y panel controlado');
assert.match(detailSource, /isOpen \? <div id=\{panelId\} role="region"/, 'un apartado cerrado no monta su contenido pesado');
assert.match(detailSource, /title="Multimedia y archivos"/, 'Multimedia vive en un acordeón propio');
assert.match(detailSource, /title="POST — Evaluación y seguimiento"/, 'POST vive en un acordeón propio');
assert.match(sectionSource, /!draft && !selected \? <header/, 'la cabecera de Biblioteca no duplica altura en consulta o edición');

for (const field of ['taskCode', 'taskType', 'stageKeys', 'playersSpec', 'playersMin', 'playersMax', 'durationMinutes', 'spaceWidthM', 'spaceLengthM', 'objective', 'description', 'gamePhase', 'gameMoment', 'technicalContent', 'tacticalContent', 'material', 'observations', 'variants', 'attachmentName', 'attachmentMime', 'attachmentSize', 'editorPayload', 'created_at', 'updated_at']) {
  assert.match(detailSource, new RegExp(`task\\.${field}`), `la ficha unificada representa ${field}`);
}
assert.match(detailSource, /Sin definir/, 'los campos vacíos permanecen localizables con un estado discreto');

console.log('training task editor UX tests passed');
