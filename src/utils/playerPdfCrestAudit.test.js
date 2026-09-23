import assert from 'node:assert/strict';
import { resolveOpponentTeamIdentity } from './opponentTeamIdentity.js';
import {
  buildPlayerPdfDiagnostic,
  buildPlayerPdfCrestAudit,
  buildPlayerPdfOpponentCrestAudit,
  completePlayerPdfDiagnostic,
  completePlayerPdfCrestAudit,
  isPlayerPdfCrestAuditEnabled,
} from './playerPdfCrestAudit.js';
import { buildPlayerConnectionRows } from './playerProductionDetails.js';
import { getPlayerPositionUsage } from './playerPositionUsage.js';

assert.equal(isPlayerPdfCrestAuditEnabled(true), true, 'DEV habilita el diagnóstico sin depender de la URL');
assert.equal(isPlayerPdfCrestAuditEnabled(false), false, 'producción mantiene deshabilitado el diagnóstico');
assert.equal(isPlayerPdfCrestAuditEnabled(), false, 'el valor seguro por defecto no expone el diagnóstico');

const teams = [
  { id: 'own', name: 'Caudal', crest: 'https://images.example/own.png', isOwnClub: true },
  { id: 'salamanca-catalog', name: 'Salamanca UDS', crest: 'https://images.example/salamanca.png?access_token=private' },
  { id: 'ceares-id', name: 'Unión Club Ceares', crest: 'https://images.example/ceares.png?signature=private' },
  { id: 'other-id', name: 'Otro rival', crest: 'https://images.example/other.png' },
];
const matches = [
  {
    id: 'salamanca-match',
    opponent: 'Salamanca CF UDS',
    equipo_rival_id: 'stale-id',
    opponent_crest: 'https://history.example/salamanca.png?Authorization=private',
    competition_key: 'copa_rfef',
  },
  {
    id: 'ceares-match',
    opponent: 'Unión Club Ceares',
    equipoRivalId: 'ceares-id',
    competitionKey: 'league',
  },
  { id: 'other-match', opponent: 'Otro rival', equipoRivalId: 'other-id' },
];
const originalInputs = JSON.stringify({ teams, matches });
const currentSalamancaResolution = resolveOpponentTeamIdentity({ match: matches[0], teams });
const audit = buildPlayerPdfCrestAudit({ matches, teams });

assert.equal(JSON.stringify({ teams, matches }), originalInputs, 'la auditoría no modifica los objetos cargados');
assert.deepEqual(audit.rivals.map((rival) => rival.target), ['Salamanca CF UDS', 'Unión Club Ceares']);
assert.equal(audit.rivals.length, 2, 'solo audita los dos rivales autorizados');
assert.equal(audit.rivals[0].catalog.matchById, null);
assert.equal(audit.rivals[0].catalog.normalizedNameCandidateCount, 0);
assert.equal(audit.rivals[0].catalog.relatedEntryCount, 1);
assert.equal(audit.rivals[0].resolution.method, currentSalamancaResolution.source, 'la auditoría observa el resolver sin cambiarlo');
assert.equal(audit.rivals[0].resolution.finalCrest, 'https://history.example/salamanca.png');
assert.equal(audit.rivals[1].catalog.matchById.id, 'ceares-id');
assert.equal(audit.rivals[1].resolution.method, 'team_id');

const completed = completePlayerPdfCrestAudit(audit, [
  {
    matchId: 'salamanca-match',
    source: 'https://history.example/salamanca.png?access_token=private',
    loaded: false,
    imageFormat: '',
    error: 'fetch_failed:Failed to fetch https://secret.example/?token=private',
  },
  {
    matchId: 'ceares-match',
    source: 'https://images.example/ceares.png?signature=private',
    loaded: true,
    imageFormat: 'PNG',
    error: '',
  },
]);

assert.deepEqual(completed.rivals.map((rival) => rival.load.result), ['error', 'success']);
assert.equal(completed.rivals[0].load.error, 'fetch_failed');
assert.equal(completed.rivals[1].load.imageType, 'PNG');
const serialized = JSON.stringify(completed);
assert.doesNotMatch(serialized, /Otro rival|other-id|access_token|Authorization|signature=|token=|secret\.example|data:image[^\]]*,/i);
assert.doesNotMatch(serialized, /cookie|session|email|supabase|refresh_token/i);

