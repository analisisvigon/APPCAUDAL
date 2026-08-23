import assert from 'node:assert/strict';
import { OWN_CLUB_IDENTITY, getOwnClubDisplayName } from './clubIdentity.js';

assert.equal(getOwnClubDisplayName('C.D. Caudal'), 'C.D. Caudal de Mieres');
assert.equal(getOwnClubDisplayName(''), 'C.D. Caudal de Mieres');
assert.equal(getOwnClubDisplayName('Otro club'), 'Otro club', 'no se reescriben identidades de otros clubes');
assert.match(OWN_CLUB_IDENTITY.crest, /^https:\/\//, 'el escudo canónico reutiliza una URL navegable real');

console.log('clubIdentity tests passed');
