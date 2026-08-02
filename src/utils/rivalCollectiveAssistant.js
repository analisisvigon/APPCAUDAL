const safeArray = (value) => Array.isArray(value) ? value : [];
const safeObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const clean = (value) => String(value ?? '').trim();
const normalize = (value) => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

export const RIVAL_ASSISTANT_EMPTY_STATES = Object.freeze({
  profile: 'No hay suficientes evidencias para definir el perfil colectivo del rival.',
  behavior: 'No hay suficientes evidencias para definir este comportamiento.',
  defense: 'No existen evidencias suficientes para generar recomendaciones defensivas.',
  attack: 'No existen evidencias suficientes para recomendar un plan ofensivo.',
  duels: 'No existen evidencias suficientes para construir duelos tácticos.',
  sources: 'No hay fuentes suficientes registradas para respaldar un plan.',
});

export const RIVAL_ASSISTANT_SOURCE_LABELS = Object.freeze([
  'Perfil',
  'Evidencias',
  'Pizarra',
  'Conexiones',
  'Vídeo',
  'Staff',
]);

const ACTION_VERBS = [
  'Presionar',
  'Cerrar',
  'Evitar',
  'Buscar',
  'Atacar',
  'Obligar',
  'Defender',
  'Provocar',
  'Proteger',
  'Replegar',
  'Orientar',
  'Fijar',
  'Atraer',
  'Saltar',
  'Temporizar',
];

const priorityRank = { 'Crítica': 0, Importante: 1, Opcional: 2 };
const confidenceRank = { Alta: 0, Media: 1, Baja: 2 };

const uniq = (values) => [...new Set(safeArray(values).filter(Boolean))];
const hasAnyTerm = (value, terms) => {
  const normalized = normalize(value);
  return safeArray(terms).some((term) => normalized.includes(normalize(term)));
};
const byNewest = (left, right) => clean(right).localeCompare(clean(left));

const evidenceUnitKey = (row = {}) => clean(
  row.evidenceUnitId
  || safeArray(row.evidenceUnitIds)[0]
  || [
    clean(row.sourceKind || row.source).toLowerCase(),
    clean(row.sourceId || row.observationId || row.playId || row.id),
    clean(row.playerId || row.playerKey),
    clean(row.matchId),
  ].filter(Boolean).join(':')
  || row.id
);

const withEvidenceIdentity = (row, defaults = {}) => {
  const sourceKind = clean(row.sourceKind || defaults.sourceKind || row.source).toLowerCase();
  const sourceId = clean(row.sourceId || defaults.sourceId || row.observationId || row.playId || row.id);
  const playerId = clean(row.playerId || row.playerKey);
  const normalized = {
    ...row,
    sourceKind,
    sourceId,
    playerId,
    playerKey: clean(row.playerKey || playerId),
    playerName: clean(row.playerName),
    matchId: clean(row.matchId || defaults.matchId),
    observationId: clean(row.observationId),
    playId: clean(row.playId),
    behaviourKey: clean(row.behaviourKey),
    scope: clean(row.scope || defaults.scope || 'collective'),
    derivedFromPlayerProfile: Boolean(row.derivedFromPlayerProfile),
    collectiveStrength: clean(row.collectiveStrength),
  };
  return {
    ...normalized,
    evidenceUnitId: evidenceUnitKey({ ...normalized, evidenceUnitId: row.evidenceUnitId }),
  };
};

const profileEvidence = (field, value) => withEvidenceIdentity({
  id: `profile:${field}:${normalize(Array.isArray(value) ? value.join('-') : value)}`,
  source: 'Perfil',
  text: Array.isArray(value) ? value.join(', ') : clean(value),
  importance: 'Media',
  date: '',
  evidenceUnitId: 'collective-profile',
}, { sourceKind: 'collective_profile', sourceId: 'collective-profile', scope: 'collective' });

