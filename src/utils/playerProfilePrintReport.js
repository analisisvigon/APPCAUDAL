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
  result: clean(action.result),
  phase: clean(action.phase),
  subphase: clean(action.subphase),
  shotZone: clean(action.shotZone),
  shotZoneLabel: clean(action.shotZoneLabel),
  assistZone: clean(action.assistZone),
  assistZoneLabel: clean(action.assistZoneLabel),
  goalZone: clean(action.goalZone),
  goalZoneLabel: clean(action.goalZoneLabel),
  contact: clean(action.contact),
  scorer: clean(action.scorer),
  assistant: clean(action.assistant),
  createdAt: clean(action.createdAt),
  description: clean(action.description),
  url: getPlayerReportActionUrl(action.url || action.videoUrl),
});

const normalizeHistoryRow = (row = {}) => ({
  ...row,
  goalLinks: rows(row.goalLinks).map(getPlayerReportActionUrl).filter(Boolean),
  assistLinks: rows(row.assistLinks).map(getPlayerReportActionUrl).filter(Boolean),
});

const PRODUCTION_CONNECTION_LIMIT = 5;
const PRODUCTION_ACTION_LIMIT = 6;
const ACTIONS_PER_CONTINUATION_PAGE = 10;

const totalZones = (maps) => rows(maps)
  .flatMap((map) => rows(map.zones))
  .reduce((sum, zone) => sum + Number(zone.count || 0), 0);

const goalAnalysisTotal = (analysis = {}) => Math.max(
  Number(analysis.bodyParts?.total || 0),
  Number(analysis.types?.total || 0),
  Number(analysis.target?.total || 0),
);

export const buildPlayerCompetitionProfile = (competitionBreakdown = []) => {
  const competitions = rows(competitionBreakdown).filter((competition) => Number(competition.played || 0) > 0);
  if (competitions.length === 1) {
    const competition = competitions[0];
    return {
      mode: 'single',
      key: clean(competition.key),
      label: clean(competition.label),
      logoUrl: clean(competition.logoUrl || competition.logo_url),
      icon: clean(competition.icon),
    };
  }
  if (competitions.length > 1) return { mode: 'multiple', key: '', label: 'Temporada completa', logoUrl: '', icon: '' };
  return { mode: 'empty', key: '', label: 'Sin competición registrada', logoUrl: '', icon: '' };
};

export const buildPlayerProductionMapLayout = ({ maps = [], seasonSummary = {} } = {}) => {
  const normalizedMaps = rows(maps).map((map) => ({ ...map, zones: rows(map.zones) }));
  const goals = Number(seasonSummary.goals || 0);
  const assists = Number(seasonSummary.assists || 0);
  const totalFor = (map) => rows(map.zones).reduce((sum, zone) => sum + Number(zone.count || 0), 0);
  const visibleMaps = normalizedMaps.filter((map) => {
    const total = totalFor(map);
    if (map.key === 'goals') return goals > 0 || total > 0;
    if (map.key === 'assists') return assists > 0 || total > 0;
    if (map.key === 'all') return goals + assists > 0 || total > 0;
    return total > 0;
  });
  return {
    maps: visibleMaps,
    columns: Math.min(3, visibleMaps.length),
    hiddenKeys: normalizedMaps.filter((map) => !visibleMaps.includes(map)).map((map) => map.key),
  };
};

export const buildPlayerDossierSectionPlan = (report = {}) => {
  const offensiveOutput = Number(report.production?.goalContributions || 0) > 0;
  const influenceMapLayout = report.influenceMapLayout || buildPlayerProductionMapLayout({ maps: report.influenceMaps, seasonSummary: report.seasonSummary });
  const sections = [
    { key: 'performance', label: 'Rendimiento', visible: true },
    { key: 'competitions', label: 'Rendimiento por competición', visible: rows(report.competitionBreakdown).length > 0 },
    { key: 'history', label: 'Historial partido a partido', visible: true },
    { key: 'zones', label: 'Zonas de producción', visible: influenceMapLayout.maps.length > 0 },
    { key: 'production', label: 'Producción ofensiva', visible: offensiveOutput },
    { key: 'connections', label: 'Conexiones ofensivas', visible: rows(report.offensiveConnections).length > 0 },
    { key: 'goalAnalysis', label: 'Análisis objetivo de finalización', visible: goalAnalysisTotal(report.goalAnalysis) > 0 },
    { key: 'videos', label: 'Acciones en vídeo', visible: rows(report.videoActions).length > 0 },
  ];
  return sections
    .filter((section) => section.visible)
    .map(({ visible, ...section }, index) => ({ ...section, number: String(index + 1).padStart(2, '0') }));
};

