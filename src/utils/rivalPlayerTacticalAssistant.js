const safeArray = (value) => Array.isArray(value) ? value : [];
const clean = (value) => String(value ?? '').trim();
const normalize = (value) => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const sourcePriority = ['Perfil', 'Evidencias', 'Pizarra', 'Conexiones', 'Vídeo', 'Staff'];
const confidenceRank = { Alta: 0, Media: 1, Baja: 2 };
const weaknessTerms = /vulnerable|debil|presionable|lento|pierde|baja intensidad|llega tarde|ayuda poco|repliegue lento|sufre/;

export const PLAYER_TACTICAL_COACH_DISCLAIMER = 'Propuesta táctica basada en conocimiento futbolístico. No confirmada mediante evidencias del jugador.';

export const PLAYER_TACTICAL_SUGGESTED_QUESTIONS = Object.freeze([
  '¿Cómo defenderle?',
  '¿Cómo evitar que reciba?',
  '¿Dónde hacerle daño?',
  '¿Qué jugador nuestro debería marcarle?',
  '¿Cómo entrenaríamos este duelo?',
  '¿Qué riesgos genera?',
  '¿Qué ocurre si no juega?',
  '¿Cómo cambia el rival sin él?',
]);

const unique = (rows) => [...new Set(safeArray(rows).filter(Boolean))];
const sortSources = (sources) => unique(sources).sort((a, b) => sourcePriority.indexOf(a) - sourcePriority.indexOf(b));
const fullPlayerName = (player = {}) => clean(player.shirtName || player.shirt_name || player.name) || 'Jugador rival';
const playerKey = (player = {}) => clean(player.globalPlayerId || player.jugadorRivalId || player.id || player.name);
const getDate = (value) => {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? null : date;
};
const newestDate = (values) => safeArray(values)
  .map(getDate)
  .filter(Boolean)
  .sort((a, b) => b.getTime() - a.getTime())[0]?.toISOString() || '';

const independentFacts = (facts) => [...new Map(safeArray(facts).map((fact) => [fact.evidenceUnitId || fact.id, fact])).values()];

const evidenceConfidence = (facts) => {
  const rows = independentFacts(facts);
  const sources = new Set(rows.map((fact) => fact.source));
  if (rows.length >= 3 && sources.size >= 3) return 'Alta';
  if (rows.length >= 2 && sources.size >= 2) return 'Media';
  return 'Baja';
};

const makeFact = ({ id, text, source, date = '', topics = [], meta = {}, evidenceUnitId = '', sourceKind = '', sourceId = '', playerId = '', matchId = '' }) => ({
  id,
  text: clean(text),
  source,
  date,
  topics,
  meta,
  evidenceUnitId: clean(evidenceUnitId || id),
  sourceKind: clean(sourceKind || source).toLowerCase(),
  sourceId: clean(sourceId || id),
  playerId: clean(playerId),
  matchId: clean(matchId),
});

const matchesPlayerEvidence = (row, player) => {
  const expected = normalize(player?.name || player?.shirtName || player?.shirt_name);
  if (!expected) return false;
  const text = normalize(`${row?.playerName || ''} ${row?.observation || row?.text || ''}`);
  return clean(row?.playerKey) === playerKey(player) || text.includes(expected);
};

export const classifyPlayerConnectionContext = (connection = {}) => {
  const contextRows = safeArray(connection.contexts);
  const contextText = [
    connection.type,
    connection.phase,
    connection.category,
    connection.context,
    connection.situation,
    connection.label,
    ...contextRows.flatMap((row) => [row.phase, row.phaseLabel, row.category, row.situation, row.type]),
  ].map(clean).filter(Boolean).join(' ');
  const value = normalize(contextText);
  const matches = (pattern) => pattern.test(value);
  if (matches(/\babp\b|balon parado|corner|falta lateral|estrategia|set piece/)) {
    return { key: 'set-piece', label: 'ABP', reason: 'Contexto explícito de estrategia', contextText };
  }
  if (matches(/transicion|contraataque|tras robo|tras recuperacion|tras perdida|recuperacion inmediata/)) {
    return { key: 'transition', label: 'Transición', reason: 'Contexto explícito de transición', contextText };
  }
  if (matches(/finalizacion|ultimo pase|asistencia|centro|remate|area/)) {
    return { key: 'finishing', label: 'Finalización', reason: 'Contexto explícito de finalización', contextText };
  }
  if (matches(/salida|inicio|primera linea|construccion|progresion desde/)) {
    return { key: 'build-up', label: 'Salida / construcción', reason: 'Contexto explícito de inicio o progresión', contextText };
  }
  if (matches(/ataque posicional|juego posicional|amplitud|conexion interior|pase habitual/)) {
    return { key: 'positional', label: 'Ataque posicional', reason: 'Contexto explícito de ataque posicional', contextText };
  }
  return { key: 'unclassified', label: 'Sin contexto', reason: 'La conexión no incluye una fase táctica verificable', contextText };
};

