import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  PLAYER_TACTICAL_COACH_DISCLAIMER,
  PLAYER_TACTICAL_SUGGESTED_QUESTIONS,
  answerRivalPlayerTacticalQuestion,
  buildRivalPlayerCollectiveSignals,
  buildRivalPlayerTacticalModel,
} from './rivalPlayerTacticalAssistant.js';

const emptyParticipation = {
  playCount: 0,
  plays: [],
  phases: [],
  connections: [],
  connectionsCreated: 0,
  connectionsReceived: 0,
  movementTypes: [],
  roles: [],
  observations: [],
};

const player = {
  id: 'player-1',
  name: 'Gabanchu',
  position: 'Extremo derecho',
  foot: 'Derecho',
  age: 27,
  height: '178 cm',
  isKey: true,
};

const empty = buildRivalPlayerTacticalModel({ player, profile: {}, participation: emptyParticipation });
assert.equal(empty.summary.influence.label, 'Jugador residual');
assert.equal(empty.summary.maturity.label, 'Información inicial');
assert.equal(empty.recommendations.defense.length, 0, 'la posición por sí sola no genera consignas defensivas');
assert.equal(empty.recommendations.attack.length, 0, 'la posición por sí sola no genera consignas ofensivas');
assert.ok(empty.impact.every((indicator) => indicator.count === 0), 'no inventa impacto sin evidencias');
assert.equal(empty.behaviors.length, 0);

const profile = {
  position: 'Extremo derecho',
  foot: 'Derecho',
  mainProfile: 'Desbordador',
  secondaryProfile: 'Ataca espalda',
  speed: 4,
  technique: 3,
  aerial: 1,
  oneVsOne: 5,
  defensiveWork: 2,
  traits: ['regateador', 'ataca espacio', 'sufre a la espalda'],
  notes: 'Busca diagonal interior.\nPierde segundo palo.',
  updatedAt: '2026-07-31T20:15:00.000Z',
};
const participation = {
  playCount: 3,
  plays: [
    { id: 'p1', name: 'Salida derecha', phase: 'Salida' },
    { id: 'p2', name: 'Transición rápida', phase: 'Transición' },
    { id: 'p3', name: 'Ataque posicional', phase: 'Ataque' },
  ],
  phases: ['Salida', 'Transición', 'Ataque'],
  connections: [{ label: 'Lateral → Gabanchu', count: 5 }],
  connectionsCreated: 2,
  connectionsReceived: 4,
  roles: [{ label: 'Extremo', count: 3 }],
  observations: ['Recibe abierto antes de atacar hacia dentro.'],
};
const complete = buildRivalPlayerTacticalModel({
  player,
  profile,
  participation,
  observedEvidences: [{
    id: 'ev-1',
    playerKey: 'player-1',
    playerName: 'Gabanchu',
    type: 'Jugador',
    importance: 'Alta',
    date: '2026-07-30',
    match: 'Rival vs Caudal',
    observation: 'Gabanchu busca el uno contra uno y ataca el espacio.',
  }],
  duelCandidates: [{ caudalName: 'Lateral izquierdo', rivalName: 'Gabanchu', tone: 'red', reason: '1v1 5' }],
});

assert.equal(complete.summary.influence.label, 'Jugador estructural');
assert.equal(complete.summary.maturity.label, 'Análisis consolidado');
assert.match(complete.summary.influence.reason, /3 jugadas · 6 conexiones/);
assert.ok(complete.impact.find((row) => row.key === 'depth').count > 0);
assert.ok(complete.impact.find((row) => row.key === 'construction').count > 0);
assert.ok(complete.recommendations.defense.some((row) => /^Proteger|^Orientarle/.test(row.action)));
assert.ok(complete.recommendations.attack.some((row) => /espalda/.test(row.action)));
assert.ok(complete.recommendations.defense.every((row) => row.evidenceIds.length && row.sources.length));
assert.deepEqual(complete.relations[0], {
  id: 'relation:0:lateral → gabanchu',
  label: 'Lateral → Gabanchu',
  count: 5,
  source: 'Conexiones',
});
assert.equal(complete.phases.length, 3);
assert.equal(complete.scouting.plays, 3);
assert.equal(complete.scouting.connections, 6);
assert.equal(complete.scouting.profileCoverage.completed, 6);
assert.equal(complete.scouting.profileCoverage.total, 6);
assert.ok(complete.observations.some((row) => row.text === 'Busca diagonal interior.'));
assert.ok(complete.observations.some((row) => row.text === 'Pierde segundo palo.'));
assert.equal(complete.duels[0].duel, 'Lateral izquierdo vs Gabanchu');
assert.notEqual(complete.duels[0].instruction, 'No existe una consigna respaldada por evidencias.');
assert.ok(!Object.hasOwn(complete.summary.influence, 'percentage'), 'la influencia no usa porcentajes ficticios');
assert.ok(complete.impact.every((row) => !Object.hasOwn(row, 'percentage')), 'el impacto expone recuentos reales');

