const TEMPLATE_TABLE = 'tactical_play_templates';

const cloneJson = (value, fallback) => {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback));
  } catch {
    return JSON.parse(JSON.stringify(fallback));
  }
};

const normalizeTags = (value) => (
  Array.from(new Set(
    (Array.isArray(value) ? value : [])
      .filter((tag) => typeof tag === 'string')
      .map((tag) => tag.trim())
      .filter(Boolean)
  ))
);

const normalizePlayStyle = (phase, value) => {
  if (phase !== 'offensive') return null;
  return value === 'direct' ? 'direct' : 'combinative';
};

const transitionTypes = new Set(['offensive_transition', 'defensive_transition']);
const transitionFieldZones = new Set(['defensive_half', 'attacking_half']);
const transitionBehaviours = {
  offensive_transition: new Set(['fast_attack', 'keep_possession']),
  defensive_transition: new Set(['counterpress', 'retreat']),
};

const normalizeTransitionType = (phase, value, legacySituation = '') => {
  if (phase !== 'transition') return null;
  if (transitionTypes.has(value)) return value;
  if (transitionTypes.has(legacySituation)) return legacySituation;
  return 'offensive_transition';
};

const normalizeTransitionFieldZone = (phase, value) => {
  if (phase !== 'transition') return null;
  return transitionFieldZones.has(value) ? value : 'defensive_half';
};

const normalizeTransitionBehaviour = (phase, transitionType, value) => {
  if (phase !== 'transition') return null;
  if (transitionBehaviours[transitionType]?.has(value)) return value;
  return transitionType === 'defensive_transition' ? 'counterpress' : 'fast_attack';
};

export const normalizeTacticalTemplate = (row = {}) => {
  const phase = String(row.phase || '');
  const transitionType = normalizeTransitionType(phase, row.transition_type, row.situation);
  return {
  id: String(row.id || ''),
  name: String(row.name || ''),
  phase,
  situation: String(row.situation || ''),
  playStyle: normalizePlayStyle(phase, row.play_style),
  transitionType,
  fieldZone: normalizeTransitionFieldZone(phase, row.field_zone),
  behaviour: normalizeTransitionBehaviour(phase, transitionType, row.behaviour),
  category: row.category == null ? '' : String(row.category),
  description: String(row.description || ''),
  baseRivalSystem: row.base_rival_system == null ? '' : String(row.base_rival_system),
  baseCaudalSystem: row.base_caudal_system == null ? '' : String(row.base_caudal_system),
  tags: normalizeTags(row.tags),
  playerPositions: cloneJson(
    row.player_positions && typeof row.player_positions === 'object' && !Array.isArray(row.player_positions)
      ? row.player_positions
      : {},
    {}
  ),
  arrows: cloneJson(Array.isArray(row.arrows) ? row.arrows : [], []),
  isPublic: row.is_public === true,
  createdAt: String(row.created_at || ''),
  updatedAt: String(row.updated_at || ''),
  };
};

export const buildTacticalTemplatePayload = (template = {}) => {
  const name = String(template.name || '').trim();
  const phase = String(template.phase || '').trim();
  const rawSituation = String(template.situation || '').trim();
  const transitionType = phase === 'transition'
    ? String(template.transitionType || '').trim()
    : null;
  const situation = phase === 'transition' ? transitionType : rawSituation;
  if (!name) throw new Error('La plantilla necesita un nombre.');
  if (!phase) throw new Error('La plantilla necesita una fase.');
  if (phase === 'transition' && !transitionTypes.has(transitionType)) {
    throw new Error('La plantilla de transición necesita un tipo válido.');
  }
  if (!situation) throw new Error('La plantilla necesita una situación.');
  const playStyle = phase === 'offensive'
    ? String(template.playStyle || '').trim()
    : null;
  if (phase === 'offensive' && !['combinative', 'direct'].includes(playStyle)) {
    throw new Error('La plantilla ofensiva necesita un tipo de juego válido.');
  }

  const fieldZone = phase === 'transition'
    ? String(template.fieldZone || '').trim()
    : null;
  if (phase === 'transition' && !transitionFieldZones.has(fieldZone)) {
    throw new Error('La plantilla de transición necesita una zona válida.');
  }
  const behaviour = phase === 'transition'
    ? String(template.behaviour || '').trim()
    : null;
  if (phase === 'transition' && !transitionBehaviours[transitionType]?.has(behaviour)) {
    throw new Error('La plantilla de transición necesita un comportamiento válido.');
  }

  return {
    name,
    phase,
    situation,
    play_style: playStyle,
    transition_type: transitionType,
    field_zone: fieldZone,
    behaviour,
    category: String(template.category || '').trim() || null,
    description: String(template.description || ''),
    base_rival_system: String(template.baseRivalSystem || '').trim() || null,
    base_caudal_system: String(template.baseCaudalSystem || '').trim() || null,
    tags: normalizeTags(template.tags),
    player_positions: cloneJson(
      template.playerPositions && typeof template.playerPositions === 'object' && !Array.isArray(template.playerPositions)
        ? template.playerPositions
        : {},
      {}
    ),
    arrows: cloneJson(Array.isArray(template.arrows) ? template.arrows : [], []),
    is_public: false,
  };
};

const throwIfError = (error) => {
  if (error) throw error;
};

export const listTacticalTemplates = async (client) => {
  const { data, error } = await client
    .from(TEMPLATE_TABLE)
    .select('*')
    .order('updated_at', { ascending: false });
  throwIfError(error);
  return (data || []).map(normalizeTacticalTemplate);
};

export const createTacticalTemplate = async (client, template) => {
  const payload = buildTacticalTemplatePayload(template);
  const { data, error } = await client
    .from(TEMPLATE_TABLE)
    .insert(payload)
    .select('*')
    .single();
  throwIfError(error);
  return normalizeTacticalTemplate(data);
};

export const updateTacticalTemplate = async (client, templateId, template) => {
  if (!templateId) throw new Error('No se ha indicado la plantilla que se debe actualizar.');
  const payload = buildTacticalTemplatePayload(template);
  const { data, error } = await client
    .from(TEMPLATE_TABLE)
    .update(payload)
    .eq('id', templateId)
    .select('*')
    .single();
  throwIfError(error);
  return normalizeTacticalTemplate(data);
};

export const deleteTacticalTemplate = async (client, templateId) => {
  if (!templateId) throw new Error('No se ha indicado la plantilla que se debe eliminar.');
  const { error } = await client
    .from(TEMPLATE_TABLE)
    .delete()
    .eq('id', templateId);
  throwIfError(error);
  return true;
};
