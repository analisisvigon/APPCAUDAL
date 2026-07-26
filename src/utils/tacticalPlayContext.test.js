import assert from 'node:assert/strict';
import {
  buildPlayerTacticalParticipation,
  buildTacticalEvidenceSummary,
  buildTacticalPlayContext,
  calculateBlockHeight,
  calculateLineDistances,
  calculateTeamWidth,
  detectOccupiedChannels,
  detectPlayersBetweenLines,
  detectPlayersNearBall,
  detectWidePlayers,
  getPlayersByLine,
  selectTacticalContextsForQuestion,
} from './tacticalPlayContext.js';

const positions = {
  'rival:0': { x: 50, y: 8 },
  'rival:1': { x: 12, y: 27 },
  'rival:2': { x: 38, y: 29 },
  'rival:3': { x: 62, y: 29 },
  'rival:4': { x: 88, y: 27 },
  'rival:5': { x: 14, y: 50 },
  'rival:6': { x: 40, y: 51 },
  'rival:7': { x: 60, y: 51 },
  'rival:8': { x: 72, y: 49 },
  'rival:9': { x: 42, y: 73 },
  'rival:10': { x: 58, y: 73 },
  'caudal:0': { x: 50, y: 92 },
  'caudal:1': { x: 15, y: 76 },
  'caudal:2': { x: 38, y: 74 },
  'caudal:3': { x: 62, y: 74 },
  'caudal:4': { x: 85, y: 76 },
  'caudal:5': { x: 18, y: 57 },
  'caudal:6': { x: 40, y: 56 },
  'caudal:7': { x: 60, y: 56 },
  'caudal:8': { x: 82, y: 57 },
  'caudal:9': { x: 43, y: 38 },
  'caudal:10': { x: 57, y: 38 },
};

const players = [
  {
    id: 'rival-cd',
    boardKey: 'rival:3',
    name: 'Central derecho',
    role: 'Central derecho',
    primaryNaturalPosition: 'Defensa',
    primarySpecificPosition: 'Central derecho',
    foot: 'Derecha',
  },
  {
    id: 'rival-ld',
    boardKey: 'rival:4',
    name: 'Fran Álvarez',
    role: 'Lateral derecho',
    primaryNaturalPosition: 'Defensa',
    primarySpecificPosition: 'Lateral derecho',
    foot: 'Derecha',
    mainProfile: 'Lateral profundo',
    traits: [
      { category: 'strength', label: 'Proyección exterior' },
      { category: 'trend', label: 'Se incorpora por fuera' },
    ],
  },
  {
    id: 'rival-ed',
    boardKey: 'rival:8',
    name: 'Extremo derecho',
    role: 'Extremo derecho',
    primaryNaturalPosition: 'Centrocampista',
    primarySpecificPosition: 'Extremo derecho',
    foot: 'Izquierda',
    mainProfile: 'Extremo interior',
    traits: [{ category: 'trend', label: 'Recibe por dentro' }],
  },
];

const connection = {
  id: 'connection-cd-ld',
  team: 'rival',
  origin: 'Central derecho',
  destination: 'Lateral derecho',
  type: 'Pase habitual',
  intensity: 'Alta',
  comment: 'Salida recurrente hacia banda derecha',
};

const play = {
  id: 'play-right-build-up',
  phase: 'offensive',
  name: 'Salida derecha 4-4-2',
  offensiveSituation: 'build_up',
  playStyle: 'combinative',
  rivalSystem: '4-4-2',
  caudalSystem: '4-4-2',
  playerPositions: positions,
  arrows: [
    { id: 'pass-cd-ld', type: 'pass', start: positions['rival:3'], end: positions['rival:4'] },
    { id: 'move-ed-inside', type: 'movement', start: positions['rival:8'], end: { x: 58, y: 43 } },
  ],
  description: 'Central derecho conecta con Fran Álvarez, que gana altura, mientras el extremo derecho ocupa el carril interior.',
};

const fullContext = buildTacticalPlayContext({
  matchId: 'match-1',
  rivalTeamId: 'team-rival',
  phase: 'offensive',
  play,
  players,
  collectiveProfile: {
    buildUp: 'Salida combinativa',
    preferredAttack: 'Banda derecha',
    strengths: ['Juego por fuera'],
  },
  connections: [connection],
});

assert.equal(fullContext.playId, play.id);
assert.equal(fullContext.description, play.description);
assert.equal(fullContext.phase, 'offensive');
assert.equal(fullContext.playStyle, 'combinative');
assert.equal(fullContext.connections.length, 1);
assert.deepEqual(fullContext.registeredConnections, fullContext.connections);
assert.equal(fullContext.boardEvidence.passArrows.length, 1);
assert.equal(fullContext.boardEvidence.movementArrows.length, 1);
assert.equal(fullContext.boardEvidence.playersBetweenLines.rival.length, 4);
assert.ok(fullContext.sources.some((source) => source.type === 'tactical_play_description'));
assert.ok(fullContext.sources.some((source) => source.type === 'tactical_play'));
assert.ok(fullContext.sources.some((source) => source.type === 'player_profile'));
assert.ok(fullContext.sources.some((source) => source.type === 'collective_profile'));
assert.ok(fullContext.sources.some((source) => source.type === 'tactical_connection'));
assert.ok(fullContext.sources.some((source) => source.type === 'board_evidence'));

