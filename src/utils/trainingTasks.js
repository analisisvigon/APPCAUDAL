import {
  getTrainingTaskEditorPayloadSize,
  readTrainingTaskEditorPayload,
  serializeTrainingTaskEditorScene,
} from './trainingTaskEditorPayload.js';

const cloneJson = (value) => JSON.parse(JSON.stringify(value ?? {}));

export const TRAINING_TASK_TYPES = [
  { key: 'warm_up', label: 'Calentamiento', color: '#f59e0b' },
  { key: 'passing_patterns', label: 'Ruedas de pase', color: '#38bdf8' },
  { key: 'rondos', label: 'Rondos', color: '#22c55e' },
  { key: 'possession_games', label: 'Mantenimientos', color: '#14b8a6' },
  { key: 'positional_games', label: 'Juegos posicionales', color: '#8b5cf6' },
  { key: 'directed_actions', label: 'Acciones dirigidas', color: '#ec4899' },
  { key: 'attack_defense', label: 'Ataque-defensa', color: '#ef4444' },
  { key: 'finishing', label: 'Finalizaciones', color: '#f97316' },
  { key: 'small_sided_games', label: 'Partidos reducidos', color: '#06b6d4' },
  { key: 'double_boxes', label: 'Dobles áreas', color: '#a855f7' },
  { key: 'conditioned_games', label: 'Partidos condicionados', color: '#eab308' },
  { key: 'set_pieces', label: 'ABP', color: '#dc2626' },
  { key: 'position_specific', label: 'Puestos específicos', color: '#64748b' },
];

export const TRAINING_TASK_STAGES = [
  { key: 'prebenjamin', label: 'Prebenjamín' },
  { key: 'benjamin', label: 'Benjamín' },
  { key: 'alevin', label: 'Alevín' },
  { key: 'infantil', label: 'Infantil' },
  { key: 'cadete', label: 'Cadete' },
  { key: 'juvenil', label: 'Juvenil' },
  { key: 'senior', label: 'Sénior' },
];

const TRAINING_TASK_STAGE_BY_KEY = new Map(TRAINING_TASK_STAGES.map((stage) => [stage.key, stage]));

export const normalizeTrainingTaskStages = (values) => [...new Set(
  (Array.isArray(values) ? values : []).filter((value) => TRAINING_TASK_STAGE_BY_KEY.has(value))
)];

export const getTrainingTaskStageLabel = (key) => TRAINING_TASK_STAGE_BY_KEY.get(key)?.label || key;

const TRAINING_TASK_TYPE_BY_KEY = new Map(TRAINING_TASK_TYPES.map((type) => [type.key, type]));
const LEGACY_TRAINING_TASK_TYPE_KEYS = new Map([
  ['Calentamiento', 'warm_up'],
  ['Rondo', 'rondos'],
  ['Juego de posición', 'positional_games'],
  ['Finalización', 'finishing'],
  ['Partido condicionado', 'conditioned_games'],
  ['ABP', 'set_pieces'],
]);
const LEGACY_TASK_COLOR = '#64748b';

export const getTrainingTaskTypeDefinition = (value) => {
  const canonical = TRAINING_TASK_TYPE_BY_KEY.get(value);
  if (canonical) return { ...canonical, legacy: false };
  const legacyKey = LEGACY_TRAINING_TASK_TYPE_KEYS.get(value);
  const legacyColor = TRAINING_TASK_TYPE_BY_KEY.get(legacyKey)?.color || LEGACY_TASK_COLOR;
  return { key: legacyKey || '', label: String(value || 'Sin tipo'), color: legacyColor, legacy: true };
};

export const createTrainingTaskFilters = () => ({
  search: '',
  taskType: '',
  taskCode: '',
  players: '',
  playersMin: '',
  playersMax: '',
  objective: '',
  gamePhase: '',
  scope: '',
  duration: '',
  spaceWidthMin: '',
  spaceWidthMax: '',
  spaceLengthMin: '',
  spaceLengthMax: '',
  stage: '',
  ratingMin: '',
});

