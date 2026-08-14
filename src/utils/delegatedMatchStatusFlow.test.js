import assert from 'node:assert/strict';
import { buildDelegatedStatsDataset, aggregateDelegatedStats } from './delegatedStats.js';
import { getDelegatedMatchAudit } from './delegatedMatchValidation.js';
import { runDelegatedMatchStatusFlow } from './delegatedMatchStatusFlow.js';

const playerId = '11111111-1111-4111-8111-111111111111';
const currentMatch = {
  id: '33333333-3333-4333-8333-333333333333',
  delegatedDataStatus: 'Revisado',
  quickEvents: [
    ...Array.from({ length: 59 }, (_, index) => ({
      id: `valid-${index}`,
      partidoId: '33333333-3333-4333-8333-333333333333',
      tipoEvento: 'tiro',
      equipo: 'caudal',
      playerId,
      jugadorId: playerId,
      reviewed: false,
    })),
    ...Array.from({ length: 2 }, (_, index) => ({
      id: `pending-${index}`,
      partidoId: '33333333-3333-4333-8333-333333333333',
      tipoEvento: 'tiro',
      equipo: 'caudal',
      playerId: null,
      jugadorId: null,
      reviewed: false,
    })),
  ],
};
const rpcResult = {
  partido_id: currentMatch.id,
  delegated_data_status: 'Validado',
  reviewed_at: '2026-08-14T12:00:00Z',
  total_events: 61,
  validated_events: 59,
  pending_events: 2,
  unidentified_events: 2,
};
const remoteSnapshot = {
  ...currentMatch,
  delegatedDataStatus: 'Validado',
  delegatedReviewedAt: rpcResult.reviewed_at,
  quickEvents: currentMatch.quickEvents.map((event, index) => ({ ...event, reviewed: index < 59 })),
};
let dashboardMatches = [currentMatch];
assert.equal(getDelegatedMatchAudit(currentMatch).validated, 0, 'el partido parte con 0 eventos reviewed');
const transition = await runDelegatedMatchStatusFlow({
  currentMatch,
  status: 'Validado',
  persist: async () => rpcResult,
  refresh: async () => remoteSnapshot,
  publish: async (nextMatch) => { dashboardMatches = [nextMatch]; },
});
const dashboardDataset = buildDelegatedStatsDataset({ matches: dashboardMatches });
assert.equal(transition.source, 'remote');
assert.equal(getDelegatedMatchAudit(dashboardMatches[0]).validated, 59, 'la recarga publica 59 eventos reviewed');
assert.equal(dashboardDataset.events.length, 59, 'validar y recargar entrega 59 eventos al dashboard');
assert.equal(aggregateDelegatedStats(dashboardDataset.events).shots, 59, 'las métricas dejan de estar vacías tras publicar la recarga');

let fallbackMatches = [currentMatch];
const fallback = await runDelegatedMatchStatusFlow({
  currentMatch,
  status: 'Validado',
  persist: async () => rpcResult,
  refresh: async () => { throw new Error('fallo de red'); },
  publish: async (nextMatch) => { fallbackMatches = [nextMatch]; },
});
assert.equal(fallback.source, 'local-fallback');
assert.equal(buildDelegatedStatsDataset({ matches: fallbackMatches }).events.length, 59, 'el fallback no conserva el cache con 0 reviewed');

await assert.rejects(
  () => runDelegatedMatchStatusFlow({
    currentMatch,
    status: 'Validado',
    persist: async () => { throw new Error('RPC no disponible'); },
    refresh: async () => remoteSnapshot,
    publish: async () => {},
  }),
  /RPC no disponible/,
  'si la RPC falla no se publica un estado falso',
);

console.log('delegatedMatchStatusFlow tests passed');
