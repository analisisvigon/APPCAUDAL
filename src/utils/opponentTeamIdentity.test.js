import assert from 'node:assert/strict';
import { resolveOpponentTeamIdentity } from './opponentTeamIdentity.js';

const teams = [
  { id: 'salamanca-id', name: 'Salamanca UDS', crest: 'https://assets.example/salamanca.png' },
  { id: 'ceares-id', name: 'Unión Club Ceares', crest: 'https://assets.example/ceares.png' },
];

const linked = resolveOpponentTeamIdentity({
  match: { equipoRivalId: 'salamanca-id', opponent: 'Salamanca CF UDS', opponentCrest: '' },
  teams,
});
assert.equal(linked.crest, 'https://assets.example/salamanca.png');
assert.equal(linked.source, 'team_id', 'la relación estable prevalece aunque el nombre mostrado difiera');

const sameNameWrongId = resolveOpponentTeamIdentity({
  match: { equipoRivalId: 'missing-id', opponent: 'Unión Club Ceares' },
  teams,
});
assert.equal(sameNameWrongId.crest, 'https://assets.example/ceares.png', 'un ID obsoleto admite fallback nominal único y seguro');
assert.equal(sameNameWrongId.source, 'team_name');

const historical = resolveOpponentTeamIdentity({ match: { opponent: 'Union Club Ceares' }, teams });
assert.equal(historical.crest, 'https://assets.example/ceares.png', 'un partido histórico sin ID admite coincidencia normalizada inequívoca');

const normalizedHistorical = resolveOpponentTeamIdentity({ match: { opponent: 'Salamanca CF UDS' }, teams });
assert.equal(normalizedHistorical.crest, 'https://assets.example/salamanca.png', 'las siglas societarias intermedias no rompen una coincidencia nominal única');
assert.equal(normalizedHistorical.source, 'team_name_normalized');

const ambiguous = resolveOpponentTeamIdentity({
  match: { opponent: 'Racing Club' },
  teams: [
    { id: 'racing-cf', name: 'Racing CF', crest: 'https://assets.example/one.png' },
    { id: 'racing-cd', name: 'Racing CD', crest: 'https://assets.example/two.png' },
  ],
});
assert.equal(ambiguous.crest, '', 'el fallback flexible nunca elige entre candidatos ambiguos');

const snapshotFallback = resolveOpponentTeamIdentity({
  match: { opponent: 'Rival no catalogado', opponent_crest: '/legacy-crest.png' },
  teams,
});
assert.equal(snapshotFallback.crest, '/legacy-crest.png');
assert.equal(snapshotFallback.source, 'match_snapshot');

const missing = resolveOpponentTeamIdentity({ match: { opponent: 'Sin escudo' }, teams });
assert.equal(missing.crest, '');
assert.equal(missing.source, 'missing');

const repeated = [1, 2].map(() => resolveOpponentTeamIdentity({ match: { equipo_rival_id: 'ceares-id' }, teams }).crest);
assert.deepEqual(repeated, ['https://assets.example/ceares.png', 'https://assets.example/ceares.png']);

console.log('opponent team identity tests passed');