const normalizeEvidenceRows = (rows) => safeArray(rows)
  .map((row, index) => withEvidenceIdentity({
    ...row,
    id: `evidence:${clean(row?.id) || index}`,
    source: 'Evidencias',
    text: clean(row?.observation || row?.text),
    context: [clean(row?.type), clean(row?.match)].filter(Boolean).join(' · '),
    importance: clean(row?.importance) || 'Media',
    date: clean(row?.date),
    matchId: clean(row?.matchId || row?.match),
    observationId: clean(row?.observationId || row?.id),
  }, {
    sourceKind: row?.derivedFromPlayerProfile ? 'player_profile' : 'evidence',
    sourceId: row?.sourceId || row?.observationId || row?.id || index,
    scope: row?.scope || (row?.derivedFromPlayerProfile ? 'individual' : 'collective'),
  }))
  .filter((row) => row.text);

const normalizeConnections = (rows) => safeArray(rows)
  .map((row, index) => withEvidenceIdentity({
    id: `connection:${clean(row?.id) || index}`,
    source: 'Conexiones',
    text: [clean(row?.type), clean(row?.origin), clean(row?.destination), clean(row?.comment)].filter(Boolean).join(' · '),
    context: clean(row?.team) || 'rival',
    importance: clean(row?.intensity) || 'Media',
    date: clean(row?.createdAt),
  }, { sourceKind: 'connection', sourceId: row?.id || index, scope: 'collective' }))
  .filter((row) => row.text && row.context !== 'caudal');

const normalizePlays = (rows, tacticalEvidenceReport) => {
  const directRows = safeArray(rows).map((row, index) => withEvidenceIdentity({
    id: `play:${clean(row?.id || row?.playId) || index}`,
    source: 'Pizarra',
    text: [
      playPhaseLabel(row?.phase),
      clean(row?.name || row?.playName),
      clean(row?.description || row?.manualDescription),
      ...safeArray(row?.tags).map(clean),
    ].filter(Boolean).join(' · '),
    context: playPhaseLabel(row?.phase),
    importance: 'Media',
    date: clean(row?.updatedAt || row?.createdAt),
    playId: clean(row?.id || row?.playId),
  }, { sourceKind: 'play', sourceId: row?.id || row?.playId || index, scope: 'collective' })).filter((row) => row.text);

  const reportRows = safeArray(tacticalEvidenceReport?.contextRows)
    .map((row, index) => withEvidenceIdentity({
      id: `play:${clean(row?.playId) || `report-${index}`}`,
      source: 'Pizarra',
      text: [
        playPhaseLabel(row?.phase),
        clean(row?.playName),
        clean(row?.manualDescription),
        clean(row?.category),
      ].filter(Boolean).join(' · '),
      context: playPhaseLabel(row?.phase),
      importance: 'Media',
      date: '',
      playId: clean(row?.playId),
    }, { sourceKind: 'play', sourceId: row?.playId || `report-${index}`, scope: 'collective' }))
    .filter((row) => row.text);

  return [...new Map([...directRows, ...reportRows].map((row) => [row.id, row])).values()];
};

const normalizeStaffRows = (rows) => safeArray(rows)
  .map((row, index) => withEvidenceIdentity({
    id: `staff:${clean(row?.id) || index}`,
    source: 'Staff',
    text: clean(row?.text || row?.content),
    context: clean(row?.label) || 'Informe del staff',
    importance: 'Media',
    date: clean(row?.updatedAt || row?.createdAt),
  }, { sourceKind: 'staff_report', sourceId: row?.id || index, scope: 'collective' }))
  .filter((row) => row.text);

const normalizeVideos = (rows) => safeArray(rows)
  .map((row, index) => withEvidenceIdentity({
    id: `video:${clean(row?.id) || index}`,
    source: 'Vídeo',
    text: clean(row?.observation || row?.description),
    url: clean(row?.url),
    context: clean(row?.label) || 'Vídeo vinculado',
    importance: 'Media',
    date: clean(row?.updatedAt || row?.createdAt),
  }, { sourceKind: 'video', sourceId: row?.id || index, scope: 'collective' }))
  .filter((row) => row.url);

const playPhaseLabel = (phase) => ({
  defensive: 'defensa',
  offensive: 'ataque posicional',
  transition: 'transición',
  set_piece: 'ABP',
}[clean(phase)] || clean(phase));

const profileFieldRows = (profile) => {
  const source = safeObject(profile);
  return [
    ['buildUp', source.buildUp],
    ['blockHeight', source.blockHeight],
    ['pressureType', source.pressureType],
    ['attackingRhythm', source.attackingRhythm],
    ['preferredAttack', source.preferredAttack],
    ['strengths', safeArray(source.strengths)],
    ['weaknesses', safeArray(source.weaknesses)],
  ].filter(([, value]) => Array.isArray(value) ? value.length : clean(value));
};

