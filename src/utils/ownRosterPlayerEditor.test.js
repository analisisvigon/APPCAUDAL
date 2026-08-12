import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildOwnRosterGlobalEditorDraft,
  loadGlobalPlayerDatabase,
  normalizeGlobalPlayer,
  resolveOwnRosterGlobalPlayer,
} from './globalPlayerStore.js';

const alexGlobalId = '111fa593-0fe1-4ca9-aa2b-f1a7e23df5d4';
const alexMembershipId = '87105801-4931-4134-9bb6-85f031705bff';
const ismaRosterId = '778c4e89-d806-4b7f-b7e5-072b1269fcb4';
const ismaGlobalId = '22222222-2222-4222-8222-222222222222';

const alexProfile = {
  id: alexGlobalId,
  globalPlayerId: alexGlobalId,
  name: 'Alex González',
  dob: '2001-12-24',
  memberships: [{ id: alexMembershipId, team_id: 'caudal', is_current: true, number: '1' }],
};
const ismaProfile = {
  id: ismaGlobalId,
  globalPlayerId: ismaGlobalId,
  name: 'ISMA CERRO',
  dob: '1995-07-07',
  shirtName: '',
  photoUrl: '',
  memberships: [{ id: 'isma-membership', team_id: 'caudal', is_current: true, number: '16' }],
  fieldSources: {},
  legacyOwnPlayerIds: [ismaRosterId],
};
const profiles = [alexProfile, ismaProfile];

const alexResolution = resolveOwnRosterGlobalPlayer({
  id: 'alex-roster',
  globalPlayerId: alexGlobalId,
  membershipId: alexMembershipId,
  name: 'Alex González',
}, profiles);
assert.equal(alexResolution.player, alexProfile, 'A: un jugador ya vinculado se resuelve por global_player_id');
assert.equal(alexResolution.strategy, 'global_player_id');

const ismaRoster = {
  id: ismaRosterId,
  globalPlayerId: null,
  membershipId: null,
  name: 'ISMA CERRO',
  shirtName: 'Isma Cerro',
  dob: '1995-07-07',
  number: 16,
  position: 'Extremo izquierdo',
  foot: 'Derecha',
  image: 'https://example.test/transfermarkt-photo.png',
};
const ismaResolution = resolveOwnRosterGlobalPlayer(ismaRoster, profiles);
assert.equal(ismaResolution.player, ismaProfile, 'B/C: una fila importada sin enlaces recupera su perfil por el mapa legacy fiable');
assert.equal(ismaResolution.strategy, 'legacy_own_player_id');

const ismaDraft = buildOwnRosterGlobalEditorDraft(ismaRoster, ismaResolution.player);
assert.equal(ismaDraft.globalPlayerId, ismaGlobalId, 'el editor conserva el UUID global, no el UUID legacy');
assert.equal(ismaDraft.ownRosterPlayerId, ismaRosterId, 'la fila legacy queda identificada para reparar únicamente su enlace');
assert.equal(ismaDraft.photoUrl, ismaRoster.image, 'la fotografía externa existente se adapta al editor global');
assert.equal(ismaDraft.shirtName, 'Isma Cerro');
assert.equal(ismaDraft.foot, 'Derecha');
assert.equal(ismaDraft.primaryNaturalPosition, 'forward');
assert.equal(ismaDraft.primarySpecificPosition, 'left_winger');

const membershipResolution = resolveOwnRosterGlobalPlayer({ membershipId: alexMembershipId }, profiles);
assert.equal(membershipResolution.player, alexProfile, 'E: membership_id también resuelve el mismo perfil global');

const staleDirectLinkResolution = resolveOwnRosterGlobalPlayer({
  id: ismaRosterId,
  globalPlayerId: '99999999-9999-4999-8999-999999999999',
}, profiles);
assert.equal(staleDirectLinkResolution.player, ismaProfile, 'un enlace directo obsoleto continúa hasta el mapa legacy en lugar de producir un no-op');
assert.deepEqual(staleDirectLinkResolution.failedStrategies, ['missing_global_player_id']);

const legacyProfile = {
  id: '33333333-3333-4333-8333-333333333333',
  globalPlayerId: '33333333-3333-4333-8333-333333333333',
  name: 'Jugador legacy',
  memberships: [],
  fieldSources: { migration: { legacyPlayerId: 'legacy-roster-id' } },
};
assert.equal(
  resolveOwnRosterGlobalPlayer({ id: 'legacy-roster-id', name: 'Nombre anterior' }, [...profiles, legacyProfile]).player,
  legacyProfile,
  'F: la identidad legacy explícita tiene prioridad sobre el nombre'
);

const withoutPhoto = { id: '44444444-4444-4444-8444-444444444444', globalPlayerId: '44444444-4444-4444-8444-444444444444', name: 'Sin Foto', dob: '2000-01-01', memberships: [] };
assert.equal(resolveOwnRosterGlobalPlayer({ name: 'Sin Foto', dob: '2000-01-01' }, [...profiles, withoutPhoto]).player, withoutPhoto, 'D: la foto no interviene en la identidad');

