export const PLAYER_ANALYSIS_PARTIAL_NOTE = 'Dato disponible parcialmente';

const isPartialCoverage = (coverage) => coverage !== 'COMPLETE';

export function buildPlayerAnalysisPresentation(summary = {}) {
  const matches = Number(summary.matches) || 0;
  const starts = Number(summary.starts) || 0;
  const goals = Number(summary.goals) || 0;
  const assists = Number(summary.assists) || 0;
  const goalsPartial = isPartialCoverage(summary.goalsCoverage);
  const assistsPartial = isPartialCoverage(summary.assistsCoverage);

  return {
    hasSeasonData: [
      matches,
      Number(summary.minutes) || 0,
      starts,
      Number(summary.benchEntries) || 0,
      goals,
      assists,
      Number(summary.yellowCards) || 0,
      Number(summary.redCards) || 0,
    ].some((value) => value > 0),
    starterPercentage: matches > 0
      ? Math.min(100, Math.max(0, Math.round((starts / matches) * 100)))
      : null,
    contributions: goals + assists,
    goalsPartial,
    assistsPartial,
    contributionsPartial: goalsPartial || assistsPartial,
  };
}
