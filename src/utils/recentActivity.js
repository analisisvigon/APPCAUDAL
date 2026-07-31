const UPDATE_CREATION_TOLERANCE_MS = 5000;
const DEFAULT_MODULE_LIMIT = 6;
const DEFAULT_WINDOW_DAYS = 7;

const asArray = (value) => (Array.isArray(value) ? value : []);

const SOURCE_MODULE_KEYS = Object.freeze({
  wellness_entries: 'performance',
  rpe_entries: 'performance',
  training_sessions: 'performance',
  partidos: 'matches',
  jugadores: 'squad',
  equipos_rivales: 'teams',
  jugadores_rivales: 'teams',
  player_team_memberships: 'teams',
});

const MODULE_CONFIG = Object.freeze({
  performance: {
    label: 'Rendimiento',
    tab: 'Rendimiento',
    typeOrder: [
      'Registro de Wellness recibido',
      'Registro de RPE recibido',
      'Sesión de entrenamiento creada',
    ],
  },
  matches: {
    label: 'Partidos',
    tab: 'Partidos',
    typeOrder: ['Partido creado', 'Partido actualizado'],
  },
  squad: {
    label: 'Plantilla',
    tab: 'Plantilla',
    typeOrder: ['Jugador añadido', 'Jugador actualizado'],
  },
  teams: {
    label: 'Equipos',
    tab: 'Equipos',
    typeOrder: [
      'Jugador rival añadido',
      'Jugador rival actualizado',
      'Rival creado',
      'Rival actualizado',
    ],
  },
});

const TYPE_SUMMARIES = Object.freeze({
  'Registro de Wellness recibido': ['Wellness', 'Wellness'],
  'Registro de RPE recibido': ['RPE', 'RPE'],
  'Sesión de entrenamiento creada': ['sesión', 'sesiones'],
  'Partido creado': ['partido creado', 'partidos creados'],
  'Partido actualizado': ['partido actualizado', 'partidos actualizados'],
  'Jugador añadido': ['jugador añadido', 'jugadores añadidos'],
  'Jugador actualizado': ['jugador actualizado', 'jugadores actualizados'],
  'Jugador rival añadido': ['jugador rival añadido', 'jugadores rivales añadidos'],
  'Jugador rival actualizado': ['jugador rival actualizado', 'jugadores rivales actualizados'],
  'Rival creado': ['equipo creado', 'equipos creados'],
  'Rival actualizado': ['equipo actualizado', 'equipos actualizados'],
});

const LATEST_EVENT_LABELS = Object.freeze({
  'Registro de Wellness recibido': 'Último Wellness',
  'Registro de RPE recibido': 'Último RPE',
  'Sesión de entrenamiento creada': 'Última sesión creada',
  'Partido creado': 'Último partido creado',
  'Partido actualizado': 'Último partido actualizado',
  'Jugador añadido': 'Último jugador añadido',
  'Jugador actualizado': 'Último jugador actualizado',
  'Jugador rival añadido': 'Último jugador añadido',
  'Jugador rival actualizado': 'Último jugador actualizado',
  'Rival creado': 'Último equipo rival creado',
  'Rival actualizado': 'Último equipo rival actualizado',
});

const parseTimestamp = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const firstValue = (row, keys) => keys
  .map((key) => row?.[key])
  .find((value) => value !== null && value !== undefined && String(value).trim());

const createdAtFor = (row) => parseTimestamp(firstValue(row, ['created_at', 'createdAt']));
const updatedAtFor = (row) => parseTimestamp(firstValue(row, ['updated_at', 'updatedAt']));

const formatStoredDate = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
};

const getModuleKey = (source) => SOURCE_MODULE_KEYS[source] || null;

