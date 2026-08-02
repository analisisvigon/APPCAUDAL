import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  COACH_MODE_DISCLAIMER,
  RIVAL_TACTICAL_SUGGESTED_QUESTIONS,
  answerRivalTacticalQuestion,
  buildRivalMissingInformation,
  getRivalScoutingMaturity,
} from './rivalTacticalCenter.js';

const coverage = (overrides = {}) => [
  { key: 'profile', label: 'Perfil colectivo', count: 0, available: false },
  { key: 'board', label: 'Pizarra', count: 0, available: false },
  { key: 'connections', label: 'Conexiones', count: 0, available: false },
  { key: 'evidences', label: 'Evidencias', count: 0, available: false },
  { key: 'video', label: 'Vídeo', count: 0, available: false },
  { key: 'staff', label: 'Staff', count: 0, available: false },
].map((source) => ({ ...source, ...(overrides[source.key] || {}) }));

const model = (overrides = {}) => ({
  summary: { analyzedMatchCount: 0, ...overrides.summary },
  behaviors: overrides.behaviors || [
    { key: 'build_up', summary: '' },
    { key: 'positional_attack', summary: '' },
    { key: 'transition', summary: '' },
    { key: 'set_piece', summary: '' },
  ],
  recommendations: overrides.recommendations || { defense: [], attack: [] },
  duels: overrides.duels || [],
  evidenceCoverage: overrides.evidenceCoverage || coverage(),
});

assert.equal(RIVAL_TACTICAL_SUGGESTED_QUESTIONS.length, 8, 'incluye las ocho preguntas tácticas acordadas');
assert.ok(RIVAL_TACTICAL_SUGGESTED_QUESTIONS.includes('¿Qué información me falta?'));

const initial = getRivalScoutingMaturity(model());
assert.deepEqual(initial.key, 'initial');
assert.equal(initial.label, 'Información inicial');
assert.doesNotMatch(initial.detail, /%/, 'la madurez no usa porcentajes inventados');

const partial = getRivalScoutingMaturity(model({
  summary: { analyzedMatchCount: 2 },
  evidenceCoverage: coverage({
    profile: { count: 2, available: true },
    evidences: { count: 1, available: true },
  }),
  behaviors: [{ key: 'build_up', summary: 'Salida corta registrada.' }],
}));
assert.equal(partial.key, 'partial');
assert.equal(partial.label, 'Análisis parcial');

const consolidated = getRivalScoutingMaturity(model({
  summary: { analyzedMatchCount: 3 },
  evidenceCoverage: coverage({
    profile: { count: 6, available: true },
    board: { count: 3, available: true },
    evidences: { count: 4, available: true },
    staff: { count: 2, available: true },
  }),
  behaviors: [
    { key: 'build_up', summary: 'Salida corta.' },
    { key: 'positional_attack', summary: 'Ataque por fuera.' },
    { key: 'transition', summary: 'Corre tras robo.' },
  ],
  recommendations: {
    defense: [{ id: 'd1' }, { id: 'd2' }],
    attack: [{ id: 'a1' }],
  },
}));
assert.equal(consolidated.key, 'consolidated');
assert.equal(consolidated.label, 'Análisis consolidado');

const allMissing = buildRivalMissingInformation(model());
assert.deepEqual(
  allMissing.map((item) => item.destination),
  ['profile', 'board:set_piece', 'board:connections', 'video', 'board:transition', 'evidences'],
  'cada carencia conduce a un módulo existente'
);
assert.match(allMissing.at(-1).text, /No existen partidos analizados/);

const oneMatchMissing = buildRivalMissingInformation(model({ summary: { analyzedMatchCount: 1 } }));
assert.match(oneMatchMissing.at(-1).text, /Solo existe un partido analizado/);

