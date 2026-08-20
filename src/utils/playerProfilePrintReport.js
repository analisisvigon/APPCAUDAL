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
  description: clean(action.description),
  url: getPlayerReportActionUrl(action.url || action.videoUrl),
});

const normalizeHistoryRow = (row = {}) => ({
  ...row,
  goalLinks: rows(row.goalLinks).map(getPlayerReportActionUrl).filter(Boolean),
  assistLinks: rows(row.assistLinks).map(getPlayerReportActionUrl).filter(Boolean),
});

export const buildPlayerProfilePrintReport = (source = {}) => {
  const actions = rows(source.actions).map(normalizeAction).filter((action) => action.type || action.description);
  const timeline = rows(source.timeline).map((group) => ({
    ...group,
    events: rows(group.events).map(normalizeAction),
  }));
  const history = rows(source.history).map(normalizeHistoryRow);
  const live = Number(source.live?.eventCount || 0) > 0 ? source.live : null;
  const hasDetails = Boolean(actions.length || timeline.length || history.length || live);

  return {
    identity: source.identity || {},
    filters: source.filters || {},
    metrics: rows(source.metrics),
    seasonStages: rows(source.seasonStages),
    production: source.production || {},
    influenceZones: rows(source.influenceZones),
    goalZones: rows(source.goalZones),
    goalPhases: rows(source.goalPhases),
    society: rows(source.society),
    actions,
    timeline,
    history,
    live,
    pagePlan: ['summary', 'production', ...(hasDetails ? ['details'] : [])],
  };
};