export const normalizeTrainingTaskSearch = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('es')
  .trim()
  .replace(/\s+/g, ' ');

export const TRAINING_TASK_PHASES = [
  { value: '', label: 'Sin fase' },
  { value: 'offensive', label: 'Ataque' },
  { value: 'defensive', label: 'Defensa' },
  { value: 'transition', label: 'Transiciones' },
  { value: 'set_piece', label: 'ABP' },
];

export const TRAINING_TASK_MOMENTS = {
  offensive: [
    { value: 'build_up', label: 'Inicio' },
    { value: 'creation', label: 'Creación' },
    { value: 'finishing', label: 'Finalización' },
  ],
  defensive: [
    { value: 'high_block', label: 'Bloque alto' },
    { value: 'mid_block', label: 'Bloque medio' },
    { value: 'low_block', label: 'Bloque bajo' },
  ],
  transition: [
    { value: 'offensive_transition', label: 'Tras recuperación' },
    { value: 'defensive_transition', label: 'Tras pérdida' },
  ],
  set_piece: [
    { value: 'offensive_set_piece', label: 'Ofensiva' },
    { value: 'defensive_set_piece', label: 'Defensiva' },
  ],
};

export const getTrainingTaskMomentLabel = (phase, moment) => (
  TRAINING_TASK_MOMENTS[phase]?.find((option) => option.value === moment)?.label || ''
);

export const createTrainingTaskDraft = () => ({
  name: '',
  taskCode: '',
  description: '',
  objective: '',
  taskType: TRAINING_TASK_TYPES[0].key,
  playersSpec: '',
  playersMin: '',
  playersMax: '',
  durationMinutes: '',
  seriesCount: '',
  minutesPerSeries: '',
  spaceWidthM: '',
  spaceLengthM: '',
  material: '',
  exerciseRules: '',
  technicalContent: '',
  tacticalContent: '',
  tacticalOffensiveContent: '',
  tacticalDefensiveContent: '',
  gamePhase: '',
  gameMoment: '',
  observations: '',
  stageKeys: [],
  variants: '',
  previewPath: '',
  attachmentPath: '',
  attachmentName: '',
  attachmentMime: '',
  attachmentSize: null,
  editorPayload: {},
});

export const normalizeTrainingTask = (row = {}) => ({
  ...row,
  name: row.name || '',
  taskCode: row.task_code || '',
  taskType: row.task_type || '',
  stageKeys: normalizeTrainingTaskStages(row.stage_keys),
  variants: row.variants || '',
  playersSpec: row.players_spec || '',
  playersMin: row.players_min ?? '',
  playersMax: row.players_max ?? '',
  durationMinutes: row.duration_minutes ?? '',
  seriesCount: row.series_count ?? '',
  minutesPerSeries: row.minutes_per_series ?? '',
  spaceWidthM: row.space_width_m ?? '',
  spaceLengthM: row.space_length_m ?? '',
  technicalContent: row.technical_content || '',
  tacticalContent: row.tactical_content || '',
  exerciseRules: row.exercise_rules || '',
  tacticalOffensiveContent: row.tactical_content_offensive || '',
  tacticalDefensiveContent: row.tactical_content_defensive || '',
  gamePhase: row.game_phase || '',
  gameMoment: row.game_moment || '',
  previewPath: row.preview_path || '',
  attachmentPath: row.attachment_path || '',
  attachmentName: row.attachment_name || '',
  attachmentMime: row.attachment_mime || '',
  attachmentSize: row.attachment_size ?? null,
  isShared: Boolean(row.is_shared),
  editorPayload: cloneJson(row.editor_payload),
});

