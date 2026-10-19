import assert from 'node:assert/strict';
import { getPlannedSessionBoardTeams } from './plannedSessionBoardTeams.js';

const player = (id, name) => ({ globalPlayerId: id, legacyPlayerId: null,
  snapshot: { name, number: '', position: '', specificPosition: '' } });
const board = {
  schemaVersion: 1,
  board: { pitchType: 'full', elements: [
    { id: 'e1', type: 'participant', x: 20, y: 20, playerRef: player('p1', 'Pepe') },
    { id: 'e2', type: 'participant', x: 30, y: 30, playerRef: player('p1', 'Pepe') },
    { id: 'e3', type: 'participant', x: 40, y: 40, playerRef: player('not-assigned', 'Solo en pizarra') },
  ] },
  assignments: {
    teamColors: { 'team-1': 'purple', 'team-2': 'red', 'team-3': 'yellow', neutral: 'green' },
    players: [
      { playerRef: player('p1', 'Pepe'), teamKey: 'team-1', role: 'player', colorKey: 'purple' },
      { playerRef: player('p1', 'Pepe'), teamKey: 'team-1', role: 'player', colorKey: 'purple' },
      { playerRef: player('p2', 'Álvaro'), teamKey: 'team-1', role: 'player', colorKey: 'purple' },
      { playerRef: player('p3', 'Luis'), teamKey: 'team-2', role: 'player', colorKey: 'red' },
      { playerRef: player('p4', 'Miguel'), teamKey: 'team-3', role: 'player', colorKey: 'yellow' },
      { playerRef: player('p5', 'Comodín'), teamKey: 'neutral', role: 'neutral', colorKey: 'green' },
    ],
  },
};
const teams = getPlannedSessionBoardTeams(board);
assert.deepEqual(teams.map((team) => team.key), ['team-1', 'team-2', 'team-3', 'neutral']);
assert.deepEqual(teams[0].players, ['Pepe', 'Álvaro'], 'los elementos duplicados no duplican nombres');
assert.equal(teams[0].colorName, 'Morado', 'se respeta el color configurado, no el predeterminado');
assert.equal(teams[0].colorValue, '#9333ea');
assert.deepEqual(teams[1].players, ['Luis']);
assert.deepEqual(teams[2].players, ['Miguel']);
assert.deepEqual(teams[3].players, ['Comodín']);
assert.equal(JSON.stringify(teams).includes('Solo en pizarra'), false,
  'un elemento sin asignación no aparece como jugador asignado');
assert.deepEqual(getPlannedSessionBoardTeams({ schemaVersion: 1,
  board: { pitchType: 'full', elements: [] } }), [], 'no se muestran listas vacías');
assert.deepEqual(getPlannedSessionBoardTeams({ schemaVersion: 42, board: {} }), [],
  'una versión futura no se interpreta ni altera');
assert.deepEqual(getPlannedSessionBoardTeams({}), []);

console.log('planned session board teams tests passed (sin Supabase)');