const buildFacts = (input) => {
  const profile = safeObject(input.collectiveProfile);
  const profileRows = profileFieldRows(profile).map(([field, value]) => profileEvidence(field, value));
  const evidences = normalizeEvidenceRows(input.evidences);
  const connections = normalizeConnections(input.connections);
  const plays = normalizePlays(input.plays, input.tacticalEvidenceReport);
  const staff = normalizeStaffRows(input.reports);
  const videos = normalizeVideos(input.videos);
  return {
    profile,
    profileRows,
    evidences,
    connections,
    plays,
    staff,
    videos,
    concrete: [...evidences, ...connections, ...plays, ...staff, ...videos.filter((row) => row.text)],
  };
};

const collectTopicSupport = (facts, terms) => facts.concrete.filter((row) => (
  hasAnyTerm(`${row.text} ${row.context}`, terms)
));

const uniqueEvidenceUnits = (rows) => [...new Map(safeArray(rows).map((row) => [evidenceUnitKey(row), row])).values()];

const buildSupportStats = (rows) => {
  const support = safeArray(rows);
  const units = uniqueEvidenceUnits(support);
  const individual = units.filter((row) => row.scope === 'individual' || row.derivedFromPlayerProfile);
  const collective = units.filter((row) => !individual.includes(row));
  const contributingPlayerIds = uniq(individual.map((row) => row.playerId || row.playerKey));
  const contributingPlayers = uniq(individual.map((row) => row.playerName));
  const matchIds = uniq(units.map((row) => row.matchId));
  const sourceKinds = uniq(units.map((row) => row.sourceKind));
  const repeatedAcrossPlayers = contributingPlayerIds.length >= 2;
  const repeatedAcrossMatches = matchIds.length >= 2;
  const corroboratedByCollectiveSource = individual.length > 0 && collective.length > 0;
  const structuralWithIndependentSupport = individual.some((row) => row.collectiveStrength === 'structural') && units.length >= 2;
  const hasCollectiveRepetition = individual.length === 0 && collective.length >= 2;
  const qualifiesAsCollective = repeatedAcrossPlayers
    || repeatedAcrossMatches
    || corroboratedByCollectiveSource
    || structuralWithIndependentSupport
    || hasCollectiveRepetition;
  const backedPattern = qualifiesAsCollective
    && units.length >= 3
    && collective.length > 0
    && sourceKinds.length >= 2;
  const evidenceLevel = backedPattern
    ? 'collective_pattern'
    : qualifiesAsCollective
      ? 'collective_hypothesis'
      : individual.length
        ? 'individual_signal'
        : 'collective_hypothesis';
  return {
    units,
    individual,
    collective,
    contributingPlayerIds,
    contributingPlayers,
    matchIds,
    sourceKinds,
    independentSourceCount: units.length,
    corroboratedByCollectiveSource,
    evidenceLevel,
    evidenceLabel: evidenceLevel === 'collective_pattern'
      ? 'Patrón colectivo respaldado'
      : evidenceLevel === 'collective_hypothesis'
        ? 'Hipótesis colectiva'
        : 'Señal individual',
  };
};

const calculateConfidence = (rows) => {
  const stats = buildSupportStats(rows);
  if (stats.evidenceLevel === 'collective_pattern') return 'Alta';
  if (stats.evidenceLevel === 'collective_hypothesis' && stats.independentSourceCount >= 2) return 'Media';
  return 'Baja';
};

const confidenceForBehavior = (rows) => calculateConfidence(rows);