const buildFacts = ({ player, profile, participation, observedEvidences, videoEvidences }) => {
  if (!player) return [];
  const facts = [];
  const currentPlayerId = playerKey(player);
  const profileUnitId = `player-profile:${currentPlayerId}`;
  const add = (fact) => {
    if (fact.text && !facts.some((row) => row.id === fact.id)) facts.push(fact);
  };
  [
    ['main-profile', profile?.mainProfile, 'Perfil principal'],
    ['secondary-profile', profile?.secondaryProfile, 'Perfil secundario'],
    ['foot', profile?.foot, 'Pie dominante'],
  ].forEach(([id, value, label]) => {
    if (clean(value)) add(makeFact({ id: `profile:${id}`, text: `${label}: ${value}`, source: 'Perfil', evidenceUnitId: profileUnitId, sourceKind: 'player_profile', sourceId: profileUnitId, playerId: currentPlayerId }));
  });
  [
    ['speed', profile?.speed, 'Velocidad'],
    ['technique', profile?.technique, 'Técnica'],
    ['aerial', profile?.aerial, 'Juego aéreo'],
    ['one-vs-one', profile?.oneVsOne, 'Uno contra uno'],
    ['defensive-work', profile?.defensiveWork, 'Trabajo defensivo'],
  ].forEach(([id, value, label]) => {
    if (Number(value) > 0) add(makeFact({ id: `profile:metric:${id}`, text: `${label}: ${Number(value)}/5`, source: 'Perfil', evidenceUnitId: profileUnitId, sourceKind: 'player_profile', sourceId: profileUnitId, playerId: currentPlayerId, meta: { metric: id, value: Number(value) } }));
  });
  safeArray(profile?.traits).forEach((trait, index) => add(makeFact({
    id: `profile:trait:${normalize(trait)}:${index}`,
    text: clean(trait),
    source: 'Perfil',
    evidenceUnitId: profileUnitId,
    sourceKind: 'player_profile',
    sourceId: profileUnitId,
    playerId: currentPlayerId,
    meta: { trait: true },
  })));
  const profileNotes = clean(profile?.notes).split(/\r?\n/).map(clean).filter(Boolean);
  profileNotes.forEach((note, index) => add(makeFact({
    id: `profile:notes:${index}`,
    text: note,
    source: 'Staff',
    evidenceUnitId: profileUnitId,
    sourceKind: 'player_profile',
    sourceId: profileUnitId,
    playerId: currentPlayerId,
    meta: { observation: true },
  })));
  safeArray(participation?.plays).forEach((play) => add(makeFact({
    id: `play:${play.id}`,
    text: `${play.name || 'Jugada guardada'} · ${play.phase || 'Sin fase'}`,
    source: 'Pizarra',
    date: clean(play.date || play.updatedAt || play.createdAt),
    topics: [clean(play.phase)],
    evidenceUnitId: `play:${play.id}`,
    sourceKind: 'play',
    sourceId: clean(play.id),
    playerId: currentPlayerId,
    meta: { play: true, phase: clean(play.phase) },
  })));
  safeArray(participation?.connections).forEach((connection, index) => {
    const classification = classifyPlayerConnectionContext(connection);
    add(makeFact({
      id: `connection:${normalize(connection.label)}:${index}`,
      text: `${connection.label} · ${Number(connection.count || 0)} conexión${Number(connection.count || 0) === 1 ? '' : 'es'}`,
      source: 'Conexiones',
      topics: classification.key === 'unclassified' ? [] : [classification.label, classification.contextText],
      evidenceUnitId: `connection:${clean(connection.key || connection.id || index)}`,
      sourceKind: 'connection',
      sourceId: clean(connection.key || connection.id || index),
      playerId: currentPlayerId,
      meta: { connection: true, count: Number(connection.count || 0), label: connection.label, connection, connectionClassification: classification },
    }));
  });
  safeArray(participation?.observations).forEach((observation, index) => add(makeFact({
    id: `board:observation:${index}`,
    text: clean(observation),
    source: 'Pizarra',
    evidenceUnitId: `board-observation:${index}`,
    sourceKind: 'play_observation',
    sourceId: `board-observation:${index}`,
    playerId: currentPlayerId,
    meta: { observation: true },
  })));
  safeArray(observedEvidences).filter((row) => matchesPlayerEvidence(row, player)).forEach((row, index) => add(makeFact({
    id: `evidence:${row.id || index}`,
    text: clean(row.observation || row.text),
    source: 'Evidencias',
    date: clean(row.date),
    topics: [clean(row.type)],
    evidenceUnitId: `evidence:${clean(row.observationId || row.id || index)}`,
    sourceKind: 'evidence',
    sourceId: clean(row.observationId || row.id || index),
    playerId: currentPlayerId,
    matchId: clean(row.matchId || row.match),
    meta: { observation: true, match: clean(row.match), matchId: clean(row.matchId || row.match), importance: clean(row.importance) },
  })));
  safeArray(videoEvidences).filter((row) => clean(row?.url || row?.label || row?.text)).forEach((row, index) => add(makeFact({
    id: `video:${row.id || index}`,
    text: clean(row.label || row.text || 'Vídeo relacionado'),
    source: 'Vídeo',
    date: clean(row.date || row.updatedAt),
    topics: safeArray(row.topics),
    evidenceUnitId: `video:${clean(row.id || index)}`,
    sourceKind: 'video',
    sourceId: clean(row.id || index),
    playerId: currentPlayerId,
    meta: { video: true, url: clean(row.url) },
  })));
  return facts;
};

