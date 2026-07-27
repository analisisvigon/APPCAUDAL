import { getPlayerDisplayName } from './playerDisplayName.js';

const safeArray = (value) => Array.isArray(value) ? value : [];
const safeObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const clean = (value) => String(value ?? '').trim();
const normalize = (value) => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const phaseLabels = {
  defensive: 'Fase defensiva',
  offensive: 'Fase ofensiva',
  transition: 'Transiciones',
  set_piece: 'ABP',
};
const situationLabels = {
  low_block: 'Bloque bajo',
  mid_block: 'Bloque medio',
  high_block: 'Bloque alto',
  build_up: 'Inicio',
  creation: 'Creación',
  finishing: 'Finalización',
};
const playStyleLabels = { combinative: 'Juego combinativo', direct: 'Juego directo' };
const transitionTypeLabels = {
  offensive_transition: 'Transición ofensiva',
  defensive_transition: 'Transición defensiva',
};
const fieldZoneLabels = { defensive_half: 'Campo defensivo', attacking_half: 'Campo ofensivo' };
const behaviourLabels = {
  fast_attack: 'Ataque rápido',
  keep_possession: 'Conservar y organizar',
  counterpress: 'Presión tras pérdida',
  retreat: 'Repliegue',
};
const setPieceTypeLabels = {
  offensive_set_piece: 'ABP ofensiva',
  defensive_set_piece: 'ABP defensiva',
};

const finitePosition = (value) => {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
};

const average = (values) => values.length
  ? Math.round((values.reduce((total, value) => total + value, 0) / values.length) * 100) / 100
  : null;

const getLineHeights = (positions, team, threshold = 4) => (
  Object.entries(safeObject(positions))
    .filter(([key]) => key.startsWith(`${team}:`) && key !== `${team}:0`)
    .map(([, value]) => finitePosition(value)?.y)
    .filter(Number.isFinite)
    .sort((left, right) => left - right)
    .reduce((lines, value) => {
      const existing = lines.find((line) => Math.abs(line.average - value) <= threshold);
      if (existing) {
        existing.values.push(value);
        existing.average = average(existing.values);
      } else {
        lines.push({ average: value, values: [value] });
      }
      return lines;
    }, [])
    .map(({ average: value }) => value)
);

export const getPlayersByLine = (positions, team, threshold = 4) => {
  const lineHeights = getLineHeights(positions, team, threshold);
  return lineHeights.map((height, index) => ({
    line: index + 1,
    height,
    players: Object.entries(safeObject(positions))
      .filter(([key]) => key.startsWith(`${team}:`) && key !== `${team}:0`)
      .filter(([, value]) => {
        const position = finitePosition(value);
        return position && Math.abs(position.y - height) <= threshold;
      })
      .map(([playerKey]) => playerKey),
  }));
};

export const calculateTeamWidth = (positions, team) => {
  const points = Object.entries(safeObject(positions))
    .filter(([key]) => key.startsWith(`${team}:`))
    .map(([, value]) => finitePosition(value))
    .filter(Boolean);
  if (points.length < 2) return null;
  return Math.round((Math.max(...points.map(({ x }) => x)) - Math.min(...points.map(({ x }) => x))) * 100) / 100;
};

export const calculateBlockHeight = (positions, team) => {
  const longitudinal = Object.entries(safeObject(positions))
    .filter(([key]) => key.startsWith(`${team}:`) && key !== `${team}:0`)
    .map(([, value]) => finitePosition(value)?.y)
    .filter(Number.isFinite);
  return average(longitudinal);
};

export const calculateLineDistances = (positions, team) => {
  const lineHeights = getLineHeights(positions, team);
  return lineHeights.slice(1).map((height, index) => Math.round((height - lineHeights[index]) * 100) / 100);
};

