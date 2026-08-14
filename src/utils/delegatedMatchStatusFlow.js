import {
  applyDelegatedMatchStatus,
  getDelegatedDataStatus,
  getDelegatedMatchAudit,
} from './delegatedMatchValidation.js';

const getRpcCount = (rpcResult, key) => {
  const value = Number(rpcResult?.[key]);
  return Number.isFinite(value) ? value : null;
};

export const assertDelegatedMatchSnapshot = ({ snapshot, rpcResult, status }) => {
  if (!snapshot || !Array.isArray(snapshot.quickEvents)) {
    throw new Error('La recarga del Registro Delegado no devolvió match_quick_events.');
  }
  const audit = getDelegatedMatchAudit(snapshot);
  const expectedTotal = getRpcCount(rpcResult, 'total_events');
  const expectedValidated = getRpcCount(rpcResult, 'validated_events');
  const expectedPending = getRpcCount(rpcResult, 'pending_events');
  if (getDelegatedDataStatus(snapshot) !== status) {
    throw new Error(`La recarga devolvió estado ${getDelegatedDataStatus(snapshot)} en lugar de ${status}.`);
  }
  if (expectedTotal != null && audit.events.length !== expectedTotal) {
    throw new Error(`La recarga devolvió ${audit.events.length} eventos; la RPC confirmó ${expectedTotal}.`);
  }
  if (expectedValidated != null && audit.validated !== expectedValidated) {
    throw new Error(`La recarga devolvió ${audit.validated} eventos validados; la RPC confirmó ${expectedValidated}.`);
  }
  if (expectedPending != null && audit.pending !== expectedPending) {
    throw new Error(`La recarga devolvió ${audit.pending} eventos pendientes; la RPC confirmó ${expectedPending}.`);
  }
  return audit;
};

export const runDelegatedMatchStatusFlow = async ({
  currentMatch,
  status,
  persist,
  refresh,
  publish,
} = {}) => {
  const rpcResult = await persist();
  let nextMatch;
  let refreshError = null;
  let source = 'remote';
  try {
    const snapshot = await refresh();
    assertDelegatedMatchSnapshot({ snapshot, rpcResult, status });
    nextMatch = { ...currentMatch, ...snapshot };
  } catch (error) {
    refreshError = error;
    source = 'local-fallback';
    nextMatch = applyDelegatedMatchStatus(currentMatch, status, rpcResult?.reviewed_at || '');
  }
  await publish(nextMatch);
  return { rpcResult, nextMatch, refreshError, source };
};