const impactDefinitions = [
  ['build-up', 'Salida de balón', /salida|juego corto|juego largo|buen iniciador|constructor|primer pase/],
  ['construction', 'Construcción', /organizador|asociativo|constru|circulacion|recibe entre lineas|gira/],
  ['final-pass', 'Último pase', /ultimo pase|vertical|filtra|asistencia/],
  ['depth', 'Profundidad', /profundo|ataca espacio|ataca espalda|rapido al espacio|desmarque/],
  ['crosses', 'Centros', /centro|segundo palo/],
  ['finishing', 'Remate', /remat|finaliza|primer palo|llega al area/],
  ['aerial', 'Juego aéreo', /aereo|cabeza|segundo balon|segunda jugada/],
  ['transition', 'Transición', /transicion|contraataque|tras robo|tras perdida|amenaza transicion/],
  ['set-piece', 'ABP', /\babp\b|corner|falta lateral|estrategia/],
  ['pressing', 'Presión', /presion|salta|intenso|orienta salida/],
  ['cover', 'Coberturas', /cobertura|equilibra|repliegue|ayuda al lateral|protege/],
];

const factMatches = (fact, pattern) => pattern.test(normalize(`${fact.text} ${fact.topics.join(' ')}`));

const buildImpact = (facts) => impactDefinitions.map(([key, label, pattern]) => {
  const evidence = facts.filter((fact) => factMatches(fact, pattern));
  const units = independentFacts(evidence);
  const coverageLevel = units.length >= 3 ? 'Consolidada' : units.length >= 2 ? 'Parcial' : units.length === 1 ? 'Inicial' : 'Sin cobertura';
  return {
    key,
    label,
    count: evidence.length,
    evidenceCount: evidence.length,
    independentEvidenceCount: units.length,
    coverageLevel,
    sources: sortSources(evidence.map((fact) => fact.source)),
    evidenceIds: evidence.map((fact) => fact.id),
    evidenceUnitIds: units.map((fact) => fact.evidenceUnitId),
  };
});

const behaviorPhaseLabels = {
  'with-ball': 'Con balón',
  'without-ball': 'Sin balón',
  'offensive-transition': 'Transición ofensiva',
  'defensive-transition': 'Transición defensiva',
  'set-piece': 'ABP',
};

const behaviorConcepts = [
  ['attack-space', 'Ataca el espacio', /ataca espacio|ataca espalda|profundo|desmarque|rapido al espacio/],
  ['retreat', 'Repliegue', /repliegue|retorno/],
  ['aerial', 'Juego aéreo', /juego aereo|duelo aereo|rematador|cabeza/],
  ['dribble', 'Uno contra uno', /regate|desbordador|uno contra uno|1v1/],
  ['organizer', 'Organización y asociación', /organizador|asociativo|recibe entre lineas|gira|circulacion/],
  ['pressing', 'Presión', /presion|salta|intenso|orienta salida/],
  ['coverage', 'Cobertura', /cobertura|equilibra|ayuda al lateral|protege/],
  ['finishing', 'Finalización', /centro|remat|finaliza|ultimo pase|asistencia/],
];

