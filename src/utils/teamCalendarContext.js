export const chooseCalendarContext = (contexts, preferredContextId) => {
  const preferred = contexts.find((row) => row.id === preferredContextId);
  if (preferred) return preferred.id;
  if (preferredContextId) return '';
  const active = contexts.filter((row) => row.is_active);
  if (active.length === 1) return active[0].id;
  return contexts.length === 1 ? contexts[0].id : '';
};

export const scopeCalendarMatches = (matches, contextId) => contextId
  ? (matches || []).filter((row) =>
    (row.clubTeamSeasonId || row.club_team_season_id) === contextId)
  : [];
