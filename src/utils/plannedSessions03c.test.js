import assert from 'node:assert/strict';
import {
  assertPlanned03cReload, buildPlannedSavePayload, canWritePlannedContext,
  createPlannedLibraryItem, getPlannedDuration,
  getPlannedEditorIssues, getPlannedLibraryValue, hasPlannedLibraryItems,
  hydratePlannedEditor,
} from './plannedSessions.js';

const season = { starts_on: '2026-07-01', ends_on: '2027-06-30' };
assert.equal(canWritePlannedContext({ role: 'owner', is_active: true }, { status: 'open' }), true);
assert.equal(canWritePlannedContext({ role: 'admin', is_active: true }, { status: 'open' }), true);
assert.equal(canWritePlannedContext({ role: 'owner', is_active: true }, { status: 'closed' }), false);
assert.equal(canWritePlannedContext({ role: 'staff', is_active: true }, { status: 'open' }), false);
assert.equal(canWritePlannedContext({ role: 'owner', is_active: false }, { status: 'open' }), false);
const session = { id: 'session-1', revision: 4, planning_state: 'draft',
  session_date: '2026-10-18', session_number: null };
const slot = { id: 'slot-1', phase: 'main', sort_order: 0, duration_minutes: 20 };
const task = { id: 'source-1', name: 'Rondo', description: 'Biblioteca original',
  editor_payload: { schemaVersion: 1, board: { pitchType: 'full', elements: [] } },
  duration_minutes: 12, space_width_m: 20, space_length_m: 25 };
const draft = hydratePlannedEditor(session, [slot], [{ id: 'free-1', slot_id: slot.id,
  sort_order: 0, kind: 'free', free_title: 'Actividad libre' }]);
const selected = createPlannedLibraryItem('library-1', task);
const selectedContent = createPlannedLibraryItem('library-content', { ...task,
  exercise_rules: 'Dos toques\nGol doble', tactical_content: 'General heredado',
  tactical_content_offensive: 'Crear\nFinalizar', tactical_content_defensive: 'Cerrar centro' });
assert.equal(getPlannedLibraryValue(selectedContent, 'exercise_rules'), 'Dos toques\nGol doble');
assert.equal(getPlannedLibraryValue(selectedContent, 'tactical_content'), 'General heredado');
assert.equal(getPlannedLibraryValue(selectedContent, 'tactical_content_offensive'), 'Crear\nFinalizar');
assert.equal(getPlannedLibraryValue(selectedContent, 'tactical_content_defensive'), 'Cerrar centro');
const mixed = { ...draft, slots: [{ ...draft.slots[0], items: [draft.slots[0].items[0], selected] }] };
assert.equal(hasPlannedLibraryItems(mixed), true);
assert.equal(getPlannedDuration(mixed.slots), 20, 'las tareas simultáneas no duplican duración');
const seriesSnapshot = { snapshot_version: 1, source_task_id: 'source-1',
  source: { ...task, series_count: 2, minutes_per_series: 6 }, working: {} };
const seriesSaved = hydratePlannedEditor({ ...session, revision: 7 }, [slot], [{
  id: 'series-1', slot_id: slot.id, sort_order: 0, kind: 'library_task',
  source_task_uuid_snapshot: 'source-1', task_snapshot: seriesSnapshot, activity_minutes: 12,
}]);
const seriesEdited = { ...seriesSaved, slots: [{ ...seriesSaved.slots[0], duration: '18',
  items: [{ ...seriesSaved.slots[0].items[0], minutes: '18',
    working: { series_count: 3, duration_minutes: 18 } }] }] };
assert.deepEqual(getPlannedEditorIssues(seriesEdited, season), []);
assert.deepEqual(buildPlannedSavePayload(seriesEdited, seriesSaved).p_slots[0].items[0].working,
  { series_count: 3, duration_minutes: 18 }, 'PATCH conserva minutos por serie del snapshot');
assert.equal(buildPlannedSavePayload(seriesEdited, seriesSaved).p_slots[0].items[0].activity_minutes, 18);
assert.equal(getPlannedDuration(seriesEdited.slots), 18);
assert.ok(getPlannedEditorIssues({ ...seriesEdited, slots: [{ ...seriesEdited.slots[0], items: [{
  ...seriesEdited.slots[0].items[0], minutes: '17',
}] }] }, season).some((issue) => issue.field === 'minutes'));
assert.deepEqual(getPlannedEditorIssues(mixed, season), []);
const importPayload = buildPlannedSavePayload(mixed, draft);
assert.deepEqual(importPayload.p_slots[0].items[1], {
  id: 'library-1', sort_order: 1, kind: 'library_task', activity_minutes: 12,
  source_task_id: 'source-1',
}, 'la selección no envía preview ni snapshots inventados en React');
assert.equal(importPayload.p_slots[0].items[0].kind, 'free');

