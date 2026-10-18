import assert from 'node:assert/strict';
import {
  buildPlannedSavePayload,
  createEmptyPlannedEditor,
  getPlannedDuration,
  hydratePlannedEditor,
  getPlannedEditorIssues,
  validatePlannedEditor,
} from './plannedSessions.js';

const season = { starts_on: '2026-07-01', ends_on: '2027-06-30' };
const session = {
  id: 'session-1', revision: 3, planning_state: 'draft', session_number: null,
  session_date: '2026-10-18', starts_at: '10:00:00', objectives: 'Trabajo actual',
  staff_observations: 'Mantener esta nota',
};
const slots = [
  { id: 'slot-1', phase: 'main', sort_order: 0, duration_minutes: 20 },
  { id: 'slot-2', phase: 'main', sort_order: 1, duration_minutes: 25 },
];
const items = [
  { id: 'item-1', session_id: 'session-1', slot_id: 'slot-1', sort_order: 0,
    kind: 'free', free_title: 'Actividad 1', activity_minutes: 15 },
  { id: 'item-2', session_id: 'session-1', slot_id: 'slot-1', sort_order: 1,
    kind: 'free', free_title: 'Actividad 2', activity_minutes: 20 },
  { id: 'item-3', session_id: 'session-1', slot_id: 'slot-2', sort_order: 0,
    kind: 'free', free_title: 'Actividad 3', activity_minutes: 10 },
];
const original = hydratePlannedEditor(session, slots, items);
assert.equal(original.header.starts_at, '10:00');
assert.equal(getPlannedDuration(original.slots), 45,
  'la duración suma ejercicios, no tareas paralelas');
assert.deepEqual(validatePlannedEditor(original, season), []);

const unchanged = buildPlannedSavePayload(original, original);
assert.deepEqual(unchanged.p_header, {}, 'una cabecera sin cambios no borra datos');
assert.deepEqual(unchanged.p_removed_item_ids, []);
assert.deepEqual(unchanged.p_removed_slot_ids, []);
assert.deepEqual(Object.keys(unchanged).sort(), [
  'p_expected_revision', 'p_header', 'p_removed_item_ids', 'p_removed_slot_ids',
  'p_requested_number', 'p_session_date', 'p_session_id', 'p_slots',
].sort());
assert.equal(unchanged.p_slots[0].items[0].kind, 'free');
assert.deepEqual(Object.keys(unchanged.p_slots[0].items[0]).sort(), [
  'id', 'sort_order', 'kind', 'free_title', 'free_description',
  'free_comments', 'free_url', 'activity_minutes',
].sort());

const changed = {
  ...original,
  header: { ...original.header, objectives: 'Nuevo objetivo', staff_observations: '' },
  slots: [
    { ...original.slots[1], items: [original.slots[1].items[0], original.slots[0].items[1]] },
    { ...original.slots[0], items: [original.slots[0].items[0]] },
  ],
};
const payload = buildPlannedSavePayload(changed, original);
assert.deepEqual(payload.p_header, {
  objectives: 'Nuevo objetivo', staff_observations: null,
}, 'PATCH diferencia valor, borrado explícito y clave omitida');
assert.equal(payload.p_slots[0].id, 'slot-2', 'reordenar conserva el UUID');
assert.equal(payload.p_slots[0].sort_order, 0);
assert.equal(payload.p_slots[0].items[1].id, 'item-2', 'mover conserva el UUID');
assert.deepEqual(payload.p_removed_item_ids, [], 'mover no elimina la actividad');

const removed = { ...original, slots: [{ ...original.slots[1], items: [] }] };
const removedPayload = buildPlannedSavePayload(removed, original);
assert.deepEqual(removedPayload.p_removed_slot_ids, ['slot-1']);
assert.deepEqual(removedPayload.p_removed_item_ids, ['item-1', 'item-2', 'item-3']);
assert.ok(validatePlannedEditor({ ...removed, planning_state: 'confirmed' }, season)
  .some((message) => message.includes('Tarea A es obligatoria')));
assert.ok(validatePlannedEditor({ ...original, session_date: '2027-07-01' }, season).length);
assert.ok(validatePlannedEditor({ ...original, slots: [{ ...original.slots[0], duration: '10' }] }, season)
  .some((message) => message.includes('no superar el ejercicio')));
const missingTitle = { ...original, slots: [{ ...original.slots[0], items: [
  original.slots[0].items[0], { ...original.slots[0].items[1], title: '' },
] }, original.slots[1]] };
assert.deepEqual(getPlannedEditorIssues(missingTitle, season).filter((issue) => issue.field === 'title'), [
  { message: 'Ejercicio 1, Tarea B: escribe un título de hasta 160 caracteres.',
    field: 'title', slotId: 'slot-1', itemId: 'item-2' },
]);
assert.equal(getPlannedDuration([original.slots[0]]), 20, 'dos tareas no duplican el tiempo');
assert.ok(getPlannedEditorIssues({ ...original, slots: [{ ...original.slots[0], items: [
  ...original.slots[0].items, { ...original.slots[1].items[0], id: 'item-4' },
] }, original.slots[1]] }, season).some((issue) => issue.message.includes('máximo de dos tareas')));
assert.equal(createEmptyPlannedEditor().session_date, '', 'no se inventa una fecha deportiva');

console.log('planned sessions model tests passed');