const behaviorSummary = (phase, facts, support) => {
  const profile = facts.profile;
  if (phase === 'build_up') {
    const value = clean(profile.buildUp);
    if (/directa/i.test(value) && !/muy elaborada/i.test(value)) return `Prioriza una salida ${value.toLowerCase()}.`;
    if (value) return `Busca iniciar mediante una salida ${value.toLowerCase()}.`;
  }
  if (phase === 'positional') {
    const parts = [];
    if (profile.attackingRhythm) parts.push(`Ataca con un ritmo ${clean(profile.attackingRhythm).toLowerCase()}`);
    if (profile.preferredAttack) parts.push(`orienta el juego hacia ${clean(profile.preferredAttack).toLowerCase()}`);
    const strengths = safeArray(profile.strengths).filter((item) => ['Juego interior', 'Centros', 'Juego directo', 'Segunda jugada'].includes(item));
    if (strengths.length) parts.push(`tiene registrados ${strengths.join(' y ').toLowerCase()}`);
    if (parts.length) return `${parts.join('; ')}.`;
  }
  if (phase === 'transition') {
    const strengths = safeArray(profile.strengths).filter((item) => ['Transiciones', 'Contraataque'].includes(item));
    if (strengths.length) return `Busca acelerar tras recuperación mediante ${strengths.join(' y ').toLowerCase()}.`;
  }
  if (phase === 'set_piece' && safeArray(profile.strengths).includes('ABP')) {
    return 'Presenta la estrategia a balón parado como fortaleza colectiva registrada.';
  }
  const directObservation = support.find((row) => row.source === 'Evidencias' || row.source === 'Staff');
  if (directObservation) return directObservation.text;
  const play = support.find((row) => row.source === 'Pizarra');
  if (play) return `El comportamiento aparece registrado en ${play.context || 'una jugada guardada'}.`;
  return '';
};

const behaviorDefinitions = [
  { key: 'build_up', title: 'Salida', icon: '↗', terms: ['salida', 'inicio', 'portero', 'central', 'juego corto', 'juego largo', 'combinativa', 'directa'], profileFields: ['buildUp'] },
  { key: 'positional', title: 'Ataque posicional', icon: '◇', terms: ['ataque', 'progres', 'banda', 'centro', 'interior', 'amplitud', 'ritmo', 'segunda jugada'], profileFields: ['attackingRhythm', 'preferredAttack', 'strengths'] },
  { key: 'transition', title: 'Transiciones', icon: '⇄', terms: ['transicion', 'contraataque', 'recuperacion', 'perdida'], profileFields: ['strengths'] },
  { key: 'set_piece', title: 'ABP', icon: '⌁', terms: ['abp', 'corner', 'corne', 'falta lateral', 'balon parado', 'estrategia'], profileFields: ['strengths'] },
];

const buildBehaviors = (facts) => behaviorDefinitions.map((definition) => {
  const profileSupport = definition.profileFields.flatMap((field) => {
    const value = facts.profile[field];
    if (definition.key === 'transition' && !safeArray(value).some((item) => ['Transiciones', 'Contraataque'].includes(item))) return [];
    if (definition.key === 'set_piece' && !safeArray(value).includes('ABP')) return [];
    if (definition.key === 'positional' && field === 'strengths') {
      const relevant = safeArray(value).filter((item) => ['Juego interior', 'Centros', 'Juego directo', 'Segunda jugada'].includes(item));
      return relevant.length ? [profileEvidence(field, relevant)] : [];
    }
    return Array.isArray(value)
      ? value.length ? [profileEvidence(field, value)] : []
      : clean(value) ? [profileEvidence(field, value)] : [];
  });
  const topicSupport = collectTopicSupport(facts, definition.terms);
  const support = [...profileSupport, ...topicSupport];
  const summary = behaviorSummary(definition.key, facts, support);
  return {
    key: definition.key,
    title: definition.title,
    icon: definition.icon,
    summary,
    confidence: summary ? confidenceForBehavior(support) : null,
    sources: uniq(support.map((row) => row.source)),
    evidenceIds: uniq(support.map((row) => row.id)),
    emptyMessage: RIVAL_ASSISTANT_EMPTY_STATES.behavior,
  };
});