export const classifyPlayerBehavior = (fact = {}) => {
  const value = normalize(`${fact.text || ''} ${safeArray(fact.topics).join(' ')}`);
  const concept = behaviorConcepts.find(([, , pattern]) => pattern.test(value));
  const explicitSetPiece = /\babp\b|corner|balon parado|falta lateral|estrategia/.test(value);
  const explicitOffensiveTransition = /transicion ofensiva|contraataque|tras robo|tras recuperacion/.test(value);
  const explicitDefensiveTransition = /transicion defensiva|tras perdida|presion tras perdida/.test(value);
  let primaryPhase = '';
  const secondaryPhases = [];
  let reason = '';

  if (concept?.[0] === 'attack-space') {
    primaryPhase = 'with-ball';
    reason = 'Comportamiento ofensivo principal';
    if (explicitOffensiveTransition) secondaryPhases.push('offensive-transition');
  } else if (concept?.[0] === 'retreat') {
    primaryPhase = 'without-ball';
    reason = 'Comportamiento defensivo principal';
    if (explicitDefensiveTransition) secondaryPhases.push('defensive-transition');
  } else if (concept?.[0] === 'aerial') {
    primaryPhase = /defiende|marca|despeje/.test(value) ? 'without-ball' : 'with-ball';
    reason = 'Juego aéreo sin contexto de estrategia';
    if (explicitSetPiece) secondaryPhases.push('set-piece');
  } else if (explicitSetPiece) {
    primaryPhase = 'set-piece';
    reason = 'La evidencia incluye contexto explícito de estrategia';
  } else if (explicitOffensiveTransition) {
    primaryPhase = 'offensive-transition';
    reason = 'La evidencia incluye contexto tras recuperación';
  } else if (explicitDefensiveTransition) {
    primaryPhase = 'defensive-transition';
    reason = 'La evidencia incluye contexto tras pérdida';
  } else if (/organizador|asociativo|regate|conduce|vertical|centro|remat|juego corto|juego largo|recibe|gira|profundo|espacio/.test(value)) {
    primaryPhase = 'with-ball';
    reason = 'Acción registrada con balón';
  } else if (/presion|roba|defiende|marca|cobertura|equilibra|salta|intenso|ayuda/.test(value)) {
    primaryPhase = 'without-ball';
    reason = 'Acción registrada sin balón';
  }
  if (!primaryPhase) return null;
  return {
    behaviourKey: concept?.[0] || primaryPhase,
    behaviourLabel: concept?.[1] || behaviorPhaseLabels[primaryPhase],
    primaryPhase,
    secondaryPhases,
    reason,
  };
};

const buildBehaviors = (facts) => {
  const classified = facts.map((fact) => ({ fact, classification: classifyPlayerBehavior(fact) })).filter((row) => row.classification);
  return Object.entries(behaviorPhaseLabels).map(([key, label]) => {
    const rows = classified.filter((row) => row.classification.primaryPhase === key);
    const evidence = rows.map((row) => row.fact);
    return {
      key,
      label,
      items: rows.map(({ fact, classification }) => ({
        id: fact.id,
        text: fact.text,
        source: fact.source,
        date: fact.date,
        behaviourKey: classification.behaviourKey,
        secondaryPhases: classification.secondaryPhases,
        classificationReason: classification.reason,
      })),
      confidence: evidenceConfidence(evidence),
      sources: sortSources(evidence.map((fact) => fact.source)),
      lastObservedAt: newestDate(evidence.map((fact) => fact.date)),
    };
  }).filter((group) => group.items.length);
};

const recommendationRules = [
  {
    id: 'protect-depth',
    pattern: /rapido al espacio|ataca espacio|ataca espalda|profundo|desmarque/,
    defense: ['Proteger la espalda antes de saltar.', 'Evitar que reciba corriendo hacia portería.'],
    impact: 'Reducir recepciones con ventaja en profundidad.',
    priority: 'Crítica',
  },
  {
    id: 'deny-turn',
    pattern: /recibe entre lineas|gira|juego de espaldas|asociativo/,
    defense: ['Impedir que gire tras la recepción.', 'Presionar su primer control con cobertura interior.'],
    impact: 'Limitar su continuidad y el acceso al siguiente pase.',
    priority: 'Importante',
  },
  {
    id: 'individual-duel',
    pattern: /regate|desbordador|uno contra uno|1v1|pie cambiado/,
    defense: ['Orientarle hacia el perfil menos peligroso.', 'Preparar una ayuda antes de que reciba perfilado.'],
    impact: 'Reducir situaciones de uno contra uno limpio.',
    priority: 'Crítica',
  },
  {
    id: 'aerial',
    pattern: /aereo|rematador|primer palo|segundo palo|finalizador/,
    defense: ['Defender su entrada al área con contacto previo.', 'Controlar primer remate y segunda jugada.'],
    impact: 'Reducir su influencia en centros y rechaces.',
    priority: 'Importante',
  },
  {
    id: 'press-vulnerability',
    pattern: /vulnerable presionado|presionable|debil bajo presion/,
    attack: ['Presionarle inmediatamente después del control.', 'Cerrar su apoyo corto y obligarle a decidir rápido.'],
    impact: 'Provocar una salida menos limpia o una pérdida forzada.',
    priority: 'Crítica',
  },
  {
    id: 'attack-back',
    pattern: /sufre a la espalda|lento en espacios|repliegue lento|pierde segundo palo|pierde marca/,
    attack: ['Atacarle a la espalda tras fijarle fuera de zona.', 'Buscar una segunda llegada en el espacio que abandona.'],
    impact: 'Explotar una vulnerabilidad defensiva registrada.',
    priority: 'Importante',
  },
  {
    id: 'exploit-jump',
    pattern: /agresivo al salto|salta a presion|se precipita/,
    attack: ['Fijar su salto y jugar sobre el espacio liberado.', 'Buscar al tercer hombre después de atraerle.'],
    impact: 'Atacar el espacio que deja al abandonar su zona.',
    priority: 'Importante',
  },
  {
    id: 'weak-foot',
    pattern: /debil pierna|perfil menos dominante|usa perfil menos dominante/,
    attack: ['Obligarle a defender y jugar con su perfil menos dominante.'],
    impact: 'Llevar el duelo hacia una limitación registrada.',
    priority: 'Opcional',
  },
];

