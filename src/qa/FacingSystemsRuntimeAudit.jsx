import React from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';

const UUIDS = {
  user: '00000000-0000-4000-8000-000000000001',
  match: '00000000-0000-4000-8000-000000000010',
  team: '00000000-0000-4000-8000-000000000020',
};

const makeUuid = (prefix, index) => `00000000-0000-4000-${prefix}-${String(index).padStart(12, '0')}`;
const withAnalysis = new URLSearchParams(window.location.search).get('analysis') !== 'empty';

const rivalPlayers = Array.from({ length: 11 }, (_, index) => ({
  id: makeUuid('8001', index + 1),
  equipo_rival_id: UUIDS.team,
  name: `Rival ${index + 1}`,
  number: index + 1,
  position: index === 0 ? 'Portero' : index < 5 ? 'Defensa' : index < 9 ? 'Centrocampista' : 'Delantero',
  role: 'Titular',
}));

const ownPlayers = Array.from({ length: 11 }, (_, index) => ({
  id: makeUuid('8002', index + 1),
  name: `Caudal ${index + 1}`,
  number: index + 1,
  position: index === 0 ? 'Portero' : index < 5 ? 'Defensa' : index < 9 ? 'Centrocampista' : 'Delantero',
  active_in_squad: true,
}));

const basePlay = {
  id: 'qa-play-1',
  name: 'Jugada QA',
  rivalSystem: '4-4-2',
  caudalSystem: '4-4-2',
  playerPositions: {},
  arrows: [],
  ballStartPosition: { x: 50, y: 50 },
  ballVisible: true,
  description: 'Jugada representativa para comprobar el render.',
  createdAt: '2026-09-17T10:00:00.000Z',
  updatedAt: '2026-09-17T10:00:00.000Z',
};

const preAiAnalysis = withAnalysis ? {
  defensivePhaseV1: {
    version: 1,
    activeSituation: 'mid_block',
    activePlayIdBySituation: { mid_block: 'qa-defensive' },
    plays: [{ ...basePlay, id: 'qa-defensive', phase: 'defensive', defensiveSituation: 'mid_block' }],
  },
  offensivePhaseV1: {
    version: 1,
    activeSituation: 'build_up',
    activePlayStyleBySituation: { build_up: 'combinative' },
    activePlayIdByContext: { 'build_up:combinative': 'qa-offensive' },
    plays: [{ ...basePlay, id: 'qa-offensive', phase: 'offensive', offensiveSituation: 'build_up', playStyle: 'combinative' }],
  },
  transitionPhaseV1: {
    version: 1,
    activeTransitionType: 'offensive_transition',
    activeFieldZoneByType: { offensive_transition: 'defensive_half' },
    activeBehaviourByContext: { 'offensive_transition:defensive_half': 'fast_attack' },
    activePlayIdByContext: { 'offensive_transition:defensive_half:fast_attack': 'qa-transition' },
    plays: [{ ...basePlay, id: 'qa-transition', phase: 'transition', transitionType: 'offensive_transition', fieldZone: 'defensive_half', behaviour: 'fast_attack' }],
  },
  setPiecePhaseV1: {
    version: 1,
    activeSetPieceType: 'offensive_set_piece',
    activeActionByType: { offensive_set_piece: 'corner', defensive_set_piece: 'corner' },
    activeBallPositionByContext: { 'offensive_set_piece:corner': { x: 4, y: 4 } },
    activePlayIdByContext: { 'offensive_set_piece:corner:4:4': 'qa-set-piece' },
    plays: [{
      ...basePlay,
      id: 'qa-set-piece',
      phase: 'set_piece',
      setPieceType: 'offensive_set_piece',
      setPieceAction: 'corner',
      ballStartPosition: { x: 4, y: 4 },
      ballVisible: true,
      responsibilities: {},
    }],
  },
} : null;

const match = {
  id: UUIDS.match,
  date: '2026-09-20',
  time: '17:00',
  type: 'Liga',
  competition_key: 'league',
  round: 'Jornada QA',
  stadium: 'Hermanos Antuna',
  opponent: 'Rival QA',
  is_home: true,
  status: 'Previa',
  equipo_rival_id: UUIDS.team,
  pre_caudal_system: '4-4-2',
  pre_rival_system: '4-4-2',
  pre_ai_analysis: preAiAnalysis,
};

const tableRows = {
  jugadores: ownPlayers,
  partidos: [match],
  equipos_rivales: [{ id: UUIDS.team, name: 'Rival QA', system: '4-4-2', stadium: 'Campo rival' }],
  jugadores_rivales: rivalPlayers,
  equipo_rival_alineacion: rivalPlayers.map((player, index) => ({
    equipo_rival_id: UUIDS.team,
    jugador_rival_id: player.id,
    player_name: player.name,
    role: 'Titular',
    slot: index,
  })),
  partido_alineacion_slots: rivalPlayers.map((player, index) => ({
    partido_id: UUIDS.match,
    scope: 'pre_rival',
    slot: index,
    player_name: player.name,
    jugador_rival_id: player.id,
  })),
};

const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
  if (!url.hostname.includes('supabase')) return originalFetch(input, init);
  const table = url.pathname.split('/').filter(Boolean).at(-1);
  const accept = new Headers(init.headers || (typeof input === 'string' ? undefined : input.headers)).get('accept') || '';
  const rows = tableRows[table] || [];
  const body = accept.includes('application/vnd.pgrst.object+json')
    ? JSON.stringify(rows[0] || {})
    : JSON.stringify(rows);
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}`,
    },
  });
};

window.__FACING_SYSTEMS_QA__ = { withAnalysis, errors: [] };
window.addEventListener('error', (event) => {
  window.__FACING_SYSTEMS_QA__.errors.push({ type: 'error', message: event.message, stack: event.error?.stack || '' });
});
window.addEventListener('unhandledrejection', (event) => {
  window.__FACING_SYSTEMS_QA__.errors.push({ type: 'rejection', message: String(event.reason?.message || event.reason), stack: event.reason?.stack || '' });
});

const session = {
  access_token: 'qa-access-token',
  refresh_token: 'qa-refresh-token',
  expires_at: 4102444800,
  user: { id: UUIDS.user, email: 'qa@appcaudal.local' },
};

const { default: App } = await import('../App.jsx');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App controlledSession={session} onControlledSignOut={() => {}} />
  </React.StrictMode>
);
