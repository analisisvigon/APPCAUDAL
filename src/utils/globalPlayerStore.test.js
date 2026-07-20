import assert from 'node:assert/strict';
import { buildGlobalPlayerRpcPayload, findGlobalPlayerMatches, globalPlayerFromImportedPlayer } from './globalPlayerStore.js';

const imported = globalPlayerFromImportedPlayer({
  name: 'Aitor Ferrero', rawPositions: ['Defensa central', 'Pivote'], externalSource: 'transfermarkt', externalPlayerId: '123', sourceProfileUrl: 'https://tm.test/123',
});
const payload = buildGlobalPlayerRpcPayload({ ...imported, teamId: 'team-id' });
assert.equal(payload.p_positions.find((item) => item.position_type === 'natural' && item.is_primary).position_key, 'defender');
assert.equal(payload.p_positions.some((item) => item.position_key === 'holding_midfield' && !item.is_primary), true);
assert.equal(payload.p_sources.length, 1);

const sourcePayload = buildGlobalPlayerRpcPayload({
  name: 'Jugador con fuentes',
  sources: [
    { url: 'https://generic.test/player', sourceName: 'Otro' },
    { url: 'https://transfermarkt.test/player', sourceName: 'Transfermarkt', isPrimary: true },
  ],
});
assert.deepEqual(sourcePayload.p_sources.map((item) => item.is_primary), [false, true]);

const existing = [{ id: 'global-1', name: 'Aitor Ferrero', dob: '1997-01-02', externalSource: 'transfermarkt', externalPlayerId: '123', sources: [] }];
assert.equal(findGlobalPlayerMatches(imported, existing)[0].confidence, 'exact');
assert.equal(findGlobalPlayerMatches({ name: 'Aitor Ferrero', dob: '1997-01-02' }, existing)[0].reason, 'name_dob');

console.log('globalPlayerStore tests passed');