const buildActivity = ({
  row,
  source,
  type,
  entity,
  context = '',
  timestamp,
}) => {
  const moduleKey = getModuleKey(source);
  if (!moduleKey || !timestamp) return null;
  const entityId = firstValue(row, ['id']) || entity;

  return {
    id: `${source}:${entityId}:${type}:${timestamp.toISOString()}`,
    source,
    moduleKey,
    type,
    entity,
    context,
    timestamp: timestamp.toISOString(),
  };
};

const buildEntityActivities = ({
  row,
  source,
  createdLabel,
  updatedLabel,
  entity,
  context = '',
}) => {
  const createdAt = createdAtFor(row);
  const updatedAt = updatedAtFor(row);
  if (!createdAt) return [];

  const activities = [buildActivity({
    row,
    source,
    type: createdLabel,
    entity,
    context,
    timestamp: createdAt,
  })];
  const isReliableUpdate = Boolean(
    updatedAt &&
    updatedAt.getTime() - createdAt.getTime() > UPDATE_CREATION_TOLERANCE_MS
  );
  if (isReliableUpdate) {
    activities.push(buildActivity({
      row,
      source,
      type: updatedLabel,
      entity,
      context,
      timestamp: updatedAt,
    }));
  }
  return activities.filter(Boolean);
};

const buildCreatedActivity = ({
  row,
  source,
  type,
  entity,
  context = '',
  timestampKeys = ['created_at', 'createdAt'],
}) => buildActivity({
  row,
  source,
  type,
  entity,
  context,
  timestamp: parseTimestamp(firstValue(row, timestampKeys)),
});

const matchEntity = (match) => {
  const opponent = firstValue(match, ['opponent', 'rival']) || 'Rival no disponible';
  const isHome = Boolean(firstValue(match, ['is_home', 'isHome']));
  return isHome ? `Caudal vs ${opponent}` : `${opponent} vs Caudal`;
};

const playerEntity = (player, fallback = 'Jugador no disponible') => (
  firstValue(player, ['shirt_name', 'shirtName', 'name', 'nombre']) || fallback
);

const teamEntity = (team) => (
  firstValue(team, ['name', 'nombre']) || 'Equipo no disponible'
);

const sessionEntity = (session) => (
  firstValue(session, ['title', 'session_type', 'sessionType']) || 'Sesión de entrenamiento'
);

const isOwnClubTeam = (team) => (
  Boolean(team?.isOwnClub) ||
  firstValue(team, ['team_kind', 'teamKind']) === 'own'
);

const formatSummaryCount = (type, count) => {
  const labels = TYPE_SUMMARIES[type];
  if (!labels || count <= 0) return '';
  return `${count} ${count === 1 ? labels[0] : labels[1]}`;
};

const newestOfTypes = (events, types) => (
  types
    .map((type) => events.find((event) => event.type === type))
    .find(Boolean) || null
);

const selectLatestEvent = (moduleKey, sortedEvents) => {
  if (moduleKey === 'squad') {
    return newestOfTypes(sortedEvents, ['Jugador añadido', 'Jugador actualizado']);
  }
  if (moduleKey === 'teams') {
    return newestOfTypes(sortedEvents, [
      'Jugador rival añadido',
      'Jugador rival actualizado',
    ]) || sortedEvents.find((event) => (
      event.type === 'Rival creado' || event.type === 'Rival actualizado'
    )) || null;
  }
  return sortedEvents[0] || null;
};

