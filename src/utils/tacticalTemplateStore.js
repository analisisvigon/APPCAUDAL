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

export const normalizeTacticalTemplate = (row = {}) => {
  const phase = String(row.phase || '');
  return {
  id: String(row.id || ''),
  name: String(row.name || ''),
  phase,
  situation: String(row.situation || ''),
  playStyle: normalizePlayStyle(phase, row.play_style),
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
  const situation = String(template.situation || '').trim();
  if (!name) throw new Error('La plantilla necesita un nombre.');
  if (!phase) throw new Error('La plantilla necesita una fase.');
  if (!situation) throw new Error('La plantilla necesita una situación.');
  const playStyle = phase === 'offensive'
    ? String(template.playStyle || '').trim()
    : null;
  if (phase === 'offensive' && !['combinative', 'direct'].includes(playStyle)) {
    throw new Error('La plantilla ofensiva necesita un tipo de juego válido.');
  }

  return {
    name,
    phase,
    situation,
    play_style: playStyle,
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