const recommendation = {
  id: 'press-build-up',
  action: 'Presionar la salida hacia banda.',
  rationale: 'La salida rival repite apoyos interiores bajo presión.',
  expectedImpact: 'Reducir recepciones limpias del pivote.',
  priority: 'Crítica',
  confidence: 'Alta',
  sources: ['Perfil', 'Evidencias'],
  evidenceIds: ['profile:build-up', 'evidence:1'],
};
const evidenceModel = model({
  recommendations: { defense: [recommendation], attack: [] },
  duels: [{
    id: 'risk-1',
    type: 'Riesgo',
    relation: 'Espacio detrás de la primera presión.',
    evidenceIds: ['evidence:1'],
  }],
});
const evidenceAnswer = answerRivalTacticalQuestion({
  question: '¿Cómo presionamos su salida?',
  mode: 'evidence',
  model: evidenceModel,
});
assert.match(evidenceAnswer.reading, /salida rival/i);
assert.match(evidenceAnswer.proposal, /^Presionar/);
assert.deepEqual(evidenceAnswer.sources, ['Perfil', 'Evidencias']);
assert.deepEqual(evidenceAnswer.evidenceIds, ['profile:build-up', 'evidence:1']);
assert.equal(evidenceAnswer.confidence, 'Alta');
assert.equal(evidenceAnswer.disclaimer, '');

const noEvidenceAnswer = answerRivalTacticalQuestion({
  question: '¿Dónde podemos hacerles daño?',
  mode: 'evidence',
  model: model(),
});
assert.match(noEvidenceAnswer.reading, /No existen evidencias registradas suficientes/);
assert.deepEqual(noEvidenceAnswer.sources, []);
assert.equal(noEvidenceAnswer.confidence, 'Baja');

const coachAnswer = answerRivalTacticalQuestion({
  question: '¿Cómo defender su juego directo?',
  mode: 'coach',
  model: model(),
});
assert.equal(coachAnswer.disclaimer, COACH_MODE_DISCLAIMER);
assert.equal(
  coachAnswer.disclaimer,
  'Propuesta táctica basada en conocimiento futbolístico. No confirmada mediante evidencias del rival.'
);
assert.deepEqual(coachAnswer.sources, [], 'el modo entrenador no atribuye fuentes del rival');
assert.match(coachAnswer.proposal, /^Proteger/);

const componentSource = fs.readFileSync(new URL('../components/tactical/RivalCollectiveAssistant.jsx', import.meta.url), 'utf8');
const assistantSource = fs.readFileSync(new URL('../components/tactical/RivalTacticalAssistant.jsx', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');

assert.match(componentSource, /visibleBehaviors = model\.behaviors\.filter/, 'Cómo atacan solo monta fases con datos');
assert.match(componentSource, /No existen evidencias suficientes para describir el comportamiento ofensivo del rival\./);
assert.doesNotMatch(componentSource, />Duelos tácticos</, 'Rival ya no duplica el bloque de duelos');
assert.doesNotMatch(componentSource, /TacticalBoard|connectionDraft|Guardar conexi[oó]n/i, 'Rival no contiene editores de Pizarra o Conexiones');
assert.match(componentSource, /onCompleteMissingInformation\?\.\(item\.destination\)/, 'Completar delega únicamente la navegación');
assert.match(componentSource, /flex flex-wrap gap-2/, 'las fuentes se presentan como chips compactos y responsive');
assert.match(componentSource, /focus-visible:ring-2/, 'los controles conservan foco visible');

assert.match(assistantSource, /role="radiogroup"/, 'el selector de modo es semántico');
assert.match(assistantSource, /role="radio"/, 'cada modo expone su estado accesible');
assert.match(assistantSource, /aria-checked=\{mode === value\}/);
assert.match(assistantSource, /aria-live="polite"/, 'la respuesta se anuncia sin interrumpir');
assert.match(assistantSource, /placeholder="Escribe tu pregunta\.\.\."/);
assert.match(assistantSource, /\['Lectura', answer\.reading\]/);
assert.match(assistantSource, /\['Propuesta', answer\.proposal\]/);
assert.match(assistantSource, /\['Riesgos', answer\.risks\]/);
assert.match(assistantSource, /\['Alternativa', answer\.alternative\]/);
assert.ok(!/supabase|localStorage|fetch\(/i.test(assistantSource), 'el asistente no consulta ni persiste datos');

assert.match(appSource, /destination === 'board:set_piece'[\s\S]*setFacingSystemsView\('PIZARRA'\)/);
assert.match(appSource, /destination === 'board:connections'[\s\S]*setFacingSystemsView\('PIZARRA'\)/);
assert.match(appSource, /destination === 'video'[\s\S]*setMatchView\('post_partido'\)/);
assert.match(appSource, /destination === 'evidences'[\s\S]*setFacingSystemsView\('EVIDENCIAS'\)/);

console.log('rivalTacticalCenter tests: ok');
