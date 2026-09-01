import { isAllowedPlayerAnalysisVideo } from '../data/playerAnalysisStore.js';

export const PLAYER_ANALYSIS_PARTIAL_NOTE = 'Dato disponible parcialmente';

export const PLAYER_ANALYSIS_COMPETITION_OPTIONS = Object.freeze([
  { value: 'season', label: 'Temporada' },
  { value: 'all', label: 'Todos' },
  { value: 'league', label: 'Liga' },
  { value: 'copa_rfef', label: 'Copa RFEF' },
  { value: 'playoff', label: 'Play Off' },
  { value: 'friendly', label: 'Amistoso' },
]);

export const PLAYER_ANALYSIS_VENUE_OPTIONS = Object.freeze([
  { value: 'all', label: 'Todos' },
  { value: 'home', label: 'Local' },
  { value: 'away', label: 'Visitante' },
]);

export const PLAYER_ANALYSIS_WINDOW_OPTIONS = Object.freeze([
  { value: 'last_3_event_matches', label: 'Últimos 3' },
  { value: 'last_5_event_matches', label: 'Últimos 5' },
  { value: 'full_scope', label: 'Temporada' },
]);

export const PLAYER_ANALYSIS_ACTION_FILTERS = Object.freeze(['Todos', 'Goles', 'Asistencias']);

const PLAYER_ANALYSIS_DISTRIBUTION_SCOPES = Object.freeze(['league', 'copa_rfef', 'playoff', 'friendly']);
const PLAYER_ANALYSIS_DISTRIBUTION_LABELS = new Map(
  PLAYER_ANALYSIS_COMPETITION_OPTIONS
    .filter((option) => PLAYER_ANALYSIS_DISTRIBUTION_SCOPES.includes(option.value))
    .map((option) => [option.value, option.label === 'Amistoso' ? 'Amistosos' : option.label]),
);

const PITCH_ZONE_CATALOG = Object.freeze([
  { value: 'finalizacion_izquierda', label: 'Finalización\nizquierda' },
  { value: 'finalizacion_centro', label: 'Finalización\ncentro' },
  { value: 'finalizacion_derecha', label: 'Finalización\nderecha' },
  { value: 'creacion_izquierda', label: 'Creación\nizquierda' },
  { value: 'creacion_centro', label: 'Creación\ncentro' },
  { value: 'creacion_derecha', label: 'Creación\nderecha' },
  { value: 'inicio_izquierda', label: 'Inicio\nizquierda' },
  { value: 'inicio_centro', label: 'Inicio\ncentro' },
  { value: 'inicio_derecha', label: 'Inicio\nderecha' },
]);

const GOAL_ZONE_CATALOG = Object.freeze([
  { value: 'alta_izquierda', label: 'Alta\nizquierda' },
  { value: 'alta_centro', label: 'Alta\ncentro' },
  { value: 'alta_derecha', label: 'Alta\nderecha' },
  { value: 'media_izquierda', label: 'Media\nizquierda' },
  { value: 'media_centro', label: 'Media\ncentro' },
  { value: 'media_derecha', label: 'Media\nderecha' },
  { value: 'baja_izquierda', label: 'Baja\nizquierda' },
  { value: 'baja_centro', label: 'Baja\ncentro' },
  { value: 'baja_derecha', label: 'Baja\nderecha' },
]);

const rows = (value) => Array.isArray(value) ? value : [];
const clean = (value) => String(value ?? '').trim();
const isPartial = (coverage) => coverage !== 'COMPLETE';

const safeMinutes = (value) => {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 0;
};

const safeHttpsImageUrl = (value) => {
  const candidate = clean(value);
  if (!candidate) return '';
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
};

export const shouldShowPlayerCompetitionMinutes = (competitionScope) => (
  competitionScope === 'season' || competitionScope === 'all'
);

