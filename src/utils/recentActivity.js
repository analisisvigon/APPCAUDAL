const UPDATE_CREATION_TOLERANCE_MS = 5000;
const DEFAULT_MODULE_LIMIT = 6;

const asArray = (value) => (Array.isArray(value) ? value : []);

const SOURCE_MODULE_KEYS = Object.freeze({
  wellness_entries: 'performance',
  rpe_entries: 'performance',
  training_sessions: 'performance',
  partidos: 'matches',
  jugadores: 'squad',
  equipos_rivales: 'teams',
});

const MODULE_CONFIG = Object.freeze({
  performance: {
    name: 'Rendimiento',
    tab: 'Rendimiento',
    typeOrder: [
      'Registro de Wellness recibido',
      'Registro de RPE recibido',
      'Sesión de entrenamiento creada',
    ],
  },
  matches: {
    name: 'Partidos',
    tab: 'Partidos',
    typeOrder: ['Partido creado', 'Partido actualizado'],
  },
  squad: {
    name: 'Plantilla',
    tab: 'Plantilla',
    typeOrder: ['Jugador añadido', 'Jugador actualizado'],
  },
  teams: {
    name: 'Equipos',
    tab: 'Equipos',
    typeOrder: ['Rival creado', 'Rival actualizado'],
  },
});

const TYPE_SUMMARIES = Object.freeze({
  'Registro de Wellness recibido': ['respuesta Wellness', 'respuestas Wellness'],
  'Registro de RPE recibido': ['respuesta RPE', 'respuestas RPE'],
  'Sesión de entrenamiento creada': ['sesión creada', 'sesiones creadas'],
  'Partido creado': ['partido creado', 'partidos creados'],
  'Partido actualizado': ['partido actualizado', 'partidos actualizados'],
  'Jugador añadido': ['jugador añadido', 'jugadores añadidos'],
  'Jugador actualizado': ['jugador actualizado', 'jugadores actualizados'],
  'Rival creado': ['rival creado', 'rivales creados'],
  'Rival actualizado': ['rival actualizado', 'rivales actualizados'],
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
  description,
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
    description,
    timestamp: timestamp.toISOString(),
  };
};

const buildEntityActivity = ({
  row,
  source,
  createdLabel,
  updatedLabel,
  entity,
  description,
}) => {
  const createdAt = createdAtFor(row);
  const updatedAt = updatedAtFor(row);
  if (!createdAt) return null;

  const isReliableUpdate = Boolean(
    updatedAt &&
    updatedAt.getTime() - createdAt.getTime() > UPDATE_CREATION_TOLERANCE_MS
  );

  return buildActivity({
    row,
    source,
    type: isReliableUpdate ? updatedLabel : createdLabel,
    entity,
    description,
    timestamp: isReliableUpdate ? updatedAt : createdAt,
  });
};

const buildCreatedActivity = ({
  row,
  source,
  type,
  entity,
  description,
  timestampKeys = ['created_at', 'createdAt'],
}) => buildActivity({
  row,
  source,
  type,
  entity,
  description,
  timestamp: parseTimestamp(firstValue(row, timestampKeys)),
});

const matchEntity = (match) => {
  const opponent = firstValue(match, ['opponent', 'rival']) || 'Rival';
  const isHome = Boolean(firstValue(match, ['is_home', 'isHome']));
  return isHome ? `Caudal vs ${opponent}` : `${opponent} vs Caudal`;
};

const playerEntity = (player) => (
  firstValue(player, ['shirt_name', 'shirtName', 'name', 'nombre']) || 'Jugador sin identificar'
);

const teamEntity = (team) => (
  firstValue(team, ['name', 'nombre']) || 'Rival sin identificar'
);

const sessionEntity = (session) => (
  firstValue(session, ['title', 'session_type', 'sessionType']) || 'Sesión de entrenamiento'
);

const formatSummaryCount = (type, count) => {
  const labels = TYPE_SUMMARIES[type];
  if (!labels || count <= 0) return '';
  return `${count} ${count === 1 ? labels[0] : labels[1]}`;
};

export const groupRecentActivity = (events = [], { limit = DEFAULT_MODULE_LIMIT } = {}) => {
  const uniqueEvents = new Map();
  asArray(events).filter(Boolean).forEach((event) => {
    if (
      event?.id &&
      event?.moduleKey &&
      MODULE_CONFIG[event.moduleKey] &&
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
      const latestEvent = sortedEvents[0];

      return {
        id: `recent-activity:${moduleKey}`,
        moduleKey,
        moduleName: config.name,
        tab: config.tab,
        summary: summaryParts.join(' · '),
        timestamp: latestEvent.timestamp,
        eventCount: sortedEvents.length,
        counts,
        events: sortedEvents,
      };
    })
    .filter((group) => group.summary)
    .sort((left, right) => (
      new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime() ||
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
} = {}, options = {}) => {
  const playerNames = new Map(asArray(players).map((player) => [
    String(firstValue(player, ['id']) || ''),
    playerEntity(player),
  ]));
  const activities = [];

  asArray(matches).forEach((match) => {
    activities.push(buildEntityActivity({
      row: match,
      source: 'partidos',
      createdLabel: 'Partido creado',
      updatedLabel: 'Partido actualizado',
      entity: matchEntity(match),
      description: ['Partido', formatStoredDate(firstValue(match, ['date']))].filter(Boolean).join(' · '),
    }));
  });

  asArray(teams).forEach((team) => {
    activities.push(buildEntityActivity({
      row: team,
      source: 'equipos_rivales',
      createdLabel: 'Rival creado',
      updatedLabel: 'Rival actualizado',
      entity: teamEntity(team),
      description: 'Equipo rival',
    }));
  });

  asArray(players).forEach((player) => {
    activities.push(buildEntityActivity({
      row: player,
      source: 'jugadores',
      createdLabel: 'Jugador añadido',
      updatedLabel: 'Jugador actualizado',
      entity: playerEntity(player),
      description: 'Plantilla',
    }));
  });

  asArray(trainingSessions).forEach((session) => {
    activities.push(buildCreatedActivity({
      row: session,
      source: 'training_sessions',
      type: 'Sesión de entrenamiento creada',
      entity: sessionEntity(session),
      description: ['Sesión', formatStoredDate(firstValue(session, ['session_date', 'sessionDate']))].filter(Boolean).join(' · '),
    }));
  });

  asArray(wellnessEntries).forEach((entry) => {
    const playerId = String(firstValue(entry, ['jugador_id', 'jugadorId']) || '');
    activities.push(buildCreatedActivity({
      row: entry,
      source: 'wellness_entries',
      type: 'Registro de Wellness recibido',
      entity: playerNames.get(playerId) || 'Jugador sin identificar',
      description: ['Respuesta', formatStoredDate(firstValue(entry, ['entry_date', 'entryDate']))].filter(Boolean).join(' · '),
    }));
  });

  asArray(rpeEntries).forEach((entry) => {
    const playerId = String(firstValue(entry, ['jugador_id', 'jugadorId']) || '');
    activities.push(buildCreatedActivity({
      row: entry,
      source: 'rpe_entries',
      type: 'Registro de RPE recibido',
      entity: playerNames.get(playerId) || 'Jugador sin identificar',
      description: ['Respuesta', formatStoredDate(firstValue(entry, ['entry_date', 'entryDate']))].filter(Boolean).join(' · '),
      timestampKeys: ['created_at', 'createdAt'],
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