const recommendationRules = [
  {
    id: 'defend-interior', side: 'defense', field: 'strengths', values: ['Juego interior'], terms: ['juego interior', 'pase interior', 'pivote', 'entre lineas', 'progresion interior'],
    action: 'Cerrar el pase interior hacia el pivote y las recepciones entre líneas.', priority: 'Crítica', expectedImpact: 'Reducir su progresión interior.',
    rationale: 'El rival presenta progresión interior registrada; cerrar el primer apoyo limita la continuidad hacia jugadores situados entre líneas.',
    duel: { relation: 'Nuestra primera línea de presión vs su progresión interior', type: 'Riesgo' },
  },
  {
    id: 'defend-crosses', side: 'defense', field: 'strengths', values: ['Centros'], terms: ['centro', 'segundo palo', 'ataque exterior', 'banda'],
    action: 'Defender el segundo palo y evitar centros sin oposición.', priority: 'Crítica', expectedImpact: 'Limitar centros y remates en el segundo palo.',
    rationale: 'La amenaza exterior está respaldada por registros de centros; la consigna protege la zona de finalización asociada.',
    duel: { relation: 'Nuestros laterales y extremos vs su ataque exterior', type: 'Riesgo' },
  },
  {
    id: 'defend-direct', side: 'defense', field: 'strengths', values: ['Juego directo', 'Segunda jugada'], terms: ['juego directo', 'pase largo', 'envio largo', 'segunda jugada', 'duelo aereo'],
    action: 'Proteger la zona de caída y preparar la segunda jugada.', priority: 'Importante', expectedImpact: 'Aumentar opciones de recuperar el segundo balón.',
    rationale: 'Los envíos directos o las segundas jugadas registrados requieren proteger tanto el duelo inicial como su continuación.',
    duel: { relation: 'Nuestros centrales y mediocentros vs su juego directo', type: 'Riesgo' },
  },
  {
    id: 'defend-transition', side: 'defense', field: 'strengths', values: ['Transiciones', 'Contraataque'], terms: ['transicion', 'contraataque', 'tras recuperacion', 'salida rapida'],
    action: 'Replegar tras pérdida y cerrar el primer pase hacia delante.', priority: 'Crítica', expectedImpact: 'Frenar el avance rival durante la transición.',
    rationale: 'La transición ofensiva está registrada como amenaza; proteger el primer pase reduce la posibilidad de correr con ventaja.',
    duel: { relation: 'Nuestra vigilancia ofensiva vs sus transiciones', type: 'Riesgo' },
  },
  {
    id: 'defend-set-piece', side: 'defense', field: 'strengths', values: ['ABP'], terms: ['abp', 'corner', 'falta lateral', 'balon parado', 'estrategia'],
    action: 'Evitar faltas laterales y defender el rechace en ABP.', priority: 'Importante', expectedImpact: 'Reducir acciones de estrategia y segundas finalizaciones.',
    rationale: 'La estrategia rival aparece respaldada por registros específicos; evitar concesiones y proteger el rechace limita esa vía.',
    duel: { relation: 'Nuestra defensa de área vs su estrategia', type: 'Riesgo' },
  },
  {
    id: 'attack-fullback-back', side: 'attack', field: 'weaknesses', values: ['Espalda lateral'], terms: ['espalda lateral', 'lateral salta', 'banda', 'carril exterior', 'intervalo lateral'],
    action: 'Atacar el espacio liberado a la espalda de sus laterales.', priority: 'Crítica', expectedImpact: 'Generar situaciones de ventaja en el carril exterior.',
    rationale: 'El espacio a la espalda lateral está registrado y respaldado por una evidencia táctica concreta.',
    duel: { relation: 'Nuestros extremos vs sus laterales', type: 'Oportunidad' },
  },
  {
    id: 'attack-interior-loss', side: 'attack', field: 'weaknesses', values: ['Pérdida interior'], terms: ['perdida interior', 'robo interior', 'recepcion interior', 'pase interior'],
    action: 'Provocar recepciones interiores bajo presión y saltar sobre el siguiente pase.', priority: 'Importante', expectedImpact: 'Aumentar opciones de recuperar cerca de su portería.',
    rationale: 'La pérdida interior registrada permite orientar la presión hacia una zona concreta de recuperación.',
    duel: { relation: 'Nuestra presión interior vs su primera progresión', type: 'Oportunidad' },
  },
  {
    id: 'attack-box-defense', side: 'attack', field: 'weaknesses', values: ['Defensa área'], terms: ['defensa area', 'pase atras', 'segundo palo', 'centro', 'area'],
    action: 'Buscar el pase atrás y ocupar el segundo palo con llegada escalonada.', priority: 'Importante', expectedImpact: 'Generar remates desde zonas de difícil ajuste defensivo.',
    rationale: 'Las dificultades registradas dentro del área permiten priorizar ocupaciones diferenciadas en lugar de centros sin ventaja.',
    duel: { relation: 'Nuestra ocupación del área vs su bloque defensivo', type: 'Oportunidad' },
  },
  {
    id: 'attack-defensive-transition', side: 'attack', field: 'weaknesses', values: ['Transición defensiva', 'Vigilancias'], terms: ['transicion defensiva', 'tras perdida', 'vigilancia', 'repliegue', 'desorganizado'],
    action: 'Acelerar tras recuperación antes de que recompongan sus vigilancias.', priority: 'Crítica', expectedImpact: 'Atacar espacios durante su reorganización defensiva.',
    rationale: 'La transición defensiva o las vigilancias aparecen registradas como vulnerabilidad y cuentan con apoyo observable.',
    duel: { relation: 'Nuestra primera salida tras robo vs su repliegue', type: 'Oportunidad' },
  },
  {
    id: 'attack-build-up', side: 'attack', field: 'weaknesses', values: ['Salida de balón'], terms: ['salida de balon', 'inicio', 'portero', 'central', 'presion salida'],
    action: 'Presionar su primera construcción y obligar al envío largo.', priority: 'Importante', expectedImpact: 'Provocar posesiones rivales menos controladas desde el inicio.',
    rationale: 'La salida está registrada como punto vulnerable y existe evidencia concreta sobre su primera construcción.',
    duel: { relation: 'Nuestra primera línea de presión vs su salida', type: 'Oportunidad' },
  },
  {
    id: 'attack-set-piece', side: 'attack', field: 'weaknesses', values: ['ABP defensiva'], terms: ['abp defensiva', 'corner defensivo', 'balon parado', 'rechace'],
    action: 'Atacar el rechace y fijar una segunda acción en ABP ofensiva.', priority: 'Opcional', expectedImpact: 'Aumentar opciones de segunda finalización.',
    rationale: 'La defensa de ABP aparece como vulnerabilidad respaldada por registros específicos.',
    duel: { relation: 'Nuestra segunda acción de ABP vs su defensa del rechace', type: 'Oportunidad' },
  },
  {
    id: 'attack-aerial', side: 'attack', field: 'weaknesses', values: ['Juego aéreo'], terms: ['juego aereo', 'duelo aereo', 'centro', 'remate'],
    action: 'Buscar centros con ventaja y cargar la zona de remate.', priority: 'Opcional', expectedImpact: 'Generar duelos aéreos favorables dentro del área.',
    rationale: 'La debilidad aérea está registrada y respaldada por acciones observadas de centro o remate.',
    duel: { relation: 'Nuestros rematadores colectivos vs su defensa aérea', type: 'Oportunidad' },
  },
];

