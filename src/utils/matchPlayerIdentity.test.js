import assert from 'node:assert/strict';
import {
  createMatchPlayerIdentityIndex,
  getMatchPlayerIdentityKey,
  resolveMatchPlayerCandidate,
} from './matchPlayerIdentity.js';

const dani = {
  id: 'dani-current',
  globalPlayerId: 'dani-global',
  membershipId: 'dani-membership',
  aliasIds: ['dani-legacy'],
  name: 'Daniel Palacio',
};
const identityIndex = createMatchPlayerIdentityIndex([dani]);

const legacyResolved = resolveMatchPlayerCandidate({
  reference: { playerId: 'dani-current', playerName: 'Daniel Palacio' },
  candidates: [{ playerId: 'dani-legacy', playerName: 'Daniel Palacio', slot: 5 }],
  identityIndex,
});
assert.equal(legacyResolved.status, 'resolved', 'un alias histórico explícitamente relacionado resuelve la identidad');
assert.equal(legacyResolved.mode, 'id');
assert.equal(getMatchPlayerIdentityKey(legacyResolved.candidate, identityIndex), 'canonical:dani-current');

const contradictoryId = resolveMatchPlayerCandidate({
  reference: { playerId: 'dani-current', playerName: 'Daniel Palacio' },
  candidates: [{ playerId: 'otro-id', playerName: 'Daniel Palacio', slot: 5 }],
  identityIndex,
});
assert.equal(contradictoryId.status, 'identity_conflict', 'el mismo nombre no anula dos IDs explícitos contradictorios');

const contradictoryReference = resolveMatchPlayerCandidate({
  reference: { playerId: 'otro-id', playerName: 'Daniel Palacio' },
  candidates: [dani],
  identityIndex,
});
assert.equal(contradictoryReference.status, 'identity_conflict', 'un ID desconocido que contradice una identidad nominal conocida también se audita como conflicto');

const uniqueName = resolveMatchPlayerCandidate({
  reference: { playerId: 'dani-current', playerName: 'Daniel Palacio' },
  candidates: [{ playerName: '  DÁNIEL   PALACIO ', slot: 5 }],
  identityIndex,
});
assert.equal(uniqueName.status, 'resolved');
assert.equal(uniqueName.mode, 'unique_name', 'el nombre estricto solo se usa si el candidato carece de ID contradictorio');
assert.equal(getMatchPlayerIdentityKey(uniqueName.candidate, identityIndex), 'canonical:dani-current', 'una observación sin ID reutiliza la identidad nominal única en las comparaciones temporales');

const ambiguousName = resolveMatchPlayerCandidate({
  reference: { playerName: 'Daniel Palacio' },
  candidates: [{ playerName: 'Daniel Palacio' }, { playerName: 'DÁNIEL PALACIO' }],
  identityIndex,
});
assert.equal(ambiguousName.status, 'ambiguous', 'dos nombres normalizados iguales nunca se desempatan de forma aproximada');

const renamedById = resolveMatchPlayerCandidate({
  reference: { playerId: 'dani-current', playerName: 'Daniel Palacio' },
  candidates: [{ playerId: 'dani-current', playerName: 'Dani Palacio' }],
  identityIndex,
});
assert.equal(renamedById.status, 'resolved', 'un ID canónico exacto prevalece sobre diferencias de nombre');

const globalAlias = resolveMatchPlayerCandidate({
  reference: { playerId: 'dani-global', playerName: 'Daniel Palacio' },
  candidates: [dani],
  identityIndex,
});
assert.equal(globalAlias.status, 'resolved', 'globalPlayerId relacionado funciona como alias, no como identidad paralela');

const membershipAlias = resolveMatchPlayerCandidate({
  reference: { membershipId: 'dani-membership', playerName: 'Daniel Palacio' },
  candidates: [dani],
  identityIndex,
});
assert.equal(membershipAlias.status, 'resolved', 'membershipId explícito pertenece a la misma identidad canónica');

const renamedAliasIndex = createMatchPlayerIdentityIndex([{ ...dani, aliasNames: ['Dani Palacio'] }]);
const renamedLegacy = resolveMatchPlayerCandidate({
  reference: dani,
  candidates: [{ playerName: 'Dani Palacio' }],
  identityIndex: renamedAliasIndex,
});
assert.equal(renamedLegacy.status, 'resolved', 'un cambio nominal sólo resuelve cuando el alias está registrado');

const homonyms = [
  { id: 'alex-a', name: 'Álex García' },
  { id: 'alex-b', name: 'Álex García' },
];
const homonymResolution = resolveMatchPlayerCandidate({
  reference: { playerName: 'Alex Garcia' },
  candidates: [{ playerName: 'Álex García' }],
  identityIndex: createMatchPlayerIdentityIndex(homonyms),
});
assert.equal(homonymResolution.status, 'ambiguous', 'un legacy sin ID no se asigna entre homónimos');

console.log('match player identity tests passed');
