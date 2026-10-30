// Datos inventados para la revisión visual de Fase 2A. Nunca leer de Supabase.
export const SEASON_MEMORY_DEMO = Object.freeze({
  club: 'Al-Madina SC',
  team: 'Al-Madina SC Sub-23',
  season: '2026/27',
  generatedAt: '30 junio 2027',
  competitions: [
    { key: 'league', name: 'Liga', played: 20, wins: 11, draws: 5, losses: 4, goalsFor: 34, goalsAgainst: 19 },
    { key: 'cup', name: 'Copa', played: 4, wins: 3, draws: 0, losses: 1, goalsFor: 8, goalsAgainst: 4 },
    { key: 'friendly', name: 'Amistosos', played: 6, wins: 3, draws: 2, losses: 1, goalsFor: 12, goalsAgainst: 7 },
  ],
  match: {
    competition: 'Liga', competitionKey: 'league', round: 'Jornada 7', date: '15 noviembre 2026',
    home: 'Al-Madina SC Sub-23', away: 'Rival de demostración',
    homeGoals: 2, awayGoals: 1,
    stats: [
      { label: 'Posesión', home: 56, away: 44, suffix: '%' },
      { label: 'Tiros', home: 14, away: 9, suffix: '' },
      { label: 'Tiros a puerta', home: 6, away: 3, suffix: '' },
      { label: 'Córners', home: 7, away: 4, suffix: '' },
      { label: 'Faltas', home: 12, away: 15, suffix: '' },
    ],
    events: [
      { minute: "18'", label: 'Gol Al-Madina', side: 'home' },
      { minute: "34'", label: 'Gol rival', side: 'away' },
      { minute: "76'", label: 'Gol Al-Madina', side: 'home' },
    ],
    formation: '4-3-3',
    context: 'Victoria en casa · Partido de demostración',
    // Identificadores y posiciones ficticios. No corresponden a jugadores de la app.
    lineup: [
      { number: 1, name: 'Demo 01', role: 'POR', x: 50, y: 88 },
      { number: 2, name: 'Demo 02', role: 'LD', x: 84, y: 70 },
      { number: 4, name: 'Demo 04', role: 'DFC', x: 62, y: 75 },
      { number: 5, name: 'Demo 05', role: 'DFC', x: 38, y: 75 },
      { number: 3, name: 'Demo 03', role: 'LI', x: 16, y: 70 },
      { number: 6, name: 'Demo 06', role: 'MC', x: 50, y: 55 },
      { number: 8, name: 'Demo 08', role: 'MC', x: 73, y: 47 },
      { number: 10, name: 'Demo 10', role: 'MP', x: 27, y: 47 },
      { number: 7, name: 'Demo 07', role: 'ED', x: 80, y: 25 },
      { number: 9, name: 'Demo 09', role: 'DC', x: 50, y: 20 },
      { number: 11, name: 'Demo 11', role: 'EI', x: 20, y: 25 },
    ],
    videos: [
      { minute: "18'", label: 'Gol Al-Madina', url: null },
      { minute: "76'", label: 'Gol Al-Madina', url: null },
    ],
  },
});