export const detectPlayersBetweenLines = (positions, team, opponent, margin = 3) => {
  const opponentLines = getLineHeights(positions, opponent);
  if (opponentLines.length < 2) return [];
  return Object.entries(safeObject(positions))
    .filter(([key]) => key.startsWith(`${team}:`) && key !== `${team}:0`)
    .map(([playerKey, value]) => ({ playerKey, position: finitePosition(value) }))
    .filter(({ position }) => position)
    .filter(({ position }) => opponentLines.slice(1).some((upperLine, index) => (
      position.y > opponentLines[index] + margin
      && position.y < upperLine - margin
    )));
};

export const detectPlayersNearBall = (positions, ballPosition, threshold = 12) => {
  const ball = finitePosition(ballPosition);
  if (!ball) return [];
  return Object.entries(safeObject(positions))
    .map(([playerKey, value]) => ({ playerKey, position: finitePosition(value) }))
    .filter(({ position }) => position)
    .map((entry) => ({ ...entry, distance: Math.round(Math.hypot(entry.position.x - ball.x, entry.position.y - ball.y) * 100) / 100 }))
    .filter(({ distance }) => distance <= threshold)
    .sort((left, right) => left.distance - right.distance);
};

export const detectWidePlayers = (positions, team, threshold = 18) => (
  Object.entries(safeObject(positions))
    .filter(([key, value]) => key.startsWith(`${team}:`) && finitePosition(value))
    .filter(([, value]) => value.x <= threshold || value.x >= 100 - threshold)
    .map(([playerKey, position]) => ({ playerKey, position: finitePosition(position) }))
);

export const detectOccupiedChannels = (positions, team) => {
  const counts = { left: 0, centre: 0, right: 0 };
  Object.entries(safeObject(positions))
    .filter(([key]) => key.startsWith(`${team}:`))
    .forEach(([, value]) => {
      const position = finitePosition(value);
      if (!position) return;
      if (position.x < 33.33) counts.left += 1;
      else if (position.x > 66.66) counts.right += 1;
      else counts.centre += 1;
    });
  return counts;
};

export const calculateLocalNumericalSuperiority = (positions) => {
  const zones = {};
  Object.entries(safeObject(positions)).forEach(([key, value]) => {
    const position = finitePosition(value);
    const team = key.split(':')[0];
    if (!position || !['rival', 'caudal'].includes(team)) return;
    const column = position.x < 33.33 ? 'left' : position.x > 66.66 ? 'right' : 'centre';
    const row = position.y < 33.33 ? 'upper' : position.y > 66.66 ? 'lower' : 'middle';
    const zone = `${row}:${column}`;
    zones[zone] ||= { rival: 0, caudal: 0 };
    zones[zone][team] += 1;
  });
  return Object.entries(zones)
    .filter(([, counts]) => counts.rival !== counts.caudal)
    .map(([zone, counts]) => ({ zone, ...counts, advantage: counts.rival > counts.caudal ? 'rival' : 'caudal' }));
};

const getPlayerId = (player) => clean(player?.globalPlayerId || player?.jugadorRivalId || player?.id);
const getPlayerName = (player) => clean(getPlayerDisplayName(player));
const getPlayerTraits = (player, category) => safeArray(player?.traits)
  .filter((trait) => normalize(trait?.category) === normalize(category))
  .map((trait) => clean(trait?.label))
  .filter(Boolean);

const profileHasData = (player) => Boolean(
  clean(player?.primaryNaturalPosition || player?.position)
  || clean(player?.primarySpecificPosition || player?.specificPosition)
  || clean(player?.foot)
  || clean(player?.height)
  || clean(player?.mainProfile)
  || clean(player?.secondaryProfile)
  || clean(player?.scoutingSummary || player?.notes)
  || safeArray(player?.traits).length
  || safeArray(player?.behaviours).length
);

const nearestPlayerKey = (point, playerPositions, maxDistance = 9, team = '') => {
  const target = finitePosition(point);
  if (!target) return '';
  const candidates = Object.entries(safeObject(playerPositions))
    .filter(([key]) => !team || key.startsWith(`${team}:`))
    .map(([key, value]) => {
      const position = finitePosition(value);
      if (!position) return null;
      const distance = Math.hypot(position.x - target.x, position.y - target.y);
      return { key, distance };
    })
    .filter(Boolean)
    .sort((left, right) => left.distance - right.distance);
  return candidates[0]?.distance <= maxDistance ? candidates[0].key : '';
};

