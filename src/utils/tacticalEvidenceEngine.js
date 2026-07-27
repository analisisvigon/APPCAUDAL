const safeArray = (value) => Array.isArray(value) ? value : [];
const safeObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const clean = (value) => String(value ?? '').trim();
const normalize = (value) => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const phaseNames = {
  defensive: 'Fase defensiva',
  offensive: 'Fase ofensiva',
  transition: 'Transiciones',
  set_piece: 'ABP',
};

const planQuestions = {
  'Con balón': '¿Cómo progresamos con balón?',
  'Sin balón': '¿Dónde presionamos y qué protegemos sin balón?',
  Transición: '¿Qué hacemos en transiciones tras pérdida y recuperación?',
  ABP: '¿Qué hacemos en ABP y estrategia?',
  'Vigilancias prioritarias': '¿Qué vigilancias debemos priorizar?',
  'Jugadores a vigilar': '¿Qué jugadores debemos vigilar?',
  Riesgos: '¿Qué riesgos debemos evitar?',
  'Claves del partido': '¿Cuáles son las claves del partido?',
};

const explicitMovementTerms = [
  [/\bapoy(?:o|a|ar|os|an)\b/, 'Apoyo'],
  [/\b(?:ruptura|rompe|romper)\b/, 'Ruptura'],
  [/\bamplitud\b/, 'Amplitud'],
  [/\bfij(?:a|ar|acion|an)\b/, 'Fijación'],
  [/\bdesmar(?:que|car|ques|ca)\b/, 'Desmarque'],
  [/\b(?:cobertura|cubre|cubrir)\b/, 'Cobertura'],
  [/\bpermut(?:a|ar|an)\b/, 'Permuta'],
  [/\bvigil(?:a|ar|ancia|an)\b/, 'Vigilancia'],
];

const finitePoint = (value) => {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
};

const percentage = (value, total) => total ? Math.round((value / total) * 100) : 0;

const addCount = (map, key, seed, amount = 1, playId = '') => {
  if (!key) return;
  if (!map.has(key)) map.set(key, { ...seed, count: 0, playIds: new Set(), countByPlay: new Map() });
  const row = map.get(key);
  row.count += amount;
  if (playId) {
    row.playIds.add(playId);
    row.countByPlay.set(playId, (row.countByPlay.get(playId) || 0) + amount);
  }
};

const finalizeRanking = (map) => [...map.values()]
  .map((row) => ({ ...row, playIds: [...row.playIds], countByPlay: Object.fromEntries(row.countByPlay) }))
  .sort((left, right) => right.count - left.count || clean(left.label).localeCompare(clean(right.label), 'es'));

const playerIdentity = (player) => clean(player?.playerId || player?.boardKey);

const getContextPlayer = (context, boardKey) => (
  safeArray(context?.involvedPlayers).find((player) => clean(player.boardKey) === clean(boardKey)) || null
);

const getPlayerTeam = (player) => clean(player?.boardKey).split(':')[0];

const nearestPlayer = (context, point, { team = '', maxDistance = 9 } = {}) => {
  const target = finitePoint(point);
  if (!target) return null;
  const nearest = Object.entries(safeObject(context?.playerPositions))
    .filter(([boardKey]) => !team || boardKey.startsWith(`${team}:`))
    .map(([boardKey, value]) => {
      const position = finitePoint(value);
      return position
        ? { boardKey, distance: Math.hypot(position.x - target.x, position.y - target.y) }
        : null;
    })
    .filter(Boolean)
    .sort((left, right) => left.distance - right.distance)[0];
  return nearest && nearest.distance <= maxDistance ? getContextPlayer(context, nearest.boardKey) : null;
};

const getPlayerLabel = (player) => clean(player?.name) || clean(player?.specificPosition) || 'Jugador sin identificar';

const getRoleLabel = (player) => clean(player?.specificPosition || player?.naturalPosition) || getPlayerLabel(player);

const getCategory = (context) => (
  clean(
    context?.playStyleLabel
    || context?.behaviourLabel
    || context?.transitionTypeLabel
    || context?.setPieceTypeLabel
    || context?.situationLabel
  ) || 'Sin categoría'
);

