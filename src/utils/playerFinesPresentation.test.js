import assert from 'node:assert/strict';
import {
  PLAYER_FINE_FILTERS,
  filterPlayerFines,
  hasPlayerFineSurcharge,
  isPlayerFineOverdue,
} from './playerFinesPresentation.js';

const rows = [
  { fine_id: 'unpaid', lifecycle_status: 'active', financial_status: 'unpaid', pending_amount: 2, due_on: '2026-09-01' },
  { fine_id: 'partial', lifecycle_status: 'active', financial_status: 'partial', pending_amount: 1, due_on: '2026-09-30' },
  { fine_id: 'paid', lifecycle_status: 'active', financial_status: 'paid', pending_amount: 0, due_on: '2026-08-01' },
  { fine_id: 'cancelled', lifecycle_status: 'cancelled', financial_status: 'unpaid', pending_amount: 2, due_on: '2026-08-01' },
];

assert.deepEqual(PLAYER_FINE_FILTERS.map(({ value }) => value), ['all', 'unpaid', 'partial', 'paid', 'cancelled', 'overdue']);
assert.equal(isPlayerFineOverdue(rows[0], '2026-09-02'), true);
assert.equal(isPlayerFineOverdue(rows[1], '2026-09-02'), false);
assert.equal(isPlayerFineOverdue(rows[2], '2026-09-02'), false);
assert.equal(isPlayerFineOverdue(rows[3], '2026-09-02'), false, 'Una multa anulada nunca se presenta como vencida.');
assert.deepEqual(filterPlayerFines(rows, 'unpaid', '2026-09-02').map(({ fine_id }) => fine_id), ['unpaid']);
assert.deepEqual(filterPlayerFines(rows, 'partial', '2026-09-02').map(({ fine_id }) => fine_id), ['partial']);
assert.deepEqual(filterPlayerFines(rows, 'paid', '2026-09-02').map(({ fine_id }) => fine_id), ['paid']);
assert.deepEqual(filterPlayerFines(rows, 'cancelled', '2026-09-02').map(({ fine_id }) => fine_id), ['cancelled']);
assert.deepEqual(filterPlayerFines(rows, 'overdue', '2026-09-02').map(({ fine_id }) => fine_id), ['unpaid']);
assert.equal(hasPlayerFineSurcharge({ surcharge_amount: 0 }), false);
assert.equal(hasPlayerFineSurcharge({ surcharge_amount: 0.01 }), true);

console.log('playerFinesPresentation: filtros, estados vencidos y visibilidad de recargos validados.');
