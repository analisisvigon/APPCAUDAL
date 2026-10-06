import assert from 'node:assert/strict';
import {
  assignTrainingTaskPlayer, createTrainingTaskPlayerRef, createTrainingTaskRosterParticipant,
  isTrainingTaskPlayerPlaced, removeTrainingTaskPlayerFromBoard, resolveTrainingTaskPlayerRef,
  setTrainingTaskTeamColor, syncTrainingTaskPlacedPlayers,
} from './trainingTaskRoster.js';

const player = { id: 'legacy-7', globalPlayerId: 'global-7', name: 'Iria Soto', number: 1, position: 'Portero', primaryNaturalPosition: 'goalkeeper', specificPosition: 'Portera', image: 'now.jpg' };
const ref = createTrainingTaskPlayerRef(player);
assert.deepEqual(ref, { globalPlayerId: 'global-7', legacyPlayerId: 'legacy-7', snapshot: { name: 'Iria Soto', number: '1', position: 'Portero', specificPosition: 'Portera' } });

const changed = { ...player, id: 'new-membership', name: 'Iria Actual', number: 13 };
assert.deepEqual(resolveTrainingTaskPlayerRef(ref, [changed]).display, { name: 'Iria Actual', number: '13', position: 'Portero', specificPosition: 'Portera', image: 'now.jpg' });
assert.equal(resolveTrainingTaskPlayerRef({ ...ref, globalPlayerId: null }, [player]).player, player);
assert.equal(resolveTrainingTaskPlayerRef(ref, []).display.name, 'Iria Soto');
assert.equal(ref.snapshot.name, 'Iria Soto');

let assignments = assignTrainingTaskPlayer({}, player, 'team-1');
const placed = createTrainingTaskRosterParticipant(assignments.players[0], { x: 12, y: 22 });
assignments = assignTrainingTaskPlayer(assignments, changed, 'team-2');
let synced = syncTrainingTaskPlacedPlayers([placed], assignments);
assert.equal(assignments.players.length, 1);
assert.equal(assignments.players[0].playerRef.snapshot.name, 'Iria Soto', 'mover de equipo no reescribe el snapshot con datos actuales');
assert.deepEqual({ x: synced[0].x, y: synced[0].y, teamKey: synced[0].teamKey, role: synced[0].role }, { x: 12, y: 22, teamKey: 'team-2', role: 'goalkeeper' });
assert.equal(isTrainingTaskPlayerPlaced(synced, assignments.players[0].playerRef), true);
assert.deepEqual(removeTrainingTaskPlayerFromBoard(synced, assignments.players[0].playerRef), []);

assignments = setTrainingTaskTeamColor(assignments, 'team-2', 'purple');
synced = syncTrainingTaskPlacedPlayers(synced, assignments);
assert.equal(synced[0].colorKey, 'purple');
console.log('training task roster tests passed');
