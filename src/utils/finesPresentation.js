export const FINE_STATUS_FILTERS = Object.freeze([
  { value: 'all', label: 'Todas' },
  { value: 'unpaid', label: 'Pendientes' },
  { value: 'partial', label: 'Parciales' },
  { value: 'paid', label: 'Pagadas' },
  { value: 'cancelled', label: 'Anuladas' },
  { value: 'overdue', label: 'Vencidas' },
]);

const euroFormatter = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const cleanNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export const formatFinesCurrency = (value) => euroFormatter.format(cleanNumber(value));

export const formatFinesDate = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '—';
};

export const getLocalToday = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const formatFinesSeason = (code) => {
  const normalized = String(code || '').trim();
  if (/^\d{4}$/.test(normalized)) return `${normalized}/${Number(normalized) + 1}`;
  return normalized || 'Temporada actual';
};

export const getFineStatusPresentation = (fine = {}) => {
  if (fine.lifecycle_status === 'cancelled') {
    return { label: 'Anulada', tone: 'border-slate-300/15 bg-slate-300/10 text-slate-300' };
  }
  if (fine.financial_status === 'paid') {
    return { label: 'Pagada', tone: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200' };
  }
  if (fine.financial_status === 'partial') {
    return { label: 'Parcial', tone: 'border-amber-300/20 bg-amber-300/10 text-amber-100' };
  }
  return { label: 'Pendiente', tone: 'border-yellow-300/20 bg-yellow-300/10 text-yellow-100' };
};

export const getFineActionAvailability = (fine = {}) => {
  const active = fine.lifecycle_status === 'active';
  const collected = cleanNumber(fine.collected_amount);
  const pending = cleanNumber(fine.pending_amount);
  return {
    payment: active && pending > 0,
    refund: active && collected > 0,
    cancel: active && collected === 0,
    cancelBlockedByCollection: active && collected > 0,
  };
};

export const validateFineAmount = (rawValue, maximum) => {
  const amount = Number(String(rawValue ?? '').replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return { valid: false, amount: null, message: 'Introduce un importe mayor que cero.' };
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(String(rawValue).trim())) return { valid: false, amount: null, message: 'Usa como máximo dos decimales.' };
  if (Number.isFinite(Number(maximum)) && amount > Number(maximum)) return { valid: false, amount, message: 'El importe supera el máximo disponible.' };
  return { valid: true, amount, message: '' };
};

export const sortFineSubjectSummary = (rows = []) => [...rows].sort((left, right) => (
  cleanNumber(right.pending_total) - cleanNumber(left.pending_total)
  || cleanNumber(right.generated_total) - cleanNumber(left.generated_total)
  || String(left.subject_name || '').localeCompare(String(right.subject_name || ''), 'es')
));

export const getPendingFinesCount = (summary = {}) => (
  cleanNumber(summary.unpaid_count) + cleanNumber(summary.partial_count)
);

export const getFinesUserMessage = (operation) => ({
  rules: 'No se ha podido cargar el catálogo de multas.',
  subjects: 'No se han podido cargar las personas disponibles.',
  list: 'No se han podido cargar las multas.',
  financialSummary: 'No se ha podido cargar el resumen económico.',
  subjectSummary: 'No se ha podido cargar la situación por jugador.',
  createIndividual: 'No se ha podido crear la multa.',
  createCollective: 'No se han podido crear las multas.',
  payment: 'No se ha podido registrar el pago.',
  refund: 'No se ha podido registrar el reembolso.',
  cancel: 'No se ha podido anular la multa.',
}[operation] || 'No se ha podido completar la operación.');
