import assert from 'node:assert/strict';
import {
  RIVAL_TEAM_SYNC_FIELDS,
  applyFieldSyncPlan,
  applyRivalSyncPlan,
  buildFieldSyncPlan,
  buildRivalSyncPlan,
  createFieldSource,
  getRivalSyncPlayerKey,
  isManualField,
  markChangedFieldsManual,
  matchImportedPlayer,
} from './rivalSync.js';

const timestamp = '2026-07-20T10:00:00.000Z';
const importedSource = { number: createFieldSource('transfermarkt', timestamp) };
const current = [{
  id: 'player-1',
  name: 'Aitor Ferrero',
  sourceProfileUrl: 'https://www.transfermarkt.es/a/profil/spieler/123',
  externalSource: 'transfermarkt',
  externalPlayerId: '123',
  image: 'https://storage.example/manual.jpg',
  position: 'Pivote',
  age: '',
  number: '8',
  notes: 'No perder de vista su juego aéreo',
  captain: true,
  activeInSquad: true,
  fieldSources: {
    image: createFieldSource('manual_upload', timestamp),
    position: createFieldSource('manual', timestamp),
    ...importedSource,
  },
}];

const imported = [{
  name: 'Aitor Ferrero',
  sourceProfileUrl: 'https://www.transfermarkt.es/a/profil/spieler/123',
  externalSource: 'transfermarkt',
  externalPlayerId: '123',
  image: 'https://tm.example/new.jpg',
  position: 'Mediocentro',
  age: '24',
  number: '5',
  notes: '',
  captain: false,
}];

const plan = buildRivalSyncPlan({ currentPlayers: current, importedPlayers: imported, source: 'transfermarkt', updatedAt: timestamp });
assert.equal(plan.newPlayers.length, 0);
assert.equal(plan.autoCompletedFields.some((change) => change.field === 'age'), true, 'la edad vacía se completa');
assert.equal(plan.conflicts[0].changes.find((change) => change.field === 'image').category, 'manual', 'la foto manual genera conflicto protegido');
assert.equal(plan.conflicts[0].changes.find((change) => change.field === 'position').category, 'manual', 'la posición manual genera conflicto protegido');
assert.equal(plan.conflicts[0].changes.find((change) => change.field === 'number').category, 'imported', 'el dorsal importado cambiado se revisa');

const kept = applyRivalSyncPlan(plan);
assert.equal(kept[0].image, current[0].image);
assert.equal(kept[0].position, 'Pivote');
assert.equal(kept[0].number, '8');
assert.equal(kept[0].age, '24');
assert.equal(kept[0].notes, current[0].notes, 'las observaciones no forman parte del reemplazo');
assert.equal(kept[0].captain, true, 'capitán no forma parte del reemplazo importado');

const acceptedNumber = applyRivalSyncPlan(plan, {
  conflictResolutions: { [plan.conflicts[0].playerKey]: { number: 'incoming' } },
});
assert.equal(acceptedNumber[0].number, '5');
assert.equal(acceptedNumber[0].fieldSources.number.source, 'transfermarkt');

const newPlan = buildRivalSyncPlan({
  currentPlayers: current,
  importedPlayers: [...imported, { name: 'Jugador Nuevo', externalSource: 'transfermarkt', externalPlayerId: '999', position: 'Defensa', notes: 'No importar', captain: true }],
  source: 'transfermarkt',
  updatedAt: timestamp,
});
assert.equal(newPlan.newPlayers.length, 1, 'un jugador nuevo se añade');
assert.equal(newPlan.nextPlayers.length, 2, 'no se borra la plantilla existente');
assert.equal(newPlan.newPlayers[0].notes, undefined, 'la importación no introduce observaciones');
assert.equal(newPlan.newPlayers[0].captain, undefined, 'la importación no introduce capitán');

