import assert from 'node:assert/strict';
import { canPlayerManageFines, guardPlayerSection } from './playerCapabilities.js';

const normalPlayer = { kind: 'player', membership: { role: 'player' }, capabilities: { canManageFines: false } };
const managerPlayer = { kind: 'player', membership: { role: 'player' }, capabilities: { canManageFines: true } };

assert.equal(canPlayerManageFines(normalPlayer), false);
assert.equal(canPlayerManageFines(managerPlayer), true);
assert.equal(canPlayerManageFines({ kind: 'staff', membership: { role: 'staff' }, capabilities: { canManageFines: true } }), false);
assert.equal(canPlayerManageFines({ kind: 'player', membership: { role: 'viewer' }, capabilities: { canManageFines: true } }), false);
assert.equal(guardPlayerSection('fines-management', false), 'home');
assert.equal(guardPlayerSection('fines-management', true), 'fines-management');
assert.equal(guardPlayerSection('fines', false), 'fines');
assert.equal(guardPlayerSection('performance', false), 'performance');

console.log('playerCapabilities: capability PLAYER y protección de sección forzada validadas.');