export const buildPlayerOffensiveConnections = ({ society, playerName }) => rows(society)
  .flatMap((row, rowIndex) => {
    const teammateName = clean(row.name);
    if (!teammateName) return [];
    const given = Number(row.given);
    const received = Number(row.received);
    return [
      Number.isFinite(given) && given > 0
        ? { id: `given-${rowIndex}-${teammateName}`, direction: 'given', from: clean(playerName), to: teammateName, count: given }
        : null,
      Number.isFinite(received) && received > 0
        ? { id: `received-${rowIndex}-${teammateName}`, direction: 'received', from: teammateName, to: clean(playerName), count: received }
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
      minutesPerMatch: Number(competition.minutesPerMatch ?? (
        Number(competition.played || 0) > 0 ? Math.round(Number(competition.minutes || 0) / Number(competition.played || 0)) : 0
      )),
      goalContributions: Number(competition.goalContributions ?? (Number(competition.goals || 0) + Number(competition.assists || 0))),
    }));
  const competitionProfile = buildPlayerCompetitionProfile(competitionBreakdown);
  const influenceMapLayout = buildPlayerProductionMapLayout({ maps: influenceMaps, seasonSummary: source.seasonSummary });
  const videoActions = actions.filter((action) => action.url);
  const summaryHistoryLimit = Math.max(10, 18 - Math.max(0, competitionBreakdown.length - 4));
  const summaryHistory = history.slice(0, summaryHistoryLimit);
  const historyOverflow = [];
  for (let index = summaryHistory.length; index < history.length; index += 30) historyOverflow.push(history.slice(index, index + 30));
  const productionActions = videoActions.slice(0, PRODUCTION_ACTION_LIMIT);
  const actionOverflow = [];
  for (let index = productionActions.length; index < videoActions.length; index += ACTIONS_PER_CONTINUATION_PAGE) actionOverflow.push(videoActions.slice(index, index + ACTIONS_PER_CONTINUATION_PAGE));
  const offensiveConnections = buildPlayerOffensiveConnections({ society: source.society, playerName: source.identity?.name });
  const productionConnections = offensiveConnections.slice(0, PRODUCTION_CONNECTION_LIMIT);
  const connectionOverflow = [];
  const influenceZoneTotal = totalZones(influenceMaps);
  const goalAnalysisCount = goalAnalysisTotal(source.goalAnalysis);
  const hasProduction = influenceZoneTotal > 0
    || offensiveConnections.length > 0
    || goalAnalysisCount > 0
    || videoActions.length > 0
    || Number(source.production?.goalContributions || 0) > 0;
  const pagePlan = [
    'summary',
    ...(hasProduction ? ['production'] : []),
    ...historyOverflow.map(() => 'history'),
    ...actionOverflow.map(() => 'video'),
  ];

  const report = {
    identity: source.identity || {},
    filters: source.filters || {},
    validation: source.validation || {},
    seasonSummary: source.seasonSummary || {},
    competitionBreakdown,
    competitionProfile,
    positionUsage: source.positionUsage || {},
    production: source.production || {},
    hasProduction,
    goalAnalysis: source.goalAnalysis || {},
    influenceMaps,
    influenceMapLayout,
    society: rows(source.society),
    offensiveConnections,
    productionConnections,
    connectionOverflow,
    actions,
    videoActions,
    history,
    summaryHistory,
    historyOverflow,
    productionActions,
    actionOverflow,
    pagePlan,
  };
  report.sectionPlan = buildPlayerDossierSectionPlan(report);
  return report;
};