const ruleProfileSupport = (rule, facts) => {
  const values = safeArray(facts.profile[rule.field]);
  const matched = values.filter((value) => rule.values.includes(value));
  return matched.length ? [profileEvidence(rule.field, matched)] : [];
};

const isValidAction = (action) => ACTION_VERBS.some((verb) => new RegExp(`^${verb}\\b`, 'i').test(clean(action)));

const recommendationFromRule = (rule, facts, ruleIndex) => {
  const profileSupport = ruleProfileSupport(rule, facts);
  const topicSupport = collectTopicSupport(facts, rule.terms);
  const support = [...profileSupport, ...topicSupport];
  const stats = buildSupportStats(support);
  const canApply = topicSupport.length > 0;
  if (!canApply || !isValidAction(rule.action) || !clean(rule.expectedImpact) || !clean(rule.rationale)) return null;
  const sources = uniq(support.map((row) => row.source)).filter((source) => RIVAL_ASSISTANT_SOURCE_LABELS.includes(source));
  if (!sources.length || !support.length) return null;
  const confidence = calculateConfidence(support);
  const priority = stats.evidenceLevel === 'individual_signal'
    ? 'Opcional'
    : stats.evidenceLevel === 'collective_hypothesis'
      ? rule.priority === 'Opcional' ? 'Opcional' : 'Importante'
      : rule.priority;
  const playerExplanation = stats.contributingPlayers.length
    ? `${stats.evidenceLabel} respaldada por ${stats.contributingPlayers.join(', ')}.`
    : `${stats.evidenceLabel} respaldada por ${stats.independentSourceCount} ${stats.independentSourceCount === 1 ? 'unidad independiente' : 'unidades independientes'}.`;
  return {
    id: rule.id,
    side: rule.side,
    action: rule.action,
    priority,
    expectedImpact: rule.expectedImpact,
    confidence,
    sources,
    rationale: rule.rationale,
    evidenceIds: uniq(support.map((row) => row.id)),
    contributingEvidenceIds: uniq(support.map((row) => row.id)),
    contributingPlayerIds: stats.contributingPlayerIds,
    contributingPlayers: stats.contributingPlayers,
    independentSourceCount: stats.independentSourceCount,
    sourceKinds: stats.sourceKinds,
    corroboratedByCollectiveSource: stats.corroboratedByCollectiveSource,
    evidenceLevel: stats.evidenceLevel,
    evidenceLabel: stats.evidenceLabel,
    traceabilityExplanation: playerExplanation,
    evidence: support.map((row) => ({
      id: row.id,
      source: row.source,
      text: row.text,
      context: row.context || '',
      date: row.date || '',
      playerId: row.playerId || '',
      playerKey: row.playerKey || '',
      playerName: row.playerName || '',
      sourceKind: row.sourceKind || '',
      sourceId: row.sourceId || '',
      evidenceUnitId: row.evidenceUnitId || '',
      derivedFromPlayerProfile: Boolean(row.derivedFromPlayerProfile),
      behaviourKey: row.behaviourKey || '',
      matchId: row.matchId || '',
    })),
    duel: rule.duel,
    ruleOrder: ruleIndex,
  };
};

