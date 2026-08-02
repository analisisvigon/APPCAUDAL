import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  PLAYER_TACTICAL_COACH_DISCLAIMER,
  PLAYER_TACTICAL_SUGGESTED_QUESTIONS,
  answerRivalPlayerTacticalQuestion,
  buildRivalPlayerCollectiveSignals,
  buildRivalPlayerTacticalModel,
  classifyPlayerBehavior,
  classifyPlayerConnectionContext,
} from './rivalPlayerTacticalAssistant.js';
import { buildRivalCollectiveAssistant } from './rivalCollectiveAssistant.js';

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
assert.equal(complete.impact.find((row) => row.key === 'construction').count, 0, 'una conexión sin contexto no incrementa construcción');
assert.ok(complete.recommendations.defense.some((row) => /^Proteger|^Orientarle/.test(row.action)));
assert.ok(complete.recommendations.attack.some((row) => /espalda/.test(row.action)));
assert.ok(complete.recommendations.defense.every((row) => row.evidenceIds.length && row.sources.length));
assert.equal(complete.relations[0].label, 'Lateral → Gabanchu');
assert.equal(complete.relations[0].count, 5);
assert.equal(complete.relations[0].classification.key, 'unclassified');
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
assert.ok(complete.impact.every((row) => Object.hasOwn(row, 'independentEvidenceCount') && Object.hasOwn(row, 'coverageLevel')));

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

const collectiveBase = {
  rivalName: 'Rival de prueba',
  rivalSystem: '4-3-3',
  collectiveProfile: { strengths: [], weaknesses: [] },
  evidences: [],
  connections: [],
  plays: [],
  reports: [],
  videos: [],
  tacticalEvidenceReport: { contextRows: [] },
};
const transitionRecommendation = (input) => buildRivalCollectiveAssistant({ ...collectiveBase, ...input }).recommendations.defense.find((row) => row.id === 'defend-transition');

// 1. Un rasgo aislado nunca escala a una conclusión colectiva fuerte.
const onePlayerSignal = buildRivalPlayerCollectiveSignals([{
  player: { id: 'solo-1', name: 'Jugador aislado', isKey: true },
  profile: { traits: ['contraataque'] },
}]);
const isolatedRecommendation = transitionRecommendation({ evidences: onePlayerSignal });
assert.equal(isolatedRecommendation.priority, 'Opcional');
assert.equal(isolatedRecommendation.confidence, 'Baja');
assert.equal(isolatedRecommendation.evidenceLevel, 'individual_signal');

// 2-3. Varias etiquetas del mismo perfil comparten una sola unidad y no aumentan diversidad.
const sameProfileSignals = buildRivalPlayerCollectiveSignals([{
  player: { id: 'solo-1', name: 'Jugador aislado', isKey: true },
  profile: { traits: ['contraataque', 'salida rápida'] },
}]);
assert.equal(new Set(sameProfileSignals.map((row) => row.evidenceUnitId)).size, 1);
const sameProfileRecommendation = transitionRecommendation({ evidences: sameProfileSignals });
assert.equal(sameProfileRecommendation.independentSourceCount, 1);
assert.equal(sameProfileRecommendation.priority, 'Opcional');
assert.equal(sameProfileRecommendation.confidence, 'Baja');
const sameObservationRecommendation = transitionRecommendation({ evidences: [
  { id: 'derived-tag-1', observationId: 'observation-1', observation: 'Contraataque.', scope: 'individual', playerId: 'solo-1', playerName: 'Jugador aislado' },
  { id: 'derived-tag-2', observationId: 'observation-1', observation: 'Salida rápida tras recuperación.', scope: 'individual', playerId: 'solo-1', playerName: 'Jugador aislado' },
] });
assert.equal(sameObservationRecommendation.independentSourceCount, 1, 'dos etiquetas derivadas de la misma observación forman una unidad');

// 4. Dos jugadores distintos elevan la señal a hipótesis colectiva, nunca a patrón fuerte.
const twoPlayerSignals = buildRivalPlayerCollectiveSignals([
  { player: { id: 'p-a', name: 'Hugo Rodríguez' }, profile: { traits: ['contraataque'] } },
  { player: { id: 'p-b', name: 'Gabancho' }, profile: { traits: ['contraataque'] } },
]);
const twoPlayerRecommendation = transitionRecommendation({ evidences: twoPlayerSignals });
assert.equal(twoPlayerRecommendation.evidenceLevel, 'collective_hypothesis');
assert.equal(twoPlayerRecommendation.priority, 'Importante');
assert.equal(twoPlayerRecommendation.confidence, 'Media');