const connectionMatchesPlayer = (connection, player) => {
  const names = [getPlayerName(player), clean(player?.role), clean(player?.specificPosition)]
    .map(normalize)
    .filter(Boolean);
  return names.includes(normalize(connection.origin)) || names.includes(normalize(connection.destination));
};

const extractInvolvement = ({ play, players, connections }) => {
  const playerPositions = safeObject(play.playerPositions);
  const byBoardKey = new Map(players.map((player) => [clean(player.boardKey), player]));
  const signals = new Map();
  const addSignal = (boardKey, role, type, sourceId = '') => {
    const player = byBoardKey.get(boardKey);
    if (!player) return;
    const id = getPlayerId(player) || boardKey;
    if (!signals.has(id)) signals.set(id, { player, roles: new Set(), signals: [] });
    if (role) signals.get(id).roles.add(role);
    signals.get(id).signals.push({ type, sourceId, role: role || null });
  };

  Object.keys(playerPositions).forEach((boardKey) => addSignal(boardKey, 'presente', 'position'));
  safeArray(play.arrows).forEach((arrow) => {
    const originKey = nearestPlayerKey(arrow.start, playerPositions);
    const originTeam = originKey.split(':')[0];
    const destinationKey = nearestPlayerKey(arrow.end, playerPositions, 9, originTeam);
    if (arrow.type === 'pass') {
      addSignal(originKey, 'lanzador', 'pass_arrow', arrow.id);
      addSignal(destinationKey, 'receptor', 'pass_arrow', arrow.id);
    } else if (arrow.type === 'movement') {
      addSignal(originKey, 'protagonista', 'movement_arrow', arrow.id);
    }
  });
  const description = normalize(play.description);
  if (description) {
    players.forEach((player) => {
      const name = normalize(getPlayerName(player));
      if (name && name.length >= 5 && description.includes(name)) addSignal(clean(player.boardKey), '', 'description', play.id);
    });
  }
  safeArray(connections).forEach((connection) => {
    players.filter((player) => (
      clean(player.boardKey).startsWith(`${connection.team}:`)
      && connectionMatchesPlayer(connection, player)
    )).forEach((player) => {
      const boardKey = clean(player.boardKey);
      const id = getPlayerId(player) || boardKey;
      const alreadyLinkedToPlay = signals.get(id)?.signals.some(({ type }) => type !== 'position');
      const explicitlyLinkedToPlay = clean(connection.playId) && clean(connection.playId) === clean(play.id);
      if (!alreadyLinkedToPlay && !explicitlyLinkedToPlay) return;
      const playerNames = [getPlayerName(player), clean(player.role), clean(player.specificPosition)].map(normalize);
      if (playerNames.includes(normalize(connection.origin))) addSignal(boardKey, 'lanzador', 'connection', connection.id);
      if (playerNames.includes(normalize(connection.destination))) addSignal(boardKey, 'receptor', 'connection', connection.id);
    });
  });

  return [...signals.values()].map(({ player, roles, signals: playerSignals }) => ({
    playerId: getPlayerId(player) || null,
    boardKey: clean(player.boardKey) || null,
    name: getPlayerName(player) || 'Jugador sin identificar',
    roles: [...roles],
    meaningful: playerSignals.some(({ type }) => type !== 'position'),
    involvementSignals: playerSignals,
    naturalPosition: clean(player.primaryNaturalPosition || player.position) || null,
    specificPosition: clean(player.primarySpecificPosition || player.specificPosition) || null,
    dominantFoot: clean(player.foot) || null,
    height: clean(player.height) || null,
    mainProfile: clean(player.mainProfile) || null,
    secondaryProfile: clean(player.secondaryProfile) || null,
    strengths: getPlayerTraits(player, 'strength'),
    vulnerabilities: getPlayerTraits(player, 'vulnerability'),
    tendencies: getPlayerTraits(player, 'trend'),
    behaviours: safeArray(player.behaviours).map(clean).filter(Boolean),
    observations: clean(player.scoutingSummary || player.notes) || null,
    scoutingPriority: clean(player.scoutingPriority) || null,
    alerts: [
      player.cardAlert ? 'Riesgo de tarjeta' : '',
      player.sentOffAlert ? 'Expulsado' : '',
      player.suspendedAlert ? 'Sancionado' : '',
      player.injuredAlert ? 'Lesionado' : '',
    ].filter(Boolean),
    available: !(player.suspendedAlert || player.injuredAlert || player.suspended || player.injured),
    hasProfileData: profileHasData(player),
  }));
};

