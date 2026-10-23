import assert from 'node:assert/strict';
import { loadAuthorizedSportsContexts, SportsContextCoordinator, verifySportsContext } from './authorizedContext.js';

const first = {
  club_team_season_id: 'cts-caudal', club_id: 'club-caudal', team_id: 'team-caudal',
  season_id: 'season-open', team_name: 'Caudal', season_label: '2026/2027',
  season_status: 'open', season_is_active: true, team_crest: 'https://example.test/crest.png',
};
const historical = {
  ...first, club_team_season_id: 'cts-historical', season_id: 'season-closed',
  season_label: '2025/2026', season_status: 'closed', season_is_active: false,
};
const other = {
  ...first, club_team_season_id: 'cts-other', club_id: 'club-other',
  team_id: 'team-other', season_id: 'season-other', team_name: 'Otro equipo',
};
const membership = (clubId, contexts, role = 'owner') => ({
  membership_id: `membership-${clubId}`, club_id: clubId, club_name: clubId,
  role, is_active: true, contexts,
});
const client = (rows) => ({ rpc: async (name) => {
  assert.equal(name, 'my_access_contexts_v1');
  return { data: rows, error: null };
} });

const authorized = client([
  membership('club-caudal', [first, historical]),
  membership('club-other', [other]),
]);
const options = await loadAuthorizedSportsContexts(authorized);
assert.deepEqual(options.map((row) => row.id), ['cts-caudal', 'cts-historical', 'cts-other']);
assert.equal(options[0].teamCrest, 'https://example.test/crest.png');
assert.equal((await verifySportsContext(authorized, 'cts-other')).clubId, 'club-other');
await assert.rejects(verifySportsContext(authorized, 'browser-invented'), /no autorizados/);

const staff = client([membership('club-caudal', [first], 'staff')]);
assert.deepEqual((await loadAuthorizedSportsContexts(staff)).map((row) => row.id), ['cts-caudal']);
await assert.rejects(verifySportsContext(staff, 'cts-historical'), /no autorizados/);
await assert.rejects(verifySportsContext(staff, 'cts-other'), /no autorizados/);

const revoked = client([membership('club-caudal', [first])]);
await assert.rejects(verifySportsContext(revoked, 'cts-other'), /no autorizados/);

await assert.rejects(loadAuthorizedSportsContexts(client([
  membership('club-caudal', [first]), membership('club-other', [{ ...other, club_id: 'club-caudal' }]),
])), /ambiguo o incompleto/);

const coordinator = new SportsContextCoordinator();
assert.throws(() => coordinator.change({ id: 'cts-caudal', seasonStatus: 'open' }), /verificación del servidor/);
const initial = coordinator.change(options[0]);
assert.equal(coordinator.isCurrent(initial), true);
coordinator.assertWritable(initial);
const closed = coordinator.change(options[1]);
assert.equal(coordinator.isCurrent(initial), false);
assert.throws(() => coordinator.assertWritable(initial), /ha cambiado/);
assert.throws(() => coordinator.assertWritable(closed), /solo consulta/);
coordinator.change(null);
assert.equal(coordinator.isCurrent(closed), false);

console.log('authorizedContext tests: OK');
