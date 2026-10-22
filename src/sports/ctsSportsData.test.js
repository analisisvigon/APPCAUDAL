import assert from 'node:assert/strict';
import { loadAuthorizedSportsContexts, SportsContextCoordinator } from './authorizedContext.js';
import { assertCtsCreate, assertCtsMatchWrite, loadCtsMatches, loadCtsRoster } from './ctsSportsData.js';

const row = (id, status = 'open') => ({
  club_team_season_id: id, club_id: 'club-a', team_id: 'team-a',
  season_id: id, season_status: status, season_is_active: status === 'open',
});
let authorized = [row('cts-a')];
let delayedRoster;
let crossedMatchResponse = false;
const calls = [];
const client = {
  rpc: async (name, args) => {
    calls.push([name, args]);
    if (name === 'my_access_contexts_v1') return { data: [{
      membership_id: 'm-a', club_id: 'club-a', role: 'staff', is_active: true,
      contexts: authorized,
    }], error: null };
    if (name === 'my_cts_jugadores_v1') return delayedRoster || { data: [{ id: 'j-a' }], error: null };
    if (name === 'my_cts_matches_v1') return { data: [
      { id: 'p-a', club_team_season_id: 'cts-a' },
      ...(crossedMatchResponse ? [{ id: 'p-b', club_team_season_id: 'cts-b' }] : []),
    ], error: null };
    if (name === 'can_write_match' || name === 'can_write_club_team_season') {
      return { data: true, error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
    data: { id: 'p-b', club_team_season_id: 'cts-b' }, error: null,
  }) }) }) }),
};
const coordinator = new SportsContextCoordinator();
const [context] = await loadAuthorizedSportsContexts(client);
const snapshot = coordinator.change(context);
assert.deepEqual(await loadCtsRoster(client, coordinator, snapshot), [{ id: 'j-a' }]);
assert.deepEqual((await loadCtsMatches(client, coordinator, snapshot)).map((match) => match.id), ['p-a']);
crossedMatchResponse = true;
await assert.rejects(loadCtsMatches(client, coordinator, snapshot), /contiene otro equipo/);
crossedMatchResponse = false;
assert.equal((await assertCtsCreate(client, coordinator, snapshot)).id, 'cts-a');
await assert.rejects(assertCtsMatchWrite(client, coordinator, snapshot, 'p-b'), /no pertenece/);
assert(calls.some(([name, args]) => name === 'my_cts_matches_v1' && args.p_club_team_season_id === 'cts-a'));

authorized = [];
await assert.rejects(loadCtsRoster(client, coordinator, snapshot), /no autorizados/);
authorized = [row('cts-a')];
let release;
delayedRoster = new Promise((resolve) => { release = resolve; });
const pending = loadCtsRoster(client, coordinator, snapshot);
await new Promise((resolve) => setTimeout(resolve, 0));
coordinator.change(null);
release({ data: [{ id: 'j-a' }], error: null });
await assert.rejects(pending, /ha cambiado/);

const [closed] = await loadAuthorizedSportsContexts({ rpc: async () => ({
  data: [{ membership_id: 'm-a', club_id: 'club-a', role: 'staff', is_active: true,
    contexts: [row('cts-closed', 'closed')] }], error: null,
}) });
const closedSnapshot = coordinator.change(closed);
authorized = [row('cts-closed', 'closed')];
await assert.rejects(assertCtsCreate(client, coordinator, closedSnapshot), /solo consulta/);
console.log('ctsSportsData tests: OK');