export const groupRecentActivity = (events = [], {
  limit = DEFAULT_MODULE_LIMIT,
  nowValue = Date.now(),
  windowDays = DEFAULT_WINDOW_DAYS,
} = {}) => {
  const now = parseTimestamp(nowValue) || new Date();
  const normalizedWindowDays = Math.max(1, Number(windowDays) || DEFAULT_WINDOW_DAYS);
  const windowStart = now.getTime() - normalizedWindowDays * 24 * 60 * 60 * 1000;
  const uniqueEvents = new Map();

  asArray(events).filter(Boolean).forEach((event) => {
    const eventTime = parseTimestamp(event?.timestamp)?.getTime();
    if (
      event?.id &&
      event?.moduleKey &&
      MODULE_CONFIG[event.moduleKey] &&
      Number.isFinite(eventTime) &&
      eventTime >= windowStart &&
      eventTime <= now.getTime() &&
      !uniqueEvents.has(event.id)
    ) {
      uniqueEvents.set(event.id, event);
    }
  });

  const groups = new Map();
  uniqueEvents.forEach((event) => {
    const current = groups.get(event.moduleKey) || [];
    current.push(event);
    groups.set(event.moduleKey, current);
  });

  return [...groups.entries()]
    .map(([moduleKey, moduleEvents]) => {
      const config = MODULE_CONFIG[moduleKey];
      const sortedEvents = [...moduleEvents].sort((left, right) => (
        new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime() ||
        left.id.localeCompare(right.id)
      ));
      const counts = sortedEvents.reduce((result, event) => {
        result[event.type] = (result[event.type] || 0) + 1;
        return result;
      }, {});
      const summaryParts = config.typeOrder
        .map((type) => formatSummaryCount(type, counts[type] || 0))
        .filter(Boolean);
      const latestEvent = selectLatestEvent(moduleKey, sortedEvents);
      if (!latestEvent || !summaryParts.length) return null;

      return {
        id: `recent-activity:${moduleKey}`,
        moduleKey,
        moduleLabel: config.label,
        tab: config.tab,
        latestEvent,
        latestEventType: LATEST_EVENT_LABELS[latestEvent.type] || latestEvent.type,
        latestEntityLabel: latestEvent.entity,
        latestContextLabel: latestEvent.context,
        latestTimestamp: latestEvent.timestamp,
        summary: summaryParts.join(' · '),
        summaryPeriodLabel: `Últimos ${normalizedWindowDays} días`,
        eventCount: sortedEvents.length,
        counts,
        events: sortedEvents,
      };
    })
    .filter(Boolean)
    .sort((left, right) => (
      new Date(right.latestTimestamp).getTime() - new Date(left.latestTimestamp).getTime() ||
      left.moduleKey.localeCompare(right.moduleKey)
    ))
    .slice(0, Math.max(0, Number(limit) || 0));
};