const centreBack = fullContext.involvedPlayers.find((player) => player.playerId === 'rival-cd');
const rightBack = fullContext.involvedPlayers.find((player) => player.playerId === 'rival-ld');
const rightWing = fullContext.involvedPlayers.find((player) => player.playerId === 'rival-ed');
assert.ok(centreBack.roles.includes('lanzador'));
assert.ok(rightBack.roles.includes('receptor'));
assert.ok(rightWing.roles.includes('protagonista'));
assert.deepEqual(rightBack.strengths, ['Proyección exterior']);
assert.deepEqual(rightWing.tendencies, ['Recibe por dentro']);

const fullSummary = buildTacticalEvidenceSummary([fullContext], {
  question: '¿Cómo progresa el rival con balón?',
});
assert.equal(fullSummary.confidence, 'Alta');
assert.match(fullSummary.conclusion, /banda derecha/i);
assert.match(fullSummary.proposedAction, /conexión interior/i);

const withoutDescriptionContext = buildTacticalPlayContext({
  phase: 'offensive',
  play: { ...play, description: '' },
  players,
  collectiveProfile: {
    buildUp: 'Salida combinativa',
    preferredAttack: 'Banda derecha',
  },
  connections: [connection],
});
const withoutDescriptionSummary = buildTacticalEvidenceSummary([withoutDescriptionContext], {
  question: '¿Cómo progresa el rival con balón?',
});
assert.equal(withoutDescriptionSummary.confidence, 'Media');

const visualOnlyContext = buildTacticalPlayContext({
  phase: 'offensive',
  play: { ...play, description: '' },
  players: players.map(({ id, boardKey, name }) => ({ id, boardKey, name })),
  collectiveProfile: {},
  connections: [],
});
const visualOnlySummary = buildTacticalEvidenceSummary([visualOnlyContext], {
  question: '¿Cómo progresa el rival con balón?',
});
assert.equal(visualOnlySummary.confidence, 'Baja');
assert.match(visualOnlySummary.conclusion, /información insuficiente/i);
assert.deepEqual(visualOnlySummary.sources.map((source) => source.type), ['tactical_play', 'board_evidence']);
assert.equal(
  visualOnlyContext.involvedPlayers.find((player) => player.playerId === 'rival-ld').dominantFoot,
  null
);

const legacyContext = buildTacticalPlayContext({
  phase: 'defensive',
  play: {
    id: 'legacy-play',
    name: 'Jugada antigua',
    defensiveSituation: 'mid_block',
    playerPositions: { 'rival:0': { x: 50, y: 10 } },
  },
});
assert.equal(legacyContext.playId, 'legacy-play');
assert.equal(legacyContext.manualDescription, null);
assert.deepEqual(legacyContext.connections, []);
assert.deepEqual(legacyContext.involvedPlayers, []);
assert.ok(!JSON.stringify(legacyContext).includes('undefined'));

const participation = buildPlayerTacticalParticipation([fullContext], 'rival-ld');
assert.equal(participation.playCount, 1);
assert.equal(participation.connections.length, 1);
assert.ok(participation.roles.includes('receptor'));
assert.equal(participation.passesAsLauncher, 0);
assert.equal(participation.passesAsReceiver, 1);
assert.equal(selectTacticalContextsForQuestion([fullContext], '¿Qué hace tras pérdida?').length, 0);
assert.equal(selectTacticalContextsForQuestion([fullContext], '¿Cómo progresa?', { playerId: 'rival-ld' }).length, 1);

assert.equal(calculateTeamWidth(positions, 'rival'), 76);
assert.equal(calculateBlockHeight(positions, 'rival'), 45.9);
assert.deepEqual(calculateLineDistances(positions, 'rival'), [22.25, 22.75]);
assert.equal(getPlayersByLine(positions, 'rival').length, 3);
assert.equal(detectWidePlayers(positions, 'rival').length, 3);
assert.deepEqual(detectOccupiedChannels(positions, 'rival'), { left: 2, centre: 7, right: 2 });
assert.deepEqual(
  detectPlayersBetweenLines(positions, 'rival', 'caudal').map(({ playerKey }) => playerKey),
  ['rival:5', 'rival:6', 'rival:7', 'rival:8']
);
assert.deepEqual(detectPlayersNearBall(positions, { x: 88, y: 27 }, 3).map(({ playerKey }) => playerKey), ['rival:4']);

console.log('tacticalPlayContext tests passed');
