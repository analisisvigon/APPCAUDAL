export const POST_EVENT_TYPES = [
  { value: 'inicios', label: 'Inicios', color: 'sky', markerClass: 'bg-sky-400' },
  { value: 'bloque_bajo', label: 'Bloque bajo', color: 'violet', markerClass: 'bg-violet-400' },
  { value: 'bloque_medio', label: 'Bloque medio', color: 'indigo', markerClass: 'bg-indigo-400' },
  { value: 'bloque_alto', label: 'Bloque alto', color: 'red', markerClass: 'bg-red-400' },
  { value: 'juego_directo', label: 'Juego directo', color: 'orange', markerClass: 'bg-orange-400' },
  { value: 'juego_combinativo', label: 'Juego combinativo', color: 'cyan', markerClass: 'bg-cyan-400' },
  { value: 'transicion_defensiva', label: 'Transición defensiva', color: 'amber', markerClass: 'bg-amber-300' },
  { value: 'transicion_ofensiva', label: 'Transición ofensiva', color: 'emerald', markerClass: 'bg-emerald-400' },
  { value: 'abp', label: 'ABP', color: 'purple', markerClass: 'bg-purple-400' },
  { value: 'gol', label: 'Gol', color: 'rose', markerClass: 'bg-rose-500' },
];

const normalizeEventKey = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export const getPostEventType = (type = '') => {
  const normalized = normalizeEventKey(type);
  return POST_EVENT_TYPES.find((eventType) => (
    eventType.value === normalized ||
    normalizeEventKey(eventType.label) === normalized
  )) || null;
};

export const getPostEventTypeLabel = (type = '') => getPostEventType(type)?.label || type || 'Evento';

export const getPostEventTypeValue = (type = '') => getPostEventType(type)?.value || normalizeEventKey(type);

export const getPostEventTypeColor = (type = '') => getPostEventType(type)?.color || 'slate';

export const getPostEventTypeMarkerClass = (type = '') => getPostEventType(type)?.markerClass || 'bg-slate-400';

export const buildPostEventTypesFromCatalog = (storedTypes = []) => POST_EVENT_TYPES.map((eventType) => {
  const stored = storedTypes.find((item) => (
    normalizeEventKey(item.name) === eventType.value ||
    normalizeEventKey(item.name) === normalizeEventKey(eventType.label)
  ));
  return {
    id: stored?.id || null,
    legacyId: stored?.legacyId || stored?.legacy_id || null,
    name: eventType.value,
    value: eventType.value,
    label: eventType.label,
    color: eventType.color,
    markerClass: eventType.markerClass,
    isDefault: Boolean(stored?.isDefault ?? stored?.is_default),
  };
});