export function buildCompetitionMinutesRows(source = {}, totalMinutesValue = 0) {
  const totalMinutes = safeMinutes(totalMinutesValue);
  if (source?.enabled !== true || totalMinutes === 0) {
    return {
      rows: [],
      totalMinutes,
      accountedMinutes: 0,
      reconciliationDelta: totalMinutes,
      unclassifiedMinutes: 0,
      percentageTotal: 0,
      reconciles: totalMinutes === 0,
    };
  }

  const scopeMinutes = new Map(
    rows(source.scopeMinutes).map((entry) => [clean(entry?.key), safeMinutes(entry?.minutes)]),
  );
  const historyByCompetition = new Map();
  let unclassifiedMinutes = 0;

  rows(source.historyRows).forEach((historyRow) => {
    const minutes = safeMinutes(historyRow?.minutes);
    const key = clean(historyRow?.competitionKey);
    if (!key) {
      unclassifiedMinutes += minutes;
      return;
    }
    if (!historyByCompetition.has(key)) {
      historyByCompetition.set(key, {
        key,
        name: '',
        logoUrl: '',
        historyMinutes: 0,
      });
    }
    const competition = historyByCompetition.get(key);
    competition.historyMinutes += minutes;
    if (!competition.name) competition.name = clean(historyRow?.competitionName);
    if (!competition.logoUrl) competition.logoUrl = safeHttpsImageUrl(historyRow?.competitionLogoUrl);
  });

  const knownRows = PLAYER_ANALYSIS_DISTRIBUTION_SCOPES
    .filter((key) => historyByCompetition.has(key))
    .map((key) => {
      const history = historyByCompetition.get(key);
      return {
        key,
        name: history.name || PLAYER_ANALYSIS_DISTRIBUTION_LABELS.get(key) || 'Competición',
        logoUrl: history.logoUrl,
        minutes: scopeMinutes.get(key) || 0,
      };
    });
  const additionalRows = [...historyByCompetition.values()]
    .filter((competition) => !PLAYER_ANALYSIS_DISTRIBUTION_SCOPES.includes(competition.key))
    .map((competition) => ({
      key: competition.key,
      name: competition.name || 'Competición',
      logoUrl: competition.logoUrl,
      minutes: competition.historyMinutes,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'es'));

  const visibleRows = [...knownRows, ...additionalRows].filter((row) => row.minutes > 0);
  const resultRows = visibleRows.map((row) => ({
    ...row,
    percentage: Math.round((row.minutes * 1000) / totalMinutes) / 10,
  }));
  const accountedMinutes = resultRows.reduce((total, row) => total + row.minutes, 0);
  const reconciliationDelta = totalMinutes - accountedMinutes;
  return {
    rows: resultRows,
    totalMinutes,
    accountedMinutes,
    reconciliationDelta,
    unclassifiedMinutes,
    percentageTotal: Math.round(resultRows.reduce((total, row) => total + row.percentage, 0) * 10) / 10,
    reconciles: reconciliationDelta === 0,
  };
}

export function buildPlayerAnalysisOverviewPresentation(overview = {}) {
  const matches = Number(overview.matchesPlayed) || 0;
  const minutes = Number(overview.minutes) || 0;
  const starts = Number(overview.starts) || 0;
  const goals = Number(overview.goals) || 0;
  const assists = Number(overview.assists) || 0;
  return {
    hasData: [
      Number(overview.matchRecords) || 0,
      matches,
      minutes,
      starts,
      goals,
      assists,
      Number(overview.yellowCards) || 0,
      Number(overview.redCards) || 0,
    ].some((value) => value > 0),
    goalsPartial: isPartial(overview.goalsCoverage),
    assistsPartial: isPartial(overview.assistsCoverage),
    contributionsPartial: isPartial(overview.goalContributionsCoverage)
      || isPartial(overview.goalsCoverage)
      || isPartial(overview.assistsCoverage),
    minutesPerMatch: matches > 0 ? Number(overview.minutesPerMatch) || minutes / matches : 0,
    participation: Math.min(100, Math.max(0, Number(overview.participationPercentage) || 0)),
    possibleMinutes: Math.max(0, Number(overview.possibleMinutes) || 0),
  };
}

export function filterPlayerProductionActions(actions = [], filter = 'Todos') {
  if (filter === 'Goles') return rows(actions).filter((action) => action.actionType === 'goal');
  if (filter === 'Asistencias') return rows(actions).filter((action) => action.actionType === 'assist');
  return rows(actions);
}

const buildZoneRows = (actions, keyField, nameField, catalog) => {
  const allowed = new Set(catalog.map((zone) => zone.value));
  const counts = new Map();
  const names = new Map();
  rows(actions).forEach((action) => {
    const key = clean(action?.[keyField]);
    if (!allowed.has(key)) return;
    counts.set(key, (counts.get(key) || 0) + 1);
    const safeName = clean(action?.[nameField]);
    if (safeName) names.set(key, safeName);
  });
  return catalog.map((zone) => ({
    ...zone,
    label: names.get(zone.value) || zone.label,
    count: counts.get(zone.value) || 0,
  }));
};

export function buildPlayerProductionZones(actions = []) {
  const goalActions = rows(actions).filter((action) => action.actionType === 'goal');
  const assistActions = rows(actions).filter((action) => action.actionType === 'assist');
  return {
    shots: buildZoneRows(goalActions, 'shotZoneKey', 'shotZoneName', PITCH_ZONE_CATALOG),
    assists: buildZoneRows(assistActions, 'assistZoneKey', 'assistZoneName', PITCH_ZONE_CATALOG),
    goals: buildZoneRows(goalActions, 'goalZoneKey', 'goalZoneName', GOAL_ZONE_CATALOG),
  };
}

export function getPlayerZoneMapGridClass(visibleMapCount) {
  if (visibleMapCount === 1) return 'max-w-md';
  if (visibleMapCount === 2) return 'max-w-4xl sm:grid-cols-2';
  return 'sm:grid-cols-2 xl:grid-cols-3';
}

const countCategory = (actions, field) => {
  const counts = new Map();
  rows(actions).forEach((action) => {
    const label = clean(action?.[field]);
    if (!label) return;
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'es'));
};

export function buildPlayerProductionCategories(actions = []) {
  const goalActions = rows(actions).filter((action) => action.actionType === 'goal');
  return {
    phases: countCategory(goalActions, 'phase'),
    subphases: countCategory(goalActions, 'subphase'),
    contacts: countCategory(goalActions, 'contact'),
  };
}

export function buildPlayerAnalysisConnections(actions = []) {
  const connections = new Map();
  rows(actions).forEach((action) => {
    const name = clean(action?.counterpartName);
    if (!name) return;
    const validGoalConnection = action.actionType === 'goal' && action.counterpartRole === 'assistant';
    const validAssistConnection = action.actionType === 'assist' && action.counterpartRole === 'scorer';
    if (!validGoalConnection && !validAssistConnection) return;
    if (!connections.has(name)) connections.set(name, { name, given: 0, received: 0, total: 0 });
    const connection = connections.get(name);
    if (validGoalConnection) connection.received += 1;
    if (validAssistConnection) connection.given += 1;
    connection.total += 1;
  });
  return [...connections.values()]
    .sort((left, right) => right.total - left.total || left.name.localeCompare(right.name, 'es'));
}

export const getPlayerAnalysisVideoActions = (actions = []) => (
  rows(actions).filter((action) => action.videoAvailable === true && clean(action.videoUrl))
);

const normalizeMatchIdentityPart = (value) => clean(value).toLocaleLowerCase('es-ES');

const getPlayerAnalysisMatchIdentity = (row = {}) => {
  const matchDate = normalizeMatchIdentityPart(row.matchDate);
  const opponent = normalizeMatchIdentityPart(row.opponent);
  const venue = normalizeMatchIdentityPart(row.venue);
  const competitionKey = normalizeMatchIdentityPart(row.competitionKey);
  const competitionName = normalizeMatchIdentityPart(row.competitionName);
  const competition = competitionKey ? `key:${competitionKey}` : competitionName ? `name:${competitionName}` : '';
  if (!matchDate || !opponent || !venue || !competition) return '';
  return JSON.stringify([matchDate, opponent, competition, venue]);
};

export function resolvePlayerHistoryVideoUrls(historyRows = [], productionActions = []) {
  const safeHistoryRows = rows(historyRows);
  const historyIdentityCounts = new Map();
  const actionsByIdentity = new Map();

  safeHistoryRows.forEach((row) => {
    const identity = getPlayerAnalysisMatchIdentity(row);
    if (identity) historyIdentityCounts.set(identity, (historyIdentityCounts.get(identity) || 0) + 1);
  });

  rows(productionActions).forEach((action) => {
    const identity = getPlayerAnalysisMatchIdentity(action);
    if (!identity || action.videoAvailable !== true || !isAllowedPlayerAnalysisVideo(action.videoUrl)) return;
    if (!actionsByIdentity.has(identity)) actionsByIdentity.set(identity, []);
    actionsByIdentity.get(identity).push(action.videoUrl);
  });

  return safeHistoryRows.map((row) => {
    if (row.hasAllowedVideo !== true) return null;
    const identity = getPlayerAnalysisMatchIdentity(row);
    if (!identity || historyIdentityCounts.get(identity) !== 1) return null;
    const matchingVideoUrls = actionsByIdentity.get(identity) || [];
    return matchingVideoUrls.length === 1 ? matchingVideoUrls[0] : null;
  });
}

export function formatPlayerAnalysisDate(value) {
  const source = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(source)) return source || 'Fecha no disponible';
  const [year, month, day] = source.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function getPlayerHistoryOutcomePresentation(outcome) {
  if (outcome === 'win') return { label: 'V', tone: 'bg-emerald-200/15 text-emerald-100' };
  if (outcome === 'loss') return { label: 'D', tone: 'bg-red-200/15 text-red-100' };
  if (outcome === 'draw') return { label: 'E', tone: 'bg-amber-200/15 text-amber-100' };
  return { label: '', tone: 'bg-white/[0.06] text-slate-400' };
}
