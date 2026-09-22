import assert from 'node:assert/strict';
import { resolveOpponentTeamIdentity } from './opponentTeamIdentity.js';
import {
  buildPlayerPdfCrestAudit,
  completePlayerPdfCrestAudit,
  isPlayerPdfCrestAuditEnabled,
} from './playerPdfCrestAudit.js';

assert.equal(isPlayerPdfCrestAuditEnabled({ search: '' }), false);
assert.equal(isPlayerPdfCrestAuditEnabled({ search: '?qaCrestAudit=0' }), false);
assert.equal(isPlayerPdfCrestAuditEnabled({ search: '?section=players&qaCrestAudit=1' }), true);

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

console.log('player PDF crest audit tests passed');
