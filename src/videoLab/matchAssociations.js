export function preparePreMatches(rows, context) {
  if (!context?.id || !Array.isArray(rows)) return [];
  const seen = new Set();
  return rows.filter((row) => {
    const ctsId = row?.club_team_season_id || row?.clubTeamSeasonId;
    if (!row?.id || ctsId !== context.id || seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  }).map((row) => ({
    id: row.id,
    ctsId: context.id,
    opponent: String(row.opponent || '').trim() || 'Rival pendiente',
    date: row.date || '',
    time: row.time || '',
    status: row.status || 'Previa',
  })).sort((a, b) => `${a.date} ${a.time} ${a.opponent}`.localeCompare(`${b.date} ${b.time} ${b.opponent}`));
}

export function canSeeLocalAnalysis(analysis, { userId, ownerRole, context }) {
  if (!analysis || !userId) return false;
  if (analysis.ownerUserId && analysis.ownerUserId !== userId) return false;
  if (!analysis.ownerUserId && ownerRole !== 'owner') return false;
  if (!analysis.matchPreId) return true;
  const link = analysis.matchPre;
  return Boolean(context && link && analysis.matchPreId === link.id &&
    link.ctsId === context.id && link.clubId === context.clubId &&
    link.teamId === context.teamId && link.seasonId === context.seasonId);
}

export function isAnalysisForMatch(analysis, matchId, context) {
  return Boolean(analysis?.matchPreId && analysis.matchPreId === matchId &&
    analysis.matchPre?.ctsId === context?.id);
}

export function associateLocalAnalysis(analysis, match, context, userId) {
  if (!analysis || !match || !context || !userId ||
      match.ctsId !== context.id || context.seasonStatus !== 'open' ||
      !context.clubId || !context.teamId || !context.seasonId ||
      (analysis.ownerUserId && analysis.ownerUserId !== userId) ||
      (analysis.matchPreId && !isAnalysisForMatch(analysis, match.id, context))) return null;
  return {
    ...analysis,
    ownerUserId: userId,
    matchPreId: match.id,
    matchPre: {
      id: match.id,
      ctsId: context.id,
      clubId: context.clubId,
      teamId: context.teamId,
      seasonId: context.seasonId,
      opponent: match.opponent,
      date: match.date,
    },
  };
}