const buildRecommendations = (facts, kind) => recommendationRules.flatMap((rule) => {
  const actions = rule[kind];
  if (!actions) return [];
  const evidence = facts.filter((fact) => factMatches(fact, rule.pattern));
  if (!evidence.length) return [];
  return actions.map((action, index) => ({
    id: `${rule.id}:${kind}:${index}`,
    action,
    expectedImpact: rule.impact,
    priority: rule.priority,
    confidence: evidenceConfidence(evidence),
    sources: sortSources(evidence.map((fact) => fact.source)),
    evidenceIds: evidence.map((fact) => fact.id),
    rationale: evidence.slice(0, 3).map((fact) => fact.text).join(' · '),
  }));
});

const trendCandidateFacts = (facts) => facts
  .filter((fact) => fact.meta.trait || fact.source === 'Evidencias')
  .filter((fact) => !/^pie dominante|^perfil/i.test(fact.text));

const buildRegisteredBehaviors = (facts) => trendCandidateFacts(facts).map((fact) => {
  const classification = classifyPlayerBehavior(fact);
  return {
    id: `behavior:${fact.id}`,
    type: 'recorded_behavior',
    label: fact.text,
    behaviourKey: classification?.behaviourKey || normalize(fact.text),
    source: fact.source,
    date: fact.date,
    dateLabel: fact.date ? '' : 'Fecha no registrada',
    evidenceUnitId: fact.evidenceUnitId,
  };
});

const buildTrends = (facts) => {
  const groups = new Map();
  trendCandidateFacts(facts).forEach((fact) => {
    const classification = classifyPlayerBehavior(fact);
    const key = classification?.behaviourKey || normalize(fact.text);
    if (!groups.has(key)) groups.set(key, { key, label: classification?.behaviourLabel || fact.text, facts: [] });
    groups.get(key).facts.push(fact);
  });
  return [...groups.values()].flatMap((group) => {
    const units = independentFacts(group.facts);
    const matches = unique(group.facts.map((fact) => fact.matchId || fact.meta.matchId || fact.meta.match));
    const declaredFrequency = Math.max(0, ...group.facts.map((fact) => Number(fact.meta.frequency || 0)));
    if (units.length < 2 && matches.length < 2 && declaredFrequency < 2) return [];
    const frequency = matches.length >= 2
      ? `${matches.length} partidos`
      : declaredFrequency >= 2
        ? `${declaredFrequency} repeticiones registradas`
        : `${units.length} evidencias independientes`;
    return [{
      id: `trend:${group.key}`,
      type: 'observed_trend',
      label: group.label,
      frequency,
      lastObservedAt: newestDate(group.facts.map((fact) => fact.date)),
      dateLabel: newestDate(group.facts.map((fact) => fact.date)) ? '' : 'Fecha no registrada',
      confidence: evidenceConfidence(group.facts),
      sources: sortSources(group.facts.map((fact) => fact.source)),
      evidenceIds: group.facts.map((fact) => fact.id),
      evidenceUnitIds: units.map((fact) => fact.evidenceUnitId),
    }];
  });
};

const buildRelations = (participation) => safeArray(participation?.connections)
  .filter((row) => clean(row.label) && Number(row.count || 0) > 0)
  .sort((a, b) => Number(b.count || 0) - Number(a.count || 0))
  .map((row, index) => ({
    id: `relation:${index}:${normalize(row.label)}`,
    label: row.label,
    count: Number(row.count || 0),
    source: 'Conexiones',
    classification: classifyPlayerConnectionContext(row),
  }));

const buildPhases = (participation) => {
  const counts = new Map();
  safeArray(participation?.plays).forEach((play) => {
    const phase = clean(play.phase) || 'Sin fase';
    counts.set(phase, (counts.get(phase) || 0) + 1);
  });
  return [...counts.entries()].map(([label, count]) => ({ label, count }));
};

const buildObservations = (facts) => facts
  .filter((fact) => fact.meta.observation)
  .sort((a, b) => (getDate(b.date)?.getTime() || 0) - (getDate(a.date)?.getTime() || 0))
  .map((fact) => ({
    id: fact.id,
    text: fact.text,
    source: fact.source,
    date: fact.date,
    author: 'Autor no registrado',
  }));

const profileCoverage = (profile) => {
  const checks = [
    clean(profile?.position),
    clean(profile?.foot),
    clean(profile?.mainProfile),
    clean(profile?.secondaryProfile),
    safeArray(profile?.traits).length,
    clean(profile?.notes),
  ];
  return { completed: checks.filter(Boolean).length, total: checks.length };
};

