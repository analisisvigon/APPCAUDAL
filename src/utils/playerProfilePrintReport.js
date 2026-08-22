const rows = (value) => Array.isArray(value) ? value : [];
const clean = (value) => String(value ?? '').trim();

export const getPlayerReportActionUrl = (value) => {
  const url = clean(value);
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
};

const normalizeAction = (action = {}) => ({
  ...action,
  id: clean(action.id),
  type: clean(action.type || action.action),
  minute: clean(action.minute),
  opponent: clean(action.opponent),
  competition: clean(action.competition),
  date: clean(action.date),
  description: clean(action.description),
  url: getPlayerReportActionUrl(action.url || action.videoUrl),
});

const normalizeHistoryRow = (row = {}) => ({
  ...row,
  goalLinks: rows(row.goalLinks).map(getPlayerReportActionUrl).filter(Boolean),
  assistLinks: rows(row.assistLinks).map(getPlayerReportActionUrl).filter(Boolean),
});

const PRODUCTION_CONNECTION_LIMIT = 4;
const CONNECTIONS_PER_CONTINUATION_PAGE = 12;

export const buildPlayerOffensiveConnections = ({ society, playerName }) => rows(society)
  .flatMap((row, rowIndex) => {
    const teammateName = clean(row.name);
    if (!teammateName) return [];
    const given = Number(row.given);
    const received = Number(row.received);
    return [
      Number.isFinite(given) && given > 0
        ? { id: `given-${rowIndex}-${teammateName}`, from: clean(playerName), to: teammateName, count: given }
        : null,
      Number.isFinite(received) && received > 0
        ? { id: `received-${rowIndex}-${teammateName}`, from: teammateName, to: clean(playerName), count: received }
        : null,
    ];
  })
  .filter((connection) => connection && connection.from && connection.to)
  .sort((first, second) => second.count - first.count
    || first.from.localeCompare(second.from, 'es')
    || first.to.localeCompare(second.to, 'es'));

export const buildPlayerProfilePrintReport = (source = {}) => {
  const actions = rows(source.actions).map(normalizeAction).filter((action) => action.type || action.description);
  const history = rows(source.history).map(normalizeHistoryRow);
  const influenceMaps = rows(source.influenceMaps).length
    ? rows(source.influenceMaps).map((map) => ({ ...map, zones: rows(map.zones) }))
    : [{ key: 'all', label: 'Todos', zones: rows(source.influenceZones) }];
  const competitionBreakdown = rows(source.competitionBreakdown)
    .filter((competition) => Number(competition.played || 0) > 0)
    .map((competition) => ({
      ...competition,
      goalContributions: Number(competition.goalContributions ?? (Number(competition.goals || 0) + Number(competition.assists || 0))),
    }));
  const videoActions = actions.filter((action) => action.url);
  const summaryHistoryLimit = Math.max(10, 18 - Math.max(0, competitionBreakdown.length - 4));
  const summaryHistory = history.slice(0, summaryHistoryLimit);
  const historyOverflow = [];
  for (let index = summaryHistory.length; index < history.length; index += 30) historyOverflow.push(history.slice(index, index + 30));
  const productionActions = videoActions.slice(0, 10);
  const actionOverflow = [];
  for (let index = productionActions.length; index < videoActions.length; index += 16) actionOverflow.push(videoActions.slice(index, index + 16));
  const offensiveConnections = buildPlayerOffensiveConnections({ society: source.society, playerName: source.identity?.name });
  const productionConnections = offensiveConnections.slice(0, PRODUCTION_CONNECTION_LIMIT);
  const connectionOverflow = [];
  for (let index = productionConnections.length; index < offensiveConnections.length; index += CONNECTIONS_PER_CONTINUATION_PAGE) {
    connectionOverflow.push(offensiveConnections.slice(index, index + CONNECTIONS_PER_CONTINUATION_PAGE));
  }
  const pagePlan = [
    'summary',
    'production',
    ...connectionOverflow.map(() => 'connections'),
    ...historyOverflow.map(() => 'history'),
    ...actionOverflow.map(() => 'video'),
  ];

  return {
    identity: source.identity || {},
    filters: source.filters || {},
    seasonSummary: source.seasonSummary || {},
    competitionBreakdown,
    production: source.production || {},
    influenceMaps,
    society: rows(source.society),
    offensiveConnections,
    productionConnections,
    connectionOverflow,
    actions,
    history,
    summaryHistory,
    historyOverflow,
    productionActions,
    actionOverflow,
    pagePlan,
  };
};
