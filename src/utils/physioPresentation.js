export const PHYSIO_BODY_AREAS = Object.freeze([
  ['head_neck', 'Cabeza/cuello'],
  ['shoulder', 'Hombro'],
  ['arm', 'Brazo'],
  ['elbow', 'Codo'],
  ['forearm', 'Antebrazo'],
  ['wrist_hand', 'Muñeca/mano'],
  ['back', 'Espalda'],
  ['lumbar', 'Lumbar'],
  ['hip', 'Cadera'],
  ['groin_adductor', 'Ingle/aductor'],
  ['glute', 'Glúteo'],
  ['anterior_thigh', 'Muslo anterior'],
  ['hamstrings', 'Isquios'],
  ['knee', 'Rodilla'],
  ['calf', 'Gemelo'],
  ['ankle', 'Tobillo'],
  ['foot', 'Pie'],
  ['other', 'Otra'],
]);

export const PHYSIO_TREATMENT_TYPES = Object.freeze([
  ['massage_release', 'Masaje / descarga'],
  ['manual_therapy', 'Terapia manual'],
  ['mobility', 'Movilidad'],
  ['stretching', 'Estiramientos'],
  ['cryotherapy', 'Crioterapia'],
  ['heat', 'Calor'],
  ['electrotherapy', 'Electroterapia'],
  ['taping', 'Vendaje'],
  ['active_work', 'Trabajo activo'],
  ['recovery', 'Recuperación'],
  ['assessment', 'Valoración'],
  ['other', 'Otro'],
]);

export const PHYSIO_CASE_TYPES = Object.freeze([
  ['new', 'Nueva molestia'],
  ['follow_up', 'Seguimiento'],
]);

export const PHYSIO_AVAILABILITY = Object.freeze([
  ['available', 'Disponible'],
  ['limited', 'Disponible con limitación'],
  ['unavailable', 'No disponible'],
]);

const labels = (entries) => Object.freeze(Object.fromEntries(entries));

export const PHYSIO_BODY_AREA_LABELS = labels(PHYSIO_BODY_AREAS);
export const PHYSIO_TREATMENT_TYPE_LABELS = labels(PHYSIO_TREATMENT_TYPES);
export const PHYSIO_CASE_TYPE_LABELS = labels(PHYSIO_CASE_TYPES);
export const PHYSIO_AVAILABILITY_LABELS = labels(PHYSIO_AVAILABILITY);

export const getPhysioLocalToday = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getPhysioWeekRange = (value = new Date()) => {
  const source = value instanceof Date ? new Date(value) : new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(source.getTime())) return { startDate: '', endDate: '' };
  const mondayOffset = (source.getDay() + 6) % 7;
  const start = new Date(source);
  start.setDate(source.getDate() - mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { startDate: getPhysioLocalToday(start), endDate: getPhysioLocalToday(end) };
};

export const formatPhysioDate = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '—';
};

export const formatPhysioTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  }).format(date);
};

export const getPhysioAvailabilityTone = (status) => ({
  available: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200',
  limited: 'border-amber-300/20 bg-amber-300/10 text-amber-100',
  unavailable: 'border-red-300/20 bg-red-300/10 text-red-100',
}[status] || 'border-white/10 bg-white/5 text-slate-300');

export const buildEmptyPhysioDraft = (today = getPhysioLocalToday()) => ({
  treatmentDate: today,
  playerId: '',
  bodyArea: '',
  reason: '',
  treatmentTypes: [],
  caseType: 'new',
  availabilityStatus: 'available',
  durationMinutes: '',
  notes: '',
});

export const buildPhysioDraftFromTreatment = (row) => ({
  treatmentDate: row?.treatment_date || getPhysioLocalToday(),
  playerId: row?.player_id || '',
  bodyArea: row?.body_area || '',
  reason: row?.reason || '',
  treatmentTypes: Array.isArray(row?.treatment_types) ? [...row.treatment_types] : [],
  caseType: row?.case_type || 'new',
  availabilityStatus: row?.availability_status || 'available',
  durationMinutes: row?.duration_minutes ?? '',
  notes: row?.notes || '',
});

export const validatePhysioDraft = (draft) => {
  const errors = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(draft?.treatmentDate || ''))) errors.treatmentDate = 'Selecciona una fecha válida.';
  if (!String(draft?.playerId || '').trim()) errors.playerId = 'Selecciona un jugador.';
  if (!PHYSIO_BODY_AREA_LABELS[draft?.bodyArea]) errors.bodyArea = 'Selecciona una zona corporal.';
  const reason = String(draft?.reason || '').trim();
  if (!reason) errors.reason = 'Indica la molestia o motivo.';
  else if (reason.length > 200) errors.reason = 'Usa como máximo 200 caracteres.';
  const treatmentTypes = [...new Set(Array.isArray(draft?.treatmentTypes) ? draft.treatmentTypes : [])];
  if (!treatmentTypes.length || treatmentTypes.some((type) => !PHYSIO_TREATMENT_TYPE_LABELS[type])) {
    errors.treatmentTypes = 'Selecciona al menos un tratamiento válido.';
  }
  if (!PHYSIO_CASE_TYPE_LABELS[draft?.caseType]) errors.caseType = 'Selecciona nueva molestia o seguimiento.';
  if (!PHYSIO_AVAILABILITY_LABELS[draft?.availabilityStatus]) errors.availabilityStatus = 'Selecciona la disponibilidad.';
  const rawDuration = String(draft?.durationMinutes ?? '').trim();
  if (rawDuration && (!/^\d+$/.test(rawDuration) || Number(rawDuration) <= 0)) errors.durationMinutes = 'La duración debe ser un entero positivo.';
  if (String(draft?.notes || '').trim().length > 1000) errors.notes = 'Usa como máximo 1000 caracteres.';
  return { valid: Object.keys(errors).length === 0, errors };
};

export const getPhysioKpis = (todayRows = [], weekRows = []) => ({
  treatmentsToday: todayRows.length,
  playersToday: new Set(todayRows.map((row) => row.player_id).filter(Boolean)).size,
  treatmentsWeek: weekRows.length,
  playersWeek: new Set(weekRows.map((row) => row.player_id).filter(Boolean)).size,
});

export const normalizeBodyAreaCounts = (value) => (Array.isArray(value) ? value : [])
  .map((entry) => ({
    bodyArea: String(entry?.body_area || ''),
    treatmentCount: Number(entry?.treatment_count) || 0,
  }))
  .filter((entry) => PHYSIO_BODY_AREA_LABELS[entry.bodyArea] && entry.treatmentCount > 0);