const buildInfluence = ({ player, participation, facts }) => {
  const plays = Number(participation?.playCount || safeArray(participation?.plays).length || 0);
  const connections = Number(participation?.connectionsCreated || 0) + Number(participation?.connectionsReceived || 0);
  const observations = facts.filter((fact) => fact.meta.observation).length;
  if (plays >= 3 && connections >= 4 && new Set(safeArray(participation?.phases)).size >= 2) {
    return { key: 'structural', label: 'Jugador estructural', reason: `${plays} jugadas · ${connections} conexiones · ${new Set(safeArray(participation?.phases)).size} fases` };
  }
  if (plays >= 2 || connections >= 3 || (player?.isKey && facts.length >= 2)) {
    return { key: 'important', label: 'Jugador importante', reason: `${plays} jugadas · ${connections} conexiones · ${observations} observaciones` };
  }
  if (facts.length) return { key: 'complementary', label: 'Jugador complementario', reason: `${facts.length} evidencias disponibles` };
  return { key: 'residual', label: 'Jugador residual', reason: 'Sin participación táctica identificable en los datos cargados' };
};

const buildDuels = (duelCandidates, defensivePlan) => safeArray(duelCandidates).map((duel, index) => ({
  id: `duel:${index}:${normalize(duel.caudalName)}`,
  duel: `${duel.caudalName} vs ${duel.rivalName}`,
  favorability: duel.tone === 'red' ? 'Muy exigente' : duel.tone === 'green' ? 'Favorable' : 'Equilibrado',
  risk: clean(duel.reason) || 'Riesgo pendiente de validar',
  reason: clean(duel.reason) || 'Basado en el perfil registrado',
  instruction: defensivePlan[0]?.action || 'No existe una consigna respaldada por evidencias.',
  expectedImpact: defensivePlan[0]?.expectedImpact || 'Sin impacto estimado por falta de evidencias.',
  confidence: defensivePlan[0]?.confidence || 'Baja',
  sources: defensivePlan[0]?.sources || [],
}));

export const buildRivalPlayerTacticalModel = (input = {}) => {
  const player = input.player || null;
  const profile = input.profile || {};
  const participation = input.participation || {};
  const facts = buildFacts({
    player,
    profile,
    participation,
    observedEvidences: input.observedEvidences,
    videoEvidences: input.videoEvidences,
  });
  const defensivePlan = buildRecommendations(facts, 'defense');
  const attackingPlan = buildRecommendations(facts, 'attack');
  const coverage = profileCoverage(profile);
  const influence = buildInfluence({ player, participation, facts });
  const sourceCount = new Set(facts.map((fact) => fact.source)).size;
  const maturity = facts.length >= 7 && sourceCount >= 3
    ? { key: 'consolidated', label: 'Análisis consolidado' }
    : facts.length >= 2
      ? { key: 'partial', label: 'Análisis parcial' }
      : { key: 'initial', label: 'Información inicial' };
  return {
    player,
    playerKey: playerKey(player),
    summary: {
      name: fullPlayerName(player),
      image: clean(player?.image || player?.imageUrl || player?.photoUrl),
      position: clean(profile.position || player?.specificPosition || player?.position),
      foot: clean(profile.foot || player?.foot),
      height: clean(player?.height || player?.altura || player?.heightCm),
      age: clean(player?.age),
      role: clean(safeArray(participation?.roles)[0]?.label || player?.role),
      mainProfile: clean(profile.mainProfile),
      secondaryProfile: clean(profile.secondaryProfile),
      scoutingState: coverage.completed === coverage.total ? 'Perfil completo' : coverage.completed ? 'Perfil parcial' : 'Perfil pendiente',
      maturity,
      influence,
      lastUpdatedAt: newestDate(facts.map((fact) => fact.date)),
    },
    facts,
    impact: buildImpact(facts),
    behaviors: buildBehaviors(facts),
    registeredBehaviors: buildRegisteredBehaviors(facts),
    recommendations: { defense: defensivePlan, attack: attackingPlan },
    trends: buildTrends(facts),
    relations: buildRelations(participation),
    phases: buildPhases(participation),
    scouting: {
      matches: unique(facts.map((fact) => fact.meta.match)).length,
      videos: facts.filter((fact) => fact.source === 'Vídeo').length,
      plays: Number(participation?.playCount || safeArray(participation?.plays).length || 0),
      connections: Number(participation?.connectionsCreated || 0) + Number(participation?.connectionsReceived || 0),
      observations: facts.filter((fact) => fact.meta.observation).length,
      profileCoverage: coverage,
      confidence: evidenceConfidence(facts),
      sources: sortSources(facts.map((fact) => fact.source)),
    },
    observations: buildObservations(facts),
    duels: buildDuels(input.duelCandidates, defensivePlan),
  };
};