export const sortRivalRecommendations = (recommendations) => safeArray(recommendations)
  .map((item, index) => ({ ...item, ruleOrder: Number.isFinite(item.ruleOrder) ? item.ruleOrder : index }))
  .sort((left, right) => (
    (priorityRank[left.priority] ?? 9) - (priorityRank[right.priority] ?? 9)
    || (confidenceRank[left.confidence] ?? 9) - (confidenceRank[right.confidence] ?? 9)
    || safeArray(right.sources).length - safeArray(left.sources).length
    || left.ruleOrder - right.ruleOrder
  ));

export const getRivalRecommendationListView = (recommendations, expanded = false, initialLimit = 5) => {
  const rows = safeArray(recommendations);
  return {
    items: expanded ? rows : rows.slice(0, initialLimit),
    hiddenCount: expanded ? 0 : Math.max(0, rows.length - initialLimit),
    expanded: Boolean(expanded),
  };
};

const buildRecommendations = (facts) => {
  const generated = recommendationRules
    .map((rule, index) => recommendationFromRule(rule, facts, index))
    .filter(Boolean);
  return {
    defense: sortRivalRecommendations(generated.filter((item) => item.side === 'defense')),
    attack: sortRivalRecommendations(generated.filter((item) => item.side === 'attack')),
  };
};

const buildDuels = (recommendations) => {
  const rows = [...recommendations.defense, ...recommendations.attack]
    .filter((recommendation) => recommendation.duel)
    .map((recommendation) => ({
      id: `duel:${recommendation.id}`,
      relation: recommendation.duel.relation,
      type: recommendation.duel.type,
      recommendation: recommendation.action,
      sources: recommendation.sources,
      confidence: recommendation.confidence,
      evidenceIds: recommendation.evidenceIds,
      priority: recommendation.priority,
      ruleOrder: recommendation.ruleOrder,
    }));
  return sortRivalRecommendations(rows).map(({ ruleOrder, ...row }) => row);
};

const countAnalyzedMatches = (input, facts) => {
  const explicit = safeArray(input.analyzedMatches).filter((match) => match?.hasAnalysis !== false);
  if (explicit.length) {
    return new Set(explicit.map((match, index) => (
      clean(match?.id || match?.date || match?.label) || `match-${index}`
    ))).size;
  }
  const evidenceMatches = facts.evidences
    .map((row) => clean(row.context).split(' · ')[1] || '')
    .filter(Boolean);
  return new Set(evidenceMatches.map((match) => normalize(match))).size;
};

