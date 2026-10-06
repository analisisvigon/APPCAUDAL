import assert from 'node:assert/strict';
import {
  buildTrainingTaskFeedbackPayload,
  createTrainingTaskFeedbackDraft,
  sortTrainingTaskFeedback,
  summarizeTrainingTaskRatings,
  validateTrainingTaskFeedback,
} from './trainingTaskFeedback.js';

const base = { usedOn: '2026-10-10', rating: 1, post: '' };
assert.deepEqual(validateTrainingTaskFeedback(base), {}, 'rating 1 es válido');
assert.deepEqual(validateTrainingTaskFeedback({ ...base, rating: 5 }), {}, 'rating 5 es válido');
assert.ok(validateTrainingTaskFeedback({ ...base, rating: 0 }).rating, 'rating 0 es inválido');
assert.ok(validateTrainingTaskFeedback({ ...base, rating: 6 }).rating, 'rating 6 es inválido');
assert.ok(validateTrainingTaskFeedback({ ...base, rating: 3.5 }).rating, 'rating 3.5 es inválido y no se redondea');
assert.deepEqual(validateTrainingTaskFeedback({ ...base, rating: null, post: 'Reducir espacio.' }), {}, 'rating null se permite con POST');
assert.ok(validateTrainingTaskFeedback({ ...base, rating: null, post: '   ' }).post, 'una entrada no puede quedar totalmente vacía');

const payload = buildTrainingTaskFeedbackPayload(
  { usedOn: '2026-10-10', rating: null, post: '  Reducir espacio.  ' },
  { taskId: 'task-1', clubId: 'club-1', authorUserId: 'user-1' },
);
assert.deepEqual(payload, {
  task_id: 'task-1', club_id: 'club-1', author_user_id: 'user-1',
  used_on: '2026-10-10', rating: null, post_text: 'Reducir espacio.',
});

assert.deepEqual(summarizeTrainingTaskRatings([]), { ratingAverage: null, ratingCount: 0, feedbackCount: 0 }, 'sin valoraciones no inventa 0/5');
assert.deepEqual(summarizeTrainingTaskRatings([{ rating: 3 }, { rating: null }, { rating: 5 }, { rating: 6 }]), { ratingAverage: 4, ratingCount: 2, feedbackCount: 4 }, 'la media usa solo ratings válidos y el contador POST incluye todos los registros');

const history = sortTrainingTaskFeedback([
  { id: 'old', usedOn: '2026-10-10', created_at: '2026-10-11T10:00:00Z' },
  { id: 'newer-created', usedOn: '2027-01-20', created_at: '2027-01-20T11:00:00Z' },
  { id: 'newest-created', usedOn: '2027-01-20', created_at: '2027-01-20T12:00:00Z' },
]);
assert.deepEqual(history.map(({ id }) => id), ['newest-created', 'newer-created', 'old'], 'el historial ordena fecha de uso y creación descendentes');
assert.equal(history.length, 3, 'varias entradas de una tarea conviven sin sobrescribirse');
assert.match(createTrainingTaskFeedbackDraft(new Date('2026-10-04T12:00:00')).usedOn, /^2026-10-04$/, 'el borrador propone una fecha local editable');

console.log('training task feedback tests passed');