const buildSources = ({ play, involvedPlayers, collectiveProfile, connections, boardEvidence }) => {
  const sources = [];
  if (clean(play.id)) {
    sources.push({ type: 'tactical_play', id: clean(play.id), label: clean(play.name) || 'Jugada guardada', strength: 0 });
  }
  if (clean(play.description)) {
    sources.push({ type: 'tactical_play_description', id: clean(play.id), label: `Descripción: ${clean(play.name) || 'Jugada'}`, strength: 3 });
  }
  involvedPlayers.filter((player) => player.meaningful && player.hasProfileData).forEach((player) => {
    sources.push({ type: 'player_profile', id: player.playerId || player.boardKey, label: player.name, strength: 2 });
  });
  const collectiveFields = Object.entries(collectiveProfile)
    .filter(([, value]) => Array.isArray(value) ? value.length : clean(value))
    .map(([field]) => field);
  if (collectiveFields.length) {
    sources.push({ type: 'collective_profile', id: 'collective', label: `Perfil colectivo (${collectiveFields.join(', ')})`, strength: 3 });
  }
  connections.forEach((connection) => {
    sources.push({
      type: 'tactical_connection',
      id: clean(connection.id) || `${connection.origin}-${connection.destination}`,
      label: `${clean(connection.origin)} → ${clean(connection.destination)}`,
      strength: 3,
    });
  });
  if (
    Object.keys(safeObject(play.playerPositions)).length
    || boardEvidence.passArrows.length
    || boardEvidence.movementArrows.length
  ) {
    sources.push({ type: 'board_evidence', id: clean(play.id), label: `Posiciones y flechas: ${clean(play.name) || 'Jugada'}`, strength: 1 });
  }
  return sources;
};