const buildEvidenceCoverage = (facts) => {
  const profileCount = profileFieldRows(facts.profile).length;
  const rows = [
    { key: 'profile', source: 'Perfil', label: 'Perfil colectivo', count: profileCount, detail: `${profileCount} ${profileCount === 1 ? 'campo registrado' : 'campos registrados'}` },
    { key: 'board', source: 'Pizarra', label: 'Pizarra', count: facts.plays.length, detail: `${facts.plays.length} ${facts.plays.length === 1 ? 'jugada relevante' : 'jugadas relevantes'}` },
    { key: 'connections', source: 'Conexiones', label: 'Conexiones', count: facts.connections.length, detail: `${facts.connections.length} ${facts.connections.length === 1 ? 'relación registrada' : 'relaciones registradas'}` },
    { key: 'evidences', source: 'Evidencias', label: 'Evidencias', count: facts.evidences.length, detail: `${facts.evidences.length} ${facts.evidences.length === 1 ? 'observación' : 'observaciones'}` },
    { key: 'video', source: 'Vídeo', label: 'Vídeo', count: facts.videos.length, detail: facts.videos.length ? 'Disponible' : 'No disponible' },
    { key: 'staff', source: 'Staff', label: 'Staff', count: facts.staff.length, detail: `${facts.staff.length} ${facts.staff.length === 1 ? 'texto registrado' : 'textos registrados'}` },
  ];
  return rows.map((row) => ({ ...row, available: row.count > 0 }));
};

const buildLastUpdatedAt = (input, facts) => [
  clean(input.analysisUpdatedAt),
  ...facts.evidences.map((row) => row.date),
  ...facts.connections.map((row) => row.date),
  ...facts.plays.map((row) => row.date),
  ...facts.staff.map((row) => row.date),
  ...facts.videos.map((row) => row.date),
].filter(Boolean).sort(byNewest)[0] || '';

const buildProfileChips = (profile) => [
  { label: 'Salida', value: clean(profile.buildUp) },
  { label: 'Bloque', value: clean(profile.blockHeight) },
  { label: 'Presión', value: clean(profile.pressureType) },
  { label: 'Ritmo', value: clean(profile.attackingRhythm) },
  { label: 'Ataque', value: clean(profile.preferredAttack) },
  ...safeArray(profile.strengths).map((value) => ({ label: 'Fortaleza', value: clean(value), tone: 'positive' })),
  ...safeArray(profile.weaknesses).map((value) => ({ label: 'Debilidad', value: clean(value), tone: 'warning' })),
].filter((item) => item.value);

export const buildRivalCollectiveAssistant = (input = {}) => {
  const facts = buildFacts(input);
  const recommendations = buildRecommendations(facts);
  const behaviors = buildBehaviors(facts);
  const evidenceCoverage = buildEvidenceCoverage(facts);
  const duels = buildDuels(recommendations);
  const profileChips = buildProfileChips(facts.profile);
  return {
    rivalName: clean(input.rivalName) || 'Rival',
    systems: {
      own: clean(input.ownSystem),
      rival: clean(input.rivalSystem),
    },
    summary: {
      usualSystem: clean(input.rivalSystem) || 'Sin sistema registrado',
      analyzedMatchCount: countAnalyzedMatches(input, facts),
      lastUpdatedAt: buildLastUpdatedAt(input, facts),
      profileChips,
      emptyMessage: profileChips.length ? '' : RIVAL_ASSISTANT_EMPTY_STATES.profile,
    },
    behaviors,
    recommendations: {
      defense: recommendations.defense,
      attack: recommendations.attack,
      defenseEmptyMessage: RIVAL_ASSISTANT_EMPTY_STATES.defense,
      attackEmptyMessage: RIVAL_ASSISTANT_EMPTY_STATES.attack,
    },
    duels,
    duelsEmptyMessage: RIVAL_ASSISTANT_EMPTY_STATES.duels,
    evidenceCoverage,
    evidenceEmptyMessage: evidenceCoverage.some((row) => row.available) ? '' : RIVAL_ASSISTANT_EMPTY_STATES.sources,
  };
};

export const isRivalRecommendationActionable = (recommendation) => (
  isValidAction(recommendation?.action)
  && Boolean(clean(recommendation?.expectedImpact))
  && Boolean(clean(recommendation?.rationale))
  && safeArray(recommendation?.sources).length > 0
  && safeArray(recommendation?.evidenceIds).length > 0
);
