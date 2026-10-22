import assert from 'node:assert/strict';
import { createOwnPlayerProfileAtomic } from '../utils/globalPlayerStore.js';

const ownPlayerId = '00000000-0000-4000-8000-000000000001';
const globalPlayerId = '00000000-0000-4000-8000-000000000002';
const membershipId = '00000000-0000-4000-8000-000000000003';
const ctsId = '00000000-0000-4000-8000-000000000004';
const calls = [];
const client = { rpc: async (name, args) => {
  calls.push({ name, args });
  return { data: { ownPlayerId, globalPlayerId, membershipId }, error: null };
} };
const draft = { ownRosterPlayerId: ownPlayerId, name: 'Jugador de prueba' };
await createOwnPlayerProfileAtomic(client, { ...draft, clubTeamSeasonId: ctsId });
assert.equal(calls[0].name, 'create_own_player_atomic_v2');
assert.equal(calls[0].args.p_club_team_season_id, ctsId);
await createOwnPlayerProfileAtomic(client, draft);
assert.equal(calls[1].name, 'create_own_player_atomic');
assert.equal('p_club_team_season_id' in calls[1].args, false);
await assert.rejects(
  createOwnPlayerProfileAtomic(client, { ...draft, clubTeamSeasonId: 'invalid' }),
  /UUID válido/
);
assert.equal(calls.length, 2);
console.log('ctsPlayerCreateDispatch tests: OK');
