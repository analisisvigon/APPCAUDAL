import assert from 'node:assert/strict';
import {
  buildMatchKeyPersistence,
  getMatchKeyGroups,
  moveMatchKey,
  normalizeMatchKeyLines,
} from './matchKeys.js';

assert.deepEqual(normalizeMatchKeyLines(['  Presionar alto  ', 'presionar   alto', '', 'Cerrar dentro']), ['Presionar alto', 'Cerrar dentro']);

const legacy = getMatchKeyGroups({
  preAiAnalysis: { matchKeys: ['Clave antigua 1', 'Clave antigua 2'] },
  planClave: 'No debe prevalecer',
});
assert.deepEqual(legacy.offensive, ['Clave antigua 1', 'Clave antigua 2'], 'las claves planas antiguas siguen visibles');
assert.deepEqual(legacy.defensive, [], 'las claves sin clasificación entran en ofensivas por compatibilidad');
assert.equal(legacy.usesLegacyFallback, true);

const planFallback = getMatchKeyGroups({ planClave: 'Primera\nSegunda' });
assert.deepEqual(planFallback.offensive, ['Primera', 'Segunda'], 'planClave conserva el último fallback histórico');

const typed = getMatchKeyGroups({
  preAiAnalysis: {
    matchKeys: ['Plano obsoleto'],
    matchKeysOffensive: ['Atacar intervalo'],
    matchKeysDefensive: ['Cerrar segundo palo'],
  },
});
assert.deepEqual(typed, {
  offensive: ['Atacar intervalo'],
  defensive: ['Cerrar segundo palo'],
  usesLegacyFallback: false,
});

const persisted = buildMatchKeyPersistence({
  offensive: ['Ofensiva 1', 'Ofensiva 2'],
  defensive: ['Defensiva 1'],
}, { generatedAt: '2026-08-25', matchKey: 'legado' });
assert.deepEqual(persisted, {
  planClave: 'Ofensiva 1\nOfensiva 2\nDefensiva 1',
  preAiAnalysis: {
    generatedAt: '2026-08-25',
    matchKeysOffensive: ['Ofensiva 1', 'Ofensiva 2'],
    matchKeysDefensive: ['Defensiva 1'],
    matchKeys: ['Ofensiva 1', 'Ofensiva 2', 'Defensiva 1'],
  },
}, 'la persistencia tipada mantiene también los formatos legados consumidos por el resto del PRE');
assert.deepEqual(getMatchKeyGroups({ preAiAnalysis: persisted.preAiAnalysis, planClave: persisted.planClave }), {
  offensive: ['Ofensiva 1', 'Ofensiva 2'],
  defensive: ['Defensiva 1'],
  usesLegacyFallback: false,
}, 'la clasificación y el orden sobreviven al ciclo guardar/recargar');

assert.deepEqual(moveMatchKey(['Uno', 'Dos', 'Tres'], 1, -1), ['Dos', 'Uno', 'Tres']);
assert.deepEqual(moveMatchKey(['Uno', 'Dos'], 0, -1), ['Uno', 'Dos'], 'los límites no alteran el orden');

console.log('match keys tests passed');
