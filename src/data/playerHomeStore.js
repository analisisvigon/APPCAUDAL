import { loadPlayerAnalysisOverview } from './playerAnalysisStore.js';
import { loadMyPlayerMatches } from './playerMatchesStore.js';
import { loadPlayerPerformancePage } from './playerPerformanceStore.js';

export const PLAYER_HOME_PERFORMANCE_LIMIT = 1;

const settledDomain = (result, fallback) => (
  result.status === 'fulfilled'
    ? { status: 'ready', data: result.value, errorKind: '' }
    : { status: 'error', data: fallback, errorKind: result.reason?.kind || 'network' }
);

export async function loadPlayerHomeDashboard(client) {
  const [analysisResult, matchesResult, performanceResult] = await Promise.allSettled([
    loadPlayerAnalysisOverview(client),
    loadMyPlayerMatches(client),
    loadPlayerPerformancePage(client, { limit: PLAYER_HOME_PERFORMANCE_LIMIT })
      .then(({ wellness, rpe }) => ({ wellness: wellness.rows, rpe: rpe.rows })),
  ]);

  return {
    analysis: settledDomain(analysisResult, null),
    matches: settledDomain(matchesResult, []),
    performance: settledDomain(performanceResult, { wellness: [], rpe: [] }),
  };
}