export const buildTacticalPlayContext = ({
  matchId = null,
  rivalTeamId = null,
  caudalSystem = '',
  rivalSystem = '',
  phase = '',
  play = {},
  players = [],
  collectiveProfile = {},
  connections = [],
}) => {
  const safePlay = safeObject(play);
  const safePhase = clean(phase || safePlay.phase || (
    safePlay.defensiveSituation ? 'defensive'
      : safePlay.offensiveSituation ? 'offensive'
        : safePlay.transitionType ? 'transition'
          : safePlay.setPieceType ? 'set_piece'
            : ''
  ));
  const relevantConnections = safeArray(connections)
    .filter((connection) => connection && clean(connection.origin) && clean(connection.destination))
    .map((connection) => ({
      id: clean(connection.id) || null,
      team: connection.team === 'caudal' ? 'caudal' : 'rival',
      origin: clean(connection.origin),
      destination: clean(connection.destination),
      type: clean(connection.type) || null,
      frequency: clean(connection.intensity || connection.frequency) || null,
      observation: clean(connection.comment || connection.observation) || null,
      phase: clean(connection.phase) || null,
      playId: clean(connection.playId) || null,
    }))
    .filter((connection) => (
      (!connection.phase || connection.phase === safePhase)
      && (!connection.playId || connection.playId === clean(safePlay.id))
    ));
  const boardEvidence = {
    teamWidth: {
      rival: calculateTeamWidth(safePlay.playerPositions, 'rival'),
      caudal: calculateTeamWidth(safePlay.playerPositions, 'caudal'),
    },
    blockHeight: {
      rival: calculateBlockHeight(safePlay.playerPositions, 'rival'),
      caudal: calculateBlockHeight(safePlay.playerPositions, 'caudal'),
    },
    lineDistances: {
      rival: calculateLineDistances(safePlay.playerPositions, 'rival'),
      caudal: calculateLineDistances(safePlay.playerPositions, 'caudal'),
    },
    playersByLine: {
      rival: getPlayersByLine(safePlay.playerPositions, 'rival'),
      caudal: getPlayersByLine(safePlay.playerPositions, 'caudal'),
    },
    rivalPlayersByLine: getPlayersByLine(safePlay.playerPositions, 'rival'),
    playersBetweenLines: {
      rival: detectPlayersBetweenLines(safePlay.playerPositions, 'rival', 'caudal'),
      caudal: detectPlayersBetweenLines(safePlay.playerPositions, 'caudal', 'rival'),
    },
    widePlayers: {
      rival: detectWidePlayers(safePlay.playerPositions, 'rival'),
      caudal: detectWidePlayers(safePlay.playerPositions, 'caudal'),
    },
    occupiedChannels: {
      rival: detectOccupiedChannels(safePlay.playerPositions, 'rival'),
      caudal: detectOccupiedChannels(safePlay.playerPositions, 'caudal'),
    },
    occupiedZones: {
      rival: detectOccupiedChannels(safePlay.playerPositions, 'rival'),
      caudal: detectOccupiedChannels(safePlay.playerPositions, 'caudal'),
    },
    localNumericalSuperiority: calculateLocalNumericalSuperiority(safePlay.playerPositions),
    playersNearBall: detectPlayersNearBall(safePlay.playerPositions, safePlay.ballStartPosition),
    passArrows: safeArray(safePlay.arrows).filter((arrow) => arrow?.type === 'pass'),
    movementArrows: safeArray(safePlay.arrows).filter((arrow) => arrow?.type === 'movement'),
  };
  const collectiveEvidence = {
    buildUp: clean(collectiveProfile.buildUp) || null,
    blockHeight: clean(collectiveProfile.blockHeight) || null,
    pressingType: clean(collectiveProfile.pressureType) || null,
    attackingRhythm: clean(collectiveProfile.attackingRhythm) || null,
    preferredAttack: clean(collectiveProfile.preferredAttack) || null,
    strengths: safeArray(collectiveProfile.strengths).map(clean).filter(Boolean),
    weaknesses: safeArray(collectiveProfile.weaknesses).map(clean).filter(Boolean),
  };
  const involvedPlayers = extractInvolvement({
    play: safePlay,
    players: safeArray(players),
    connections: relevantConnections,
  });
  const sources = buildSources({
    play: safePlay,
    involvedPlayers,
    collectiveProfile: collectiveEvidence,
    connections: relevantConnections,
    boardEvidence,
  });
  return {
    matchId: matchId || null,
    rivalTeamId: rivalTeamId || null,
    caudalSystem: clean(safePlay.caudalSystem || caudalSystem) || null,
    rivalSystem: clean(safePlay.rivalSystem || rivalSystem) || null,
    phase: safePhase || null,
    phaseLabel: phaseLabels[safePhase] || safePhase || 'Sin fase',
    situation: clean(safePlay.defensiveSituation || safePlay.offensiveSituation) || null,
    situationLabel: situationLabels[safePlay.defensiveSituation || safePlay.offensiveSituation] || null,
    playStyle: clean(safePlay.playStyle) || null,
    playStyleLabel: playStyleLabels[safePlay.playStyle] || null,
    transitionType: clean(safePlay.transitionType) || null,
    transitionTypeLabel: transitionTypeLabels[safePlay.transitionType] || null,
    fieldZone: clean(safePlay.fieldZone) || null,
    fieldZoneLabel: fieldZoneLabels[safePlay.fieldZone] || null,
    behaviour: clean(safePlay.behaviour) || null,
    behaviourLabel: behaviourLabels[safePlay.behaviour] || null,
    setPieceType: clean(safePlay.setPieceType) || null,
    setPieceTypeLabel: setPieceTypeLabels[safePlay.setPieceType] || null,
    playId: clean(safePlay.id) || null,
    playName: clean(safePlay.name) || 'Jugada sin nombre',
    description: clean(safePlay.description) || null,
    manualDescription: clean(safePlay.description) || null,
    playerPositions: safeObject(safePlay.playerPositions),
    arrows: safeArray(safePlay.arrows),
    connections: relevantConnections,
    registeredConnections: relevantConnections,
    ballStartPosition: finitePosition(safePlay.ballStartPosition),
    involvedPlayers,
    sourceTemplateId: clean(safePlay.sourceTemplateId) || null,
    collectiveEvidence,
    boardEvidence,
    sources,
  };
};