// 5. Dos partidos distintos pueden elevar la confianza hasta Media.
const twoMatchRecommendation = transitionRecommendation({ evidences: [
  { id: 'match-observation-1', observation: 'Contraataque tras recuperación.', scope: 'individual', playerId: 'p-a', playerName: 'Hugo Rodríguez', matchId: 'm-1', evidenceUnitId: 'obs-1' },
  { id: 'match-observation-2', observation: 'Contraataque tras recuperación.', scope: 'individual', playerId: 'p-a', playerName: 'Hugo Rodríguez', matchId: 'm-2', evidenceUnitId: 'obs-2' },
] });
assert.equal(twoMatchRecommendation.evidenceLevel, 'collective_hypothesis');
assert.equal(twoMatchRecommendation.confidence, 'Media');

// 6. Señal individual y evidencia colectiva independiente generan hipótesis Importante.
const corroboratedRecommendation = transitionRecommendation({ evidences: [
  ...onePlayerSignal,
  { id: 'collective-transition', observation: 'El equipo activa el contraataque tras recuperación.', type: 'Colectiva', scope: 'collective' },
] });
assert.equal(corroboratedRecommendation.priority, 'Importante');
assert.equal(corroboratedRecommendation.corroboratedByCollectiveSource, true);

// 7. Tres unidades independientes, incluida fuente colectiva, permiten patrón Crítico y confianza Alta.
const backedRecommendation = transitionRecommendation({
  evidences: onePlayerSignal,
  plays: [{ id: 'play-transition', phase: 'transition', name: 'Contraataque tras recuperación' }],
  reports: [{ id: 'staff-transition', text: 'Contraataque repetido tras recuperación.' }],
});
assert.equal(backedRecommendation.evidenceLevel, 'collective_pattern');
assert.equal(backedRecommendation.priority, 'Crítica');
assert.equal(backedRecommendation.confidence, 'Alta');

// 8. El sistema nominal no genera recomendaciones.
const systemOnlyCollective = buildRivalCollectiveAssistant(collectiveBase);
assert.equal(systemOnlyCollective.recommendations.defense.length, 0);
assert.equal(systemOnlyCollective.recommendations.attack.length, 0);

// 9-10. La trazabilidad conserva jugadores y los identifica en la explicación.
assert.deepEqual(twoPlayerRecommendation.contributingPlayerIds.sort(), ['p-a', 'p-b']);
assert.deepEqual(twoPlayerRecommendation.contributingPlayers.sort(), ['Gabancho', 'Hugo Rodríguez']);
assert.match(twoPlayerRecommendation.traceabilityExplanation, /Hugo Rodríguez/);
assert.ok(twoPlayerRecommendation.evidence.every((row) => row.playerId && row.playerName && row.sourceKind && row.sourceId));

// 11. Una etiqueta aislada es comportamiento registrado, no tendencia.
const isolatedBehaviorModel = buildRivalPlayerTacticalModel({ player, profile: { traits: ['ataca espacio'] }, participation: emptyParticipation });
assert.equal(isolatedBehaviorModel.trends.length, 0);
assert.equal(isolatedBehaviorModel.registeredBehaviors[0].type, 'recorded_behavior');

// 12. Una tendencia exige repetición en unidades independientes.
const repeatedTrendModel = buildRivalPlayerTacticalModel({
  player,
  profile: {},
  participation: emptyParticipation,
  observedEvidences: [
    { id: 'trend-1', playerKey: 'player-1', observation: 'Ataca espacio tras recuperación.', date: '2026-07-20', matchId: 'm-1' },
    { id: 'trend-2', playerKey: 'player-1', observation: 'Ataca espacio tras recuperación.', date: '2026-07-27', matchId: 'm-2' },
  ],
});
assert.equal(repeatedTrendModel.trends.length, 1);
assert.equal(repeatedTrendModel.trends[0].type, 'observed_trend');
assert.equal(repeatedTrendModel.trends[0].frequency, '2 partidos');