export const trainingTaskToDraft = (task) => ({
  ...createTrainingTaskDraft(),
  name: task.name || '',
  taskCode: task.taskCode || task.task_code || '',
  description: task.description || '',
  objective: task.objective || '',
  taskType: task.taskType || TRAINING_TASK_TYPES[0].key,
  playersSpec: task.playersSpec || '',
  playersMin: task.playersMin ?? '',
  playersMax: task.playersMax ?? '',
  durationMinutes: task.durationMinutes ?? '',
  seriesCount: task.seriesCount ?? task.series_count ?? '',
  minutesPerSeries: task.minutesPerSeries ?? task.minutes_per_series ?? '',
  spaceWidthM: task.spaceWidthM ?? '',
  spaceLengthM: task.spaceLengthM ?? '',
  material: task.material || '',
  technicalContent: task.technical_content || task.technicalContent || '',
  tacticalContent: task.tactical_content || task.tacticalContent || '',
  exerciseRules: task.exercise_rules || task.exerciseRules || '',
  tacticalOffensiveContent: task.tactical_content_offensive || task.tacticalOffensiveContent || '',
  tacticalDefensiveContent: task.tactical_content_defensive || task.tacticalDefensiveContent || '',
  gamePhase: task.gamePhase || '',
  gameMoment: task.gameMoment || '',
  observations: task.observations || '',
  stageKeys: normalizeTrainingTaskStages(task.stageKeys || task.stage_keys),
  variants: task.variants || '',
  previewPath: task.previewPath || '',
  attachmentPath: task.attachmentPath || '',
  attachmentName: task.attachmentName || '',
  attachmentMime: task.attachmentMime || '',
  attachmentSize: task.attachmentSize ?? null,
  editorPayload: cloneJson(task.editorPayload ?? task.editor_payload),
});

const jsonEquals = (left, right) => JSON.stringify(left ?? {}) === JSON.stringify(right ?? {});
const optionalMultiline = (value) => String(value ?? '').trim() ? String(value) : null;

export const prepareTrainingTaskEditorPayload = (draft = {}, existing = null) => {
  const candidate = cloneJson(draft.editorPayload ?? existing?.editorPayload ?? existing?.editor_payload ?? {});
  const result = readTrainingTaskEditorPayload(candidate);
  if (result.kind === 'empty') return {};
  if (result.kind === 'v1') {
    const payload = serializeTrainingTaskEditorScene(result.scene);
    const size = getTrainingTaskEditorPayloadSize(payload);
    if (size.exceedsLimit) {
      throw new Error(`La pizarra ocupa ${size.bytes.toLocaleString('es-ES')} bytes y supera el limite de 256 KiB.`);
    }
    return payload;
  }
  const original = existing?.editorPayload ?? existing?.editor_payload;
  if (existing && jsonEquals(candidate, original)) return cloneJson(original);
  throw new Error(result.kind === 'unsupported'
    ? 'La pizarra usa una version no compatible y no puede sustituirse desde este editor.'
    : `La pizarra no es valida: ${result.error || 'payload desconocido'}`);
};

export const trainingTaskCalculatedDuration = (draft) =>
  draft.seriesCount !== '' && draft.minutesPerSeries !== '' &&
  draft.seriesCount != null && draft.minutesPerSeries != null &&
  Number.isSafeInteger(Number(draft.seriesCount)) && Number(draft.seriesCount) > 0 &&
  Number.isSafeInteger(Number(draft.minutesPerSeries)) && Number(draft.minutesPerSeries) > 0
    ? Number(draft.seriesCount) * Number(draft.minutesPerSeries) : null;

