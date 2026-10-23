// Contrato mínimo de las RPC que usa CtsCoreApp. Todo vive en memoria.
// Los IDs y registros son deliberadamente ficticios y no son UUID reales.
export const DEMO_ACTIVE_CTS_ID = 'demo-libya-cts';
export const DEMO_ARCHIVE_CTS_ID = 'demo-caudal-archive-cts';

const memberships = [
  {
    user_id: 'demo-personal-account', membership_id: 'demo-membership-libya',
    is_active: true, role: 'owner', club_id: 'demo-club-libya',
    club_name: 'Club de Libia · DEMO',
    contexts: [{
      club_team_season_id: DEMO_ACTIVE_CTS_ID,
      club_id: 'demo-club-libya', team_id: 'demo-team-libya',
      season_id: 'demo-season-libya', season_label: '2026/27',
      season_status: 'open', season_is_active: true,
      team_name: 'Equipo de Libia', team_code: 'LIB-DEMO', team_crest: '',
    }],
  },
  {
    user_id: 'demo-personal-account', membership_id: 'demo-membership-caudal',
    is_active: true, role: 'owner', club_id: 'demo-club-caudal',
    club_name: 'Caudal · DEMO',
    contexts: [{
      club_team_season_id: DEMO_ARCHIVE_CTS_ID,
      club_id: 'demo-club-caudal', team_id: 'demo-team-caudal',
      season_id: 'demo-season-caudal', season_label: '2024/25',
      season_status: 'closed', season_is_active: false,
      team_name: 'Caudal (archivo simulado)', team_code: 'CAU-DEMO', team_crest: '',
    }],
  },
];

const roster = {
  [DEMO_ACTIVE_CTS_ID]: [
    { id: 'demo-libya-player-01', name: 'Jugador ficticio L-01', position: 'Portero' },
    { id: 'demo-libya-player-02', name: 'Jugador ficticio L-02', position: 'Defensa' },
    { id: 'demo-libya-player-03', name: 'Jugador ficticio L-03', position: 'Centrocampista' },
    { id: 'demo-libya-player-04', name: 'Jugador ficticio L-04', position: 'Delantero' },
  ],
  [DEMO_ARCHIVE_CTS_ID]: [
    { id: 'demo-caudal-player-01', name: 'Jugador ficticio C-01', position: 'Portero' },
    { id: 'demo-caudal-player-02', name: 'Jugador ficticio C-02', position: 'Defensa' },
    { id: 'demo-caudal-player-03', name: 'Jugador ficticio C-03', position: 'Delantero' },
  ],
};

const matches = {
  [DEMO_ACTIVE_CTS_ID]: [
    { id: 'demo-libya-match-01', club_team_season_id: DEMO_ACTIVE_CTS_ID,
      date: '2026-11-07', opponent: 'Rival ficticio L-A' },
    { id: 'demo-libya-match-02', club_team_season_id: DEMO_ACTIVE_CTS_ID,
      date: '2026-11-14', opponent: 'Rival ficticio L-B' },
  ],
  [DEMO_ARCHIVE_CTS_ID]: [
    { id: 'demo-caudal-match-01', club_team_season_id: DEMO_ARCHIVE_CTS_ID,
      date: '2025-03-09', opponent: 'Rival ficticio C-A' },
    { id: 'demo-caudal-match-02', club_team_season_id: DEMO_ARCHIVE_CTS_ID,
      date: '2025-04-20', opponent: 'Rival ficticio C-B' },
  ],
};

const copy = (value) => JSON.parse(JSON.stringify(value));

export function createDemoClient() {
  return Object.freeze({
    async rpc(name, args = {}) {
      if (name === 'my_access_contexts_v1') return { data: copy(memberships), error: null };
      const id = args.p_club_team_season_id;
      if (name === 'my_cts_jugadores_v1' && Object.hasOwn(roster, id)) {
        return { data: copy(roster[id]), error: null };
      }
      if (name === 'my_cts_matches_v1' && Object.hasOwn(matches, id)) {
        return { data: copy(matches[id]), error: null };
      }
      return { data: null, error: { code: '42501', message: 'Operación fuera de la demo.' } };
    },
  });
}