// 13. Sin fecha real se informa de forma explícita y no se usa updatedAt del perfil.
const undatedTrendModel = buildRivalPlayerTacticalModel({
  player,
  profile: { traits: ['ataca espacio'], updatedAt: '2026-07-31T20:15:00.000Z' },
  participation: emptyParticipation,
  observedEvidences: [{ id: 'trend-undated', playerKey: 'player-1', observation: 'Ataca espacio.' }],
});
assert.equal(undatedTrendModel.trends[0].lastObservedAt, '');
assert.equal(undatedTrendModel.trends[0].dateLabel, 'Fecha no registrada');

// 14-17. Las conexiones solo afectan a una fase cuando existe contexto verificable.
const noContextConnection = { key: 'cx-none', label: 'Central → Lateral', count: 2 };
assert.equal(classifyPlayerConnectionContext(noContextConnection).key, 'unclassified');
assert.equal(classifyPlayerConnectionContext({ ...noContextConnection, contexts: [{ phase: 'transition', phaseLabel: 'Transición' }] }).key, 'transition');
assert.equal(classifyPlayerConnectionContext({ ...noContextConnection, type: 'ABP' }).key, 'set-piece');
const noContextModel = buildRivalPlayerTacticalModel({ player, profile: {}, participation: { ...emptyParticipation, connections: [noContextConnection] } });
assert.equal(noContextModel.impact.find((row) => row.key === 'construction').evidenceCount, 0);
assert.equal(noContextModel.impact.find((row) => row.key === 'transition').evidenceCount, 0);
assert.equal(noContextModel.impact.find((row) => row.key === 'set-piece').evidenceCount, 0);
const transitionConnectionModel = buildRivalPlayerTacticalModel({ player, profile: {}, participation: { ...emptyParticipation, connections: [{ ...noContextConnection, key: 'cx-transition', contexts: [{ phase: 'transition', phaseLabel: 'Transición' }] }] } });
assert.equal(transitionConnectionModel.impact.find((row) => row.key === 'transition').evidenceCount, 1);
const setPieceConnectionModel = buildRivalPlayerTacticalModel({ player, profile: {}, participation: { ...emptyParticipation, connections: [{ ...noContextConnection, key: 'cx-abp', type: 'ABP' }] } });
assert.equal(setPieceConnectionModel.impact.find((row) => row.key === 'set-piece').evidenceCount, 1);

// 18-20. Clasificación principal única sin duplicados por palabras solapadas.
assert.equal(classifyPlayerBehavior({ text: 'ataca espacio' }).primaryPhase, 'with-ball');
assert.deepEqual(classifyPlayerBehavior({ text: 'ataca espacio' }).secondaryPhases, []);
assert.equal(classifyPlayerBehavior({ text: 'repliegue' }).primaryPhase, 'without-ball');
assert.deepEqual(classifyPlayerBehavior({ text: 'repliegue' }).secondaryPhases, []);
assert.equal(classifyPlayerBehavior({ text: 'juego aéreo' }).primaryPhase, 'with-ball');
assert.deepEqual(classifyPlayerBehavior({ text: 'juego aéreo' }).secondaryPhases, []);

// 21-22. El asistente detecta emparejamientos y propone perfil sin inventar nombres propios.
const pairingAnswer = answerRivalPlayerTacticalQuestion({ question: '¿Quién debería emparejarse con él?', mode: 'coach', model: isolatedBehaviorModel });
assert.match(pairingAnswer.reading, /No hay datos comparables suficientes/);
assert.match(pairingAnswer.instruction, /Elegir el perfil/);
assert.doesNotMatch(pairingAnswer.reading, /Carlos|Pedro|Juan/);

// 23-24. Rival y Jugadores conservan sus contratos renderizables.
assert.ok(Array.isArray(systemOnlyCollective.behaviors));
assert.ok(Array.isArray(isolatedBehaviorModel.impact));

// 25. Reconstruir desde los mismos datos persistidos produce señales idénticas y sin duplicados.
const persistedRows = JSON.parse(JSON.stringify([
  { player: { id: 'p-a', name: 'Hugo Rodríguez' }, profile: { traits: ['contraataque', 'salida rápida'], notes: 'Ataca espacio.' } },
]));
assert.deepEqual(buildRivalPlayerCollectiveSignals(persistedRows), buildRivalPlayerCollectiveSignals(JSON.parse(JSON.stringify(persistedRows))));

const componentSource = fs.readFileSync(new URL('../components/tactical/RivalPlayerTacticalCenter.jsx', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
[
  'Resumen del jugador',
  'Impacto en el modelo colectivo',
  'Cómo juega',
  'Plan defensivo',
  'Cómo hacerle daño',
  'Tendencias observadas',
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