const serverSnapshot = { snapshot_version: 1, source_task_id: 'source-1',
  source_club_id: 'club-1', source: { ...task, exercise_rules: 'Dos toques',
    tactical_content: 'General', tactical_content_offensive: 'Crear',
    tactical_content_defensive: 'Cerrar' }, working: {}, media: [] };
const hydrated = hydratePlannedEditor({ ...session, revision: 5 }, [slot], [
  { id: 'free-1', slot_id: slot.id, sort_order: 0, kind: 'free', free_title: 'Actividad libre' },
  { id: 'library-1', slot_id: slot.id, sort_order: 1, kind: 'library_task',
    source_task_uuid_snapshot: 'source-1', task_snapshot: serverSnapshot, activity_minutes: 12 },
]);
assert.equal(hydrated.slots[0].items[1].snapshot.source.description, 'Biblioteca original');
assert.equal(getPlannedLibraryValue(hydrated.slots[0].items[1], 'exercise_rules'), 'Dos toques');
assert.doesNotThrow(() => assertPlanned03cReload(mixed, hydrated, 5));
assert.throws(() => assertPlanned03cReload(mixed, draft, 5), /lectura posterior/,
  'no se acepta una recarga que oculte el snapshot recién incorporado');
assert.throws(() => assertPlanned03cReload(mixed, hydrated, 6), /lectura posterior/,
  'no se acepta una revisión desfasada');
assert.throws(() => assertPlanned03cReload({ ...mixed, slots: [{ ...mixed.slots[0], items: [
  mixed.slots[0].items[0], { ...selected, working: { description: 'Edición no recibida' } },
] }] }, hydrated, 5), /lectura posterior/,
  'no se acepta una recarga que pierda el PATCH de working');
task.description = 'Biblioteca actualizada después';
assert.equal(hydrated.slots[0].items[1].snapshot.source.description, 'Biblioteca original',
  'la lectura posterior conserva el valor histórico aunque cambie la tarea original');
assert.deepEqual(getPlannedEditorIssues(hydrated, season), []);
const edited = { ...hydrated, slots: [{ ...hydrated.slots[0], items: [
  hydrated.slots[0].items[0],
  { ...hydrated.slots[0].items[1], working: { description: 'Copia editada' } },
] }] };
assert.equal(getPlannedLibraryValue(edited.slots[0].items[1], 'description'), 'Copia editada');
assert.equal(serverSnapshot.source.description, 'Biblioteca original', 'el origen sigue intacto');
const contentEdited = { ...hydrated, slots: [{ ...hydrated.slots[0], items: [
  hydrated.slots[0].items[0], { ...hydrated.slots[0].items[1], working: {
    exercise_rules: 'Tres toques\nGol doble', tactical_content_offensive: 'Crear por fuera',
  } },
] }] };
assert.equal(getPlannedLibraryValue(contentEdited.slots[0].items[1], 'exercise_rules'), 'Tres toques\nGol doble');
assert.equal(getPlannedLibraryValue(contentEdited.slots[0].items[1], 'tactical_content_defensive'), 'Cerrar');
assert.equal(serverSnapshot.source.exercise_rules, 'Dos toques', 'Biblioteca histórica permanece intacta');
assert.deepEqual(buildPlannedSavePayload(contentEdited, hydrated).p_slots[0].items[1].working,
  { exercise_rules: 'Tres toques\nGol doble', tactical_content_offensive: 'Crear por fuera' });
assert.deepEqual(buildPlannedSavePayload(edited, hydrated).p_slots[0].items[1], {
  id: 'library-1', sort_order: 1, kind: 'library_task', activity_minutes: 12,
  working: { description: 'Copia editada' },
}, 'las ediciones posteriores envían solo working PATCH');

const board = { schemaVersion: 1, board: { pitchType: 'half', elements: [] } };
const successive = { ...edited, slots: [{ ...edited.slots[0], items: [
  edited.slots[0].items[0],
  { ...edited.slots[0].items[1], working: { description: 'Copia editada', editor_payload: board } },
] }] };
assert.deepEqual(buildPlannedSavePayload(successive, edited).p_slots[0].items[1].working,
  { editor_payload: board }, 'la segunda edición no reenvía ni revierte el PATCH anterior');