const withoutMembership = {
  id: '66666666-6666-4666-8666-666666666666',
  globalPlayerId: '66666666-6666-4666-8666-666666666666',
  name: 'Sin membership',
  memberships: [],
  legacyOwnPlayerIds: ['roster-without-membership'],
};
assert.equal(
  resolveOwnRosterGlobalPlayer({ id: 'roster-without-membership', name: 'Nombre legacy distinto' }, [...profiles, withoutMembership]).player,
  withoutMembership,
  'un jugador sin membership abre si el enlace legacy determina el perfil global'
);

const normalizedMappedProfile = normalizeGlobalPlayer(
  { id: ismaGlobalId, name: 'Isma global' },
  { ownRosterMigrations: [{ legacy_player_id: ismaRosterId, global_player_id: ismaGlobalId, membership_id: null }] }
);
assert.deepEqual(normalizedMappedProfile.legacyOwnPlayerIds, [ismaRosterId], 'el cargador adjunta al perfil global el UUID histórico de Plantilla');
assert.equal(resolveOwnRosterGlobalPlayer(ismaRoster, [normalizedMappedProfile]).player, normalizedMappedProfile);

const globalRowsByTable = {
  players_database: [{ id: ismaGlobalId, name: 'Isma global' }],
  player_team_memberships: [],
  player_positions: [],
  player_sources: [],
  player_scouting_traits: [],
  legacy_own_player_migration: [{ legacy_player_id: ismaRosterId, global_player_id: ismaGlobalId, membership_id: null }],
};
const loadedGlobalDatabase = await loadGlobalPlayerDatabase({
  from: (table) => ({
    select: () => ({
      order: async () => ({ data: globalRowsByTable[table] || [], error: null }),
    }),
  }),
});
assert.equal(loadedGlobalDatabase.available, true);
assert.equal(resolveOwnRosterGlobalPlayer(ismaRoster, loadedGlobalDatabase.players).player?.id, ismaGlobalId, 'la carga real incorpora el mapa legacy antes de pulsar Editar');
assert.equal(resolveOwnRosterGlobalPlayer(ismaRoster, loadedGlobalDatabase.players).player?.id, ismaGlobalId, 'cerrar y volver a resolver conserva la misma identidad global');

const duplicatedExact = { ...ismaProfile, id: '55555555-5555-4555-8555-555555555555', globalPlayerId: '55555555-5555-4555-8555-555555555555' };
assert.equal(resolveOwnRosterGlobalPlayer(ismaRoster, [...profiles, duplicatedExact]).player, null, 'una coincidencia exacta ambigua se bloquea para no fusionar ni duplicar');

const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const formSource = fs.readFileSync(new URL('../components/players/PlayerDatabaseForm.jsx', import.meta.url), 'utf8');
const openFormSource = appSource.slice(appSource.indexOf('const openForm ='), appSource.indexOf('const closeForm ='));
const linkSource = appSource.slice(appSource.indexOf('const ensureOwnRosterGlobalLink'), appSource.indexOf('const saveRivalPlayerFromModal'));
assert.ok(openFormSource.includes('resolveOwnRosterGlobalPlayer(player, globalPlayers)'), 'Plantilla usa el resolvedor global compartido');
assert.ok(openFormSource.includes('buildOwnRosterGlobalEditorDraft'), 'Plantilla abre el editor global con un adaptador de datos');
assert.ok(openFormSource.includes('No se abrirá el editor legacy ni se creará un duplicado'), 'una identidad ambigua no cae silenciosamente al formulario alternativo');
assert.ok(openFormSource.includes("console.error('[OWN_PLAYER_EDITOR_RESOLUTION_FAILED]'"), 'un fallo total deja diagnóstico visible en desarrollo');
assert.ok(linkSource.includes(".from('jugadores')") && linkSource.includes('.update({ global_player_id: globalPlayerId })'), 'guardar repara el enlace de la fila existente');
assert.ok(!linkSource.includes('.insert('), 'la reparación de identidad no crea jugadores ni membresías');
assert.ok(formSource.includes('Editar jugador global') && formSource.includes('Nombre en camiseta') && formSource.includes('Nombre en Google Forms'), 'el editor unificado conserva los campos propios');
assert.ok(formSource.includes('Fecha de nacimiento') && formSource.includes('Edad si no hay fecha') && formSource.includes('Altura'), 'el editor global cubre fecha, edad y altura');
assert.ok(formSource.includes('Posición natural principal') && formSource.includes('Posición específica principal'), 'el editor global conserva las posiciones reales');
assert.ok(!openFormSource.includes('ISMA CERRO'), 'la corrección no contiene lógica específica por nombre');

console.log('ownRosterPlayerEditor tests passed');