export const buildRivalPlayerCollectiveSignals = (rows = []) => safeArray(rows).flatMap(({ player, profile }) => {
  const name = fullPlayerName(player);
  const key = playerKey(player) || normalize(name);
  const sourceId = `player-profile:${key}`;
  const observations = [
    clean(profile?.mainProfile) ? `Perfil principal: ${profile.mainProfile}` : '',
    clean(profile?.secondaryProfile) ? `Perfil secundario: ${profile.secondaryProfile}` : '',
    ...safeArray(profile?.traits),
    clean(profile?.notes) ? `Observación del staff: ${profile.notes}` : '',
  ].filter(Boolean);
  return observations.map((observation, index) => {
    const classification = classifyPlayerBehavior({ text: observation, topics: [] });
    return {
    id: `${sourceId}:${index}`,
    type: 'Jugador',
    importance: 'Media',
    observation: `${name} · ${observation}`,
    date: '',
    scope: 'individual',
    playerId: key,
    playerKey: key,
    playerName: name,
    sourceKind: 'player_profile',
    sourceId,
    evidenceUnitId: sourceId,
    evidenceUnitIds: [sourceId],
    observationId: '',
    matchId: '',
    behaviourKey: classification?.behaviourKey || normalize(observation),
    derivedFromPlayerProfile: true,
    corroboratedByCollectiveSource: false,
    independentSourceCount: 1,
    collectiveStrength: player?.isStructural || profile?.influence === 'structural' ? 'structural' : 'individual',
  };
  });
});

const answerFromEvidence = (question, model) => {
  const q = normalize(question);
  if (/jugador nuestro|quien.*(?:marca|emparej)|marcarle|emparej|perfil nuestro|perfil.*duelo/.test(q)) {
    const duel = model.duels[0];
    if (!duel || !duel.sources.length) return {
      reading: 'No existe un emparejamiento respaldado por evidencias suficientes.',
      instruction: 'Registrar el perfil del jugador y el posible duelo antes de asignar una marca.',
      risks: 'Elegir un defensor únicamente por su posición no constituye una recomendación fiable.',
      alternative: 'Defender por zona hasta disponer de un emparejamiento observado.',
      sources: [],
      confidence: 'Baja',
      evidenceIds: [],
    };
    return {
      reading: `${duel.duel} · ${duel.reason}.`,
      instruction: duel.instruction,
      risks: duel.risk,
      alternative: 'Mantener una cobertura zonal si el emparejamiento obliga a abandonar la estructura.',
      sources: duel.sources,
      confidence: duel.confidence,
      evidenceIds: [],
    };
  }
  const wantsAttack = /dano|debil|atacar/.test(q);
  const wantsDefense = /defender|reciba|riesgo|marcar/.test(q);
  const plan = wantsAttack
    ? model.recommendations.attack
    : wantsDefense
      ? model.recommendations.defense
      : [...model.recommendations.defense, ...model.recommendations.attack];
  if (/si no juega|sin el/.test(q)) {
    return {
      reading: model.summary.influence.key === 'residual'
        ? 'No existen evidencias suficientes para medir cómo cambia el rival sin este jugador.'
        : `Su influencia registrada es: ${model.summary.influence.label}. ${model.summary.influence.reason}.`,
      instruction: 'Validar el once y observar qué jugador asume sus conexiones y fases antes de ajustar el plan.',
      risks: 'No existen datos comparativos suficientes para afirmar cómo se comporta el rival sin él.',
      alternative: 'Mantener el plan colectivo y ajustar únicamente si cambia una relación observada.',
      sources: model.scouting.sources,
      confidence: model.scouting.confidence,
      evidenceIds: model.facts.map((fact) => fact.id),
    };
  }
  const primary = plan[0];
  if (!primary) return {
    reading: 'No existen evidencias suficientes para responder sobre este jugador.',
    instruction: 'Completar el perfil y registrar comportamientos antes de crear una consigna.',
    risks: 'Una respuesta específica no estaría respaldada por el scouting disponible.',
    alternative: 'Usar Criterio del entrenador para una propuesta general claramente identificada.',
    sources: [],
    confidence: 'Baja',
    evidenceIds: [],
  };
  return {
    reading: primary.rationale,
    instruction: plan.slice(0, 2).map((row) => row.action).join(' '),
    risks: model.trends.length ? `Tendencia a vigilar: ${model.trends[0].label}.` : 'No existe un riesgo adicional respaldado por evidencias.',
    alternative: plan[2]?.action || 'Mantener la estructura y validar el comportamiento en sus primeras intervenciones.',
    sources: sortSources(plan.slice(0, 2).flatMap((row) => row.sources)),
    confidence: plan.slice(0, 2).map((row) => row.confidence).sort((a, b) => confidenceRank[a] - confidenceRank[b])[0] || 'Baja',
    evidenceIds: unique(plan.slice(0, 2).flatMap((row) => row.evidenceIds)),
  };
};

