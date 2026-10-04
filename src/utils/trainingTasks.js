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
  objective: '',
  gamePhase: '',
  scope: '',
  duration: '',
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
  spaceWidthM: '',
  spaceLengthM: '',
  material: '',
  technicalContent: '',
  tacticalContent: '',
  gamePhase: '',
  gameMoment: '',
  observations: '',
  previewPath: '',
  attachmentPath: '',
  attachmentName: '',
  attachmentMime: '',
  attachmentSize: null,
});

export const normalizeTrainingTask = (row = {}) => ({
  ...row,
  name: row.name || '',
  taskCode: row.task_code || '',
  taskType: row.task_type || '',
  playersSpec: row.players_spec || '',
  playersMin: row.players_min ?? '',
  playersMax: row.players_max ?? '',
  durationMinutes: row.duration_minutes ?? '',
  spaceWidthM: row.space_width_m ?? '',
  spaceLengthM: row.space_length_m ?? '',
  technicalContent: row.technical_content || '',
  tacticalContent: row.tactical_content || '',
  gamePhase: row.game_phase || '',
  gameMoment: row.game_moment || '',
  previewPath: row.preview_path || '',
  attachmentPath: row.attachment_path || '',
  attachmentName: row.attachment_name || '',
  attachmentMime: row.attachment_mime || '',
  attachmentSize: row.attachment_size ?? null,
  isShared: Boolean(row.is_shared),
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
  spaceWidthM: task.spaceWidthM ?? '',
  spaceLengthM: task.spaceLengthM ?? '',
  material: task.material || '',
  technicalContent: task.technical_content || task.technicalContent || '',
  tacticalContent: task.tactical_content || task.tacticalContent || '',
  gamePhase: task.gamePhase || '',
  gameMoment: task.gameMoment || '',
  observations: task.observations || '',
  previewPath: task.previewPath || '',
  attachmentPath: task.attachmentPath || '',
  attachmentName: task.attachmentName || '',
  attachmentMime: task.attachmentMime || '',
  attachmentSize: task.attachmentSize ?? null,
});

export const validateTrainingTaskDraft = (draft) => {
  const errors = {};
  if (!String(draft.name || '').trim()) errors.name = 'Indica un nombre.';
  if (!String(draft.objective || '').trim()) errors.objective = 'Indica el objetivo principal.';
  if (String(draft.taskCode || '').trim().length > 40) errors.taskCode = 'El código de tarea no puede superar 40 caracteres.';
  const numericFields = [
    ['durationMinutes', 'La duración debe ser un número positivo.'],
    ['playersMin', 'El mínimo de jugadores no es válido.'],
    ['playersMax', 'El máximo de jugadores no es válido.'],
  ];
  numericFields.forEach(([field, message]) => {
    if (draft[field] !== '' && (!Number.isFinite(Number(draft[field])) || Number(draft[field]) < 0)) errors[field] = message;
  });
  [['spaceWidthM', 'El ancho debe ser un número natural positivo.'], ['spaceLengthM', 'El largo debe ser un número natural positivo.']]
    .forEach(([field, message]) => {
      if (draft[field] !== '' && (!Number.isInteger(Number(draft[field])) || Number(draft[field]) <= 0)) errors[field] = message;
    });
  if (draft.playersMin !== '' && draft.playersMax !== '' && Number(draft.playersMin) > Number(draft.playersMax)) errors.playersMax = 'El máximo no puede ser menor que el mínimo.';
  return errors;
};

export const buildTrainingTaskPayload = (draft, { clubId, authorUserId, existing = null } = {}) => ({
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
  duration_minutes: draft.durationMinutes === '' ? null : Number(draft.durationMinutes),
  space_width_m: draft.spaceWidthM === '' ? null : Number(draft.spaceWidthM),
  space_length_m: draft.spaceLengthM === '' ? null : Number(draft.spaceLengthM),
  material: String(draft.material || '').trim() || null,
  technical_content: String(draft.technicalContent || '').trim() || null,
  tactical_content: String(draft.tacticalContent || '').trim() || null,
  game_phase: draft.gamePhase || null,
  game_moment: String(draft.gameMoment || '').trim() || null,
  observations: String(draft.observations || '').trim() || null,
  preview_path: draft.previewPath || null,
  attachment_path: draft.attachmentPath || null,
  attachment_name: draft.attachmentName || null,
  attachment_mime: draft.attachmentMime || null,
  attachment_size: draft.attachmentSize || null,
  editor_payload: existing?.editor_payload || {},
});

export const filterTrainingTasks = (tasks, filters = {}, currentUserId = '') => {
  const search = normalizeTrainingTaskSearch(filters.search);
  const taskCode = normalizeTrainingTaskSearch(filters.taskCode);
  const objective = normalizeTrainingTaskSearch(filters.objective);
  const requestedPlayers = filters.players === '' || filters.players === null || filters.players === undefined
    ? null
    : Number(filters.players);
  return tasks.filter((task) => {
    const haystack = normalizeTrainingTaskSearch([
      task.name,
      task.taskCode,
      task.objective,
      task.description,
      task.technicalContent,
      task.tacticalContent,
      task.material,
      task.observations,
    ].filter(Boolean).join(' '));
    const matchesSearch = !search || haystack.includes(search);
    const matchesType = !filters.taskType || getTrainingTaskTypeDefinition(task.taskType).key === filters.taskType;
    const matchesTaskCode = !taskCode || normalizeTrainingTaskSearch(task.taskCode).includes(taskCode);
    const matchesObjective = !objective || normalizeTrainingTaskSearch(task.objective).includes(objective);
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
    const hasMin = task.playersMin !== '' && task.playersMin !== null && task.playersMin !== undefined;
    const hasMax = task.playersMax !== '' && task.playersMax !== null && task.playersMax !== undefined;
    const matchesPlayers = requestedPlayers === null || (
      Number.isInteger(requestedPlayers)
      && requestedPlayers > 0
      && (hasMin || hasMax)
      && (!hasMin || Number(task.playersMin) <= requestedPlayers)
      && (!hasMax || requestedPlayers <= Number(task.playersMax))
    );
    return matchesSearch && matchesType && matchesTaskCode && matchesObjective
      && matchesPlayers && matchesPhase && matchesOwnership && matchesDuration;
  });
};

export const formatTrainingTaskPlayers = (task) => task.playersSpec || (
  task.playersMin !== '' && task.playersMin !== null && task.playersMin !== undefined
    ? task.playersMax !== '' && task.playersMax !== null && task.playersMax !== undefined && task.playersMax !== task.playersMin
      ? `${task.playersMin}-${task.playersMax}`
      : String(task.playersMin)
    : 'Sin número específico'
);

export const formatTrainingTaskSpace = (task) => task.spaceWidthM && task.spaceLengthM ? `${task.spaceWidthM} × ${task.spaceLengthM} m` : '';