const getTacticalLane = (x, team) => {
  const visualBand = x <= 18
    ? 'outer_left'
    : x < 40
      ? 'inner_left'
      : x <= 60
        ? 'centre'
        : x < 82
          ? 'inner_right'
          : 'outer_right';
  const rivalLabels = {
    outer_left: 'Banda derecha',
    inner_left: 'Carril interior derecho',
    centre: 'Zona central',
    inner_right: 'Carril interior izquierdo',
    outer_right: 'Banda izquierda',
  };
  const caudalLabels = {
    outer_left: 'Banda izquierda',
    inner_left: 'Carril interior izquierdo',
    centre: 'Zona central',
    inner_right: 'Carril interior derecho',
    outer_right: 'Banda derecha',
  };
  return (team === 'rival' ? rivalLabels : caudalLabels)[visualBand];
};

const getBroadLane = (lane) => {
  if (/derech/i.test(lane)) return 'Derecha';
  if (/izquierd/i.test(lane)) return 'Izquierda';
  return 'Centro';
};

const getFieldHalf = (y, team) => {
  const ownHalf = team === 'rival' ? y < 50 : y >= 50;
  return ownHalf ? 'Campo propio' : 'Campo rival';
};

const confidenceFromSample = (sample, share = 0) => {
  if (sample >= 8 && (!share || share >= 75)) return 'Alta';
  if (sample >= 4) return 'Media';
  return 'Baja';
};

const uniqueSources = (contexts, extra = []) => {
  const rows = new Map();
  [...safeArray(contexts).flatMap((context) => safeArray(context.sources)), ...safeArray(extra)].forEach((source) => {
    const key = `${clean(source?.type)}:${clean(source?.id)}`;
    if (key !== ':') rows.set(key, source);
  });
  return [...rows.values()];
};

const phasesForQuestion = (question) => {
  const q = normalize(question);
  if (/abp|estrategia|corner|balon parado/.test(q)) return ['set_piece'];
  if (/transicion|perdida|recuperacion/.test(q)) return ['transition'];
  if (/sin balon|presion|bloque|proteger|vigilancia/.test(q)) return ['defensive', 'offensive'];
  if (/con balon|progres|salida|construccion|espacio|superioridad/.test(q)) return ['offensive', 'defensive'];
  return [];
};

const emptyParticipation = () => ({
  playCount: 0,
  plays: [],
  phases: [],
  connections: [],
  connectionsCreated: 0,
  connectionsReceived: 0,
  movements: 0,
  movementTypes: [],
  passesAsLauncher: 0,
  passesAsReceiver: 0,
  roles: [],
  observations: [],
});

export const createEmptyTacticalEvidenceReport = () => ({
  generatedAt: null,
  team: 'rival',
  playCount: 0,
  contexts: [],
  contextRows: [],
  patterns: [],
  connections: [],
  players: [],
  zones: {
    total: 0,
    broad: [
      { key: 'right', label: 'Derecha', count: 0, percentage: 0 },
      { key: 'left', label: 'Izquierda', count: 0, percentage: 0 },
      { key: 'centre', label: 'Centro', count: 0, percentage: 0 },
    ],
    lanes: [],
    halves: [],
  },
  movements: [],
  risks: [],
  sources: [],
  planRecommendations: Object.fromEntries(Object.keys(planQuestions).map((title) => [title, {
    conclusion: 'Información insuficiente: no hay jugadas guardadas relevantes.',
    evidence: [],
    confidence: 'Baja',
    proposedAction: 'Registrar y validar jugadas antes de convertir una lectura en consigna.',
    sources: [],
    contexts: [],
  }])),
});