const player = { id: 'acerete-id', name: 'Cristian Acerete', image: 'https://images.example/acerete.png' };
const positionMatchRows = [
  {
    matchId: 'match-ei',
    minutes: 491,
    role: 'Titular',
    duration: 491,
    initialSystem: '4-3-3',
    playerStats: { 'Cristian Acerete': { jugadorId: 'acerete-id', role: 'Titular', minutes: 491 } },
    intervals: [{ id: 'interval-ei', fromMinute: 0, toMinute: 491, system: '4-3-3', isComplete: true, slots: [{ slot: 10, jugadorId: 'acerete-id', playerNameSnapshot: 'Cristian Acerete' }] }],
    matchMetadata: { date: '2026-08-01', opponent: 'Rival EI', competition: 'Liga' },
  },
  {
    matchId: 'match-forward',
    minutes: 36,
    role: 'Titular',
    duration: 36,
    initialSystem: '3-4-3',
    playerStats: { 'Cristian Acerete': { jugadorId: 'acerete-id', role: 'Titular', minutes: 36 } },
    intervals: [{ id: 'interval-forward', fromMinute: 0, toMinute: 36, system: '3-4-3', isComplete: true, slots: [{ slot: 9, jugadorId: 'acerete-id', playerNameSnapshot: 'Cristian Acerete' }] }],
    matchMetadata: { date: '2026-08-02', opponent: 'Rival DEL', competition: 'Liga' },
  },
  {
    matchId: 'match-centre-forward',
    minutes: 32,
    role: 'Titular',
    duration: 32,
    initialSystem: '4-3-3',
    playerStats: { 'Cristian Acerete': { jugadorId: 'acerete-id', role: 'Titular', minutes: 32 } },
    intervals: [{ id: 'interval-centre-forward', fromMinute: 0, toMinute: 32, system: '4-3-3', isComplete: true, slots: [{ slot: 9, jugadorId: 'acerete-id', playerNameSnapshot: 'Cristian Acerete', position: 'DC' }] }],
    matchMetadata: { date: '2026-08-03', opponent: 'Rival DC', competition: 'Copa RFEF' },
  },
];
const positionUsage = getPlayerPositionUsage({
  playerId: player.id,
  playerName: player.name,
  playerIdentity: player,
  playerIdentities: [player],
  matchRows: positionMatchRows,
});

const connectionPlayers = [
  player,
  { id: 'julio-id', globalPlayerId: 'julio-global', membershipId: 'julio-membership', name: 'Julio Delgado', shirtName: 'J. DELGADO', image: 'https://images.example/julio.png?access_token=private' },
  { id: 'ebea-id', name: 'Cristian Ebea', image: 'https://images.example/ebea.png' },
  { id: 'oscar-id', legacyId: 'oscar-legacy', name: 'Óscar Fernández', image: 'https://images.example/oscar.png' },
];
const goalActions = [
  { id: 'goal-julio', action: 'Gol', scorer: 'Cristian Acerete', scorerId: 'acerete-id', assistant: 'Julio Delgado', assistantId: 'julio-id' },
  { id: 'goal-ebea', action: 'Gol', scorer: 'Cristian Acerete', scorerId: 'acerete-id', assistant: 'Cristian Ebea', assistantId: 'ebea-id' },
];
const assistActions = [
  { id: 'assist-oscar', action: 'Asistencia', scorer: 'Óscar Fernández', scorerId: 'oscar-id', assistant: 'Cristian Acerete', assistantId: 'acerete-id' },
];
const flattenedConnections = buildPlayerConnectionRows({ goalActions, assistActions, filter: 'Todos' });
const pdfConnections = flattenedConnections.map((connection) => ({
  ...connection,
  image: connectionPlayers.find((candidate) => candidate.name === connection.name)?.image || '',
}));
const diagnosticSeed = buildPlayerPdfDiagnostic({
  matches,
  teams,
  positionUsage,
  positionMatchRows,
  player,
  players: connectionPlayers,
  goalActions,
  assistActions,
  flattenedConnections,
  pdfConnections,
});

assert.deepEqual(Object.keys(diagnosticSeed).filter((key) => key.endsWith('_AUDIT')), [
  'POSITION_USAGE_AUDIT',
  'OPPONENT_CREST_AUDIT',
  'CONNECTION_PLAYER_AUDIT',
]);
assert.deepEqual(diagnosticSeed.POSITION_USAGE_AUDIT.positionTotals, [
  { resolvedPosition: 'Extremo izquierdo', minutes: 491, segmentCount: 1 },
  { resolvedPosition: 'Delantero', minutes: 36, segmentCount: 1 },
  { resolvedPosition: 'Delantero centro', minutes: 32, segmentCount: 1 },
]);
const rawForward = diagnosticSeed.POSITION_USAGE_AUDIT.segments.find((segment) => segment.resolvedPosition === 'Delantero');
assert.deepEqual({ code: rawForward.rawPositionCode, explicit: rawForward.rawExplicitPosition, slot: rawForward.slotIndex, role: rawForward.slotRole }, {
  code: 'SLOT_9', explicit: null, slot: 9, role: 'Delantero',
}, 'la instrumentación conserva el slot raw y la posición resuelta sin modificar playerPositionUsage');
const rawCentreForward = diagnosticSeed.POSITION_USAGE_AUDIT.segments.find((segment) => segment.resolvedPosition === 'Delantero centro');
assert.deepEqual({ code: rawCentreForward.rawPositionCode, explicit: rawCentreForward.rawExplicitPosition, abbreviation: rawCentreForward.resolvedAbbreviation }, {
  code: 'DC', explicit: 'DC', abbreviation: 'DC',
});

