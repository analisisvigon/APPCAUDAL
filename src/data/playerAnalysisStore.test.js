import assert from 'node:assert/strict';
import {
  PlayerAnalysisLoadError,
  loadPlayerAnalysisSummary,
  normalizePlayerAnalysisSummary,
} from './playerAnalysisStore.js';

const validRow = {
  jugador_id: 'resolved-only-by-backend',
  matches: '7',
  minutes: '462',
  starts: '6',
  bench_entries: '0',
  goals: '0',
  goals_coverage: 'PARTIAL',
  assists: '2',
  assists_coverage: 'COMPLETE',
  yellow_cards: '1',
  red_cards: '0',
};

const calls = [];
const client = {
  rpc(...args) {
    calls.push(args);
    return Promise.resolve({ data: [validRow], error: null });
  },
};

const summary = await loadPlayerAnalysisSummary(client);
assert.deepEqual(calls, [['get_my_player_analysis_summary']], 'La RPC propia se invoca sin argumentos de identidad.');
assert.deepEqual(summary, {
  matches: 7,
  minutes: 462,
  starts: 6,
  benchEntries: 0,
  goals: 0,
  goalsCoverage: 'PARTIAL',
  assists: 2,
  assistsCoverage: 'COMPLETE',
  yellowCards: 1,
  redCards: 0,
});
assert.equal('jugador_id' in summary, false, 'El identificador usado para validar la respuesta no llega a la UI.');

assert.equal(await loadPlayerAnalysisSummary({ rpc: async () => ({ data: [], error: null }) }), null);
await assert.rejects(
  () => loadPlayerAnalysisSummary({ rpc: async () => ({ data: [validRow, validRow], error: null }) }),
  (error) => error instanceof PlayerAnalysisLoadError && error.kind === 'identity_invalid',
);
await assert.rejects(
  () => loadPlayerAnalysisSummary({ rpc: async () => ({ data: [{}], error: null }) }),
  (error) => error instanceof PlayerAnalysisLoadError && error.kind === 'identity_invalid',
);
await assert.rejects(
  () => loadPlayerAnalysisSummary({ rpc: async () => ({ data: null, error: null }) }),
  (error) => error instanceof PlayerAnalysisLoadError && error.kind === 'identity_invalid',
);
await assert.rejects(
  () => loadPlayerAnalysisSummary({ rpc: async () => ({ data: null, error: { message: 'offline' } }) }),
  (error) => error instanceof PlayerAnalysisLoadError && error.kind === 'network',
);
await assert.rejects(
  () => loadPlayerAnalysisSummary({ rpc: async () => { throw Object.assign(new Error('JWT expired'), { status: 401 }); } }),
  (error) => error instanceof PlayerAnalysisLoadError && error.kind === 'invalid_session',
);
await assert.rejects(
  () => loadPlayerAnalysisSummary(null),
  (error) => error instanceof PlayerAnalysisLoadError && error.kind === 'invalid_session',
);

let attempts = 0;
const retryClient = {
  async rpc() {
    attempts += 1;
    return attempts === 1
      ? { data: null, error: { message: 'temporary failure' } }
      : { data: [validRow], error: null };
  },
};
await assert.rejects(() => loadPlayerAnalysisSummary(retryClient), PlayerAnalysisLoadError);
assert.equal((await loadPlayerAnalysisSummary(retryClient)).matches, 7, 'Un reintento limpio puede recuperar la carga.');

assert.deepEqual(
  normalizePlayerAnalysisSummary({ matches: '-2', minutes: 'bad', goals_coverage: 'complete' }),
  {
    matches: 0,
    minutes: 0,
    starts: 0,
    benchEntries: 0,
    goals: 0,
    goalsCoverage: 'COMPLETE',
    assists: 0,
    assistsCoverage: 'PARTIAL',
    yellowCards: 0,
    redCards: 0,
  },
  'Los tipos y coberturas se normalizan de forma conservadora.',
);

console.log('playerAnalysisStore: RPC propia, identidad implícita, tipos, vacíos, errores y retry validados.');
