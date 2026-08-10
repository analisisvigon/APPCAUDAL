import assert from 'node:assert/strict';
import {
  getDossierPageContribution,
  getDossierStartPageNumber,
  getDossierTotalPages,
} from './printDossierPagination.js';

const active = (...ids) => ids.map((id) => ({ id, active: true }));
const fullContent = {
  hasLineup: true,
  hasTakers: true,
  offensiveDiagrams: [{}, {}, {}],
  defensiveDiagrams: [{}, {}],
  kickoffDiagrams: [{}],
  matchPlanSituations: [{}, {}, {}],
};

assert.equal(getDossierTotalPages(active('lineup'), fullContent), 1, 'A: solo alineación genera una página real');
assert.equal(getDossierTotalPages(active('lineup', 'keys'), fullContent), 2, 'B: alineación + claves generan dos páginas');
assert.equal(getDossierTotalPages(active('lineup', 'keys', 'takers', 'offensive', 'defensive', 'kickoff', 'match_plan'), fullContent), 9, 'C: las siete hojas cuentan sus páginas renderizadas');
assert.equal(getDossierTotalPages(active('match_plan'), { matchPlanSituations: [{}] }), 1, 'D: una situación de Plan genera una página');
assert.equal(getDossierTotalPages(active('match_plan'), { matchPlanSituations: [{}, {}] }), 1, 'E: dos situaciones de Plan comparten una página');
assert.equal(getDossierTotalPages(active('lineup', 'match_plan'), { hasLineup: true, matchPlanSituations: [{}, {}] }), 2, 'F: alineación + dos situaciones termina exactamente en la segunda página');
assert.equal(getDossierTotalPages([{ id: 'lineup', active: false }, { id: 'keys', active: true }, { id: 'match_plan', active: false }], fullContent), 1, 'G: las hojas inactivas inicial y final no generan páginas');

assert.equal(getDossierPageContribution('offensive', fullContent), 2, 'tres jugadas ABP ocupan dos páginas, no tres');
assert.equal(getDossierPageContribution('offensive', { offensiveDiagrams: [] }), 0, 'una sección ABP vacía no inventa página');
assert.equal(getDossierStartPageNumber(active('lineup', 'offensive', 'keys'), 'keys', fullContent), 4, 'la numeración usa contribuciones reales anteriores');
assert.equal(getDossierStartPageNumber([{ id: 'lineup', active: false }, { id: 'keys', active: true }], 'keys', fullContent), 1, 'la primera hoja activa empieza en página 1');

console.log('Print dossier pagination tests passed.');