const buildRisks = ({ playCount, zones, players, connections }) => {
  const risks = [];
  const dominantLane = zones.broad.find((row) => row.count >= 3 && row.percentage >= 70);
  if (dominantLane) {
    risks.push({
      id: `lane-${dominantLane.key}`,
      conclusion: `${dominantLane.percentage} % de las acciones registradas se concentran por ${dominantLane.label.toLowerCase()}.`,
      evidence: [`${dominantLane.count} de ${zones.total} acciones zonales`],
      confidence: confidenceFromSample(zones.total, dominantLane.percentage),
      proposedAction: `Preparar la respuesta del bloque sobre el carril ${dominantLane.label.toLowerCase()} y validar el patrón durante el partido.`,
    });
  }
  const dominantPlayer = players.find((row) => playCount >= 3 && row.playCount >= 3 && percentage(row.playCount, playCount) >= 70);
  if (dominantPlayer) {
    const share = percentage(dominantPlayer.playCount, playCount);
    risks.push({
      id: `player-${dominantPlayer.key}`,
      conclusion: `${dominantPlayer.name} interviene en el ${share} % de las jugadas con participación identificable.`,
      evidence: [`${dominantPlayer.playCount} de ${playCount} jugadas`],
      confidence: confidenceFromSample(playCount, share),
      proposedAction: `Preparar una vigilancia sobre la participación de ${dominantPlayer.name} sin convertirla automáticamente en una valoración de calidad.`,
    });
  }
  const dominantConnection = connections.find((row) => row.count >= 3);
  if (dominantConnection) {
    risks.push({
      id: `connection-${dominantConnection.key}`,
      conclusion: `La conexión ${dominantConnection.label} se repite con frecuencia.`,
      evidence: [`${dominantConnection.count} conexiones registradas en ${dominantConnection.playIds.length} jugada${dominantConnection.playIds.length === 1 ? '' : 's'}`],
      confidence: confidenceFromSample(dominantConnection.count),
      proposedAction: `Preparar el cierre de la conexión ${dominantConnection.label} y comprobar si vuelve a aparecer.`,
    });
  }
  const central = zones.broad.find((row) => row.key === 'centre');
  if (zones.total >= 5 && central && central.count <= 2) {
    risks.push({
      id: 'limited-central-sample',
      conclusion: `Solo se detectaron ${central.count} acciones por el centro.`,
      evidence: [`${central.count} de ${zones.total} acciones zonales`],
      confidence: confidenceFromSample(zones.total),
      proposedAction: 'Evitar asumir progresión interior habitual hasta registrar una muestra mayor.',
    });
  }
  return risks;
};

const summaryFromRows = ({ contexts, connections, players, zones, movements, risks }) => {
  if (!contexts.length) {
    return {
      contexts: [],
      sources: [],
      confidence: 'Baja',
      evidence: [],
      conclusion: 'Información insuficiente: no hay jugadas guardadas relevantes para esta pregunta.',
      proposedAction: 'Registrar y validar jugadas antes de convertir una lectura en consigna.',
    };
  }
  const evidence = [];
  if (connections[0]) evidence.push(`${connections[0].label}: ${connections[0].count} veces`);
  if (players[0]) evidence.push(`${players[0].name}: ${players[0].playCount} jugadas`);
  const dominantLane = zones.broad.find((row) => row.count && row.percentage === Math.max(...zones.broad.map((item) => item.percentage)));
  if (dominantLane) evidence.push(`${dominantLane.label}: ${dominantLane.percentage} %`);
  if (movements[0]) evidence.push(`${movements[0].label}: ${movements[0].count}`);
  const firstRisk = risks[0];
  const conclusion = firstRisk?.conclusion
    || (connections[0]?.count >= 2
      ? `La conexión ${connections[0].label} es la repetición principal de la muestra.`
      : 'Las jugadas aportan evidencias objetivas, pero todavía no confirman un patrón repetido.');
  return {
    contexts,
    sources: uniqueSources(contexts),
    confidence: firstRisk?.confidence || confidenceFromSample(contexts.length),
    evidence,
    conclusion,
    proposedAction: firstRisk?.proposedAction || 'Validar el comportamiento con nuevas jugadas antes de convertirlo en consigna.',
  };
};

