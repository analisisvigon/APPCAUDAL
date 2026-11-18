import assert from 'node:assert/strict';
import { checkPlannedSessionGuestsReady, freezePlannedRoster, loadPlannedRosterCandidates,
  loadPlannedSessionGuests, loadPlannedSessionPlayers, reconcilePlannedDate,
  savePlannedAvailability, savePlannedSessionGuests } from './plannedSessionsStore.js';

const calls = [];
const rows = {
  club_team_season_players: [{ id: 'membership-1', club_team_season_id: 'cts-1', player_id: 'player-1',
    joined_on: null, left_on: null, has_departed: false }],
  players_database: [{ id: 'player-1', name: 'Nombre real' }],
  player_positions: [
    { player_id: 'player-1', position_key: 'goalkeeper', position_type: 'natural', is_primary: true },
    { player_id: 'player-1', position_key: 'sweeper_keeper', position_type: 'specific', is_primary: true },
  ],
  planned_session_player_roster: [{ session_id: 'session-1', player_id: 'player-1',
    source_membership_id: 'membership-1', player_name_snapshot: 'Nombre histórico', position_key_snapshot: 'goalkeeper' }],
  planned_session_player_availability: [{ session_id: 'session-1', player_id: 'player-1',
    status: 'injured', observation: 'Observación propia de esta sesión' }],
  planned_session_guests_v1: [{ id: 'guest-other-session', session_id: 'session-2',
    player_name: 'Invitado ajeno', origin_team: null, position_group: 'forward', status: 'available' }],
};
const client = {
  from(table) {
    calls.push({ table });
    const filters = [];
    return { select() { return this; }, eq(column, value) {
      calls.push({ table, column, value }); filters.push([column, value]); return this;
    }, is() { return this; }, in() { return this; },
      then(resolve) { resolve({ data: (rows[table] || []).filter((row) =>
        filters.every(([column, value]) => row[column] === value)), error: null }); } };
  },
  async rpc(name, args) {
    calls.push({ name, args });
    if (name === 'save_planned_session_availability_04b') {
      rows.planned_session_player_availability = args.p_changes.map((change) => ({ session_id: args.p_session_id, ...change }));
    }
    if (name === 'planned_session_guests_ready_v1') return { data: true, error: null };
    if (name === 'save_planned_session_guests_v1') {
      rows.planned_session_guests_v1 = rows.planned_session_guests_v1
        .filter((guest) => guest.session_id !== args.p_session_id)
        .concat(args.p_guests.map((guest) => ({ ...guest, player_name: guest.player_name,
          session_id: args.p_session_id })));
      return { data: args.p_expected_revision + 1, error: null };
    }
    return { data: 5, error: null };
  },
};

const candidates = await loadPlannedRosterCandidates(client, 'cts-1');
assert.deepEqual(candidates.map((row) => [row.id, row.player_id, row.name, row.position_key]),
  [['membership-1', 'player-1', 'Nombre real', 'goalkeeper']]);
assert.equal(candidates[0].specific_position_key, 'sweeper_keeper',
  'la agrupación propuesta usa la demarcación específica principal disponible');
assert.ok(calls.some((call) => call.table === 'club_team_season_players' &&
  call.column === 'club_team_season_id' && call.value === 'cts-1'));
const loaded = await loadPlannedSessionPlayers(client, 'session-1');
assert.equal(loaded.roster[0].player_name_snapshot, 'Nombre histórico', 'se usa el snapshot, no el nombre actual');
assert.equal(loaded.availability[0].status, 'injured');
assert.ok(calls.every((call) => !call.name), 'abrir la plantilla no llama RPC de escritura');

await freezePlannedRoster(client, 'session-1', 4, ['membership-1'], true, true);
await savePlannedAvailability(client, 'session-1', 5,
  [{ player_id: 'player-1', status: 'adapted', observation: null }]);