export const validateTrainingTaskDraft = (draft) => {
  const errors = {};
  if (!String(draft.name || '').trim()) errors.name = 'Indica un nombre.';
  if (!String(draft.objective || '').trim()) errors.objective = 'Indica el objetivo principal.';
  if (String(draft.taskCode || '').trim().length > 40) errors.taskCode = 'El código de tarea no puede superar 40 caracteres.';
  if (String(draft.variants || '').trim().length > 10000) errors.variants = 'Las variantes no pueden superar 10000 caracteres.';
  for (const field of ['exerciseRules', 'tacticalOffensiveContent', 'tacticalDefensiveContent']) {
    if (String(draft[field] || '').length > 10000) errors[field] = 'Este campo no puede superar 10000 caracteres.';
  }
  const numericFields = [
    ['durationMinutes', 'La duración debe ser un número positivo.'],
    ['playersMin', 'El mínimo de jugadores no es válido.'],
    ['playersMax', 'El máximo de jugadores no es válido.'],
  ];
  numericFields.forEach(([field, message]) => {
    if (draft[field] !== '' && (!Number.isFinite(Number(draft[field])) || Number(draft[field]) < 0)) errors[field] = message;
  });
  const series = draft.seriesCount;
  const perSeries = draft.minutesPerSeries;
  const hasSeries = series !== '' && series != null;
  const hasMinutes = perSeries !== '' && perSeries != null;
  if (hasSeries !== hasMinutes) errors[hasSeries ? 'minutesPerSeries' : 'seriesCount'] = 'Indica ambos valores de las series o deja ambos vacíos.';
  if (hasSeries && (!Number.isSafeInteger(Number(series)) || Number(series) < 1)) errors.seriesCount = 'El número de series debe ser un entero positivo.';
  if (hasMinutes && (!Number.isSafeInteger(Number(perSeries)) || Number(perSeries) < 1)) errors.minutesPerSeries = 'Los minutos por serie deben ser un entero positivo.';
  if (hasSeries && hasMinutes && Number(series) * Number(perSeries) > 2147483647) errors.durationMinutes = 'La duración calculada supera el límite permitido.';
  if (draft.durationMinutes !== '' && (!Number.isSafeInteger(Number(draft.durationMinutes)) || Number(draft.durationMinutes) < 1 || Number(draft.durationMinutes) > 2147483647)) errors.durationMinutes = 'La duración debe ser un entero positivo.';
  [['spaceWidthM', 'El ancho debe ser un número natural positivo.'], ['spaceLengthM', 'El largo debe ser un número natural positivo.']]
    .forEach(([field, message]) => {
      if (draft[field] !== '' && (!Number.isInteger(Number(draft[field])) || Number(draft[field]) <= 0)) errors[field] = message;
    });
  if (draft.playersMin !== '' && draft.playersMax !== '' && Number(draft.playersMin) > Number(draft.playersMax)) errors.playersMax = 'El máximo no puede ser menor que el mínimo.';
  return errors;
};

