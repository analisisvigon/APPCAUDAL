import assert from 'node:assert/strict';
import { getPlayerDisplayName, getPlayerTooltipText, playerMatchesNameQuery } from './playerDisplayName.js';

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
assert.equal(getPlayerDisplayName({ name: 'Agustín Porto Fernández', shirtName: 'PORTO', number: 7 }), 'PORTO', 'Caudal conserva dorsal e identidad pero presenta nombre de camiseta');
assert.equal(getPlayerDisplayName({ name: 'Borja Rodríguez', shirt_name: 'BORJA', number: 10 }), 'BORJA', 'el campo snake_case real tiene la misma prioridad');
assert.equal(getPlayerDisplayName({ name: 'Rival Completo', shirtName: 'RIVAL' }), 'RIVAL', 'un rival con nombre de camiseta usa el mismo criterio');
assert.equal(getPlayerDisplayName({ name: 'Rival Completo' }), 'Rival Completo', 'un rival sin nombre de camiseta conserva el fallback existente');
assert.equal(getPlayerDisplayName({}), 'Jugador');
assert.equal(getPlayerDisplayName(null), 'Jugador');
assert.equal(getPlayerTooltipText(porto), 'Agus Porto');
assert.equal(getPlayerTooltipText({ name: 'Agustín Porto', shirtName: ' ' }), 'Agustín Porto');
assert.equal(getPlayerTooltipText({}), '');
assert.equal(getPlayerTooltipText(null), '');
assert.equal(getPlayerTooltipText({ number: 20 }), '');
assert.equal(playerMatchesNameQuery(porto, 'Agustín'), true);
assert.equal(playerMatchesNameQuery(porto, 'Agus'), true);
assert.equal(playerMatchesNameQuery(porto, 'Porto'), true);
assert.equal(playerMatchesNameQuery(porto, 'Jandro'), false);

console.log('playerDisplayName tests passed');
