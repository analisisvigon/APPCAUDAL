import assert from 'node:assert/strict';
import {
  PHYSIO_BODY_AREA_LABELS,
  PHYSIO_TREATMENT_TYPE_LABELS,
  buildEmptyPhysioDraft,
  formatPhysioDate,
  getPhysioKpis,
  getPhysioLocalToday,
  getPhysioWeekRange,
  normalizeBodyAreaCounts,
  validatePhysioDraft,
} from './physioPresentation.js';

assert.equal(PHYSIO_BODY_AREA_LABELS.hamstrings, 'Isquios');
assert.equal(PHYSIO_TREATMENT_TYPE_LABELS.manual_therapy, 'Terapia manual');
assert.equal(getPhysioLocalToday(new Date(2026, 8, 10, 23, 30)), '2026-09-10');
assert.deepEqual(getPhysioWeekRange(new Date(2026, 8, 10, 12)), { startDate: '2026-09-07', endDate: '2026-09-13' });
assert.equal(formatPhysioDate('2026-09-10'), '10/09/2026');

const validDraft = {
  ...buildEmptyPhysioDraft('2026-09-10'),
  playerId: 'player-1',
  bodyArea: 'hamstrings',
  reason: 'Sobrecarga',
  treatmentTypes: ['massage_release', 'stretching'],
  caseType: 'follow_up',
  availabilityStatus: 'limited',
};
assert.deepEqual(validatePhysioDraft(validDraft), { valid: true, errors: {} });
assert.equal(validatePhysioDraft({ ...validDraft, reason: '  ' }).errors.reason, 'Indica la molestia o motivo.');
assert.equal(validatePhysioDraft({ ...validDraft, treatmentTypes: [] }).valid, false);
assert.equal(validatePhysioDraft({ ...validDraft, bodyArea: 'invented' }).valid, false);
assert.equal(validatePhysioDraft({ ...validDraft, durationMinutes: '0' }).valid, false);
assert.equal(validatePhysioDraft({ ...validDraft, durationMinutes: '2.5' }).valid, false);
assert.equal(validatePhysioDraft({ ...validDraft, durationMinutes: '' }).valid, true, 'vacío representa NULL');
assert.equal(validatePhysioDraft({ ...validDraft, durationMinutes: '25' }).valid, true);

assert.deepEqual(getPhysioKpis(
  [{ player_id: 'a' }, { player_id: 'a' }, { player_id: 'b' }],
  [{ player_id: 'a' }, { player_id: 'a' }, { player_id: 'b' }, { player_id: 'c' }],
), { treatmentsToday: 3, playersToday: 2, treatmentsWeek: 4, playersWeek: 3 });

assert.deepEqual(normalizeBodyAreaCounts([
  { body_area: 'hamstrings', treatment_count: '4' },
  { body_area: 'groin_adductor', treatment_count: 3 },
  { body_area: 'unknown', treatment_count: 7 },
]), [
  { bodyArea: 'hamstrings', treatmentCount: 4 },
  { bodyArea: 'groin_adductor', treatmentCount: 3 },
]);

console.log('physioPresentation: catálogos, fechas, validación, duración, KPIs y resúmenes descriptivos validados.');