export const buildTrainingTaskPayload = (draft, { clubId, authorUserId, existing = null, seriesEnabled = false, contentEnabled = false } = {}) => ({
  club_id: clubId,
  author_user_id: authorUserId,
  name: String(draft.name || '').trim(),
  task_code: String(draft.taskCode || '').trim() || null,
  description: String(draft.description || '').trim() || null,
  objective: String(draft.objective || '').trim(),
  task_type: String(draft.taskType || '').trim() || TRAINING_TASK_TYPES[0].key,
  players_spec: String(draft.playersSpec || '').trim() || null,
  players_min: draft.playersMin === '' ? null : Number(draft.playersMin),
  players_max: draft.playersMax === '' ? null : Number(draft.playersMax),
  duration_minutes: draft.seriesCount !== '' && draft.minutesPerSeries !== '' && seriesEnabled
    ? Number(draft.seriesCount) * Number(draft.minutesPerSeries)
    : draft.durationMinutes === '' ? null : Number(draft.durationMinutes),
  ...(seriesEnabled ? {
    series_count: draft.seriesCount === '' ? null : Number(draft.seriesCount),
    minutes_per_series: draft.minutesPerSeries === '' ? null : Number(draft.minutesPerSeries),
  } : {}),
  space_width_m: draft.spaceWidthM === '' ? null : Number(draft.spaceWidthM),
  space_length_m: draft.spaceLengthM === '' ? null : Number(draft.spaceLengthM),
  material: String(draft.material || '').trim() || null,
  technical_content: String(draft.technicalContent || '').trim() || null,
  tactical_content: optionalMultiline(draft.tacticalContent),
  ...(contentEnabled ? {
    exercise_rules: optionalMultiline(draft.exerciseRules),
    tactical_content_offensive: optionalMultiline(draft.tacticalOffensiveContent),
    tactical_content_defensive: optionalMultiline(draft.tacticalDefensiveContent),
  } : {}),
  game_phase: draft.gamePhase || null,
  game_moment: String(draft.gameMoment || '').trim() || null,
  observations: String(draft.observations || '').trim() || null,
  stage_keys: normalizeTrainingTaskStages(draft.stageKeys),
  variants: String(draft.variants || '').trim() || null,
  preview_path: draft.previewPath || null,
  attachment_path: draft.attachmentPath || null,
  attachment_name: draft.attachmentName || null,
  attachment_mime: draft.attachmentMime || null,
  attachment_size: draft.attachmentSize || null,
  editor_payload: prepareTrainingTaskEditorPayload(draft, existing),
});

const SEARCH_EXCLUDED_KEYS = /(^|_)(id|uuid|club|author|user|membership|created|updated|deleted|path|url|mime|size|color|schema|coordinate|x|y|x1|x2|y1|y2|controlx|controly)(_|$)/i;
const SEARCH_TEXT_KEYS = /^(name|title|label|text|caption|description|objective|material|observations|variants|rules|content|post_text|original_name|task_code|players_spec)$/i;
const EDITOR_VALUE_LABELS = Object.freeze({
  full: 'campo completo', half: 'medio campo', blank: 'terreno sin lineas', 'penalty-area': 'vista de area',
  neutral: 'comodin', goalkeeper: 'portero', coach: 'entrenador', player: 'jugador', opponent: 'rival',
  ball: 'balon', cone: 'cono', pole: 'pica', mannequin: 'maniqui', hoop: 'aro', goal: 'porteria',
  mini_goal: 'mini porteria', zone: 'zona', block: 'bloque', arrow: 'flecha', dashed_arrow: 'flecha discontinua',
  curved_arrow: 'flecha curva', double_arrow: 'flecha doble', line: 'linea', dashed_line: 'linea discontinua',
});

const collectSearchText = (value, key = '', depth = 0, output = []) => {
  if (value == null || depth > 8 || SEARCH_EXCLUDED_KEYS.test(key)) return output;
  if (typeof value === 'string') {
    if (depth <= 1 || SEARCH_TEXT_KEYS.test(key) || /(_name|_title|_label|_text|_caption|_description|_content|_rules|_spec)$/i.test(key)) output.push(value);
    return output;
  }
  if (typeof value !== 'object') return output;
  if (Array.isArray(value)) {
    value.forEach((entry) => collectSearchText(entry, key, depth + 1, output));
    return output;
  }
  Object.entries(value).forEach(([entryKey, entry]) => collectSearchText(entry, entryKey, depth + 1, output));
  return output;
};

const numericValue = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(String(value).replace(',', '.'));
  return Number.isFinite(number) ? number : null;
};

const collectEditorLabels = (value, key = '', output = []) => {
  if (value == null) return output;
  if (Array.isArray(value)) {
    value.forEach((entry) => collectEditorLabels(entry, key, output));
    return output;
  }
  if (typeof value !== 'object') {
    if (typeof value === 'string' && /^(role|type|pitchType|teamKey)$/.test(key) && EDITOR_VALUE_LABELS[value]) output.push(EDITOR_VALUE_LABELS[value]);
    return output;
  }
  Object.entries(value).forEach(([entryKey, entry]) => collectEditorLabels(entry, entryKey, output));
  return output;
};

