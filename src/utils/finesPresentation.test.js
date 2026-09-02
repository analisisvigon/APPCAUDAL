import assert from 'node:assert/strict';
import {
  FINE_STATUS_FILTERS,
  formatFinesCurrency,
  formatFinesDate,
  formatFinesSeason,
  getFineActionAvailability,
  getFineStatusPresentation,
  getFinesUserMessage,
  getLocalToday,
  getPendingFinesCount,
  sortFineSubjectSummary,
  validateFineAmount,
} from './finesPresentation.js';

assert.equal(formatFinesCurrency(0), '0,00 €');
assert.equal(formatFinesCurrency(10.5), '10,50 €');
assert.equal(formatFinesDate('2026-09-02'), '02/09/2026');
assert.equal(formatFinesDate(null), '—');
assert.equal(formatFinesSeason('2026'), '2026/2027');
assert.equal(getLocalToday(new Date(2026, 8, 2, 23, 30)), '2026-09-02');

assert.equal(getFineStatusPresentation({ lifecycle_status: 'cancelled' }).label, 'Anulada');
assert.equal(getFineStatusPresentation({ lifecycle_status: 'active', financial_status: 'paid' }).label, 'Pagada');
assert.equal(getFineStatusPresentation({ lifecycle_status: 'active', financial_status: 'partial' }).label, 'Parcial');
assert.equal(getFineStatusPresentation({ lifecycle_status: 'active', financial_status: 'unpaid' }).label, 'Pendiente');

assert.deepEqual(getFineActionAvailability({ lifecycle_status: 'cancelled', collected_amount: 0, pending_amount: 10 }), {
  payment: false, refund: false, cancel: false, cancelBlockedByCollection: false,
});
assert.deepEqual(getFineActionAvailability({ lifecycle_status: 'active', collected_amount: 3, pending_amount: 7 }), {
  payment: true, refund: true, cancel: false, cancelBlockedByCollection: true,
});

assert.equal(validateFineAmount('2,50', 3).valid, true);
assert.equal(validateFineAmount('3.01', 3).valid, false);
assert.equal(validateFineAmount('0', 3).valid, false);
assert.equal(validateFineAmount('1.999', 3).valid, false);
assert.equal(getPendingFinesCount({ unpaid_count: 2, partial_count: 3 }), 5);
assert.deepEqual(sortFineSubjectSummary([
  { subject_name: 'B', pending_total: 1, generated_total: 2 },
  { subject_name: 'A', pending_total: 5, generated_total: 5 },
]).map((row) => row.subject_name), ['A', 'B']);
assert.equal(FINE_STATUS_FILTERS.some((filter) => filter.value === 'overdue'), true);
assert.equal(getFinesUserMessage('payment'), 'No se ha podido registrar el pago.');

console.log('finesPresentation: moneda, fechas, estados, acciones, filtros y validaciones validados.');
