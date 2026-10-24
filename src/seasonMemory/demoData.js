// Datos inventados para la revisión visual de Fase 2A. Nunca leer de Supabase.
export const SEASON_MEMORY_DEMO = Object.freeze({
  club: 'Almadina SC',
  team: 'Almadina SC Sub-23',
  season: '2026/27',
  generatedAt: '30 junio 2027',
  competitions: [
    { key: 'league', name: 'Liga', played: 20, wins: 11, draws: 5, losses: 4, goalsFor: 34, goalsAgainst: 19 },
    { key: 'cup', name: 'Copa', played: 4, wins: 3, draws: 0, losses: 1, goalsFor: 8, goalsAgainst: 4 },
    { key: 'friendly', name: 'Amistosos', played: 6, wins: 3, draws: 2, losses: 1, goalsFor: 12, goalsAgainst: 7 },
  ],
  match: {
    competition: 'Liga', round: 'Jornada 7', date: '15 noviembre 2026',
    home: 'Almadina SC Sub-23', away: 'Rival de demostración',
    homeGoals: 2, awayGoals: 1,
    stats: [
      { label: 'Posesión', home: 56, away: 44, suffix: '%' },
      { label: 'Tiros', home: 14, away: 9, suffix: '' },
      { label: 'Tiros a puerta', home: 6, away: 3, suffix: '' },
      { label: 'Córners', home: 7, away: 4, suffix: '' },
      { label: 'Faltas', home: 12, away: 15, suffix: '' },
    ],
    events: [
      { minute: "18'", label: 'Gol Almadina', side: 'home' },
      { minute: "34'", label: 'Gol rival', side: 'away' },
      { minute: "76'", label: 'Gol Almadina', side: 'home' },
    ],
    // Identificadores ficticios. Ninguno corresponde a un jugador de la app.
    lineup: Array.from({ length: 11 }, (_, index) => ({
      number: index + 1,
      name: `Jugador demo ${String(index + 1).padStart(2, '0')}`,
    })),
    videos: [
      { minute: "18'", label: 'Gol Almadina', url: null },
      { minute: "76'", label: 'Gol Almadina', url: null },
    ],
  },
});
