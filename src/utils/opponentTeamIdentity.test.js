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
assert.equal(sameNameWrongId.crest, '', 'un ID explícito no se sustituye por una conjetura nominal');
assert.equal(sameNameWrongId.source, 'missing');

const historical = resolveOpponentTeamIdentity({ match: { opponent: 'Union Club Ceares' }, teams });
assert.equal(historical.crest, 'https://assets.example/ceares.png', 'un partido histórico sin ID admite coincidencia normalizada inequívoca');

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
