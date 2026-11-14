import assert from 'node:assert/strict';
import {
  getRosterAgeLabel,
  getRosterAgeYears,
  getRosterFootLabel,
  isRosterPlayerOperationalSub23,
  mergeGlobalRosterProfile,
} from './rosterPlayerProfile.js';

const referenceDate = new Date(2026, 10, 14);

assert.equal(getRosterAgeLabel({ dob: '2000-11-15', age: '19' }, referenceDate), '25 años',
  'una fecha válida prevalece sobre la edad alternativa');
assert.equal(getRosterAgeLabel({ dob: '', age: '19' }, referenceDate), '19 años');
assert.equal(getRosterAgeLabel({ dob: '', age: '19 años' }, referenceDate), '19 años');
assert.equal(getRosterAgeLabel({ dob: '', age: '' }, referenceDate), 'Edad no indicada');
assert.equal(getRosterAgeLabel({ dob: '2026-02-30', age: '19' }, referenceDate), '19 años',
  'una fecha imposible no produce una edad');
assert.equal(getRosterAgeYears({ dob: '2026-12-01', age: '' }, referenceDate), null,
  'una fecha futura no produce una edad negativa');

assert.equal(getRosterFootLabel('Derecha'), 'Diestro');
assert.equal(getRosterFootLabel('Izquierda'), 'Zurdo');
assert.equal(getRosterFootLabel('Ambas'), 'Ambidiestro');
assert.equal(getRosterFootLabel(''), 'Pierna no indicada');
assert.equal(getRosterFootLabel('Sin registrar'), 'Pierna no indicada');

assert.equal(isRosterPlayerOperationalSub23({ dob: '2004-11-15' }, referenceDate), true,
  'la fecha de nacimiento válida determina la clasificación');
assert.equal(isRosterPlayerOperationalSub23({ dob: '2003-11-14' }, referenceDate), false);
assert.equal(isRosterPlayerOperationalSub23({ dob: '2003-11-14', age: '19' }, referenceDate), false,
  'una fecha válida prevalece sobre la edad alternativa también para clasificar');
assert.equal(isRosterPlayerOperationalSub23({ dob: '', age: '19' }, referenceDate), true,
  'la edad alternativa permite la clasificación operativa cuando falta fecha de nacimiento');
assert.equal(isRosterPlayerOperationalSub23({ dob: '', age: '22' }, referenceDate), true);
assert.equal(isRosterPlayerOperationalSub23({ dob: '', age: '23' }, referenceDate), false,
  'el límite sigue siendo menor de 23');
assert.equal(isRosterPlayerOperationalSub23({ dob: '2026-02-30' }, referenceDate), false);
assert.equal(isRosterPlayerOperationalSub23({ dob: '', age: '' }, referenceDate), false);

const rosterPlayer = { id: 'roster-id', globalPlayerId: 'global-id', age: '', foot: 'Derecha', seasonData: 'keep' };
const merged = mergeGlobalRosterProfile(rosterPlayer, { dob: '', age: '19', foot: '' });
assert.deepEqual(merged, {
  ...rosterPlayer, dob: '', age: '19', foot: '',
}, 'el perfil global es autoridad para sus campos y la relación/los datos estacionales permanecen intactos');
assert.equal(rosterPlayer.foot, 'Derecha', 'la mezcla de presentación no muta la ficha CTS');
assert.equal(mergeGlobalRosterProfile(rosterPlayer, null), rosterPlayer);
const reloadedProfile = mergeGlobalRosterProfile(rosterPlayer, {
  dob: '', age: '19', foot: '',
});
assert.equal(getRosterAgeLabel(reloadedProfile, referenceDate), '19 años');
assert.equal(isRosterPlayerOperationalSub23(reloadedProfile, referenceDate), true,
  'la edad global recuperada tras guardar mantiene la clasificación');

console.log('rosterPlayerProfile: edad, pierna, elegibilidad y perfil global verificados.');