assert.equal(getPlannedLibraryValue(successive.slots[0].items[1], 'description'), 'Copia editada');
assert.equal(serverSnapshot.source.editor_payload.board.pitchType, 'full');
const assignedBoard = { schemaVersion: 1, board: { pitchType: 'half', elements: [] },
  assignments: { teamColors: { 'team-1': 'blue' }, players: [{
    teamKey: 'team-1', colorKey: 'blue', role: 'player',
    playerRef: { globalPlayerId: 'player-1', snapshot: { name: 'Pepe' } },
  }] } };
const assignedCopy = { ...edited, slots: [{ ...edited.slots[0], items: [
  edited.slots[0].items[0], { ...edited.slots[0].items[1],
    working: { description: 'Desarrollo manual', editor_payload: assignedBoard } },
] }] };
assert.deepEqual(buildPlannedSavePayload(assignedCopy, hydrated).p_slots[0].items[1].working,
  { description: 'Desarrollo manual', editor_payload: assignedBoard },
  'se envía la pizarra completa de la copia junto al PATCH de desarrollo');
const savedCopySnapshot = { ...serverSnapshot,
  working: { description: 'Desarrollo manual', editor_payload: assignedBoard } };
const reloadedCopy = hydratePlannedEditor({ ...session, revision: 6 }, [slot], [
  { id: 'free-1', slot_id: slot.id, sort_order: 0, kind: 'free', free_title: 'Actividad libre' },
  { id: 'library-1', slot_id: slot.id, sort_order: 1, kind: 'library_task',
    source_task_uuid_snapshot: 'source-1', task_snapshot: savedCopySnapshot },
]);
assert.doesNotThrow(() => assertPlanned03cReload(assignedCopy, reloadedCopy, 6));
assert.deepEqual(getPlannedLibraryValue(reloadedCopy.slots[0].items[1], 'editor_payload').assignments,
  assignedBoard.assignments, 'las asignaciones siguen en working tras recargar');
assert.equal(serverSnapshot.source.description, 'Biblioteca original', 'el origen no se edita');
const longDevelopment = 'Conservar la explicación íntegra. '.repeat(180);
const longCopy = { ...edited, slots: [{ ...edited.slots[0], items: [
  edited.slots[0].items[0],
  { ...edited.slots[0].items[1], working: { description: longDevelopment } },
] }] };
assert.equal(buildPlannedSavePayload(longCopy, hydrated).p_slots[0].items[1].working.description,
  longDevelopment, 'un desarrollo largo no se trunca en el PATCH local');
const noName = { ...edited, slots: [{ ...edited.slots[0], items: [edited.slots[0].items[0],
  { ...edited.slots[0].items[1], working: { name: '' } }] }] };
assert.ok(getPlannedEditorIssues(noName, season).some((issue) => issue.field === 'name'));
const futureBoard = { schemaVersion: 99, board: { future: true } };
const futureSnapshot = { ...serverSnapshot, source: { ...serverSnapshot.source, editor_payload: futureBoard } };
const futureEditor = hydratePlannedEditor(session, [slot], [
  { id: 'library-1', slot_id: slot.id, sort_order: 0, kind: 'library_task',
    source_task_uuid_snapshot: 'source-1', task_snapshot: futureSnapshot },
]);
assert.deepEqual(getPlannedLibraryValue(futureEditor.slots[0].items[0], 'editor_payload'), futureBoard);
assert.equal(Object.hasOwn(buildPlannedSavePayload(futureEditor, futureEditor).p_slots[0].items[0], 'working'), false,
  'una versión desconocida no se reescribe al guardar otros datos');

const deleted = { ...hydrated, slots: [{ ...hydrated.slots[0], items: [hydrated.slots[0].items[0]] }] };
assert.deepEqual(buildPlannedSavePayload(deleted, hydrated).p_removed_item_ids, ['library-1']);
assert.equal(hasPlannedLibraryItems(deleted), false);
assert.equal(hasPlannedLibraryItems(hydrated), true, 'el baseline obliga a usar 03C al borrar la copia');
const historicalOne = { ...hydrated, planning_state: 'confirmed', session_number: 1 };
assert.equal(buildPlannedSavePayload(historicalOne, historicalOne).p_requested_number, null,
  'el guardado de 03C no pide renumerar la sesión histórica número 1');
assert.equal(hydratePlannedEditor({ ...session, planning_state: 'confirmed', session_number: 1 },
  [slot], []).session_number, 1);
assert.ok(getPlannedEditorIssues({ ...hydrated, session_date: '2027-07-01' }, season).length,
  'fecha fuera de temporada rechazada');
assert.ok(getPlannedEditorIssues({ ...hydrated, slots: [{ ...hydrated.slots[0], duration: '0' }] }, season).length,
  'duración no positiva rechazada');

console.log('planned sessions 03C model tests passed (sin Supabase)');