export const buildTacticalEvidenceEngine = (contexts, { team = 'rival' } = {}) => {
  const report = createEmptyTacticalEvidenceReport();
  const scopedContexts = safeArray(contexts).filter((context) => context?.playId);
  if (!scopedContexts.length) return report;

  const connectionMap = new Map();
  const playerMap = new Map();
  const laneMap = new Map();
  const halfMap = new Map();
  const movementMap = new Map();
  const patternMap = new Map();

  const ensurePlayer = (player) => {
    if (!player || getPlayerTeam(player) !== team) return null;
    const key = playerIdentity(player);
    if (!key) return null;
    if (!playerMap.has(key)) {
      playerMap.set(key, {
        key,
        playerId: player.playerId || null,
        boardKey: player.boardKey || null,
        name: getPlayerLabel(player),
        playIds: new Set(),
        phases: new Set(),
        roles: new Map(),
        movements: new Map(),
        connections: new Map(),
        connectionsCreated: 0,
        connectionsReceived: 0,
        passesAsLauncher: 0,
        passesAsReceiver: 0,
        observations: new Set(),
      });
    }
    return playerMap.get(key);
  };

  const registerParticipant = (player, context, roles = []) => {
    const row = ensurePlayer(player);
    if (!row) return null;
    row.playIds.add(context.playId);
    row.phases.add(context.phaseLabel || phaseNames[context.phase] || context.phase);
    safeArray(roles).filter((role) => role && role !== 'presente').forEach((role) => {
      row.roles.set(role, (row.roles.get(role) || 0) + 1);
    });
    if (context.manualDescription) row.observations.add(context.manualDescription);
    return row;
  };

  const registerZone = (point, actionType, playId) => {
    const position = finitePoint(point);
    if (!position) return;
    const lane = getTacticalLane(position.x, team);
    const broad = getBroadLane(lane);
    const half = getFieldHalf(position.y, team);
    addCount(laneMap, normalize(lane), { key: normalize(lane), label: lane, actionTypes: new Set() }, 1, playId);
    laneMap.get(normalize(lane)).actionTypes.add(actionType);
    addCount(halfMap, normalize(half), { key: normalize(half), label: half }, 1, playId);
    return broad;
  };

  scopedContexts.forEach((context) => {
    const contextCategory = getCategory(context);
    addCount(patternMap, `${context.phase}:${normalize(contextCategory)}`, {
      key: `${context.phase}:${normalize(contextCategory)}`,
      label: contextCategory,
      phase: context.phaseLabel || phaseNames[context.phase] || context.phase,
    }, 1, context.playId);

    safeArray(context.involvedPlayers)
      .filter((player) => player.meaningful && getPlayerTeam(player) === team)
      .forEach((player) => registerParticipant(player, context, player.roles));

    safeArray(context.arrows).forEach((arrow) => {
      const origin = nearestPlayer(context, arrow?.start, { team });
      if (!origin) return;
      const originRow = registerParticipant(origin, context, arrow.type === 'pass' ? ['Origen'] : ['Protagonista']);
      const start = finitePoint(arrow.start);
      const end = finitePoint(arrow.end);
      if (start) registerZone(start, arrow.type || 'acción', context.playId);
      if (arrow.type === 'pass') {
        const destination = nearestPlayer(context, arrow.end, { team });
        if (!destination) return;
        const destinationRow = registerParticipant(destination, context, ['Destino']);
        const originKey = playerIdentity(origin);
        const destinationKey = playerIdentity(destination);
        if (!originKey || !destinationKey || originKey === destinationKey) return;
        const key = `${originKey}->${destinationKey}`;
        const label = `${getRoleLabel(origin)} → ${getRoleLabel(destination)}`;
        addCount(connectionMap, key, {
          key,
          label,
          originKey,
          destinationKey,
          originName: getPlayerLabel(origin),
          destinationName: getPlayerLabel(destination),
          originRole: getRoleLabel(origin),
          destinationRole: getRoleLabel(destination),
          source: 'pass_arrow',
        }, 1, context.playId);
        originRow.connectionsCreated += 1;
        originRow.passesAsLauncher += 1;
        destinationRow.connectionsReceived += 1;
        destinationRow.passesAsReceiver += 1;
        addCount(originRow.connections, key, { key, label }, 1, context.playId);
        addCount(destinationRow.connections, key, { key, label }, 1, context.playId);
        if (end) registerZone(end, 'recepción', context.playId);
      }
      if (arrow.type === 'movement' && end) {
        const movementTypes = new Set(['Desmarque']);
        const forwardDelta = team === 'rival' ? end.y - start.y : start.y - end.y;
        if (forwardDelta >= 12) movementTypes.add('Ruptura');
        if ((end.x <= 18 || end.x >= 82) && Math.abs(end.x - start.x) >= 10) movementTypes.add('Amplitud');
        movementTypes.forEach((label) => {
          const movementKey = normalize(label);
          addCount(movementMap, movementKey, { key: movementKey, label, source: 'geometry' }, 1, context.playId);
          addCount(originRow.movements, movementKey, { key: movementKey, label }, 1, context.playId);
          originRow.roles.set(label, (originRow.roles.get(label) || 0) + 1);
        });
        registerZone(end, 'movimiento', context.playId);
      }
    });

    const normalizedDescription = normalize(context.manualDescription);
    const descriptionSentences = normalizedDescription.split(/[.;:\n]+/).map(clean).filter(Boolean);
    explicitMovementTerms.forEach(([term, label]) => {
      if (!term.test(normalizedDescription)) return;
      const movementKey = normalize(label);
      addCount(movementMap, movementKey, { key: movementKey, label, source: 'description' }, 1, context.playId);
      safeArray(context.involvedPlayers)
        .filter((player) => player.meaningful && getPlayerTeam(player) === team)
        .filter((player) => {
          const name = normalize(player.name);
          return name && descriptionSentences.some((sentence) => term.test(sentence) && sentence.includes(name));
        })
        .forEach((player) => {
          const row = registerParticipant(player, context, [label]);
          addCount(row.movements, movementKey, { key: movementKey, label }, 1, context.playId);
        });
    });

    safeArray(context.connections)
      .filter((connection) => connection.team === team && clean(connection.playId) === clean(context.playId))
      .forEach((connection) => {
        const manualLabel = `${connection.origin} → ${connection.destination}`;
        const alreadyDetected = [...connectionMap.values()].some((row) => (
          row.playIds.has(context.playId) && normalize(row.label) === normalize(manualLabel)
        ));
        if (alreadyDetected) return;
        const key = `manual:${clean(connection.id) || `${normalize(connection.origin)}->${normalize(connection.destination)}`}`;
        addCount(connectionMap, key, {
          key,
          label: manualLabel,
          originKey: null,
          destinationKey: null,
          originName: connection.origin,
          destinationName: connection.destination,
          originRole: connection.origin,
          destinationRole: connection.destination,
          source: 'registered_connection',
        }, 1, context.playId);
      });
  });

  const connections = finalizeRanking(connectionMap);
  const movements = finalizeRanking(movementMap);
  const patterns = finalizeRanking(patternMap).filter((row) => row.count >= 2);
  const lanes = finalizeRanking(laneMap).map((row) => ({ ...row, actionTypes: [...row.actionTypes] }));
  const halves = finalizeRanking(halfMap);
  const zoneTotal = lanes.reduce((sum, row) => sum + row.count, 0);
  const broadCounts = { Derecha: 0, Izquierda: 0, Centro: 0 };
  lanes.forEach((row) => { broadCounts[getBroadLane(row.label)] += row.count; });
  const broad = [
    { key: 'right', label: 'Derecha', count: broadCounts.Derecha, percentage: percentage(broadCounts.Derecha, zoneTotal) },
    { key: 'left', label: 'Izquierda', count: broadCounts.Izquierda, percentage: percentage(broadCounts.Izquierda, zoneTotal) },
    { key: 'centre', label: 'Centro', count: broadCounts.Centro, percentage: percentage(broadCounts.Centro, zoneTotal) },
  ];
  const players = [...playerMap.values()]
    .map((row) => ({
      ...row,
      playCount: row.playIds.size,
      playIds: [...row.playIds],
      phases: [...row.phases],
      roles: [...row.roles.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((left, right) => right.count - left.count),
      movementTypes: finalizeRanking(row.movements),
      connections: finalizeRanking(row.connections),
      observations: [...row.observations],
    }))
    .sort((left, right) => right.playCount - left.playCount || right.connectionsCreated + right.connectionsReceived - left.connectionsCreated - left.connectionsReceived);
  const zones = { total: zoneTotal, broad, lanes, halves };
  const risks = buildRisks({ playCount: scopedContexts.length, zones, players, connections });
  const sources = uniqueSources(scopedContexts);
  const contextRows = scopedContexts.map((context) => ({
    playId: context.playId,
    playName: context.playName,
    phase: context.phase,
    phaseLabel: context.phaseLabel || phaseNames[context.phase] || context.phase,
    situation: context.situationLabel
      || context.fieldZoneLabel
      || context.transitionTypeLabel
      || context.setPieceTypeLabel
      || null,
    category: getCategory(context),
    sourceTemplateId: context.sourceTemplateId || null,
    rivalTeamId: context.rivalTeamId || null,
    rivalSystem: context.rivalSystem || null,
    caudalSystem: context.caudalSystem || null,
    participants: safeArray(context.involvedPlayers)
      .filter((player) => player.meaningful && getPlayerTeam(player) === team)
      .map((player) => ({
        playerId: player.playerId || null,
        boardKey: player.boardKey || null,
        name: player.name,
        detectedRoles: safeArray(player.roles).filter((role) => role !== 'presente'),
      })),
  }));
  const result = {
    generatedAt: new Date().toISOString(),
    team,
    playCount: scopedContexts.length,
    contexts: scopedContexts,
    contextRows,
    patterns,
    connections,
    players,
    zones,
    movements,
    risks,
    sources,
    planRecommendations: {},
  };
  result.planRecommendations = Object.fromEntries(Object.entries(planQuestions).map(([title, question]) => [
    title,
    selectTacticalEvidenceForQuestion(result, question),
  ]));
  return result;
};

export const getPlayerTacticalEvidence = (report, playerId) => {
  const row = safeArray(report?.players).find((player) => (
    clean(player.playerId) === clean(playerId) || clean(player.key) === clean(playerId)
  ));
  if (!row) return emptyParticipation();
  const contextsById = new Map(safeArray(report.contexts).map((context) => [context.playId, context]));
  return {
    playCount: row.playCount,
    plays: row.playIds.map((playId) => {
      const context = contextsById.get(playId);
      return {
        id: playId,
        name: context?.playName || 'Jugada guardada',
        phase: context?.phaseLabel || phaseNames[context?.phase] || 'Sin fase',
      };
    }),
    phases: row.phases,
    connections: row.connections,
    connectionsCreated: row.connectionsCreated,
    connectionsReceived: row.connectionsReceived,
    movements: row.movementTypes.reduce((sum, movement) => sum + movement.count, 0),
    movementTypes: row.movementTypes,
    passesAsLauncher: row.passesAsLauncher,
    passesAsReceiver: row.passesAsReceiver,
    roles: row.roles,
    observations: row.observations,
  };
};

export const selectTacticalEvidenceForQuestion = (report, question, { playerId = '' } = {}) => {
  const phases = phasesForQuestion(question);
  const contexts = safeArray(report?.contexts)
    .filter((context) => !phases.length || phases.includes(context.phase))
    .filter((context) => !playerId || safeArray(context.involvedPlayers).some((player) => (
      player.meaningful && (clean(player.playerId) === clean(playerId) || clean(player.boardKey) === clean(playerId))
    )));
  if (!contexts.length) return summaryFromRows({
    contexts: [],
    connections: [],
    players: [],
    zones: createEmptyTacticalEvidenceReport().zones,
    movements: [],
    risks: [],
  });
  const playIds = new Set(contexts.map((context) => context.playId));
  const filterRows = (rows) => safeArray(rows)
    .map((row) => {
      const scopedPlayIds = safeArray(row.playIds).filter((id) => playIds.has(id));
      return {
        ...row,
        playIds: scopedPlayIds,
        count: scopedPlayIds.reduce((sum, id) => sum + Number(row.countByPlay?.[id] || 0), 0),
      };
    })
    .filter((row) => row.playIds.length)
    .sort((left, right) => right.count - left.count);
  const connections = filterRows(report?.connections);
  const players = safeArray(report?.players)
    .map((row) => ({ ...row, playIds: row.playIds.filter((id) => playIds.has(id)) }))
    .filter((row) => row.playIds.length)
    .map((row) => ({ ...row, playCount: row.playIds.length }))
    .sort((left, right) => right.playCount - left.playCount);
  const movements = filterRows(report?.movements);
  const lanes = filterRows(report?.zones?.lanes);
  const scopedZoneTotal = lanes.reduce((sum, row) => sum + row.count, 0);
  const broadCounts = { Derecha: 0, Izquierda: 0, Centro: 0 };
  lanes.forEach((row) => { broadCounts[getBroadLane(row.label)] += row.count; });
  const scopedBroad = [
    { key: 'right', label: 'Derecha', count: broadCounts.Derecha, percentage: percentage(broadCounts.Derecha, scopedZoneTotal) },
    { key: 'left', label: 'Izquierda', count: broadCounts.Izquierda, percentage: percentage(broadCounts.Izquierda, scopedZoneTotal) },
    { key: 'centre', label: 'Centro', count: broadCounts.Centro, percentage: percentage(broadCounts.Centro, scopedZoneTotal) },
  ];
  const zones = { ...report.zones, total: scopedZoneTotal, broad: scopedBroad, lanes };
  const risks = buildRisks({ playCount: contexts.length, zones, players, connections });
  return summaryFromRows({ contexts, connections, players, zones, movements, risks });
};
