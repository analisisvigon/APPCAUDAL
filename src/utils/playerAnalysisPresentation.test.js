import assert from 'node:assert/strict';
import {
  PLAYER_ANALYSIS_PARTIAL_NOTE,
  buildPlayerAnalysisPresentation,
} from './playerAnalysisPresentation.js';

const complete = buildPlayerAnalysisPresentation({
  matches: 8,
  minutes: 510,
  starts: 6,
  benchEntries: 1,
  goals: 3,
  goalsCoverage: 'COMPLETE',
  assists: 2,
  assistsCoverage: 'COMPLETE',
});
assert.equal(complete.starterPercentage, 75);
assert.equal(complete.contributions, 5);
assert.equal(complete.contributionsPartial, false);
assert.equal(complete.hasSeasonData, true);

const partial = buildPlayerAnalysisPresentation({
  matches: 7,
  starts: 6,
  goals: 0,
  goalsCoverage: 'PARTIAL',
  assists: 2,
  assistsCoverage: 'COMPLETE',
});
assert.equal(partial.contributions, 2);
assert.equal(partial.goalsPartial, true);
assert.equal(partial.assistsPartial, false);
assert.equal(partial.contributionsPartial, true, 'La suma hereda cualquier cobertura incompleta.');
assert.equal(partial.starterPercentage, 86);

const empty = buildPlayerAnalysisPresentation({
  matches: 0,
  starts: 4,
  goalsCoverage: 'COMPLETE',
  assistsCoverage: 'COMPLETE',
});
assert.equal(empty.starterPercentage, null, 'No existe división por cero ni porcentaje inventado.');
assert.equal(PLAYER_ANALYSIS_PARTIAL_NOTE, 'Dato disponible parcialmente');

console.log('playerAnalysisPresentation: métricas, contribuciones, cobertura y división segura validadas.');