const julioAudit = diagnosticSeed.CONNECTION_PLAYER_AUDIT.connections.find((connection) => connection.flattenedConnectionName === 'Julio Delgado');
assert.equal(julioAudit.originalAssistantId, 'julio-id', 'el diagnóstico conserva el ID original previo al flatten');
assert.equal(julioAudit.flattenedConnectionId, null, 'la conexión de producción continúa aplanada y sin ID');
assert.equal(julioAudit.resolvedPlayerId, 'julio-id');
assert.equal(julioAudit.identityResolutionMode, 'unique_normalized_name');
assert.equal(diagnosticSeed.CONNECTION_PLAYER_AUDIT.connections.length, 3, 'Julio, Ebea y Óscar pueden compararse sin alterar producción');

const completedDiagnostic = completePlayerPdfDiagnostic(diagnosticSeed, {
  opponentCrests: [
    { matchId: 'salamanca-match', source: 'https://history.example/salamanca.png', loaded: false, loadAttempted: true, httpStatus: 403, mimeType: 'text/html', error: 'http_403', renderSuccess: false, renderError: 'http_403' },
    { matchId: 'ceares-match', source: 'https://images.example/ceares.png', loaded: true, loadAttempted: true, httpStatus: 200, mimeType: 'image/png', error: '', renderSuccess: true, renderError: '' },
  ],
  connectionImages: [
    { name: 'Julio Delgado', direction: 'received', source: 'https://images.example/julio.png?access_token=private', loaded: false, loadAttempted: true, httpStatus: null, mimeType: '', loadError: 'fetch_failed:token=private', renderSuccess: false, error: 'fetch_failed:token=private' },
    { name: 'Cristian Ebea', direction: 'received', source: 'https://images.example/ebea.png', loaded: true, loadAttempted: true, httpStatus: 200, mimeType: 'image/png', renderSuccess: true, error: '' },
    { name: 'Óscar Fernández', direction: 'given', source: 'https://images.example/oscar.png', loaded: true, loadAttempted: true, httpStatus: 200, mimeType: 'image/png', renderSuccess: true, error: '' },
  ],
});
const completedSalamanca = completedDiagnostic.OPPONENT_CREST_AUDIT.rivals.find((rival) => rival.target === 'Salamanca CF UDS');
assert.equal(completedSalamanca.appCandidateUrl, 'https://history.example/salamanca.png');
assert.equal(completedSalamanca.pdfCandidateUrl, 'https://history.example/salamanca.png');
assert.equal(completedSalamanca.sameUrl, true);
assert.equal(completedSalamanca.diagnosis, 'IMAGE_LOAD_FAILURE');
assert.equal(completedSalamanca.httpStatus, 403);
assert.equal(completedSalamanca.fallbackUsed, 'INITIALS_IMAGE_UNAVAILABLE');
assert.equal(completedDiagnostic.CONNECTION_PLAYER_AUDIT.connections.find((connection) => connection.flattenedConnectionName === 'Julio Delgado').fallbackInitials, true);
assert.equal(completedDiagnostic.CONNECTION_PLAYER_AUDIT.connections.find((connection) => connection.flattenedConnectionName === 'Cristian Ebea').loadSuccess, true);
assert.equal(completedDiagnostic.CONNECTION_PLAYER_AUDIT.connections.find((connection) => connection.flattenedConnectionName === 'Óscar Fernández').loadSuccess, true);

const noUrlDiagnostic = buildPlayerPdfOpponentCrestAudit({ matches: [{ id: 'missing-salamanca', opponent: 'Salamanca CF UDS' }], teams: [] });
const completedNoUrl = completePlayerPdfDiagnostic({
  POSITION_USAGE_AUDIT: { segments: [], positionTotals: [] },
  OPPONENT_CREST_AUDIT: noUrlDiagnostic,
  CONNECTION_PLAYER_AUDIT: { connections: [] },
}, { opponentCrests: [{ matchId: 'missing-salamanca', source: '', loaded: false, loadAttempted: false, error: 'missing_source', renderSuccess: false }] });
assert.equal(completedNoUrl.OPPONENT_CREST_AUDIT.rivals[0].diagnosis, 'RESOLUTION_FAILURE', 'URL ausente se distingue de URL no cargable');

const diagnosticJson = JSON.stringify(completedDiagnostic);
assert.doesNotMatch(diagnosticJson, /access_token|Authorization|signature=|token=|secret\.example|data:image[^\]]*,/i);
assert.doesNotMatch(diagnosticJson, /cookie|session|email|supabase|refresh_token|jwt/i);

console.log('player PDF crest audit tests passed');