await reconcilePlannedDate(client, 'session-1', 6, '2026-10-26', ['membership-1'], true);
assert.deepEqual(calls.slice(-3), [
  { name: 'freeze_planned_session_roster_04b', args: {
    p_session_id: 'session-1', p_expected_revision: 4, p_source_membership_ids: ['membership-1'],
    p_confirm_uncertain_dates: true, p_confirm_existing_session: true,
  } },
  { name: 'save_planned_session_availability_04b', args: {
    p_session_id: 'session-1', p_expected_revision: 5,
    p_changes: [{ player_id: 'player-1', status: 'adapted', observation: null }],
  } },
  { name: 'reconcile_planned_session_date_04b', args: {
    p_session_id: 'session-1', p_expected_revision: 6, p_new_date: '2026-10-26',
    p_confirmed_source_membership_ids: ['membership-1'], p_confirm_uncertain_dates: true,
  } },
]);
await assert.rejects(savePlannedAvailability({ rpc: async () => ({ data: null,
  error: { code: '40001', message: 'CAS obsoleto' } }) }, 'session-1', 4, []),
{ code: '40001' }, 'una revisión obsoleta nunca se presenta como guardada');
console.log('planned session players store tests passed');

const historicalRoster = JSON.stringify(rows.planned_session_player_roster);
const generalRoster = JSON.stringify(rows.club_team_season_players);
await savePlannedAvailability(client, 'session-1', 7,
  [{ player_id: 'player-1', status: 'first_team', observation: 'Convocatoria del primer equipo' }]);
const reopened = await loadPlannedSessionPlayers(client, 'session-1');
assert.equal(reopened.availability[0].status, 'first_team');
assert.equal(reopened.availability[0].observation, 'Convocatoria del primer equipo');
assert.equal(JSON.stringify(reopened.roster), historicalRoster);
assert.equal(JSON.stringify(rows.club_team_season_players), generalRoster);
assert.ok(calls.every((call) => call.table !== 'jugadores'), 'no lee ni modifica la disponibilidad general');

assert.equal(await checkPlannedSessionGuestsReady(client), true);
const invited = [
  { id: 'guest-1', name: 'Pablo', origin_team: 'JUV', position_group: 'forward', status: 'available', is_guest: true },
  { id: 'guest-2', name: 'Mario', origin_team: '', position_group: 'midfielder', status: 'adapted', is_guest: true },
];
assert.equal(await savePlannedSessionGuests(client, 'session-1', 8, invited), 9);
assert.deepEqual(calls.filter((call) => call.name === 'save_planned_session_guests_v1').at(-1).args.p_guests, [
  { id: 'guest-1', player_name: 'Pablo', origin_team: 'JUV',
    position_group: 'forward', status: 'available' },
  { id: 'guest-2', player_name: 'Mario', origin_team: null,
    position_group: 'midfielder', status: 'adapted' },
], 'el guardado envía la colección completa de invitados de la sesión');
const savedGuests = await loadPlannedSessionGuests(client, 'session-1');
assert.deepEqual(savedGuests.map(({ name, origin_team, position_group, status }) =>
  [name, origin_team, position_group, status]), [
  ['Pablo', 'JUV', 'forward', 'available'],
  ['Mario', '', 'midfielder', 'adapted'],
]);
assert.equal(savedGuests.every((guest) => guest.is_guest), true);
assert.equal((await loadPlannedSessionGuests(client, 'session-2'))[0].name, 'Invitado ajeno',
  'los invitados de otras sesiones no se cambian');
await savePlannedSessionGuests(client, 'session-1', 9, [
  { ...invited[0], name: 'Pablo editado', status: 'absent' },
]);
assert.deepEqual((await loadPlannedSessionGuests(client, 'session-1')).map((guest) =>
  [guest.name, guest.status]), [['Pablo editado', 'absent']],
'editar y quitar invitados se conserva al volver a cargar la sesión');
assert.ok(calls.some((call) => call.name === 'save_planned_session_guests_v1' &&
  call.args.p_session_id === 'session-1'));
assert.equal(await savePlannedSessionGuests(client, 'session-1', 10, []), 11);
assert.deepEqual(await loadPlannedSessionGuests(client, 'session-1'), [],
  'una lista completa vacía retira todos los invitados solo de esa sesión');
assert.equal((await loadPlannedSessionGuests(client, 'session-2'))[0].name, 'Invitado ajeno',
  'el reemplazo completo nunca elimina invitados de otras sesiones');
await assert.rejects(savePlannedSessionGuests({ rpc: async () => ({ data: null,
  error: { code: '40001', message: 'Revision obsoleta' } }) }, 'session-1', 10, invited),
{ code: '40001' }, 'la revisión obsoleta de invitados se propaga como conflicto');