const signals = buildRivalPlayerCollectiveSignals([{ player, profile }]);
assert.ok(signals.length >= profile.traits.length);
assert.ok(signals.every((signal) => signal.type === 'Jugador' && signal.derivedFromPlayerProfile));
assert.ok(signals.some((signal) => /Gabanchu · regateador/.test(signal.observation)));
assert.ok(signals.every((signal) => !/recomendamos|deberíamos/i.test(signal.observation)), 'Rival recibe hechos, no recomendaciones duplicadas');

const noEvidenceAnswer = answerRivalPlayerTacticalQuestion({ question: '¿Cómo defenderle?', mode: 'evidence', model: empty });
assert.match(noEvidenceAnswer.reading, /No existen evidencias suficientes/);
assert.deepEqual(noEvidenceAnswer.sources, []);
assert.equal(noEvidenceAnswer.disclaimer, '');

const evidenceAnswer = answerRivalPlayerTacticalQuestion({ question: '¿Cómo defenderle?', mode: 'evidence', model: complete });
assert.ok(evidenceAnswer.sources.length);
assert.match(evidenceAnswer.instruction, /Proteger|Orientarle/);
assert.equal(evidenceAnswer.disclaimer, '');

const duelAnswer = answerRivalPlayerTacticalQuestion({ question: '¿Qué jugador nuestro debería marcarle?', mode: 'evidence', model: complete });
assert.match(duelAnswer.reading, /Lateral izquierdo vs Gabanchu/);
assert.ok(duelAnswer.sources.length);

const coachAnswer = answerRivalPlayerTacticalQuestion({ question: '¿Cómo entrenaríamos este duelo?', mode: 'coach', model: empty });
assert.equal(coachAnswer.disclaimer, PLAYER_TACTICAL_COACH_DISCLAIMER);
assert.deepEqual(coachAnswer.sources, []);
assert.equal(PLAYER_TACTICAL_SUGGESTED_QUESTIONS.length, 8);

const componentSource = fs.readFileSync(new URL('../components/tactical/RivalPlayerTacticalCenter.jsx', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
[
  'Resumen del jugador',
  'Impacto en el modelo colectivo',
  'Cómo juega',
  'Plan defensivo',
  'Cómo hacerle daño',
  'Tendencias detectadas',
  'Relaciones tácticas',
  'Fases del juego',
  'Evolución del scouting',
  'Observaciones',
  'Asistente del jugador',
  'Duelos recomendados',
].forEach((heading) => assert.match(componentSource, new RegExp(heading), `incluye ${heading}`));
assert.match(componentSource, /role="radiogroup"/);
assert.match(componentSource, /aria-live="polite"/);
assert.match(componentSource, /focus-visible:ring-2/);
assert.match(componentSource, /sm:grid-cols|lg:grid-cols|xl:grid-cols/, 'la composición declara breakpoints responsive');
assert.ok(!/supabase|localStorage|fetch\(/i.test(componentSource), 'el componente no consulta ni persiste directamente');
assert.match(appSource, /facingSystemsView === 'JUGADORES' \? \([\s\S]*?<RivalPlayerTacticalCenter/);
assert.match(appSource, /evidences: \[\.\.\.evidences, \.\.\.individualRivalSignals\]/, 'Rival consume señales reales del perfil individual');
assert.match(appSource, /notes: \[String\(selectedMicroProfile\.notes/, 'las observaciones reutilizan el campo existente');

console.log('rivalPlayerTacticalAssistant tests: ok');