const coachTemplates = [
  [/defender|reciba/, 'Identificar su recepción preferida y decidir de antemano la orientación del duelo.', 'Cerrar el acceso interior, llegar durante el pase y proteger la espalda del defensor que salta.', 'Saltar tarde puede permitirle girar; saltar sin cobertura puede liberar al siguiente receptor.', 'Defender en bloque medio y negar primero la continuidad si la presión individual no es estable.'],
  [/dano|atacar/, 'El duelo ofensivo debe obligarle a defender una situación incómoda de forma repetida.', 'Fijarle, moverle fuera de su zona y atacar el espacio que deje con una segunda acción.', 'Forzar el duelo sin ventaja puede facilitar su defensa y exponer la transición.', 'Cambiar de orientación y volver a aislarle si recibe ayuda cercana.'],
  [/marcar/, 'El emparejamiento debe valorar velocidad, contacto, lectura y coberturas disponibles.', 'Elegir al defensor que pueda cumplir la consigna sin romper la estructura colectiva.', 'Una marca nominal puede arrastrar al defensor fuera de su zona.', 'Asignar responsabilidades por zona y activar el seguimiento solo ante un desencadenante claro.'],
  [/entren/, 'El duelo debe entrenarse con el contexto y las ayudas que aparecerán en partido.', 'Repetir recepción, orientación defensiva, ayuda y respuesta si supera la primera acción.', 'Un ejercicio aislado puede ocultar los problemas de cobertura del duelo real.', 'Reducir la tarea a dos desencadenantes si el tiempo semanal es limitado.'],
  [/riesgo/, 'El principal riesgo individual depende de dónde recibe y de qué apoyo dispone.', 'Definir qué acción se concede y qué acción debe impedirse en cada zona.', 'Intentar anular todas sus acciones puede desordenar el bloque.', 'Aceptar la recepción menos peligrosa y proteger la acción posterior.'],
  [/si no juega|sin el/, 'La ausencia de un jugador puede cambiar relaciones y responsabilidades sin alterar el sistema nominal.', 'Observar quién ocupa su altura, quién recibe sus pases y quién asume su fase dominante.', 'Asumir que el sustituto repetirá su comportamiento puede conducir a un ajuste equivocado.', 'Mantener el plan inicial hasta identificar un cambio real en las primeras posesiones.'],
];

const answerPairingFromCoach = (model) => {
  const duel = safeArray(model?.duels)[0];
  if (duel?.duel && duel?.sources?.length) {
    return {
      reading: `El emparejamiento registrado es ${duel.duel}.`,
      instruction: duel.instruction,
      risks: duel.risk,
      alternative: 'Mantener cobertura zonal si el seguimiento individual rompe la estructura.',
      sources: duel.sources,
      confidence: duel.confidence,
      evidenceIds: [],
    };
  }
  const summary = model?.summary || {};
  const metricFacts = safeArray(model?.facts).filter((fact) => fact.meta?.metric);
  const metric = (key) => Number(metricFacts.find((fact) => fact.meta.metric === key)?.meta.value || 0);
  const needs = [];
  if (metric('speed') >= 4 || /extremo|delantero/.test(normalize(summary.position))) needs.push('velocidad para proteger la espalda');
  if (metric('aerial') >= 4 || /rematador|juego aereo/.test(normalize(safeArray(model?.facts).map((fact) => fact.text).join(' ')))) needs.push('capacidad aérea y contacto');
  if (metric('one-vs-one') >= 4) needs.push('temporización y defensa del uno contra uno');
  if (summary.foot) needs.push(`orientación para llevarle lejos de su pie ${summary.foot.toLowerCase()}`);
  if (!needs.length) needs.push('lectura posicional, capacidad de temporizar y cobertura cercana');
  return {
    reading: `No hay datos comparables suficientes de nuestros jugadores para proponer un nombre concreto. El duelo requiere ${needs.join(', ')}.`,
    instruction: 'Elegir el perfil que reúna esas capacidades sin romper las coberturas del bloque.',
    risks: 'Asignar un nombre sin datos comparables convertiría una orientación de perfil en una certeza no respaldada.',
    alternative: 'Defender por zona y activar el seguimiento únicamente con un desencadenante claro.',
    sources: [],
    confidence: 'Baja',
    evidenceIds: [],
  };
};

const answerFromCoach = (question, model) => {
  const normalizedQuestion = normalize(question);
  if (/jugador nuestro|quien.*(?:marca|emparej)|marcarle|emparej|perfil nuestro|perfil.*duelo/.test(normalizedQuestion)) {
    return answerPairingFromCoach(model);
  }
  const template = coachTemplates.find(([pattern]) => pattern.test(normalize(question))) || coachTemplates[0];
  return {
    reading: template[1],
    instruction: template[2],
    risks: template[3],
    alternative: template[4],
    sources: [],
    confidence: 'Baja',
    evidenceIds: [],
  };
};

export const answerRivalPlayerTacticalQuestion = ({ question, mode = 'evidence', model } = {}) => {
  if (!clean(question) || !model) return null;
  const answer = mode === 'coach' ? answerFromCoach(question, model) : answerFromEvidence(question, model);
  return {
    ...answer,
    mode,
    disclaimer: mode === 'coach' ? PLAYER_TACTICAL_COACH_DISCLAIMER : '',
  };
};