export const getTrainingTaskPlayerRange = (task = {}) => {
  const structuredMin = numericValue(task.playersMin ?? task.players_min);
  const structuredMax = numericValue(task.playersMax ?? task.players_max);
  if (structuredMin !== null || structuredMax !== null) return { min: structuredMin, max: structuredMax };
  const spec = normalizeTrainingTaskSearch(task.playersSpec ?? task.players_spec).replace(/\s+/g, '');
  const range = spec.match(/^(\d+)(?:-|a)(\d+)(?:jugadores?)?$/);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  if (!spec || !/^(?:\d+[v+])*(?:\d+)(?:jugadores?)?$/.test(spec)) return { min: null, max: null };
  const total = (spec.match(/\d+/g) || []).reduce((sum, value) => sum + Number(value), 0);
  return total > 0 ? { min: total, max: total } : { min: null, max: null };
};

const dimensionRange = (task, axis) => {
  const prefix = axis === 'width' ? 'spaceWidth' : 'spaceLength';
  const snake = axis === 'width' ? 'space_width' : 'space_length';
  const fixed = numericValue(task[`${prefix}M`] ?? task[`${snake}_m`]);
  return {
    min: numericValue(task[`${prefix}MinM`] ?? task[`${snake}_min_m`]) ?? fixed,
    max: numericValue(task[`${prefix}MaxM`] ?? task[`${snake}_max_m`]) ?? fixed,
  };
};

const rangeContains = (range, point) => point === null || (
  (range.min !== null || range.max !== null)
  && (range.min === null || range.min <= point)
  && (range.max === null || point <= range.max)
);

const rangesOverlap = (taskRange, requestedMin, requestedMax) => {
  if (requestedMin === null && requestedMax === null) return true;
  if (taskRange.min === null && taskRange.max === null) return false;
  return (requestedMax === null || taskRange.min === null || taskRange.min <= requestedMax)
    && (requestedMin === null || taskRange.max === null || requestedMin <= taskRange.max);
};

const taskSearchText = (task) => normalizeTrainingTaskSearch([
  ...collectSearchText(task),
  getTrainingTaskTypeDefinition(task.taskType).label,
  ...normalizeTrainingTaskStages(task.stageKeys).map(getTrainingTaskStageLabel),
  TRAINING_TASK_PHASES.find((phase) => phase.value === task.gamePhase)?.label,
  getTrainingTaskMomentLabel(task.gamePhase, task.gameMoment),
  ...collectEditorLabels(task.editorPayload ?? task.editor_payload),
].filter(Boolean).join(' '));

export const parseTrainingTaskSearch = (value) => {
  let remainder = normalizeTrainingTaskSearch(value);
  const parsed = { players: null, width: null, length: null, duration: null, series: null, terms: [] };
  remainder = remainder.replace(/(\d+)\s*(?:jugadores?|jug\.?)/g, (_, number) => { parsed.players = Number(number); return ' '; });
  remainder = remainder.replace(/(\d+(?:[.,]\d+)?)\s*[x\u00d7]\s*(\d+(?:[.,]\d+)?)/g, (_, width, length) => {
    parsed.width = numericValue(width); parsed.length = numericValue(length); return ' ';
  });
  remainder = remainder.replace(/(\d+)\s*(?:minutos?|mins?\.?)/g, (_, number) => { parsed.duration = Number(number); return ' '; });
  remainder = remainder.replace(/(\d+)\s*series?/g, (_, number) => { parsed.series = Number(number); return ' '; });
  parsed.terms = normalizeTrainingTaskSearch(remainder).split(' ').filter(Boolean);
  return parsed;
};

