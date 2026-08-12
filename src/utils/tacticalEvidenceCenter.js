import { rebuildTacticalEvidencePlanRecommendations } from './tacticalEvidenceEngine.js';

const safeArray = (value) => Array.isArray(value) ? value : [];
const safeObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const clean = (value) => String(value ?? '').trim();
const unique = (rows) => [...new Set(safeArray(rows).map(clean).filter(Boolean))];

const roleLabels = {
  goalkeeper: 'Portero',
  right_back: 'Lateral derecho',
  left_back: 'Lateral izquierdo',
  right_centre_back: 'Central derecho',
  left_centre_back: 'Central izquierdo',
  centre_back: 'Central',
  defensive_midfielder: 'Mediocentro defensivo',
  central_midfielder: 'Mediocentro',
  right_midfielder: 'Interior derecho',
  left_midfielder: 'Interior izquierdo',
  attacking_midfielder: 'Mediapunta',
  right_winger: 'Extremo derecho',
  left_winger: 'Extremo izquierdo',
  centre_forward: 'Delantero',
  striker: 'Delantero',
};

export const humanizeTacticalRole = (value) => {
  const source = clean(value);
  if (!source) return 'Jugador';
  const normalized = source.toLowerCase().replace(/[\s-]+/g, '_');
  if (roleLabels[normalized]) return roleLabels[normalized];
  if (!source.includes('_')) return source;
  return source
    .split('_')
    .filter(Boolean)
    .map((part, index) => index ? part : `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
};

export const humanizeTacticalConnection = (row = {}) => {
  const rawOrigin = clean(row.originRole || row.originName || clean(row.label).split(/→|->/)[0]);
  const rawDestination = clean(row.destinationRole || row.destinationName || clean(row.label).split(/→|->/)[1]);
  const origin = humanizeTacticalRole(rawOrigin);
  const destination = humanizeTacticalRole(rawDestination);
  return `${origin} conecta habitualmente con ${destination}`;
};

const contextDate = (context) => clean(context?.updatedAt || context?.createdAt || context?.date);
const latestValue = (values) => unique(values).sort((left, right) => right.localeCompare(left))[0] || '';

const buildItem = ({ type, row, report, validations }) => {
  const playIds = unique(row.playIds);
  const contexts = safeArray(report.contexts).filter((context) => playIds.includes(clean(context.playId)));
  const phases = unique(contexts.map((context) => context.phase));
  const phaseLabels = unique(contexts.map((context) => context.phaseLabel));
  const participants = [...new Map(contexts.flatMap((context) => safeArray(context.involvedPlayers))
    .filter((player) => player?.meaningful)
    .map((player) => [clean(player.playerId || player.boardKey || player.name), {
      id: clean(player.playerId || player.boardKey),
      name: clean(player.name) || humanizeTacticalRole(player.specificPosition),
    }])).values()];
  const sources = [...new Map(contexts.flatMap((context) => safeArray(context.sources))
    .map((source) => [`${clean(source?.type)}:${clean(source?.id)}`, source])
    .filter(([key]) => key !== ':')).values()];
  const id = `${type}:${clean(row.key || row.id || row.label)}`;
  const validation = safeObject(validations[id]);
  const canConfirm = playIds.length >= 2;
  const requestedStatus = ['confirmed', 'discarded', 'review'].includes(validation.status) ? validation.status : 'pending';
  const status = requestedStatus === 'confirmed' && !canConfirm ? 'pending' : requestedStatus;
  const title = clean(validation.interpretation)
    || (type === 'connection' ? humanizeTacticalConnection(row) : clean(row.label || row.observation || row.name))
    || 'Evidencia sin interpretación';
  const quality = status === 'confirmed'
    ? 'Confirmada'
    : status === 'discarded'
      ? 'Descartada'
      : status === 'review'
        ? 'Requiere revisión'
        : playIds.length >= 2
          ? 'Repetida'
          : 'Observada';
  return {
    id,
    type,
    title,
    originalTitle: type === 'connection' ? humanizeTacticalConnection(row) : clean(row.label || row.observation || row.name),
    phase: phaseLabels.join(' · ') || clean(row.phase) || 'Sin fase registrada',
    phaseKeys: phases,
    playIds,
    playCount: playIds.length,
    occurrenceCount: Number(row.count || playIds.length || 0),
    matchIds: unique(contexts.map((context) => context.matchId)),
    matchCount: unique(contexts.map((context) => context.matchId)).length,
    sources,
    sourceCount: sources.length,
    participants,
    contexts,
    status,
    quality,
    canConfirm,
    notes: clean(validation.notes),
    updatedAt: clean(validation.updatedAt) || latestValue(contexts.map(contextDate)),
    updatedBy: clean(validation.updatedBy),
    history: safeArray(validation.history),
    usedIn: {
      rival: status === 'confirmed',
      plan: status === 'confirmed',
      players: status === 'confirmed' && participants.length > 0,
    },
    hasVideo: contexts.some((context) => clean(context.videoUrl)),
    hasBoard: playIds.length > 0,
  };
};

const buildManualItem = (row, validations) => {
  const id = `manual:${clean(row.id || row.observation)}`;
  const validation = safeObject(validations[id]);
  const requestedStatus = validation.status || row.status;
  const status = ['confirmed', 'discarded', 'review'].includes(requestedStatus) ? requestedStatus : 'pending';
  return {
    id,
    type: 'manual',
    title: clean(validation.interpretation || row.observation) || 'Observación del staff',
    originalTitle: clean(row.observation),
    phase: clean(row.type) || 'Observación',
    phaseKeys: [],
    playIds: [],
    playCount: 0,
    occurrenceCount: 1,
    matchIds: clean(row.partidoId) ? [clean(row.partidoId)] : [],
    matchCount: clean(row.partidoId || row.match) ? 1 : 0,
    sources: [{ type: 'staff_observation', id: clean(row.id), label: 'Staff' }],
    sourceCount: 1,
    participants: [],
    contexts: [],
    status,
    quality: status === 'confirmed' ? 'Confirmada' : status === 'discarded' ? 'Descartada' : status === 'review' ? 'Requiere revisión' : 'Observada',
    canConfirm: true,
    notes: clean(validation.notes || row.notes),
    updatedAt: clean(validation.updatedAt || row.updatedAt || row.date),
    updatedBy: clean(validation.updatedBy),
    history: safeArray(validation.history),
    usedIn: { rival: status === 'confirmed', plan: status === 'confirmed', players: false },
    manualMatch: clean(row.match),
    manualDate: clean(row.date),
    hasVideo: false,
    hasBoard: false,
  };
};

const coverageDefinitions = [
  { key: 'build_up', label: 'Salida de balón', matches: (context) => context.phase === 'offensive' && context.situation === 'build_up' },
  { key: 'positional_attack', label: 'Ataque posicional', matches: (context) => context.phase === 'offensive' && context.situation !== 'build_up' },
  { key: 'offensive_transition', label: 'Transición ofensiva', matches: (context) => context.phase === 'transition' && context.transitionType === 'offensive_transition' },
  { key: 'offensive_set_piece', label: 'ABP ofensiva', matches: (context) => context.phase === 'set_piece' && context.setPieceType === 'offensive_set_piece' },
  { key: 'defensive_set_piece', label: 'ABP defensiva', matches: (context) => context.phase === 'set_piece' && context.setPieceType === 'defensive_set_piece' },
];

export const buildTacticalEvidenceCenter = ({ report, validations, manualEvidences } = {}) => {
  const safeReport = safeObject(report);
  const validationMap = safeObject(validations);
  const generatedItems = [
    ...safeArray(safeReport.patterns).map((row) => buildItem({ type: 'pattern', row, report: safeReport, validations: validationMap })),
    ...safeArray(safeReport.connections).map((row) => buildItem({ type: 'connection', row, report: safeReport, validations: validationMap })),
    ...safeArray(safeReport.movements).map((row) => buildItem({ type: 'movement', row, report: safeReport, validations: validationMap })),
  ];
  const items = [...generatedItems, ...safeArray(manualEvidences).map((row) => buildManualItem(row, validationMap))]
    .sort((left, right) => {
      const statusOrder = { confirmed: 0, pending: 1, review: 2, discarded: 3 };
      return statusOrder[left.status] - statusOrder[right.status]
        || right.playCount - left.playCount
        || right.occurrenceCount - left.occurrenceCount
        || left.title.localeCompare(right.title, 'es');
    });
  const confirmedItems = items.filter((item) => item.status === 'confirmed');
  const pendingItems = items.filter((item) => ['pending', 'review'].includes(item.status) && item.canConfirm);
  const signalItems = items.filter((item) => ['pending', 'review'].includes(item.status) && !item.canConfirm);
  const discardedItems = items.filter((item) => item.status === 'discarded');
  const confirmedPlayIds = unique(confirmedItems.flatMap((item) => item.playIds));
  const reviewedContexts = safeArray(safeReport.contexts);
  const confirmedContexts = reviewedContexts.filter((context) => confirmedPlayIds.includes(clean(context.playId)));
  const coverage = coverageDefinitions.map((definition) => {
    const reviewed = reviewedContexts.filter(definition.matches);
    const confirmed = confirmedContexts.filter(definition.matches);
    return {
      key: definition.key,
      label: definition.label,
      status: confirmed.length ? 'confirmed' : reviewed.length ? 'reviewed' : 'missing',
      playCount: unique(reviewed.map((context) => context.playId)).length,
    };
  });
  const confirmedCoverage = coverage.filter((item) => item.status === 'confirmed').length;
  const repeatedCount = items.filter((item) => item.canConfirm && item.status !== 'discarded').length;
  const maturity = confirmedItems.length >= 2 && confirmedCoverage >= 2
    ? { key: 'high', label: 'Alta', description: 'Las conclusiones principales están respaldadas por varias jugadas y han sido confirmadas por el staff.' }
    : confirmedItems.length || repeatedCount >= 2
      ? { key: 'medium', label: 'Media', description: 'Existen comportamientos repetidos, pero todavía quedan validaciones pendientes.' }
      : { key: 'initial', label: 'Inicial', description: 'No existe información suficiente para confirmar comportamientos tácticos.' };
  return {
    items,
    confirmedItems,
    pendingItems,
    signalItems,
    discardedItems,
    confirmedPlayIds,
    coverage,
    maturity,
    playCount: Number(safeReport.playCount || 0),
    independentEvidenceCount: items.filter((item) => item.canConfirm).length,
    confirmedCount: confirmedItems.length,
    pendingCount: pendingItems.length,
    lastUpdatedAt: latestValue([
      safeReport.generatedAt,
      ...items.map((item) => item.updatedAt),
    ]),
  };
};

export const filterConfirmedTacticalEvidenceContexts = (report, center) => {
  const confirmedIds = new Set(safeArray(center?.confirmedPlayIds).map(clean));
  return safeArray(report?.contexts).filter((context) => confirmedIds.has(clean(context.playId)));
};

export const buildConfirmedTacticalEvidenceReport = (report, center) => {
  const safeReport = safeObject(report);
  const confirmedItems = safeArray(center?.confirmedItems);
  const confirmedItemIds = new Set(confirmedItems.map((item) => item.id));
  const confirmedPlayIds = new Set(safeArray(center?.confirmedPlayIds).map(clean));
  const contexts = safeArray(safeReport.contexts).filter((context) => confirmedPlayIds.has(clean(context.playId)));
  const contextRows = safeArray(safeReport.contextRows).filter((context) => confirmedPlayIds.has(clean(context.playId)));
  const patterns = safeArray(safeReport.patterns).filter((row) => confirmedItemIds.has(`pattern:${clean(row.key || row.id || row.label)}`));
  const connections = safeArray(safeReport.connections).filter((row) => confirmedItemIds.has(`connection:${clean(row.key || row.id || row.label)}`));
  const movements = safeArray(safeReport.movements).filter((row) => confirmedItemIds.has(`movement:${clean(row.key || row.id || row.label)}`));
  const connectionKeys = new Set(connections.map((row) => clean(row.key)));
  const movementKeys = new Set(movements.map((row) => clean(row.key)));
  const playerIds = new Set(confirmedItems.flatMap((item) => item.participants).map((player) => clean(player.id || player.name)));
  const players = safeArray(safeReport.players)
    .filter((player) => playerIds.has(clean(player.playerId || player.key || player.name)))
    .map((player) => {
      const playIds = safeArray(player.playIds).filter((playId) => confirmedPlayIds.has(clean(playId)));
      return {
        ...player,
        playIds,
        playCount: playIds.length,
        connections: safeArray(player.connections).filter((row) => connectionKeys.has(clean(row.key))),
        movementTypes: safeArray(player.movementTypes).filter((row) => movementKeys.has(clean(row.key))),
        connectionsCreated: 0,
        connectionsReceived: 0,
        passesAsLauncher: 0,
        passesAsReceiver: 0,
        roles: [],
        observations: [],
      };
    })
    .filter((player) => player.playCount > 0);
  const sources = [...new Map(contexts.flatMap((context) => safeArray(context.sources))
    .map((source) => [`${clean(source?.type)}:${clean(source?.id)}`, source])
    .filter(([key]) => key !== ':')).values()];
  const curated = {
    ...safeReport,
    playCount: contexts.length,
    contexts,
    contextRows,
    patterns,
    connections,
    players,
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
    movements,
    risks: [],
    sources,
  };
  return rebuildTacticalEvidencePlanRecommendations(curated);
};
