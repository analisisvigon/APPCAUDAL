const ANALYSIS_RPC = 'get_my_player_analysis_summary';

export class PlayerAnalysisLoadError extends Error {
  constructor(kind = 'network') {
    const messages = {
      invalid_session: 'La sesión ya no es válida.',
      identity_invalid: 'No se pudo resolver el análisis vinculado a esta cuenta.',
      network: 'No se pudo cargar Mi análisis.',
    };
    super(messages[kind] || messages.network);
    this.name = 'PlayerAnalysisLoadError';
    this.kind = kind;
  }
}

const isInvalidSessionError = (error) => {
  const status = Number(error?.status || error?.statusCode);
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return status === 401
    || code === 'PGRST301'
    || message.includes('jwt expired')
    || message.includes('invalid jwt');
};

const normalizeMetric = (value, { integer = false } = {}) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return integer ? Math.trunc(parsed) : parsed;
};

const normalizeCoverage = (value) => (
  String(value || '').trim().toUpperCase() === 'COMPLETE' ? 'COMPLETE' : 'PARTIAL'
);

export const normalizePlayerAnalysisSummary = (row) => ({
  matches: normalizeMetric(row?.matches, { integer: true }),
  minutes: normalizeMetric(row?.minutes),
  starts: normalizeMetric(row?.starts, { integer: true }),
  benchEntries: normalizeMetric(row?.bench_entries, { integer: true }),
  goals: normalizeMetric(row?.goals, { integer: true }),
  goalsCoverage: normalizeCoverage(row?.goals_coverage),
  assists: normalizeMetric(row?.assists, { integer: true }),
  assistsCoverage: normalizeCoverage(row?.assists_coverage),
  yellowCards: normalizeMetric(row?.yellow_cards),
  redCards: normalizeMetric(row?.red_cards, { integer: true }),
});

export async function loadPlayerAnalysisSummary(client) {
  if (!client || typeof client.rpc !== 'function') {
    throw new PlayerAnalysisLoadError('invalid_session');
  }

  let response;
  try {
    response = await client.rpc(ANALYSIS_RPC);
  } catch (error) {
    throw new PlayerAnalysisLoadError(isInvalidSessionError(error) ? 'invalid_session' : 'network');
  }

  if (response?.error) {
    throw new PlayerAnalysisLoadError(
      isInvalidSessionError(response.error) ? 'invalid_session' : 'network',
    );
  }

  if (!Array.isArray(response?.data)) {
    throw new PlayerAnalysisLoadError('identity_invalid');
  }
  if (response.data.length === 0) return null;
  if (response.data.length !== 1) {
    throw new PlayerAnalysisLoadError('identity_invalid');
  }

  const row = response.data[0];
  if (!row || typeof row !== 'object' || !String(row.jugador_id || '').trim()) {
    throw new PlayerAnalysisLoadError('identity_invalid');
  }

  return normalizePlayerAnalysisSummary(row);
}
