export const TRAINING_TASK_TYPES = [
  'Calentamiento',
  'Rondo',
  'Posesión',
  'Juego de posición',
  'Conservación',
  'Finalización',
  'Partido condicionado',
  'Tarea táctica',
  'ABP',
  'Física',
  'Técnica',
  'Otro',
];

export const TRAINING_TASK_PHASES = [
  { value: '', label: 'Sin fase' },
  { value: 'offensive', label: 'Ataque' },
  { value: 'defensive', label: 'Defensa' },
  { value: 'transition', label: 'Transiciones' },
  { value: 'set_piece', label: 'ABP' },
];

export const TRAINING_TASK_MOMENTS = {
  offensive: ['Inicio', 'Creación', 'Finalización'],
  defensive: ['Bloque alto', 'Bloque medio', 'Bloque bajo'],
  transition: ['Tras recuperación', 'Tras pérdida'],
  set_piece: ['Ofensiva', 'Defensiva'],
};

export const createTrainingTaskDraft = () => ({
  name: '',
  description: '',
  objective: '',
  taskType: 'Tarea táctica',
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
  description: task.description || '',
  objective: task.objective || '',
  taskType: task.taskType || 'Tarea táctica',
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
  const numericFields = [
    ['durationMinutes', 'La duración debe ser un número positivo.'],
    ['playersMin', 'El mínimo de jugadores no es válido.'],
    ['playersMax', 'El máximo de jugadores no es válido.'],
    ['spaceWidthM', 'El ancho debe ser un número positivo.'],
    ['spaceLengthM', 'El largo debe ser un número positivo.'],
  ];
  numericFields.forEach(([field, message]) => {
    if (draft[field] !== '' && (!Number.isFinite(Number(draft[field])) || Number(draft[field]) < 0)) errors[field] = message;
  });
  if (draft.playersMin !== '' && draft.playersMax !== '' && Number(draft.playersMin) > Number(draft.playersMax)) errors.playersMax = 'El máximo no puede ser menor que el mínimo.';
  return errors;
};

export const buildTrainingTaskPayload = (draft, { clubId, authorUserId, existing = null } = {}) => ({
  club_id: clubId,
  author_user_id: authorUserId,
  name: String(draft.name || '').trim(),
  description: String(draft.description || '').trim() || null,
  objective: String(draft.objective || '').trim(),
  task_type: String(draft.taskType || '').trim() || 'Otro',
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

export const filterTrainingTasks = (tasks, filters = {}) => {
  const search = String(filters.search || '').trim().toLocaleLowerCase('es');
  return tasks.filter((task) => {
    const haystack = [task.name, task.description, task.objective, task.taskType, task.tacticalContent, task.technicalContent]
      .filter(Boolean).join(' ').toLocaleLowerCase('es');
    const matchesSearch = !search || haystack.includes(search);
    const matchesType = !filters.taskType || task.taskType === filters.taskType;
    const matchesPhase = !filters.gamePhase || task.gamePhase === filters.gamePhase;
    const matchesOwnership = filters.scope === 'mine' ? !task.isShared : filters.scope === 'shared' ? task.isShared : true;
    const matchesDuration = !filters.duration || (filters.duration === 'short' ? Number(task.durationMinutes) <= 15 : filters.duration === 'medium' ? Number(task.durationMinutes) > 15 && Number(task.durationMinutes) <= 30 : Number(task.durationMinutes) > 30);
    return matchesSearch && matchesType && matchesPhase && matchesOwnership && matchesDuration;
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
