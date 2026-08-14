import assert from 'node:assert/strict';
import { getPlayerMatchIndicators } from './playerMatchIndicators.js';

const player = { id: 'player-1', name: 'Jugador Uno' };
const otherPlayer = { id: 'player-2', name: 'Jugador Dos' };
const goal = (id, scorer = player, assistant = null) => ({
  id,
  type: 'Gol a favor',
  scorerId: scorer.id,
  scorer: scorer.name,
  assistantId: assistant?.id || null,
  assistant: assistant?.name || '',
});
const keys = (indicators) => indicators.map((indicator) => indicator.key);

assert.deepEqual(keys(getPlayerMatchIndicators({ player, isCaptain: true })), ['captain']);
assert.equal(getPlayerMatchIndicators({ player, goalEvents: [goal('g1')] })[0].label, '⚽');
assert.equal(getPlayerMatchIndicators({ player, goalEvents: [goal('g1'), goal('g2')] })[0].label, '⚽×2');
assert.equal(getPlayerMatchIndicators({ player, goalEvents: [goal('g1', otherPlayer, player)] })[0].label, 'A');
assert.deepEqual(keys(getPlayerMatchIndicators({ player, goalEvents: [goal('g1', player)] })), ['goals'], 'un gol sin asistencia no crea A');
assert.equal(getPlayerMatchIndicators({ player, playerStats: { yellowCount: 2 } })[0].label, '🟨×2');
assert.deepEqual(keys(getPlayerMatchIndicators({ player, playerStats: { red: true } })), ['red']);
assert.deepEqual(keys(getPlayerMatchIndicators({ player, playerStats: { injured: true } })), ['injury']);

assert.deepEqual(
  keys(getPlayerMatchIndicators({
    player,
    isCaptain: true,
    goalEvents: [goal('g1', player, otherPlayer), goal('g2', otherPlayer, player)],
    playerStats: { yellowCount: 1, red: true, injured: true },
  })),
  ['captain', 'goals', 'assists', 'yellow', 'red', 'injury'],
);

assert.deepEqual(getPlayerMatchIndicators({ player }), [], 'sin incidencias no hay indicadores');

const duplicatedOfficialEvent = goal('same-goal', player, otherPlayer);
const deduplicated = getPlayerMatchIndicators({
  player,
  goalEvents: [duplicatedOfficialEvent, { ...duplicatedOfficialEvent }],
  playerStats: { goals: 50, assists: 50 },
});
assert.equal(deduplicated.find((indicator) => indicator.key === 'goals')?.label, '⚽');
assert.equal(deduplicated.some((indicator) => indicator.key === 'assists'), false);

assert.equal(
  getPlayerMatchIndicators({
    player: otherPlayer,
    goalEvents: [goal('sub-goal', otherPlayer)],
    playerStats: { role: 'Suplente' },
  })[0].label,
  '⚽',
  'un suplente que entra usa la misma identidad y fuente oficial',
);

console.log('playerMatchIndicators tests passed');

