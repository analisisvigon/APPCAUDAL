import assert from 'node:assert/strict';
import { extractTransfermarktPlayerId, isEmptyImportedField, normalizeTransfermarktPosition, resolveImportedValue } from './rivalPlayerImport.js';

assert.equal(resolveImportedValue({ existingValue: null, incomingValue: 'Portero' }), 'Portero');
assert.equal(resolveImportedValue({ existingValue: 'Sin posición', incomingValue: 'Portero' }), 'Portero');
assert.equal(resolveImportedValue({ existingValue: 'Pivote', incomingValue: 'Mediocentro', resolution: 'existing' }), 'Pivote');
assert.equal(resolveImportedValue({ existingValue: 'Pivote', incomingValue: 'Mediocentro', resolution: 'incoming' }), 'Mediocentro');
assert.equal(resolveImportedValue({ existingValue: 'No indicada', incomingValue: 'Derecha' }), 'Derecha');
assert.equal(isEmptyImportedField('Edad pendiente'), true);
assert.equal(isEmptyImportedField('Reserva'), false);
assert.equal(extractTransfermarktPlayerId('https://www.transfermarkt.es/a/profil/spieler/12345'), '12345');
assert.equal(extractTransfermarktPlayerId('https://example.com/player/12345'), null);
assert.deepEqual(normalizeTransfermarktPosition('Portero'), { position: 'Portero', specificPosition: 'Portero' });
assert.deepEqual(normalizeTransfermarktPosition('Defensa central'), { position: 'Defensa', specificPosition: 'Defensa central' });
assert.deepEqual(normalizeTransfermarktPosition('Mediocentro'), { position: 'Centrocampista', specificPosition: 'Mediocentro' });
assert.deepEqual(normalizeTransfermarktPosition('Extremo derecho'), { position: 'Atacante', specificPosition: 'Extremo derecho' });

console.log('rivalPlayerImport tests passed');
