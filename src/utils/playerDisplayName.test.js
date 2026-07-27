import assert from 'node:assert/strict';
import { getPlayerDisplayName, playerMatchesNameQuery } from './playerDisplayName.js';

const porto = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Agustín Porto',
  shirtName: '  Agus Porto  ',
  number: 20,
};

assert.equal(getPlayerDisplayName(porto), 'Agus Porto');
assert.equal(`${porto.number} · ${getPlayerDisplayName(porto)}`, '20 · Agus Porto');
assert.equal(getPlayerDisplayName({ name: 'Agustín Porto', shirt_name: 'Agus Porto' }), 'Agus Porto');
assert.equal(getPlayerDisplayName({ name: 'Agustín Porto', shirtName: '   ' }), 'Agustín Porto');
assert.equal(getPlayerDisplayName({ shortName: 'Porto', name: 'Agustín Porto' }), 'Porto');
assert.equal(getPlayerDisplayName({}), 'Jugador');
assert.equal(getPlayerDisplayName(null), 'Jugador');
assert.equal(playerMatchesNameQuery(porto, 'Agustín'), true);
assert.equal(playerMatchesNameQuery(porto, 'Agus'), true);
assert.equal(playerMatchesNameQuery(porto, 'Porto'), true);
assert.equal(playerMatchesNameQuery(porto, 'Jandro'), false);

console.log('playerDisplayName tests passed');
