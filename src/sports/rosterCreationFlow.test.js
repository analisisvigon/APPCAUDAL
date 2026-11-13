import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SportsContextCoordinator, verifySportsContext } from './authorizedContext.js';
import { createAndConfirmCtsPlayer, loadCtsRoster, resolveRosterContext } from './ctsSportsData.js';
import { groupRosterPlayers } from '../utils/rosterGroups.js';

const option = (id = 'cts-a', seasonStatus = 'open') => ({ club_team_season_id: id,
  club_id: 'club-a', team_id: 'team-a', season_id: id, season_status: seasonStatus });
let contexts = [option()];
let permission = true;
let fichas = [];
let links = [];
let readError = null;
let preferred = null;
let archiveAvailable = true;
const calls = [];
const client = { rpc: async (name, args) => {
  calls.push({ name, args });
  if (name === 'my_access_contexts_v1') return { data: [{ membership_id: 'staff-a',
    club_id: 'club-a', role: 'staff', is_active: true, contexts }] };
  if (name === 'my_operational_cts_v1') return { data: preferred };
  if (name === 'can_write_club_team_season') return { data: permission };
  if (name === 'can_open_historical_cts_v1') return { data: archiveAvailable };
  if (name === 'my_cts_jugadores_v1') return { data: fichas, error: readError };
  if (name === 'my_cts_roster_links_v1') return { data: links };
  throw new Error(`Unexpected RPC: ${name}`);
} };
const coordinator = new SportsContextCoordinator();
let snapshot = coordinator.change(await verifySportsContext(client, 'cts-a'));
assert.equal((await resolveRosterContext(client, '', 'club-a')).context.id, 'cts-a');
contexts = [option(), option('cts-b')];
assert.equal((await resolveRosterContext(client, '', 'club-a')).context, null, 'varios CTS requieren selección');
preferred = 'cts-b';
assert.equal((await resolveRosterContext(client, '', 'club-a')).context, null, 'STAFF no hereda la preferencia de owner');
assert.equal((await resolveRosterContext(client, 'cts-b', 'club-a')).context.id, 'cts-b');
await assert.rejects(resolveRosterContext(client, 'cts-a', 'club-other'), /no autorizados/);
contexts = [option(), option('closed', 'closed')];
archiveAvailable = false;
await assert.rejects(resolveRosterContext(client, 'closed', 'club-a'), (error) => {
  assert.match(error.message, /Archivo pendiente/);
  assert.deepEqual(error.contexts.map((context) => context.id), ['cts-a', 'closed'],
    'un archivo no disponible permite volver a seleccionar el CTS abierto');
  return true;
});
archiveAvailable = true;
contexts = [option()];

const active = { id: 'new-id', global_player_id: 'global-new', membership_id: 'stage-new', active_in_squad: true };
const activeLink = { legacy_jugador_id: active.id, player_id: active.global_player_id,
  legacy_ficha_count: 1, has_departed: false, left_on: null };
const result = { status: 'created', ownPlayerId: active.id,
  globalPlayerId: active.global_player_id, membershipId: active.membership_id };
const histories = Array.from({ length: 24 }, (_, index) => ({ id: `old-${index}`, global_player_id: `g-${index}`, active_in_squad: true }));
fichas = [...histories, active];
links = [...histories.map((row) => ({ legacy_jugador_id: row.id, player_id: row.global_player_id,
  legacy_ficha_count: 1, has_departed: true, voided_at: null })), activeLink];
const before = JSON.stringify({ fichas, links });
assert.deepEqual(await loadCtsRoster(client, coordinator, snapshot), [active], 'las 24 bajas CTS no reaparecen aunque su ficha legacy esté activa');
assert.equal(JSON.stringify({ fichas, links }), before, 'la lectura no modifica registros históricos');
links = [{ ...activeLink, legacy_ficha_count: 2 }];
assert.deepEqual(await loadCtsRoster(client, coordinator, snapshot), [], 'bindings ambiguos no se incluyen');
links = [{ ...activeLink, player_id: 'wrong-global' }];
assert.deepEqual(await loadCtsRoster(client, coordinator, snapshot), [], 'identidades incompatibles no se incluyen');

const freshAttempt = () => ({ playerId: active.id, ctsId: 'cts-a' });
let writes = 0;
const create = async () => { writes++; fichas = [active]; links = [activeLink]; return result; };
fichas = []; links = [];
const attempt = freshAttempt();
const confirmed = await createAndConfirmCtsPlayer(client, coordinator, snapshot, attempt, create);
assert.deepEqual(confirmed, { result, roster: [active] });
await createAndConfirmCtsPlayer(client, coordinator, snapshot, attempt, create);
assert.equal(writes, 1, 'reintentar un alta confirmada no inserta de nuevo');