export const selectTacticalContextsForQuestion = (contexts, question, { playerId = '' } = {}) => {
  const q = normalize(question);
  let phases = [];
  if (/abp|estrategia|corner|balon parado/.test(q)) phases = ['set_piece'];
  else if (/transicion|perdida|recuperacion/.test(q)) phases = ['transition'];
  else if (/sin balon|presion|vigilar|bloque|proteger/.test(q)) phases = ['defensive', 'offensive'];
  else if (/con balon|progres|salida|espacio|superioridad|estructura/.test(q)) phases = ['offensive', 'defensive'];
  const selected = safeArray(contexts).filter((context) => !phases.length || phases.includes(context.phase));
  if (!playerId) return selected;
  return selected.filter((context) => context.involvedPlayers.some((player) => (
    player.playerId === playerId && player.meaningful
  )));
};

const uniqueSources = (contexts) => {
  const byKey = new Map();
  contexts.flatMap((context) => context.sources).forEach((source) => {
    const key = `${source.type}:${source.id}`;
    if (!byKey.has(key)) byKey.set(key, source);
  });
  return [...byKey.values()];
};

export const calculateEvidenceConfidence = (sources) => {
  const unique = safeArray(sources);
  const nonBoard = unique.filter((source) => !['board_evidence', 'tactical_play'].includes(source.type));
  const score = unique.reduce((total, source) => total + Number(source.strength || 0), 0);
  const hasManualDescription = unique.some((source) => source.type === 'tactical_play_description');
  if (hasManualDescription && nonBoard.length >= 3 && score >= 8) return 'Alta';
  if (nonBoard.length >= 2 && score >= 5) return 'Media';
  return 'Baja';
};

