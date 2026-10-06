import assert from 'node:assert/strict';
import { buildTrainingTaskCardPresentation, formatTrainingTaskCardStages } from './trainingTaskCardPresentation.js';

assert.equal(formatTrainingTaskCardStages(['juvenil', 'senior']), 'Juvenil · Sénior');
assert.equal(formatTrainingTaskCardStages(['infantil', 'cadete', 'juvenil', 'senior']), 'Infantil · Cadete · +2');
const card = buildTrainingTaskCardPresentation({ author_user_id: 'u1', taskType: 'rondos', playersSpec: '6v6+2', durationMinutes: 18, spaceWidthM: 40, spaceLengthM: 30, objective: 'Conservar', description: 'Fallback', variants: 'Una variante libre', ratingAverage: 4.25, ratingCount: 4, feedbackCount: 5 }, 'u1');
assert.equal(card.type.label, 'Rondos');
assert.equal(card.players, '6v6+2');
assert.equal(card.duration, "18'");
assert.match(card.space, /40.*30/);
assert.equal(card.summary, 'Conservar');
assert.equal(card.variants, 'Con variantes');
assert.equal(card.rating, '4,3 (4)');
assert.equal(card.feedback, '5 registros POST');
assert.equal(card.ownership, 'Mía');
assert.equal(buildTrainingTaskCardPresentation({ description: 'Descripción', taskType: 'warm_up' }, 'u1').summary, 'Descripción');
console.log('training task card presentation tests passed');