// A committed RPC followed by a failed read remains pending in the same form.
fichas = []; links = [];
const pending = freshAttempt();
await assert.rejects(createAndConfirmCtsPlayer(client, coordinator, snapshot, pending, async () => {
  await create(); readError = new Error('network read failure'); return result;
}), /network read failure/);
assert.equal(pending.busy, false);
readError = null;
await createAndConfirmCtsPlayer(client, coordinator, snapshot, pending, create);
assert.equal(writes, 2, 'el segundo intento solo relee tras fallar la confirmación');

// The INSERT committed but its response was lost: recover only the same random ID.
fichas = []; links = [];
const lost = freshAttempt();
await assert.rejects(createAndConfirmCtsPlayer(client, coordinator, snapshot, lost, async () => {
  await create(); throw new Error('lost response');
}), /lost response/);
await createAndConfirmCtsPlayer(client, coordinator, snapshot, lost, create);
assert.equal(writes, 3);

fichas = []; links = [];
const incomplete = freshAttempt();
await assert.rejects(createAndConfirmCtsPlayer(client, coordinator, snapshot, incomplete, async () => {
  writes++; return result;
}), /no se confirmó su vinculación/);
await assert.rejects(createAndConfirmCtsPlayer(client, coordinator, snapshot, incomplete, create), /no se confirmó su vinculación/);
assert.equal(writes, 4, 'una respuesta confirmada sin binding no dispara otra creación');

let release;
const busy = freshAttempt();
const inFlight = createAndConfirmCtsPlayer(client, coordinator, snapshot, busy,
  () => new Promise((resolve) => { release = () => { fichas = [active]; links = [activeLink]; resolve(result); }; }));
await assert.rejects(createAndConfirmCtsPlayer(client, coordinator, snapshot, busy, create), /ya se está comprobando/);
while (!release) await new Promise((resolve) => setTimeout(resolve, 0));
release(); await inFlight;
assert.equal(writes, 4);

permission = false;
await assert.rejects(createAndConfirmCtsPlayer(client, coordinator, snapshot, freshAttempt(), create), /permiso/);
permission = true;
contexts = [];
await assert.rejects(createAndConfirmCtsPlayer(client, coordinator, snapshot, freshAttempt(), create), /no autorizados/);
contexts = [option('cts-a', 'closed')];
snapshot = coordinator.change(await verifySportsContext(client, 'cts-a'));
await assert.rejects(createAndConfirmCtsPlayer(client, coordinator, snapshot, freshAttempt(), create), /solo consulta/);
contexts = [option('cts-b')];
snapshot = coordinator.change(await verifySportsContext(client, 'cts-b'));
await assert.rejects(createAndConfirmCtsPlayer(client, coordinator, snapshot, freshAttempt(), create), /formulario no pertenece/);
assert.equal(writes, 4, 'sin permisos, con temporada cerrada o CTS distinto no se escribe');

const rosterCards = [{ id: 'keeper', position: 'Portero' }, { id: 'missing' },
  { id: 'custom', position: 'Carrilero personalizado' }, { id: 'blank', position: '' }];
const groups = groupRosterPlayers(rosterCards, [{ title: 'Porteros', positions: ['Portero'] },
  { title: 'Defensas', positions: ['Defensa'] }]);
assert.deepEqual(groups.flatMap((group) => group.players).map((player) => player.id),
  rosterCards.map((player) => player.id), 'todos los jugadores contados tienen tarjeta, incluso sin posición estándar');
assert.equal(groups.at(-1).players.length, 3);

const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
assert.doesNotMatch(app, /handleDelete\(player\)/, 'el panel no expone ni invoca el borrado abandonado');
assert.match(app, /departRosterPlayer/, 'el panel integra la baja acotada al CTS');
assert.doesNotMatch(app, /deleteOwnPlayer\(/, 'no reutiliza la eliminacion global antigua');
const getPlayers = app.slice(app.indexOf('async function getJugadores'), app.indexOf('const createJugadorPayload'));
assert.doesNotMatch(getPlayers, /\.from\(/, 'no hay lectura legacy de respaldo sin CTS');
assert.match(app, /Equipo y temporada de Plantilla/);
assert.match(app, /setPlayerSearchTerm\(''\); setPlayerQuickFilter\('Todos'\)/, 'el alta no queda escondida por filtros previos');
console.log('rosterCreationFlow tests: OK (CTS, bajas, permisos, reintentos y wiring)');
