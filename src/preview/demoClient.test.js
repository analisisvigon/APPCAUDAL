import assert from 'node:assert/strict';
import { loadAuthorizedSportsContexts, verifySportsContext } from '../sports/authorizedContext.js';
import { loadCtsMatches, loadCtsRoster } from '../sports/ctsSportsData.js';
import { SportsContextCoordinator } from '../sports/authorizedContext.js';
import { createDemoClient, DEMO_ACTIVE_CTS_ID, DEMO_ARCHIVE_CTS_ID } from './demoClient.js';

const client = createDemoClient();
assert.equal(typeof client.from, 'undefined', 'la demo no tiene cliente de tablas');
const contexts = await loadAuthorizedSportsContexts(client);
assert.equal(contexts.length, 2);
assert.equal(contexts.find((row) => row.id === DEMO_ACTIVE_CTS_ID)?.seasonStatus, 'open');
assert.equal(contexts.find((row) => row.id === DEMO_ARCHIVE_CTS_ID)?.seasonStatus, 'closed');
await assert.rejects(verifySportsContext(client, 'cts-ajeno'), /no autorizados/i);

const coordinator = new SportsContextCoordinator();
const active = coordinator.change(await verifySportsContext(client, DEMO_ACTIVE_CTS_ID));
const activePlayers = await loadCtsRoster(client, coordinator, active);
const activeMatches = await loadCtsMatches(client, coordinator, active);
assert.ok(activePlayers.every((row) => row.name.includes('L-')));
assert.ok(activeMatches.every((row) => row.club_team_season_id === DEMO_ACTIVE_CTS_ID));

const archived = coordinator.change(await verifySportsContext(client, DEMO_ARCHIVE_CTS_ID));
assert.equal(coordinator.isCurrent(active), false, 'cambiar el CTS invalida el estado anterior');
const archivedPlayers = await loadCtsRoster(client, coordinator, archived);
const archivedMatches = await loadCtsMatches(client, coordinator, archived);
assert.ok(archivedPlayers.every((row) => row.name.includes('C-')));
assert.ok(archivedMatches.every((row) => row.club_team_season_id === DEMO_ARCHIVE_CTS_ID));

const denied = await client.rpc('my_cts_jugadores_v1', { p_club_team_season_id: 'cts-ajeno' });
assert.equal(denied.error.code, '42501');
console.log('Preview client isolation checks passed.');
