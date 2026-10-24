import assert from 'node:assert/strict';
import { OWN_CLUB_IDENTITY, getOwnClubDisplayName, resolveOwnClubIdentity } from './clubIdentity.js';

assert.equal(getOwnClubDisplayName('C.D. Caudal'), 'Almadina SC');
assert.equal(getOwnClubDisplayName('C.D. Caudal de Mieres'), 'Almadina SC');
assert.equal(getOwnClubDisplayName(''), 'Almadina SC');
assert.equal(getOwnClubDisplayName('Otro club'), 'Otro club', 'no se reescriben identidades de otros clubes');
assert.equal(OWN_CLUB_IDENTITY.crest, '/branding/almadina-sc-crest.png');
assert.deepEqual(resolveOwnClubIdentity({ VITE_DEPLOYMENT_ID: 'libya',
  VITE_OWN_CLUB_NAME: 'Equipo de Libia', VITE_OWN_CLUB_SHORT_NAME: 'Libia',
  VITE_OWN_CLUB_CREST: '' }), { name: 'Equipo de Libia', shortName: 'Libia', crest: '' });

console.log('clubIdentity tests passed');
