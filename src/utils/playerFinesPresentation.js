import { getLocalToday } from './finesPresentation.js';

export const PLAYER_FINE_FILTERS = Object.freeze([
  { value: 'all', label: 'Todas' },
  { value: 'unpaid', label: 'Pendientes' },
  { value: 'partial', label: 'Parciales' },
  { value: 'paid', label: 'Pagadas' },
  { value: 'cancelled', label: 'Anuladas' },
  { value: 'overdue', label: 'Vencidas' },
]);

const numericAmount = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export const isPlayerFineOverdue = (fine = {}, today = getLocalToday()) => (
  fine.lifecycle_status === 'active'
  && numericAmount(fine.pending_amount) > 0
  && /^\d{4}-\d{2}-\d{2}$/.test(String(fine.due_on || ''))
  && today > fine.due_on
);

export const hasPlayerFineSurcharge = (fine = {}) => numericAmount(fine.surcharge_amount) > 0;

export const filterPlayerFines = (rows = [], filter = 'all', today = getLocalToday()) => rows.filter((fine) => {
  if (filter === 'all') return true;
  if (filter === 'cancelled') return fine.lifecycle_status === 'cancelled';
  if (filter === 'overdue') return isPlayerFineOverdue(fine, today);
  return fine.lifecycle_status === 'active' && fine.financial_status === filter;
});