export const buildRecentActivity = ({
  matches = [],
  teams = [],
  players = [],
  trainingSessions = [],
  wellnessEntries = [],
  rpeEntries = [],
  rivalPlayers = [],
  globalPlayers = [],
  rivalMemberships = [],
} = {}, options = {}) => {
  const playerNames = new Map(asArray(players).map((player) => [
    String(firstValue(player, ['id']) || ''),
    playerEntity(player),
  ]));
  const teamsById = new Map(asArray(teams).map((team) => [
    String(firstValue(team, ['id']) || ''),
    team,
  ]));
  const globalPlayersById = new Map(asArray(globalPlayers).map((player) => [
    String(firstValue(player, ['id']) || ''),
    player,
  ]));
  const activities = [];

  asArray(matches).forEach((match) => {
    activities.push(...buildEntityActivities({
      row: match,
      source: 'partidos',
      createdLabel: 'Partido creado',
      updatedLabel: 'Partido actualizado',
      entity: matchEntity(match),
      context: formatStoredDate(firstValue(match, ['date'])),
    }));
  });

  asArray(teams).filter((team) => !isOwnClubTeam(team)).forEach((team) => {
    activities.push(...buildEntityActivities({
      row: team,
      source: 'equipos_rivales',
      createdLabel: 'Rival creado',
      updatedLabel: 'Rival actualizado',
      entity: teamEntity(team),
    }));
  });

  asArray(players).forEach((player) => {
    activities.push(...buildEntityActivities({
      row: player,
      source: 'jugadores',
      createdLabel: 'Jugador añadido',
      updatedLabel: 'Jugador actualizado',
      entity: playerEntity(player),
    }));
  });

  asArray(trainingSessions).forEach((session) => {
    activities.push(buildCreatedActivity({
      row: session,
      source: 'training_sessions',
      type: 'Sesión de entrenamiento creada',
      entity: sessionEntity(session),
      context: formatStoredDate(firstValue(session, ['session_date', 'sessionDate'])),
    }));
  });

  asArray(wellnessEntries).forEach((entry) => {
    const playerId = String(firstValue(entry, ['jugador_id', 'jugadorId']) || '');
    activities.push(buildCreatedActivity({
      row: entry,
      source: 'wellness_entries',
      type: 'Registro de Wellness recibido',
      entity: playerNames.get(playerId) || 'Jugador no disponible',
      context: formatStoredDate(firstValue(entry, ['entry_date', 'entryDate'])),
    }));
  });

  asArray(rpeEntries).forEach((entry) => {
    const playerId = String(firstValue(entry, ['jugador_id', 'jugadorId']) || '');
    activities.push(buildCreatedActivity({
      row: entry,
      source: 'rpe_entries',
      type: 'Registro de RPE recibido',
      entity: playerNames.get(playerId) || 'Jugador no disponible',
      context: formatStoredDate(firstValue(entry, ['entry_date', 'entryDate'])),
      timestampKeys: ['created_at', 'createdAt'],
    }));
  });

  const membershipIds = new Set();
  const membershipPlayerTeams = new Set();
  asArray(rivalMemberships).forEach((membership) => {
    const teamId = String(firstValue(membership, ['team_id', 'teamId']) || '');
    const playerId = String(firstValue(membership, ['player_id', 'playerId']) || '');
    const team = teamsById.get(teamId);
    if (team && isOwnClubTeam(team)) return;
    const membershipId = String(firstValue(membership, ['id']) || '');
    if (membershipId) membershipIds.add(membershipId);
    if (playerId && teamId) membershipPlayerTeams.add(`${playerId}:${teamId}`);
    const player = globalPlayersById.get(playerId);
    activities.push(...buildEntityActivities({
      row: membership,
      source: 'player_team_memberships',
      createdLabel: 'Jugador rival añadido',
      updatedLabel: 'Jugador rival actualizado',
      entity: playerEntity(player, 'Jugador rival no disponible'),
      context: teamEntity(team),
    }));
  });

  asArray(rivalPlayers).forEach((rivalPlayer) => {
    const teamId = String(firstValue(rivalPlayer, ['equipo_rival_id', 'team_id', 'teamId']) || '');
    const globalPlayerId = String(firstValue(rivalPlayer, ['global_player_id', 'globalPlayerId']) || '');
    const membershipId = String(firstValue(rivalPlayer, ['membership_id', 'membershipId']) || '');
    const team = teamsById.get(teamId);
    if (team && isOwnClubTeam(team)) return;
    if (
      (membershipId && membershipIds.has(membershipId)) ||
      (globalPlayerId && teamId && membershipPlayerTeams.has(`${globalPlayerId}:${teamId}`))
    ) return;

    activities.push(...buildEntityActivities({
      row: rivalPlayer,
      source: 'jugadores_rivales',
      createdLabel: 'Jugador rival añadido',
      updatedLabel: 'Jugador rival actualizado',
      entity: playerEntity(rivalPlayer, 'Jugador rival no disponible'),
      context: teamEntity(team),
    }));
  });

  return groupRecentActivity(activities, options);
};

export const formatRecentActivityTime = (timestamp, nowValue = Date.now()) => {
  const date = parseTimestamp(timestamp);
  const now = parseTimestamp(nowValue) || new Date();
  if (!date) return '';

  const differenceMs = Math.max(0, now.getTime() - date.getTime());
  const minutes = Math.floor(differenceMs / 60000);
  if (minutes < 1) return 'Ahora';
  if (minutes < 60) return `Hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? 'Hace 1 día' : `Hace ${days} días`;

  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};