const missingPlan = buildRivalSyncPlan({ currentPlayers: [...current, { id: 'missing', name: 'Jugador Ausente', activeInSquad: true }], importedPlayers: imported, source: 'transfermarkt', updatedAt: timestamp });
assert.equal(missingPlan.missingPlayers.length, 1);
assert.equal(applyRivalSyncPlan(missingPlan).find((player) => player.id === 'missing').activeInSquad, true, 'una ausencia se conserva por defecto');
assert.equal(applyRivalSyncPlan(missingPlan, { missingResolutions: { [getRivalSyncPlayerKey({ id: 'missing' })]: 'inactive' } }).find((player) => player.id === 'missing').activeInSquad, false, 'la baja se archiva sin eliminar');

const ambiguous = matchImportedPlayer({ name: 'Álex' }, [{ id: 'a', name: 'Alex' }, { id: 'b', name: 'Álex' }]);
assert.equal(ambiguous.ambiguous, true, 'el nombre solo no enlaza una coincidencia dudosa');

const team = {
  name: 'Rival corregido',
  stadium: 'Campo manual',
  system: '4-4-2',
  kitColor: '#112233',
  crest: 'https://storage.example/crest.png',
  fieldSources: {
    name: createFieldSource('manual', timestamp),
    stadium: createFieldSource('manual', timestamp),
    kitColor: createFieldSource('manual', timestamp),
    crest: createFieldSource('manual_upload', timestamp),
    system: createFieldSource('transfermarkt', timestamp),
  },
};
const teamPlan = buildFieldSyncPlan({
  current: team,
  incoming: { name: 'Rival TM', stadium: 'Campo TM', system: '4-3-3', kitColor: '#ffffff', crest: 'https://tm.example/crest.png' },
  fields: RIVAL_TEAM_SYNC_FIELDS,
  source: 'transfermarkt',
  updatedAt: timestamp,
});
const keptTeam = applyFieldSyncPlan(teamPlan);
assert.equal(keptTeam.crest, team.crest, 'el escudo manual se conserva');
assert.equal(keptTeam.stadium, team.stadium, 'el estadio manual se conserva');
assert.equal(keptTeam.kitColor, team.kitColor, 'el color manual se conserva');
assert.equal(teamPlan.conflicts.find((change) => change.field === 'system').category, 'imported');

const unchangedSources = markChangedFieldsManual({ current: { position: 'Pivote' }, next: { position: 'Pivote' }, fields: ['position'], fieldSources: team.fieldSources, updatedAt: timestamp });
assert.deepEqual(unchangedSources, team.fieldSources, 'guardar sin editar no marca campos nuevos como manuales');
const reloadedSources = JSON.parse(JSON.stringify({ position: createFieldSource('manual', timestamp) }));
assert.equal(isManualField(reloadedSources, 'position'), true, 'field_sources persiste tras serializar y recargar');

const manualPositionPlan = buildFieldSyncPlan({
  current: {
    primaryNaturalPosition: 'midfielder', secondaryNaturalPositions: ['defender'],
    primarySpecificPosition: 'holding_midfield', secondarySpecificPositions: ['centre_back'],
    fieldSources: { position: createFieldSource('manual', timestamp), specificPosition: createFieldSource('manual', timestamp) },
  },
  incoming: { primaryNaturalPosition: 'midfielder', primarySpecificPosition: 'central_midfield' },
  fields: ['primaryNaturalPosition', 'secondaryNaturalPositions', 'primarySpecificPosition', 'secondarySpecificPositions'],
  source: 'transfermarkt', updatedAt: timestamp,
});
assert.equal(manualPositionPlan.conflicts.find((change) => change.field === 'primarySpecificPosition').category, 'manual');
const addedSecondary = applyFieldSyncPlan(manualPositionPlan, { primarySpecificPosition: 'secondary' });
assert.equal(addedSecondary.primarySpecificPosition, 'holding_midfield', 'la posición manual principal no se sobrescribe');
assert.deepEqual(addedSecondary.secondarySpecificPositions, ['centre_back', 'central_midfield'], 'la posición importada puede añadirse como secundaria');

console.log('rivalSync tests passed');