export const buildTacticalEvidenceSummary = (contexts, options = {}) => {
  const selected = selectTacticalContextsForQuestion(contexts, options.question || '', { playerId: options.playerId || '' });
  const requestedTeam = ['rival', 'caudal'].includes(options.team) ? options.team : '';
  const connections = [...new Map(selected.flatMap((context) => context.connections)
    .filter((connection) => !requestedTeam || connection.team === requestedTeam)
    .map((connection) => [connection.id || `${connection.origin}:${connection.destination}`, connection])).values()];
  const meaningfulPlayers = [...new Map(selected.flatMap((context) => context.involvedPlayers)
    .filter((player) => player.meaningful)
    .filter((player) => !requestedTeam || clean(player.boardKey).startsWith(`${requestedTeam}:`))
    .map((player) => [player.playerId || player.boardKey, player])).values()];
  const connectionSourceIds = new Set(connections.map((connection) => connection.id || `${connection.origin}-${connection.destination}`));
  const playerSourceIds = new Set(meaningfulPlayers.map((player) => player.playerId || player.boardKey));
  const sources = uniqueSources(selected).filter((source) => {
    if (source.type === 'tactical_connection') return connectionSourceIds.has(source.id);
    if (source.type === 'player_profile') return playerSourceIds.has(source.id);
    return true;
  });
  const preferredRight = selected.some((context) => /derecha/.test(normalize(context.collectiveEvidence.preferredAttack)));
  const rightConnection = connections.some((connection) => /derech/.test(normalize(`${connection.origin} ${connection.destination}`)));
  const rightPlayers = meaningfulPlayers.filter((player) => /derech/.test(normalize(player.specificPosition)));
  const rightSupportingContexts = selected.filter((context) => context.involvedPlayers.some((player) => (
    player.meaningful
    && (!requestedTeam || clean(player.boardKey).startsWith(`${requestedTeam}:`))
    && /derech/.test(normalize(player.specificPosition))
    && player.involvementSignals.some(({ type }) => ['pass_arrow', 'movement_arrow', 'description', 'connection'].includes(type))
  )));
  const rightPattern = rightSupportingContexts.length > 0 && (preferredRight || rightConnection);
  const boardOnly = sources.length > 0 && sources.every((source) => ['board_evidence', 'tactical_play'].includes(source.type));
  const evidence = [];
  selected.filter((context) => context.manualDescription).forEach((context) => evidence.push(`Descripción de jugada: ${context.playName}`));
  connections.forEach((connection) => evidence.push(`Conexión ${connection.origin} → ${connection.destination}${connection.frequency ? ` (${connection.frequency})` : ''}`));
  meaningfulPlayers.filter((player) => player.hasProfileData).forEach((player) => evidence.push(`Perfil de ${player.name}`));
  if (preferredRight) evidence.push('Perfil colectivo: ataque preferente por derecha');
  if (selected.some((context) => context.playerPositions && Object.keys(context.playerPositions).length)) evidence.push('Posiciones de la pizarra (evidencia visual)');
  const confidence = calculateEvidenceConfidence(sources);
  return {
    contexts: selected,
    sources,
    confidence,
    evidence: [...new Set(evidence)],
    conclusion: !selected.length
      ? 'Información insuficiente: no hay jugadas guardadas relevantes para esta pregunta.'
      : boardOnly
        ? 'Información insuficiente: solo existe evidencia visual de la pizarra pendiente de validar.'
        : rightPattern
        ? `Patrón por banda derecha respaldado por ${rightSupportingContexts.length} jugada${rightSupportingContexts.length === 1 ? '' : 's'} y fuentes registradas.`
        : 'Las jugadas aportan evidencias parciales; no existe un patrón suficientemente confirmado.',
    proposedAction: rightPattern
      ? 'Orientar la presión hacia fuera, bloquear la conexión interior y preparar cobertura sobre el receptor de banda.'
      : 'Validar el comportamiento con vídeo o nuevas observaciones antes de convertirlo en consigna.',
  };
};

export const buildPlayerTacticalParticipation = (contexts, playerId) => {
  const related = safeArray(contexts).filter((context) => context.involvedPlayers.some((player) => (
    player.playerId === playerId && player.meaningful
  )));
  const playerRows = related.map((context) => context.involvedPlayers.find((player) => player.playerId === playerId));
  const connections = [...new Map(related.flatMap((context) => {
    const player = context.involvedPlayers.find((item) => item.playerId === playerId);
    const playerTeam = clean(player?.boardKey).split(':')[0];
    return context.connections.filter((connection) => (
      player
      && (!playerTeam || connection.team === playerTeam)
      && connectionMatchesPlayer(connection, player)
    ));
  })
    .map((connection) => [connection.id || `${connection.origin}:${connection.destination}`, connection])).values()];
  return {
    playCount: related.length,
    plays: related.map((context) => ({ id: context.playId, name: context.playName, phase: context.phaseLabel })),
    phases: [...new Set(related.map((context) => context.phaseLabel))],
    connections,
    movements: playerRows.reduce((total, player) => total + player.involvementSignals.filter(({ type }) => type === 'movement_arrow').length, 0),
    passesAsLauncher: playerRows.reduce((total, player) => total + player.involvementSignals.filter(({ type, role }) => type === 'pass_arrow' && role === 'lanzador').length, 0),
    passesAsReceiver: playerRows.reduce((total, player) => total + player.involvementSignals.filter(({ type, role }) => type === 'pass_arrow' && role === 'receptor').length, 0),
    roles: [...new Set(playerRows.flatMap((player) => player.roles).filter((role) => role !== 'presente'))],
    observations: related.map((context) => context.manualDescription).filter(Boolean),
  };
};