export const filterTrainingTasks = (tasks, filters = {}, currentUserId = '') => {
  const query = parseTrainingTaskSearch(filters.search);
  const taskCode = normalizeTrainingTaskSearch(filters.taskCode);
  const objective = normalizeTrainingTaskSearch(filters.objective);
  const requestedPlayers = numericValue(filters.players);
  const requestedPlayersMin = numericValue(filters.playersMin);
  const requestedPlayersMax = numericValue(filters.playersMax);
  const requestedWidthMin = numericValue(filters.spaceWidthMin);
  const requestedWidthMax = numericValue(filters.spaceWidthMax);
  const requestedLengthMin = numericValue(filters.spaceLengthMin);
  const requestedLengthMax = numericValue(filters.spaceLengthMax);
  return tasks.filter((task) => {
    const haystack = taskSearchText(task);
    const playerRange = getTrainingTaskPlayerRange(task);
    const widthRange = dimensionRange(task, 'width');
    const lengthRange = dimensionRange(task, 'length');
    const matchesSearch = query.terms.every((term) => haystack.includes(term))
      && rangeContains(playerRange, query.players)
      && rangeContains(widthRange, query.width)
      && rangeContains(lengthRange, query.length)
      && (query.duration === null || Number(task.durationMinutes) === query.duration)
      && (query.series === null || Number(task.seriesCount) === query.series);
    const matchesType = !filters.taskType || getTrainingTaskTypeDefinition(task.taskType).key === filters.taskType;
    const matchesTaskCode = !taskCode || normalizeTrainingTaskSearch(task.taskCode).includes(taskCode);
    const matchesObjective = !objective || normalizeTrainingTaskSearch(task.objective).includes(objective);
    const matchesStage = !filters.stage || normalizeTrainingTaskStages(task.stageKeys).includes(filters.stage);
    const matchesPhase = !filters.gamePhase || task.gamePhase === filters.gamePhase;
    const matchesOwnership = filters.scope === 'mine'
      ? task.author_user_id === currentUserId
      : filters.scope === 'shared'
        ? task.author_user_id !== currentUserId && task.isShared
        : true;
    const hasDuration = task.durationMinutes !== '' && task.durationMinutes !== null && task.durationMinutes !== undefined;
    const duration = Number(task.durationMinutes);
    const matchesDuration = !filters.duration || (hasDuration && (
      filters.duration === 'short' ? duration <= 15
        : filters.duration === 'medium' ? duration > 15 && duration <= 30 : duration > 30
    ));
    const matchesPlayers = rangeContains(playerRange, requestedPlayers)
      && rangesOverlap(playerRange, requestedPlayersMin, requestedPlayersMax);
    const matchesSpace = rangesOverlap(widthRange, requestedWidthMin, requestedWidthMax)
      && rangesOverlap(lengthRange, requestedLengthMin, requestedLengthMax);
    const ratingMinimum = filters.ratingMin === '' || filters.ratingMin === null || filters.ratingMin === undefined
      ? null
      : Number(filters.ratingMin);
    const matchesRating = ratingMinimum === null || (
      Number.isFinite(Number(task.ratingAverage))
      && Number(task.ratingCount) > 0
      && Number(task.ratingAverage) >= ratingMinimum
    );
    return matchesSearch && matchesType && matchesTaskCode && matchesObjective
      && matchesStage && matchesPlayers && matchesSpace && matchesRating && matchesPhase && matchesOwnership && matchesDuration;
  });
};

export const formatTrainingTaskPlayers = (task) => String(task.playersSpec || '').trim() || (
  task.playersMin !== '' && task.playersMin !== null && task.playersMin !== undefined
    ? task.playersMax !== '' && task.playersMax !== null && task.playersMax !== undefined && task.playersMax !== task.playersMin
      ? `${task.playersMin}-${task.playersMax}`
      : String(task.playersMin)
    : 'Sin número específico'
);

export const formatTrainingTaskSpace = (task) => task.spaceWidthM && task.spaceLengthM ? `${task.spaceWidthM} × ${task.spaceLengthM} m` : '';
