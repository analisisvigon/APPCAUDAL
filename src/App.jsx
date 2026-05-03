import { useEffect, useMemo, useRef, useState } from 'react';

const clubCrest =
  'https://tmssl.akamaized.net//images/wappen/head/13226.png?lm=1747769013';

const teamsStorageKey = 'caudal-opponent-teams';
const matchesStorageKey = 'caudal-matches';

const besoccerPlayerImage = (id) =>
  `https://cdn.resfu.com/img_data/players/medium/${id}.jpg?size=120x&lossy=1`;

const samplePlayers = [
  { id: 1, name: 'Pablo Díez', dob: '2002-02-13', number: 1, position: 'Portero', foot: 'Ambas', image: besoccerPlayerImage(993926) },
  { id: 2, name: 'Roberto Jara', dob: '1998-09-10', number: 1, position: 'Portero', foot: 'Derecha', image: '' },
  { id: 3, name: 'Javi Moral', dob: '2005-03-19', number: 13, position: 'Portero', foot: 'No indicada', image: '' },
  { id: 4, name: 'Roberto Albuquerque', dob: '1993-11-04', number: 4, position: 'Defensa central', foot: 'No indicada', image: besoccerPlayerImage(3337542) },
  { id: 5, name: 'Agustín Porto', dob: '1995-03-20', number: 20, position: 'Defensa central', foot: 'No indicada', image: '' },
  { id: 6, name: 'Mario Sánchez', dob: '2004-09-14', number: 5, position: 'Defensa central', foot: 'Derecha', image: besoccerPlayerImage(996212) },
  { id: 7, name: 'Borja Rodríguez', dob: '1998-10-21', number: 19, position: 'Lateral izquierdo', foot: 'No indicada', image: besoccerPlayerImage(190774) },
  { id: 8, name: 'Marcos Trabanco', dob: '2001-02-27', number: 2, position: 'Lateral derecho', foot: 'No indicada', image: besoccerPlayerImage(921989) },
  { id: 9, name: 'Sergio Ordóñez', dob: '2001-01-04', number: 21, position: 'Lateral derecho', foot: 'Derecha', image: besoccerPlayerImage(934311) },
  { id: 10, name: 'Santi Cabrera', dob: '2005-01-01', number: 17, position: 'Lateral derecho', foot: 'No indicada', image: '' },
  { id: 11, name: 'Vicente Antuña', dob: '2005-01-01', number: 6, position: 'Mediocentro', foot: 'No indicada', image: '' },
  { id: 12, name: 'Kike Fanjul', dob: '1993-12-24', number: 8, position: 'Mediocentro', foot: 'Derecha', image: besoccerPlayerImage(192110) },
  { id: 13, name: 'Michael Oladipupo', dob: '2004-03-06', number: 24, position: 'Mediocentro', foot: 'No indicada', image: '' },
  { id: 14, name: 'Iván Elena', dob: '1999-04-27', number: 22, position: 'Mediocentro ofensivo', foot: 'Ambas', image: besoccerPlayerImage(393748) },
  { id: 15, name: 'Julio Delgado', dob: '1996-01-28', number: 18, position: 'Extremo izquierdo', foot: 'No indicada', image: besoccerPlayerImage(232521) },
  { id: 16, name: 'Diego Boza', dob: '2002-08-23', number: 7, position: 'Extremo izquierdo', foot: 'No indicada', image: '' },
  { id: 17, name: 'Nacho Velardi', dob: '1995-01-26', number: 10, position: 'Extremo derecho', foot: 'Izquierda', image: besoccerPlayerImage(414456) },
  { id: 18, name: 'Diego Montequín', dob: '2002-02-05', number: 11, position: 'Extremo derecho', foot: 'Derecha', image: besoccerPlayerImage(951254) },
  { id: 19, name: 'Claudio Medina', dob: '1993-09-04', number: 9, position: 'Delantero centro', foot: 'No indicada', image: besoccerPlayerImage(188741) },
  { id: 20, name: 'Jairo Cárcaba', dob: '1992-05-27', number: 14, position: 'Delantero centro', foot: 'Derecha', image: besoccerPlayerImage(110439) },
];

const positions = [
  'Portero',
  'Lateral derecho',
  'Lateral izquierdo',
  'Defensa central',
  'Central derecho',
  'Central izquierdo',
  'Pivote',
  'Mediocentro',
  'Mediocentro ofensivo',
  'Extremo derecho',
  'Extremo izquierdo',
  'Mediapunta',
  'Delantero centro',
  'Delantero',
];

const footOptions = ['Derecha', 'Izquierda', 'Ambas', 'No indicada'];

const squadGroups = [
  {
    title: 'Porteros',
    positions: ['Portero'],
  },
  {
    title: 'Defensas',
    positions: ['Lateral derecho', 'Lateral izquierdo', 'Defensa central', 'Central derecho', 'Central izquierdo'],
  },
  {
    title: 'Mediocentros',
    positions: ['Pivote', 'Mediocentro', 'Mediocentro ofensivo', 'Mediapunta'],
  },
  {
    title: 'Delanteros',
    positions: ['Extremo derecho', 'Extremo izquierdo', 'Delantero centro', 'Delantero'],
  },
];

const gameSystems = ['4-4-2', '4-2-3-1', '4-3-3', '3-5-2', '3-4-3', '3-4-1-2', '5-3-2', '5-4-1', 'Otro'];
const matchTypes = ['Liga', 'Copa RFEF', 'Play off', 'Amistoso'];
const matchFilters = ['Todos', ...matchTypes];
const defaultEventTypes = [
  { id: 'goal-for', name: 'Gol favor', color: 'emerald' },
  { id: 'goal-against', name: 'Gol rival', color: 'red' },
  { id: 'chance', name: 'Ocasión', color: 'sky' },
  { id: 'recovery', name: 'Recuperación', color: 'violet' },
  { id: 'loss', name: 'Pérdida', color: 'amber' },
  { id: 'card', name: 'Tarjeta', color: 'orange' },
];
const eventColorOptions = ['emerald', 'red', 'sky', 'violet', 'amber', 'orange', 'slate'];
const goalPhaseOptions = {
  'Juego combinativo': ['Dentro del área', 'Fuera del área'],
  'Juego directo': ['Centro al área', 'Segunda jugada'],
  Transición: ['Tras robo', 'Tras ABP'],
  ABP: ['Córner', 'Falta directa', 'Falta con remate', 'Saque de banda', 'Penalti', 'Segunda jugada'],
};
const pitchZoneOptions = [
  'F.Finalización izquierda',
  'F.Finalización centro',
  'F.Finalización derecha',
  'F.Creación izquierda',
  'F.Creación centro',
  'F.Creación derecha',
  'F.Inicio izquierda',
  'F.Inicio centro',
  'F.Inicio derecha',
];
const goalZoneOptions = ['Alta izquierda', 'Alta centro', 'Alta derecha', 'Media izquierda', 'Media centro', 'Media derecha', 'Baja izquierda', 'Baja centro', 'Baja derecha'];
const defaultGoalAnalysisDraft = {
  type: 'Gol a favor',
  half: '1ª parte',
  minute: '',
  scorer: '',
  assistant: '',
  phase: 'Juego combinativo',
  subphase: 'Dentro del área',
  shotZone: 'F.Creación centro',
  assistZone: 'F.Creación centro',
  goalZone: 'Media centro',
  contact: 'Pie derecho',
  videoUrl: '',
};

const emptyMatchForm = {
  date: '',
  time: '',
  type: 'Liga',
  round: '',
  stadium: '',
  opponent: '',
  opponentCrest: '',
  homeTeam: 'C.D. Caudal',
  awayTeam: '',
  isHome: true,
  status: 'Previa',
  homeScore: '',
  awayScore: '',
  goalsFor: '',
  goalsAgainst: '',
  shots: '',
  shotsOnTarget: '',
  possession: '',
  corners: '',
  yellowCards: '',
  redCards: '',
  cleanSheet: false,
  statsGoalEvents: [],
  statsSystem: '4-4-2',
  statsLineup: [],
  statsCalledPlayers: [],
  statsPlayerData: {},
  preNotes: '',
  postNotes: '',
  postReality: '',
  postFulfilled: '',
  postNotFulfilled: '',
  postWhy: '',
  postNextAdjustment: '',
  postRepeat: '',
  postImprove: '',
  postTrainWeek: '',
  postIndividualObservations: '',
  postAiAnalysis: null,
  // PRE Partido - Plan de partido
  planConBalon: '',
  planSinBalon: '',
  planTransiciones: '',
  planClave: '',
  planObjetivo: '',
  // PRE Partido - ABP
  abpEnlace: '',
  abpOfensiva: '',
  abpDefensiva: '',
  // PRE Partido - Sistemas enfrentados
  preCanvaLink: '',
  preCaudalSystem: '4-4-2',
  preCaudalLineup: [],
  preRivalSystem: '',
  preRivalLineup: [],
  preRivalManualPlayers: [],
  preRivalStyle: '',
  preRivalStrengths: '',
  preRivalWeaknesses: '',
  preRivalBuildUp: 'Combinativo',
  preRivalDefensiveBlock: 'Medio',
  preRivalPressure: 'Media',
  preRivalTransitions: 'Equilibradas',
  preRivalOffensiveOrganization: '',
  preRivalBaseSystem: '',
  preRivalStartPlay: '',
  preRivalProgression: '',
  preRivalFinishing: '',
  preRivalOffensiveKeyPlayers: '',
  preRivalDangerZones: '',
  preRivalWideAttack: '',
  preRivalBoxOccupation: '',
  preRivalDefensiveOrganization: '',
  preRivalDefensiveSystem: '',
  preRivalBlockHeightDetail: '',
  preRivalPressureType: '',
  preRivalSpacesAllowed: '',
  preRivalDefendsCrosses: '',
  preRivalDefendsBack: '',
  preRivalSecondBallDefense: '',
  preRivalAfterLoss: '',
  preRivalAfterRecovery: '',
  preRivalTransitionLaunchers: '',
  preRivalBestRunningZones: '',
  preRivalCornersFor: '',
  preRivalCornersAgainst: '',
  preRivalWideFreeKicks: '',
  preRivalSetPieceTakers: '',
  preRivalMainHeaders: '',
  preCaudalIntent: '',
  preCaudalBuildPlan: '',
  preCaudalStartPlay: '',
  preCaudalProgressionPlan: '',
  preCaudalAttackZones: '',
  preCaudalPlayersToActivate: '',
  preCaudalSpacesToFind: '',
  preCaudalPressPlan: '',
  preCaudalRivalsToBlock: '',
  preCaudalDefendStrengths: '',
  preCaudalAvoid: '',
  preCaudalAfterLoss: '',
  preCaudalAfterRecovery: '',
  preKeyMatchups: '',
  preCaudalPlayerToBoost: '',
  preRivalPlayerToWatch: '',
  preImportantDuels: '',
  prePlayerNotes: {},
  preRivalPlayerNotes: {},
  preAiAnalysis: null,
  // POST Partido
  postVideoLink: '',
  events: [],
  // PRE Partido - Alineación rival específica
  rivalLineupSystem: '',
  rivalLineupPlayers: [],
};

const emptyTeamForm = {
  name: '',
  sourceUrl: '',
  crest: '',
  stadium: '',
  kitColor: '#ef233c',
  system: '4-4-2',
  squad: [],
};

const emptyLineup = [];
const emptyDepthChart = {};

const formationLayouts = {
  '4-4-2': [
    { role: 'Portero', x: 50, y: 89 },
    { role: 'Lateral izquierdo', x: 18, y: 73 },
    { role: 'Central izquierdo', x: 39, y: 73 },
    { role: 'Central derecho', x: 61, y: 73 },
    { role: 'Lateral derecho', x: 82, y: 73 },
    { role: 'Extremo izquierdo', x: 18, y: 45 },
    { role: 'Mediocentro', x: 39, y: 45 },
    { role: 'Mediocentro', x: 61, y: 45 },
    { role: 'Extremo derecho', x: 82, y: 45 },
    { role: 'Delantero', x: 42, y: 16 },
    { role: 'Delantero', x: 58, y: 16 },
  ],
  '4-2-3-1': [
    { role: 'Portero', x: 50, y: 89 },
    { role: 'Lateral izquierdo', x: 18, y: 73 },
    { role: 'Central izquierdo', x: 39, y: 73 },
    { role: 'Central derecho', x: 61, y: 73 },
    { role: 'Lateral derecho', x: 82, y: 73 },
    { role: 'Mediocentro', x: 39, y: 52 },
    { role: 'Mediocentro', x: 61, y: 52 },
    { role: 'Extremo izquierdo', x: 18, y: 32 },
    { role: 'Mediapunta', x: 50, y: 32 },
    { role: 'Extremo derecho', x: 82, y: 32 },
    { role: 'Delantero', x: 50, y: 14 },
  ],
  '4-3-3': [
    { role: 'Portero', x: 50, y: 89 },
    { role: 'Lateral izquierdo', x: 18, y: 73 },
    { role: 'Central izquierdo', x: 39, y: 73 },
    { role: 'Central derecho', x: 61, y: 73 },
    { role: 'Lateral derecho', x: 82, y: 73 },
    { role: 'Pivote', x: 50, y: 56 },
    { role: 'Interior izquierdo', x: 38, y: 40 },
    { role: 'Interior derecho', x: 62, y: 40 },
    { role: 'Extremo izquierdo', x: 20, y: 18 },
    { role: 'Delantero', x: 50, y: 14 },
    { role: 'Extremo derecho', x: 80, y: 18 },
  ],
  '3-5-2': [
    { role: 'Portero', x: 50, y: 89 },
    { role: 'Central izquierdo', x: 28, y: 73 },
    { role: 'Central', x: 50, y: 75 },
    { role: 'Central derecho', x: 72, y: 73 },
    { role: 'Pivote', x: 50, y: 56 },
    { role: 'Carrilero izquierdo', x: 14, y: 43 },
    { role: 'Interior izquierdo', x: 38, y: 38 },
    { role: 'Interior derecho', x: 62, y: 38 },
    { role: 'Carrilero derecho', x: 86, y: 43 },
    { role: 'Delantero', x: 42, y: 16 },
    { role: 'Delantero', x: 58, y: 16 },
  ],
  '3-4-3': [
    { role: 'Portero', x: 50, y: 89 },
    { role: 'Central izquierdo', x: 28, y: 73 },
    { role: 'Central', x: 50, y: 75 },
    { role: 'Central derecho', x: 72, y: 73 },
    { role: 'Carrilero izquierdo', x: 16, y: 48 },
    { role: 'Mediocentro', x: 40, y: 48 },
    { role: 'Mediocentro', x: 60, y: 48 },
    { role: 'Carrilero derecho', x: 84, y: 48 },
    { role: 'Extremo izquierdo', x: 22, y: 18 },
    { role: 'Delantero', x: 50, y: 14 },
    { role: 'Extremo derecho', x: 78, y: 18 },
  ],
  '3-4-1-2': [
    { role: 'Portero', x: 50, y: 89 },
    { role: 'Central izquierdo', x: 28, y: 73 },
    { role: 'Central', x: 50, y: 75 },
    { role: 'Central derecho', x: 72, y: 73 },
    { role: 'Carrilero izquierdo', x: 16, y: 48 },
    { role: 'Mediocentro', x: 40, y: 50 },
    { role: 'Mediocentro', x: 60, y: 50 },
    { role: 'Carrilero derecho', x: 84, y: 48 },
    { role: 'Mediapunta', x: 50, y: 31 },
    { role: 'Delantero', x: 42, y: 14 },
    { role: 'Delantero', x: 58, y: 14 },
  ],
  '5-3-2': [
    { role: 'Portero', x: 50, y: 89 },
    { role: 'Carrilero izquierdo', x: 12, y: 73 },
    { role: 'Central izquierdo', x: 32, y: 75 },
    { role: 'Central', x: 50, y: 76 },
    { role: 'Central derecho', x: 68, y: 75 },
    { role: 'Carrilero derecho', x: 88, y: 73 },
    { role: 'Interior izquierdo', x: 34, y: 45 },
    { role: 'Pivote', x: 50, y: 49 },
    { role: 'Interior derecho', x: 66, y: 45 },
    { role: 'Delantero', x: 42, y: 16 },
    { role: 'Delantero', x: 58, y: 16 },
  ],
  '5-4-1': [
    { role: 'Portero', x: 50, y: 89 },
    { role: 'Carrilero izquierdo', x: 12, y: 73 },
    { role: 'Central izquierdo', x: 32, y: 75 },
    { role: 'Central', x: 50, y: 76 },
    { role: 'Central derecho', x: 68, y: 75 },
    { role: 'Carrilero derecho', x: 88, y: 73 },
    { role: 'Extremo izquierdo', x: 18, y: 45 },
    { role: 'Mediocentro', x: 40, y: 45 },
    { role: 'Mediocentro', x: 60, y: 45 },
    { role: 'Extremo derecho', x: 82, y: 45 },
    { role: 'Delantero', x: 50, y: 14 },
  ],
};

const getFormationLayout = (system) => formationLayouts[system] ?? formationLayouts['4-4-2'];
const getFormationCoordinates = (system) => getFormationLayout(system).map(({ x, y }) => ({ x, y }));
const getFormationRoles = (system) => getFormationLayout(system).map(({ role }) => role);

const getSystemProfile = (system) => {
  const parts = String(system || '4-4-2')
    .split('-')
    .map((part) => Number(part))
    .filter((part) => Number.isFinite(part));
  const defenders = parts[0] ?? 4;
  const attackers = parts[parts.length - 1] ?? 2;
  const midfielders = parts.slice(1, -1).reduce((sum, part) => sum + part, 0) || 4;
  return {
    defenders,
    midfielders,
    attackers,
    hasBackFive: defenders >= 5,
    hasBackThree: defenders === 3,
    hasDoublePivot: String(system).includes('2-3') || String(system).includes('2-'),
    hasThreeMidfielders: midfielders >= 3,
    hasWideFrontThree: attackers === 3,
  };
};

const tacticalRoles = getFormationRoles('4-4-2');

const getCaudalPitchNames = (lineup, fallbackPlayers = [], fallbackRoles = tacticalRoles) => {
  const basePlayers = lineup?.length ? lineup : fallbackPlayers;
  return Array.from({ length: 11 }, (_, index) => basePlayers[index] || fallbackRoles[index] || `Jugador ${index + 1}`);
};

const valueOrMissing = (value) => value || 'FALTA DATO';
const formatLineupForPrompt = (system, lineup) =>
  getFormationRoles(system)
    .map((role, index) => `${role}: ${lineup?.[index] || 'FALTA JUGADOR'}`)
    .join('\n');

const buildTacticalPrompt = ({ match, caudalSystem, rivalSystem, caudalLineup, rivalLineup, questionnaire, playerNotes = {}, rivalNotes = {} }) => {
  const sections = [
    ['Contexto', [
      `Partido: C.D. Caudal vs ${valueOrMissing(match?.opponent)}`,
      `Sistema C.D. Caudal: ${caudalSystem}`,
      `Sistema rival: ${rivalSystem}`,
    ]],
    ['Alineacion C.D. Caudal', [formatLineupForPrompt(caudalSystem, caudalLineup)]],
    ['Alineacion rival', [formatLineupForPrompt(rivalSystem, rivalLineup)]],
    ['Resumen actual', [
      `Como juega el rival: ${valueOrMissing(questionnaire.preRivalStyle)}`,
      `Nuestra intencion para ganar: ${valueOrMissing(questionnaire.preCaudalIntent)}`,
      `Fortalezas rival: ${valueOrMissing(questionnaire.preRivalStrengths)}`,
      `Debilidades rival: ${valueOrMissing(questionnaire.preRivalWeaknesses)}`,
      `Salida rival: ${valueOrMissing(questionnaire.preRivalBuildUp)}`,
      `Bloque defensivo rival: ${valueOrMissing(questionnaire.preRivalDefensiveBlock)}`,
      `Presion rival: ${valueOrMissing(questionnaire.preRivalPressure)}`,
      `Transiciones rival: ${valueOrMissing(questionnaire.preRivalTransitions)}`,
    ]],
    ['Rival con balon', [
      `Organizacion ofensiva: ${valueOrMissing(questionnaire.preRivalOffensiveOrganization)}`,
      `Sistema base: ${valueOrMissing(questionnaire.preRivalBaseSystem)}`,
      `Como inicia: ${valueOrMissing(questionnaire.preRivalStartPlay)}`,
      `Como progresa: ${valueOrMissing(questionnaire.preRivalProgression)}`,
      `Como finaliza: ${valueOrMissing(questionnaire.preRivalFinishing)}`,
      `Jugadores clave ofensivos: ${valueOrMissing(questionnaire.preRivalOffensiveKeyPlayers)}`,
      `Donde genera peligro: ${valueOrMissing(questionnaire.preRivalDangerZones)}`,
      `Como ataca bandas: ${valueOrMissing(questionnaire.preRivalWideAttack)}`,
      `Como ocupa area: ${valueOrMissing(questionnaire.preRivalBoxOccupation)}`,
    ]],
    ['Rival sin balon', [
      `Organizacion defensiva: ${valueOrMissing(questionnaire.preRivalDefensiveOrganization)}`,
      `Sistema defensivo: ${valueOrMissing(questionnaire.preRivalDefensiveSystem)}`,
      `Altura del bloque: ${valueOrMissing(questionnaire.preRivalBlockHeightDetail)}`,
      `Tipo de presion: ${valueOrMissing(questionnaire.preRivalPressureType)}`,
      `Donde deja espacios: ${valueOrMissing(questionnaire.preRivalSpacesAllowed)}`,
      `Como defiende centros: ${valueOrMissing(questionnaire.preRivalDefendsCrosses)}`,
      `Como defiende espalda centrales: ${valueOrMissing(questionnaire.preRivalDefendsBack)}`,
      `Como defiende segunda jugada: ${valueOrMissing(questionnaire.preRivalSecondBallDefense)}`,
    ]],
    ['Transiciones', [
      `Rival tras perdida: ${valueOrMissing(questionnaire.preRivalAfterLoss)}`,
      `Rival tras robo: ${valueOrMissing(questionnaire.preRivalAfterRecovery)}`,
      `Lanzadores transicion rival: ${valueOrMissing(questionnaire.preRivalTransitionLaunchers)}`,
      `Zonas donde corre mejor: ${valueOrMissing(questionnaire.preRivalBestRunningZones)}`,
      `Caudal tras perdida: ${valueOrMissing(questionnaire.preCaudalAfterLoss)}`,
      `Caudal tras robo: ${valueOrMissing(questionnaire.preCaudalAfterRecovery)}`,
    ]],
    ['ABP rival', [
      `Corners ofensivos: ${valueOrMissing(questionnaire.preRivalCornersFor)}`,
      `Corners defensivos: ${valueOrMissing(questionnaire.preRivalCornersAgainst)}`,
      `Faltas laterales: ${valueOrMissing(questionnaire.preRivalWideFreeKicks)}`,
      `Lanzadores: ${valueOrMissing(questionnaire.preRivalSetPieceTakers)}`,
      `Rematadores principales: ${valueOrMissing(questionnaire.preRivalMainHeaders)}`,
    ]],
    ['Nuestro plan', [
      `Plan con balon: ${valueOrMissing(questionnaire.preCaudalBuildPlan)}`,
      `Como iniciar: ${valueOrMissing(questionnaire.preCaudalStartPlay)}`,
      `Por donde progresar: ${valueOrMissing(questionnaire.preCaudalProgressionPlan)}`,
      `Donde atacar: ${valueOrMissing(questionnaire.preCaudalAttackZones)}`,
      `Jugadores a activar: ${valueOrMissing(questionnaire.preCaudalPlayersToActivate)}`,
      `Espacios a buscar: ${valueOrMissing(questionnaire.preCaudalSpacesToFind)}`,
      `Donde presionar: ${valueOrMissing(questionnaire.preCaudalPressPlan)}`,
      `Rivales a tapar: ${valueOrMissing(questionnaire.preCaudalRivalsToBlock)}`,
      `Como defender puntos fuertes: ${valueOrMissing(questionnaire.preCaudalDefendStrengths)}`,
      `Que evitar: ${valueOrMissing(questionnaire.preCaudalAvoid)}`,
    ]],
    ['Duelos individuales', [
      `Emparejamientos clave: ${valueOrMissing(questionnaire.preKeyMatchups)}`,
      `Jugador nuestro a potenciar: ${valueOrMissing(questionnaire.preCaudalPlayerToBoost)}`,
      `Jugador rival a vigilar: ${valueOrMissing(questionnaire.preRivalPlayerToWatch)}`,
      `Duelos importantes: ${valueOrMissing(questionnaire.preImportantDuels)}`,
      `Notas jugadores Caudal: ${JSON.stringify(playerNotes)}`,
      `Caracteristicas jugadores rivales: ${JSON.stringify(rivalNotes)}`,
    ]],
  ];

  return [
    'Actua como analista tactico profesional para el cuerpo tecnico del C.D. Caudal.',
    'Reglas obligatorias:',
    '- No dar respuestas genericas.',
    '- Cada idea debe explicar donde, por que y que hacer.',
    '- Usar lenguaje de entrenador.',
    '- Dar acciones concretas.',
    '- No inventar jugadores si no estan en los datos.',
    '- Si falta informacion, decir que dato falta.',
    '',
    'Devuelve el analisis con esta estructura:',
    '1. Lectura general del partido',
    '2. Ventajas para el C.D. Caudal',
    '3. Riesgos principales',
    '4. Como atacar al rival',
    '5. Como defender al rival',
    '6. Transiciones',
    '7. Duelos individuales clave',
    '8. Plan de partido recomendado',
    '9. Ajustes si el partido se complica',
    '',
    ...sections.flatMap(([title, lines]) => [`## ${title}`, ...lines, '']),
  ].join('\n');
};

const buildPlayerAdvice = ({ playerName, playerIndex, caudalSystem, rivalSystem, questionnaire, playerProfile, playerNotes, rivalName, rivalNotes, role }) => {
  const playerRole = role || getFormationRoles(caudalSystem)[playerIndex] || 'Jugador';
  const rivalBlock = questionnaire.preRivalDefensiveBlock || 'Medio';
  const rivalPressure = questionnaire.preRivalPressure || 'Media';
  const rivalWeaknesses = questionnaire.preRivalWeaknesses || 'espacios entre líneas y espalda de laterales';
  const caudalIntent = questionnaire.preCaudalIntent || 'competir con equipo corto y ataques claros';
  const profileText = [playerProfile?.position, playerProfile?.foot ? `pierna ${playerProfile.foot.toLowerCase()}` : '', playerNotes].filter(Boolean).join(', ');

  return [
    `${playerName}: actuar como ${playerRole.toLowerCase()} dentro del ${caudalSystem}, con prioridad en sostener el plan: ${caudalIntent}.`,
    profileText ? `Perfil usado por la IA: ${profileText}.` : 'Añade una nota individual para que la recomendación sea más precisa.',
    rivalName ? `Duelo probable: ${rivalName}${rivalNotes ? ` (${rivalNotes})` : ''}.` : 'Asigna jugadores rivales para que la IA detecte duelos directos.',
    rivalPressure === 'Alta'
      ? 'Primer control orientado y apoyo cercano para superar presión; si no hay pase limpio, jugar a zona de segunda jugada.'
      : `Atraer a su par y acelerar cuando aparezca ${rivalWeaknesses}.`,
    rivalBlock === 'Bajo'
      ? 'Aportar paciencia, amplitud y llegada al área; no precipitar centros sin ocupación de remate.'
      : `Buscar ventajas entre líneas contra el ${rivalSystem} y cerrar rápido tras pérdida.`,
  ];
};

const buildTacticalAnalysis = ({ caudalSystem, rivalSystem, caudalLineup, rivalLineup = [], questionnaire, playerProfiles = [], playerNotes = {}, rivalProfiles = [], rivalNotes = {} }) => {
  const caudal = getSystemProfile(caudalSystem);
  const rival = getSystemProfile(rivalSystem);
  const caudalWide = caudal.hasWideFrontThree || caudal.midfielders >= 4;
  const rivalWideRisk = rival.hasBackThree || rival.hasBackFive;
  const caudalHasBackFour = caudal.defenders === 4;
  const rivalHasBackFour = rival.defenders === 4;
  const wantsPress = questionnaire.preRivalBuildUp === 'Combinativo' || questionnaire.preRivalPressure === 'Baja';
  const wantsDirect = questionnaire.preRivalTransitions === 'Directas' || /direct|largo|segunda/i.test(questionnaire.preRivalStyle || '');
  const wantsPossession = /posesi|combin|asoci|pausa/i.test(questionnaire.preCaudalIntent || '');
  const caudalRoles = getFormationRoles(caudalSystem);
  const rivalRoles = getFormationRoles(rivalSystem);
  const caudalNames = getCaudalPitchNames(caudalLineup, [], caudalRoles);
  const rivalNames = getCaudalPitchNames(rivalLineup, [], rivalRoles);
  const rivalThreats = rivalNames
    .filter((name) => rivalNotes[name])
    .slice(0, 3)
    .map((name) => `${name}: ${rivalNotes[name]}`);
  const weakness = questionnaire.preRivalWeaknesses || 'los espacios a espalda de sus laterales y el intervalo central-lateral';
  const strength = questionnaire.preRivalStrengths || 'su organización defensiva y salida tras robo';
  const block = questionnaire.preRivalDefensiveBlock || 'Medio';
  const likelyAttackZone = questionnaire.preCaudalAttackZones || (rival.hasBackThree ? 'los costados de sus centrales exteriores' : 'la espalda de sus laterales');
  const playerToActivate = questionnaire.preCaudalPlayersToActivate || caudalNames.find((name, index) => /Extremo|Mediapunta|Delantero|Interior/.test(caudalRoles[index])) || caudalNames[10];
  const rivalToLimit = questionnaire.preCaudalRivalsToBlock || rivalNames.find((name, index) => /Pivote|Mediapunta|Delantero/.test(rivalRoles[index])) || rivalNames[6];
  const dangerZone = questionnaire.preRivalDangerZones || (rival.attackers >= 3 ? 'sus extremos atacando la espalda de nuestros laterales' : 'la zona de segunda jugada alrededor de nuestros centrales');
  const avoidScenario = questionnaire.preCaudalAvoid || 'pérdidas interiores con el equipo abierto';
  const afterLossPlan = questionnaire.preCaudalAfterLoss || 'presión inmediata del jugador más cercano y cierre del pase interior por los mediocentros';
  const afterRecoveryPlan = questionnaire.preCaudalAfterRecovery || 'primer pase vertical si el rival está abierto y pausa si el robo llega en zona baja';
  const transitionLaunchers = questionnaire.preRivalTransitionLaunchers || rivalNames.filter((name, index) => /Pivote|Interior|Mediapunta|Delantero|Extremo/.test(rivalRoles[index])).slice(0, 2).join(' y ');

  return {
    generalReading: [
      `Partido entre ${caudalSystem} y ${rivalSystem}: la clave será relacionar nuestra estructura con los espacios que deja el rival.`,
      rival.midfielders > caudal.midfielders
        ? 'El rival puede juntar más gente por dentro; conviene atraerle a un lado y salir rápido al lado débil.'
        : 'Tenemos buena base para no quedar partidos por dentro; la diferencia puede estar en activar extremos/laterales con ventaja.',
      caudalHasBackFour && !rivalHasBackFour
        ? 'Nuestra línea de cuatro puede encontrar superioridad en banda si el extremo fija y el lateral llega con timing.'
        : 'El partido pide controlar distancias entre líneas para no conceder recepciones limpias a la espalda de los mediocentros.',
    ],
    winPlan: [
      `La mejor manera de ganar es atacar ${weakness}, pero protegiendo pérdidas porque su punto fuerte es ${strength}.`,
      block === 'Bajo'
        ? 'Moverlos de lado a lado, cargar área con tres alturas y finalizar jugadas para evitar contras.'
        : 'Atraer presión, encontrar hombre libre por dentro y atacar rápido la espalda de la última línea.',
      wantsPress
        ? 'Presión tras pérdida de 5 segundos y saltos coordinados sobre central-lateral-pivote para robar cerca de portería.'
        : 'Bloque medio compacto, orientar fuera y acelerar tras robo con primer pase vertical.',
      rivalThreats.length
        ? `Atención especial a ${rivalThreats.join(' / ')}.`
        : 'Completa características de jugadores rivales para afinar amenazas y emparejamientos.',
    ],
    collective: [
      caudal.midfielders >= rival.midfielders
        ? `Mantener superioridad o igualdad por dentro: ${caudalSystem} puede proteger la zona central ante ${rivalSystem}.`
        : `Compensar inferioridad interior: juntar extremo, lateral y mediocentro para no partir el equipo ante ${rivalSystem}.`,
      caudalWide || rivalWideRisk
        ? 'Atacar cambios de orientación y el intervalo lateral-central; ahí pueden aparecer ventajas antes de que bascule el rival.'
        : 'Progresar con paciencia por dentro y activar bandas cuando el rival cierre el carril central.',
      wantsPress
        ? 'Si la idea es presionar alto, saltar sobre central orientado a banda y cerrar pase interior con el pivote.'
        : 'Bloque medio preparado para robar y correr; no regalar espacios a la espalda de los mediocentros.',
    ],
    individualByPlayer: caudalNames.map((playerName, playerIndex) => ({
      playerName,
      role: caudalRoles[playerIndex] || 'Jugador',
      advice: buildPlayerAdvice({
        playerName,
        playerIndex,
        caudalSystem,
        rivalSystem,
        questionnaire,
        playerProfile: playerProfiles.find((player) => player.name === playerName),
        playerNotes: playerNotes[playerName],
        rivalName: rivalNames[playerIndex],
        rivalNotes: rivalNotes[rivalNames[playerIndex]],
        role: caudalRoles[playerIndex],
      }),
    })),
    advantages: caudal.midfielders >= rival.midfielders
      ? 'Buena base para controlar mediocampo y orientar ataques con apoyos cercanos.'
      : 'Ventaja posible si se atrae por fuera y se encuentra al hombre libre entre líneas.',
    risks: rival.attackers >= 3
      ? 'Cuidado con pérdidas en salida: el rival puede amenazar con tres jugadores arriba.'
      : 'Riesgo principal en segundas jugadas y rupturas del delantero tras descarga.',
    progress: wantsPossession
      ? 'Progresar con tercer hombre: central, pivote y mediapunta para superar la primera presión.'
      : 'Progresar alternando pase vertical y descarga a banda para ganar metros sin partirse.',
    pressure: wantsDirect
      ? 'Presionar la segunda jugada: centrales preparados para anticipar y mediocentros cerca del rechace.'
      : 'Presionar hacia fuera, cerrar pase al pivote rival y robar cerca de banda.',
    keyMatchups: rivalThreats.length
      ? `${caudalNames[6] || 'Nuestro pivote'} debe dominar la zona del mediocentro. Duelos marcados: ${rivalThreats.join(' / ')}.`
      : `${caudalNames[6] || 'Nuestro pivote'} debe dominar la zona del mediocentro; laterales y extremos deben atacar ${weakness}.`,
    attackPlan: [
      `Atacar ${likelyAttackZone}: fijar por un lado, atraer presión y acelerar el cambio de orientación antes de que el bloque bascule.`,
      `Activar a ${playerToActivate} con ventaja corporal, preferiblemente recibiendo de cara o atacando intervalo, no aislado de espaldas.`,
      questionnaire.preRivalDefendsCrosses
        ? `En centros: aprovechar que el rival defiende así: ${questionnaire.preRivalDefendsCrosses}.`
        : 'En centros, cargar primer palo, segundo palo y frontal; si el área está igualada, priorizar pase atrás sobre centro forzado.',
    ],
    defendPlan: [
      `Tapar a ${rivalToLimit}: orientar su recepción hacia fuera y negar el giro cómodo entre líneas.`,
      `Proteger ${dangerZone}: ajustar coberturas antes del pase, no cuando el rival ya está corriendo.`,
      `Evitar ${avoidScenario}, porque ahí el rival puede correr con el equipo desordenado.`,
    ],
    transitionsPlan: [
      `Tras pérdida: ${afterLossPlan}. La primera reacción debe cerrar pase vertical y zona de robo rival.`,
      `Tras robo: ${afterRecoveryPlan}. Primer pase con intención y ocupación inmediata de carriles.`,
      `Vigilar lanzadores: ${transitionLaunchers || 'pivote e interiores rivales'}. Si reciben de cara, falta táctica o temporización antes de que activen la carrera.`,
    ],
    duelsPlan: [
      questionnaire.preKeyMatchups || `${caudalNames[6]} debe imponerse a ${rivalNames[6]} para que el partido no se parta por dentro.`,
      questionnaire.preCaudalPlayerToBoost ? `Potenciar a ${questionnaire.preCaudalPlayerToBoost}.` : `Potenciar a ${playerToActivate}, porque es el perfil mejor situado para atacar la ventaja estructural.`,
      questionnaire.preRivalPlayerToWatch ? `Vigilar a ${questionnaire.preRivalPlayerToWatch}.` : `Vigilar a ${rivalToLimit}, porque puede conectar la salida rival con la zona de ataque.`,
    ],
    recommendedPlan: questionnaire.preCaudalBuildPlan || 'Plan recomendado: equipo corto, ayudas interiores, cambios de orientación, presión tras pérdida y ataques finalizados.',
    complicationAdjustments: [
      'Si el partido se complica con pérdidas interiores: bajar riesgo en salida y progresar por fuera con apoyo cercano.',
      'Si no generamos ocasiones: cambiar orientación más rápido y añadir llegada desde segunda línea.',
      'Si el rival corre demasiado: finalizar jugadas, temporizar pérdidas y juntar mediocentros.',
    ],
  };
};

const getLineupSlotMap = (lineup) => {
  const usedSlots = new Map();
  lineup.forEach((player) => {
    if (Number.isInteger(player.slot)) usedSlots.set(player.slot, player);
  });
  return usedSlots;
};

const getPlayerMeta = (player) => [player.position, player.age ? `${player.age} años` : ''].filter(Boolean).join(' · ');
const displayPlayerName = (player) => player.name;
const playerReservePlacement = (player) => {
  return 'below';
};
const playerStatusBadges = (player) =>
  [
    player.yellowRisk ? { label: 'A', className: 'bg-yellow-300 text-slate-950', title: 'Acumulación de amarillas' } : null,
    player.suspended ? { label: 'R', className: 'bg-red-500 text-white', title: 'Expulsado o sancionado' } : null,
    player.injured ? { label: '+', className: 'bg-white text-red-600', title: 'Lesionado' } : null,
  ].filter(Boolean);

const getBenchGroups = (squad) =>
  squad
    .map(normalizeSquadEntry)
    .filter((player) => player.role !== 'Titular')
    .reduce((groups, player) => {
      const position = player.position || 'Sin posición';
      return { ...groups, [position]: [...(groups[position] ?? []), player] };
    }, {});

const getBenchForStarter = (starter, benchChart = emptyDepthChart) => {
  const assignedBench = (benchChart[starter.name] ?? []).filter(Boolean).map(normalizeSquadEntry);
  return assignedBench.slice(0, 3);
};

const normalizeSquadEntry = (entry) => {
  if (typeof entry === 'string') {
    return {
      id: entry,
      name: entry,
      image: '',
      number: '',
      position: '',
      age: '',
      role: 'Reserva',
      isKey: false,
      yellowRisk: false,
      suspended: false,
      injured: false,
    };
  }

  const name = entry.name ?? '';
  return {
    id: entry.id ?? name,
    name,
    image: entry.image ?? '',
    number: entry.number ?? '',
    position: entry.position ?? '',
    age: entry.age ?? '',
    role: entry.role ?? 'Reserva',
    isKey: Boolean(entry.isKey),
    yellowRisk: Boolean(entry.yellowRisk),
    suspended: Boolean(entry.suspended),
    injured: Boolean(entry.injured),
  };
};

const parseSquadText = (value) =>
  value
    .split('\n')
    .map((line) => {
      const [name, image = '', number = '', position = '', age = '', role = 'Reserva', keyValue = ''] = line.split('|').map((part) => part.trim());
      return name ? { id: name, name, image, number, position, age, role: role || 'Reserva', isKey: /destacado|clave|si|sí|true/i.test(keyValue) } : null;
    })
    .filter(Boolean);

const formatSquadText = (squad) =>
  squad
    .map(normalizeSquadEntry)
    .map((player) =>
      [player.name, player.image, player.number, player.position, player.age, player.role, player.isKey ? 'Destacado' : ''].filter(Boolean).join(' | ')
    )
    .join('\n');

const createBlankTeamPlayer = () => ({
  id: `manual-${Date.now()}`,
  name: '',
  image: '',
  number: '',
  position: '',
  age: '',
  role: 'Reserva',
  isKey: false,
  yellowRisk: false,
  suspended: false,
  injured: false,
});

const normalizeMatch = (match) => ({
  ...emptyMatchForm,
  ...match,
  id: match.id ?? Date.now(),
});

const cleanTeamDisplayName = (name) => name.replace(/^Plantilla\s+/i, '').trim();
const comparableTeamName = (name) =>
  cleanTeamDisplayName(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
const findTeamByDisplayName = (teams, name) => {
  const comparableName = comparableTeamName(name);
  if (!comparableName) return null;
  return teams.find((team) => comparableTeamName(team.name) === comparableName) ?? null;
};

const getMatchResult = (match) => {
  if (match.status !== 'Finalizado') return null;
  const caudalGoals = Number(match.isHome ? match.homeScore : match.awayScore);
  const rivalGoals = Number(match.isHome ? match.awayScore : match.homeScore);
  if (Number.isNaN(caudalGoals) || Number.isNaN(rivalGoals)) return null;
  if (caudalGoals > rivalGoals) return 'W';
  if (caudalGoals < rivalGoals) return 'L';
  return 'D';
};

const matchDisplayDate = (date) => {
  if (!date) return '-';
  const [year, month, day] = date.split('-');
  return day && month && year ? `${day}/${month}/${year}` : date;
};

const extractImportedPlayers = (text) => {
  const ignored = new Set([
    'jugador',
    'jugadores',
    'plantilla',
    'equipo',
    'posición',
    'nacionalidad',
    'edad',
    'altura',
    'peso',
    'valor de mercado',
  ]);

  return Array.from(
    new Set(
      text
        .split('\n')
        .map((line) =>
          line
            .replace(/\[|\]|\*|#/g, '')
            .replace(/Image:\s*/gi, '')
            .replace(/\s{2,}/g, ' ')
            .trim()
        )
        .filter((line) => {
          const lower = line.toLowerCase();
          return (
            line.length >= 5 &&
            line.length <= 45 &&
            /[a-záéíóúñü]/i.test(line) &&
            !ignored.has(lower) &&
            !lower.includes('http') &&
            !lower.includes('temporada') &&
            !lower.includes('copyright') &&
            !/^\d/.test(line)
          );
        })
        .slice(0, 35)
    )
  ).map((name) => ({ name, image: '' }));
};

const normalizeSourceUrl = (value) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const getReadableUrls = (sourceUrl) => {
  const normalized = normalizeSourceUrl(sourceUrl);
  const noProtocol = normalized.replace(/^https?:\/\//i, '');

  return [
    normalized,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(normalized)}`,
    `https://r.jina.ai/${normalized}`,
    `https://r.jina.ai/http://${noProtocol}`,
  ];
};

const extractTeamName = (doc, fallback) => {
  const heading = doc.querySelector('h1')?.textContent?.trim();
  const title = doc.querySelector('meta[property="og:title"]')?.content || doc.title;
  return heading || title?.replace(/\s*[-|].*$/, '').trim() || fallback;
};

const resolveAssetUrl = (value, baseUrl) => {
  if (!value) return '';
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return value;
  }
};

const getImageSource = (img, baseUrl) =>
  resolveAssetUrl(
    img?.getAttribute('data-src') ||
      img?.getAttribute('data-original') ||
      img?.getAttribute('data-lazy') ||
      img?.getAttribute('src') ||
      '',
    baseUrl
  );

const isTransfermarktUrl = (url) => /transfermarkt\./i.test(url);
const isBesoccerUrl = (url) => /besoccer\./i.test(url);

const extractCrest = (doc, baseUrl) => {
  const raw = doc.documentElement?.outerHTML ?? '';

  if (isBesoccerUrl(baseUrl)) {
    const besoccerCrest = raw.match(/https?:\/\/[^"'\s)]+(?:img_data\/escudos|media\/img_data\/escudos|img_data\/equipos|media\/img_data\/equipos|\/escudos\/)[^"'\s)]*/i)?.[0];
    if (besoccerCrest) return besoccerCrest.replace(/&amp;/g, '&');

    const teamName = extractTeamName(doc, '');
    const crest =
      Array.from(doc.querySelectorAll('img')).find((img) => {
        const alt = img.alt?.trim() ?? '';
        const src = img.getAttribute('src') ?? '';
        return alt === teamName || /img_data\/escudos|img_data\/equipos|\/escudos\/|shield|team/i.test(src);
      }) ||
      Array.from(doc.querySelectorAll('img')).find((img) => /escudo|equipo|club|team/i.test(`${img.alt} ${img.src}`));
    const crestUrl = getImageSource(crest, baseUrl);
    if (crestUrl && !/flags|avatar|besoccertv|apuestas/i.test(crestUrl)) return crestUrl;
  }

  if (isTransfermarktUrl(baseUrl)) {
    const crest =
      doc.querySelector('.data-header__profile-container img') ||
      doc.querySelector('.data-header__profile-image') ||
      doc.querySelector('header img[alt]') ||
      Array.from(doc.querySelectorAll('img')).find((img) =>
        /wappen|logo|verein|club|data-header/i.test(`${img.className} ${img.src}`)
      );
    const crestUrl = getImageSource(crest, baseUrl);
    if (crestUrl && !/tm_logo|transfermarkt/i.test(crestUrl)) return crestUrl;
  }

  const metaImage = doc.querySelector('meta[property="og:image"]')?.content;
  const crestImage = Array.from(doc.querySelectorAll('img')).find((img) =>
    /escudo|crest|wappen|logo|equipo|team/i.test(`${img.alt} ${img.src}`)
  );
  return getImageSource(crestImage, baseUrl) || resolveAssetUrl(metaImage || '', baseUrl);
};

const extractTransfermarktPlayers = (doc, baseUrl) => {
  const byName = new Map();
  const rows = Array.from(doc.querySelectorAll('table.items tbody tr'));

  rows.forEach((row) => {
    const nameLink =
      row.querySelector('td.hauptlink a[href*="/profil/spieler/"]') ||
      row.querySelector('td.hauptlink a[href*="/spieler/"]') ||
      row.querySelector('td.hauptlink a');
    const portrait = row.querySelector('img.bilderrahmen-fixed, img[src*="/portrait/"], img[data-src*="/portrait/"]');
    const name = (nameLink?.textContent || portrait?.alt || '').replace(/\s+/g, ' ').trim();
    const image = getImageSource(portrait, baseUrl);
    const number = row.querySelector('.rn_nummer')?.textContent?.replace(/\D/g, '') ?? '';
    const position =
      row.querySelector('td.posrela table tr:nth-child(2) td')?.textContent?.replace(/\s+/g, ' ').trim() ||
      row.querySelector('td:nth-child(2) table tr:nth-child(2) td')?.textContent?.replace(/\s+/g, ' ').trim() ||
      '';

    if (
      name &&
      name.length > 2 &&
      name.length < 45 &&
      !/transfermarkt|laliga|bundesliga|premier|segunda|serie|ligue|deadline|club siero/i.test(name)
    ) {
      byName.set(name, { id: name, name, image, number, position, role: 'Reserva', isKey: false });
    }
  });

  return Array.from(byName.values());
};

const extractBesoccerPlayers = (doc, baseUrl) => {
  const byName = new Map();
  const squadScope =
    doc.querySelector('table') ||
    doc.querySelector('[class*="squad"]') ||
    doc.querySelector('[class*="plantilla"]') ||
    doc.body;
  const playerLinks = Array.from(squadScope.querySelectorAll('a[href*="/jugador/"]'));

  playerLinks.forEach((link) => {
    const name = link.textContent?.replace(/\s+/g, ' ').trim();
    const image = getImageSource(link.querySelector('img') || link.closest('tr')?.querySelector('img'), baseUrl);
    if (name && name.length > 2 && name.length < 45 && !/más|comparar|partidos|trayectoria/i.test(name)) {
      byName.set(name, { id: name, name, image, number: '', position: '', role: 'Reserva', isKey: false });
    }
  });

  return Array.from(byName.values());
};

const cleanImportedName = (value) =>
  value
    .replace(/【\d+†([^】]+)】/g, '$1')
    .replace(/\[|\]|\*|#/g, '')
    .replace(/Image:\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

const isLikelyPlayerName = (value) => {
  const lower = value.toLowerCase();
  return (
    value.length >= 3 &&
    value.length <= 45 &&
    /[a-záéíóúñü]/i.test(value) &&
    !/plantilla|porteros|defensas|centrocampistas|delanteros|rendimiento|info|totales|edad|rating|temporada|image:|pj|pt|cm|€|seleccionar|copyright|jugadores destacados|máximo goleador|más sancionado|minutos/i.test(lower) &&
    !/^\d+$/.test(value) &&
    !/^\d+\s*(k|m)?\.?€?$/i.test(value)
  );
};

const extractBesoccerPlayersFromText = (text) => {
  const start = text.search(/#\s*Plantilla|##\s*Plantilla|Plantilla\s+.+\s*\|/i);
  const scoped = start >= 0 ? text.slice(start) : text;
  const end = scoped.search(/\n##\s*(Jugadores destacados|Temporada|Últimos|Noticias|Estadio|Fichajes)|Copyright/i);
  const rosterText = end > 0 ? scoped.slice(0, end) : scoped;
  const byName = new Map();
  let currentPosition = '';
  const positionLabels = {
    Desconocido: '',
    Porteros: 'Portero',
    Defensas: 'Defensa central',
    Centrocampistas: 'Mediocentro',
    Delanteros: 'Delantero centro',
  };

  rosterText.split('\n').forEach((rawLine) => {
    const line = rawLine.trim();
    const indexedMatch = line.match(
      /^(\d{1,2})?\s*(?:【\d+†\s*】\s*)?【\d+†([^】]+)】.*?(?:Image:\s*[a-z]{2}).*?\s(\d{2}|-)\s(?:\d{2,3}|-)\s(?:[\d.,]+K|-)\s+\d+/i
    );
    if (indexedMatch) {
      const [, number = '', rawName, rawAge = ''] = indexedMatch;
      const name = cleanImportedName(rawName);
      if (isLikelyPlayerName(name)) {
        byName.set(name, {
          id: name,
          name,
          image: '',
          number,
          position: currentPosition,
          age: rawAge === '-' ? '' : rawAge,
          role: 'Reserva',
          isKey: false,
        });
      }
      return;
    }

    if (/^(Desconocido|Porteros|Defensas|Centrocampistas|Delanteros)\s*\|/i.test(line)) {
      const groupName = line.split('|')[0].trim();
      currentPosition = positionLabels[groupName] ?? groupName;
    }
    if (!line.includes('|') || !/Image:| \| \| /i.test(line)) return;
    if (/---|PJ\s*\||PT\s*\||Edad|rating|Temp/i.test(line)) return;

    const cells = line.split('|').map(cleanImportedName).filter(Boolean);
    const number = cells.find((cell) => /^\d{1,2}$/.test(cell)) ?? '';
    const nameCell = cells.find((cell, index) => {
      const previous = cells[index - 1] ?? '';
      return isLikelyPlayerName(cell) && !/^([a-z]{2}|ES|AR|VE|TR|NO)$/i.test(cell) && !isLikelyPlayerName(previous);
    });

    const fallbackName = cells.find(isLikelyPlayerName);
    const name = nameCell || fallbackName;
    const imageIndex = cells.findIndex((cell) => /^Image:/i.test(cell));
    const possibleAge = cells
      .slice(Math.max(imageIndex + 6, 0))
      .find((cell) => /^\d{2}$/.test(cell) && Number(cell) >= 15 && Number(cell) <= 45);
    if (name) byName.set(name, { id: name, name, image: '', number, position: currentPosition, age: possibleAge ?? '', role: 'Reserva', isKey: false });
  });

  return Array.from(byName.values());
};

const extractPlayersFromHtml = (html, baseUrl) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const transfermarktPlayers = isTransfermarktUrl(baseUrl) ? extractTransfermarktPlayers(doc, baseUrl) : [];
  if (transfermarktPlayers.length > 0) return { doc, players: transfermarktPlayers };
  if (isTransfermarktUrl(baseUrl)) return { doc, players: [] };

  const besoccerTextPlayers = isBesoccerUrl(baseUrl) ? extractBesoccerPlayersFromText(doc.body.textContent || html) : [];
  if (besoccerTextPlayers.length > 0) return { doc, players: besoccerTextPlayers };

  const besoccerPlayers = isBesoccerUrl(baseUrl) ? extractBesoccerPlayers(doc, baseUrl) : [];
  if (besoccerPlayers.length > 0) return { doc, players: besoccerPlayers };
  if (isBesoccerUrl(baseUrl)) return { doc, players: [] };

  const candidates = Array.from(doc.querySelectorAll('img'))
    .map((img) => ({
      name: img.alt?.replace(/^Image:\s*/i, '').trim(),
      image: getImageSource(img, baseUrl),
    }))
    .filter((player) => player.name && player.name.length > 3 && player.name.length < 45);

  const byName = new Map();
  candidates.forEach((player) => {
    if (!/escudo|logo|flag|bandera|apuestas|avatar|logout|laliga|bundesliga|premier|segunda|serie|ligue|transfermarkt|deadline|banner/i.test(player.name)) {
      byName.set(player.name, player);
    }
  });

  return {
    doc,
    players: byName.size > 0 ? Array.from(byName.values()).slice(0, 35) : extractImportedPlayers(doc.body.textContent ?? ''),
  };
};

const calculateAge = (dob) => {
  const birth = new Date(dob);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  const dayDiff = now.getDate() - birth.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) years -= 1;
  return years;
};

const playerLabel = (dob) => (calculateAge(dob) < 23 ? 'Sub-23' : 'Senior');

const displayDorsal = (number) => (number ? number : '-');

const normalizePitchZone = (zone) =>
  String(zone || '')
    .replace(/^Arriba/i, 'F.Finalización')
    .replace(/^Medio/i, 'F.Creación')
    .replace(/^Bajo/i, 'F.Inicio');

const displayZoneLabel = (zone) =>
  String(zone || '')
    .replace('F.Finalización', 'F.Finalización')
    .replace('F.Creación', 'F.Creación')
    .replace('F.Inicio', 'F.Inicio')
    .replace(' izquierda', '\nIZQ')
    .replace(' centro', '\nCENTRO')
    .replace(' derecha', '\nDER')
    .replace('Alta izquierda', 'Alta\nIZQ')
    .replace('Alta centro', 'Alta\nCENTRO')
    .replace('Alta derecha', 'Alta\nDER')
    .replace('Media izquierda', 'Media\nIZQ')
    .replace('Media centro', 'Media\nCENTRO')
    .replace('Media derecha', 'Media\nDER')
    .replace('Baja izquierda', 'Baja\nIZQ')
    .replace('Baja centro', 'Baja\nCENTRO')
    .replace('Baja derecha', 'Baja\nDER');

function App() {
  const [activeTab, setActiveTab] = useState('Inicio');
  const [players, setPlayers] = useState(samplePlayers);
  const [teams, setTeams] = useState(() => {
    try {
      const savedTeams = window.localStorage.getItem(teamsStorageKey);
      return savedTeams ? JSON.parse(savedTeams) : [];
    } catch {
      return [];
    }
  });
  const [matches, setMatches] = useState(() => {
    try {
      const savedMatches = window.localStorage.getItem(matchesStorageKey);
      return savedMatches ? JSON.parse(savedMatches).map(normalizeMatch) : [];
    } catch {
      return [];
    }
  });
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [draggedPlayer, setDraggedPlayer] = useState(null);
  const [importStatus, setImportStatus] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isTeamPanelOpen, setIsTeamPanelOpen] = useState(false);
  const [isMatchPanelOpen, setIsMatchPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingTeamId, setEditingTeamId] = useState(null);
  const [editingMatchId, setEditingMatchId] = useState(null);
  const [matchFilter, setMatchFilter] = useState('Todos');
  const [matchSections, setMatchSections] = useState({});
  const [matchView, setMatchView] = useState('lista_partidos');
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [matchViewSection, setMatchViewSection] = useState('PRE');
  const [preSubTab, setPreSubTab] = useState('Informe rival');
  const [isCanvaPreviewOpen, setIsCanvaPreviewOpen] = useState(false);
  const [selectedTacticalPlayerIndex, setSelectedTacticalPlayerIndex] = useState(0);
  const [selectedRivalTacticalPlayerIndex, setSelectedRivalTacticalPlayerIndex] = useState(0);
  const [newRivalManualPlayerName, setNewRivalManualPlayerName] = useState('');
  const [openQuestionnaireSections, setOpenQuestionnaireSections] = useState({
    rivalAttack: true,
    rivalDefense: false,
    transitions: false,
    setPieces: false,
    caudalPlan: false,
    duels: false,
  });
  const [eventTypes, setEventTypes] = useState(defaultEventTypes);
  const [selectedEventType, setSelectedEventType] = useState(defaultEventTypes[0].name);
  const [newEventDraft, setNewEventDraft] = useState({ minute: '', type: defaultEventTypes[0].name, description: '', player: '' });
  const [newEventTypeDraft, setNewEventTypeDraft] = useState({ name: '', color: 'slate' });
  const [postVideoStartSeconds, setPostVideoStartSeconds] = useState(0);
  const [postCurrentMinute, setPostCurrentMinute] = useState('');
  const [isGoalAnalysisOpen, setIsGoalAnalysisOpen] = useState(false);
  const [goalAnalysisDraft, setGoalAnalysisDraft] = useState(defaultGoalAnalysisDraft);
  const [selectedPlayerProfileId, setSelectedPlayerProfileId] = useState(null);
  const [playerCompetitionFilter, setPlayerCompetitionFilter] = useState('Todos');
  const [playerVenueFilter, setPlayerVenueFilter] = useState('Todos');
  const [playerInfluenceFilter, setPlayerInfluenceFilter] = useState('Todos');
  const [selectedTimelineAction, setSelectedTimelineAction] = useState(null);
  const [playerReport, setPlayerReport] = useState(null);
  const [groupCompetitionFilter, setGroupCompetitionFilter] = useState('Todos');
  const [groupContextFilter, setGroupContextFilter] = useState('Todos');
  const [groupAssistFilter, setGroupAssistFilter] = useState('Todas');
  const [groupShotFilter, setGroupShotFilter] = useState('Ambos');
  const [idealSystem, setIdealSystem] = useState('4-4-2');
  const [formState, setFormState] = useState({
    name: '',
    dob: '',
    number: '',
    position: 'Portero',
    foot: 'Derecha',
    image: '',
  });
  const [teamFormState, setTeamFormState] = useState(emptyTeamForm);
  const [matchFormState, setMatchFormState] = useState(emptyMatchForm);
  const [matchFormSection, setMatchFormSection] = useState('PRE');
  const preSectionRef = useRef(null);
  const postSectionRef = useRef(null);

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTeamId) ?? null,
    [selectedTeamId, teams]
  );

  const selectedMatch = useMemo(
    () => matches.find((match) => match.id === selectedMatchId) ?? null,
    [selectedMatchId, matches]
  );

  const selectedPlayerProfile = useMemo(
    () => players.find((player) => player.id === selectedPlayerProfileId) ?? null,
    [selectedPlayerProfileId, players]
  );

  useEffect(() => {
    setMatches((current) =>
      current.map((match) => {
        const rivalTeam = findTeamByDisplayName(teams, match.opponent);
        if (!rivalTeam) return match;
        const nextMatch = {
          ...match,
          opponent: cleanTeamDisplayName(rivalTeam.name),
          opponentCrest: rivalTeam.crest || match.opponentCrest,
          preRivalSystem: match.preRivalSystem || rivalTeam.system,
        };
        return nextMatch.opponent === match.opponent &&
          nextMatch.opponentCrest === match.opponentCrest &&
          nextMatch.preRivalSystem === match.preRivalSystem
          ? match
          : nextMatch;
      })
    );
  }, [teams]);

  const updateSelectedMatchFields = (fields) => {
    if (!selectedMatch) return;
    setMatches((current) => current.map((match) => (match.id === selectedMatch.id ? { ...match, ...fields } : match)));
  };

  const parseLineupText = (text) => text.split('\n').map((line) => line.trim()).filter(Boolean);
  const formatLineupText = (lineup) => (lineup || []).join('\n');
  const getYouTubeEmbedUrl = (url, startSeconds = 0) => {
    if (!url) return null;
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([A-Za-z0-9_-]{11})/);
    if (!match) return null;
    const start = Number(startSeconds) > 0 ? `&start=${Math.floor(Number(startSeconds))}` : '';
    return `https://www.youtube.com/embed/${match[1]}?enablejsapi=1${start}`;
  };
  const getCanvaEmbedUrl = (url) => {
    if (!url) return null;
    try {
      const canvaUrl = new URL(url);
      if (!canvaUrl.hostname.includes('canva.com')) return null;
      canvaUrl.searchParams.set('embed', '');
      return canvaUrl.toString();
    } catch {
      return null;
    }
  };

  const eventButtonClass = (typeOrColor) => {
    const color = eventColorOptions.includes(typeOrColor)
      ? typeOrColor
      : eventTypes.find((eventType) => eventType.name === typeOrColor)?.color || 'slate';
    switch (color) {
      case 'emerald':
        return 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30';
      case 'red':
        return 'bg-red-500/20 text-red-300 hover:bg-red-500/30';
      case 'sky':
        return 'bg-sky-500/20 text-sky-300 hover:bg-sky-500/30';
      case 'violet':
        return 'bg-violet-500/20 text-violet-300 hover:bg-violet-500/30';
      case 'amber':
        return 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30';
      case 'orange':
        return 'bg-amber-700/20 text-amber-200 hover:bg-amber-700/30';
      default:
        return 'bg-white/10 text-slate-200 hover:bg-white/15';
    }
  };

  const getRivalBaseTeam = () => {
    if (!selectedMatch?.opponent) return null;
    return findTeamByDisplayName(teams, selectedMatch.opponent);
  };

  const getCurrentRivalLineup = () => {
    if (selectedMatch?.preRivalLineup?.length) return selectedMatch.preRivalLineup;
    if (selectedMatch?.rivalLineupPlayers?.length) return selectedMatch.rivalLineupPlayers.map((player) => player.name);
    return [];
  };

  const getRivalAvailablePlayers = () => {
    const linkedPlayers = (getRivalBaseTeam()?.squad || []).map(normalizeSquadEntry);
    const manualPlayers = (selectedMatch?.preRivalManualPlayers || []).map((player) =>
      typeof player === 'string' ? { ...createBlankTeamPlayer(), name: player } : normalizeSquadEntry(player)
    );
    const byName = new Map();
    [...linkedPlayers, ...manualPlayers].forEach((player) => {
      if (player.name) byName.set(player.name, player);
    });
    return Array.from(byName.values());
  };

  const getCurrentRivalSystem = () => selectedMatch?.preRivalSystem || selectedMatch?.rivalLineupSystem || '4-4-2';

  const getTacticalQuestionnaire = () => ({
    preRivalStyle: selectedMatch?.preRivalStyle || '',
    preRivalStrengths: selectedMatch?.preRivalStrengths || '',
    preRivalWeaknesses: selectedMatch?.preRivalWeaknesses || '',
    preRivalBuildUp: selectedMatch?.preRivalBuildUp || 'Combinativo',
    preRivalDefensiveBlock: selectedMatch?.preRivalDefensiveBlock || 'Medio',
    preRivalPressure: selectedMatch?.preRivalPressure || 'Media',
    preRivalTransitions: selectedMatch?.preRivalTransitions || 'Equilibradas',
    preRivalOffensiveOrganization: selectedMatch?.preRivalOffensiveOrganization || '',
    preRivalBaseSystem: selectedMatch?.preRivalBaseSystem || '',
    preRivalStartPlay: selectedMatch?.preRivalStartPlay || '',
    preRivalProgression: selectedMatch?.preRivalProgression || '',
    preRivalFinishing: selectedMatch?.preRivalFinishing || '',
    preRivalOffensiveKeyPlayers: selectedMatch?.preRivalOffensiveKeyPlayers || '',
    preRivalDangerZones: selectedMatch?.preRivalDangerZones || '',
    preRivalWideAttack: selectedMatch?.preRivalWideAttack || '',
    preRivalBoxOccupation: selectedMatch?.preRivalBoxOccupation || '',
    preRivalDefensiveOrganization: selectedMatch?.preRivalDefensiveOrganization || '',
    preRivalDefensiveSystem: selectedMatch?.preRivalDefensiveSystem || '',
    preRivalBlockHeightDetail: selectedMatch?.preRivalBlockHeightDetail || '',
    preRivalPressureType: selectedMatch?.preRivalPressureType || '',
    preRivalSpacesAllowed: selectedMatch?.preRivalSpacesAllowed || '',
    preRivalDefendsCrosses: selectedMatch?.preRivalDefendsCrosses || '',
    preRivalDefendsBack: selectedMatch?.preRivalDefendsBack || '',
    preRivalSecondBallDefense: selectedMatch?.preRivalSecondBallDefense || '',
    preRivalAfterLoss: selectedMatch?.preRivalAfterLoss || '',
    preRivalAfterRecovery: selectedMatch?.preRivalAfterRecovery || '',
    preRivalTransitionLaunchers: selectedMatch?.preRivalTransitionLaunchers || '',
    preRivalBestRunningZones: selectedMatch?.preRivalBestRunningZones || '',
    preRivalCornersFor: selectedMatch?.preRivalCornersFor || '',
    preRivalCornersAgainst: selectedMatch?.preRivalCornersAgainst || '',
    preRivalWideFreeKicks: selectedMatch?.preRivalWideFreeKicks || '',
    preRivalSetPieceTakers: selectedMatch?.preRivalSetPieceTakers || '',
    preRivalMainHeaders: selectedMatch?.preRivalMainHeaders || '',
    preCaudalIntent: selectedMatch?.preCaudalIntent || '',
    preCaudalBuildPlan: selectedMatch?.preCaudalBuildPlan || '',
    preCaudalStartPlay: selectedMatch?.preCaudalStartPlay || '',
    preCaudalProgressionPlan: selectedMatch?.preCaudalProgressionPlan || '',
    preCaudalAttackZones: selectedMatch?.preCaudalAttackZones || '',
    preCaudalPlayersToActivate: selectedMatch?.preCaudalPlayersToActivate || '',
    preCaudalSpacesToFind: selectedMatch?.preCaudalSpacesToFind || '',
    preCaudalPressPlan: selectedMatch?.preCaudalPressPlan || '',
    preCaudalRivalsToBlock: selectedMatch?.preCaudalRivalsToBlock || '',
    preCaudalDefendStrengths: selectedMatch?.preCaudalDefendStrengths || '',
    preCaudalAvoid: selectedMatch?.preCaudalAvoid || '',
    preCaudalAfterLoss: selectedMatch?.preCaudalAfterLoss || '',
    preCaudalAfterRecovery: selectedMatch?.preCaudalAfterRecovery || '',
    preKeyMatchups: selectedMatch?.preKeyMatchups || '',
    preCaudalPlayerToBoost: selectedMatch?.preCaudalPlayerToBoost || '',
    preRivalPlayerToWatch: selectedMatch?.preRivalPlayerToWatch || '',
    preImportantDuels: selectedMatch?.preImportantDuels || '',
  });

  const runAiAnalysis = () => {
    if (!selectedMatch) return;
    const questionnaire = getTacticalQuestionnaire();
    const caudalSystem = selectedMatch.preCaudalSystem || '4-4-2';
    const rivalSystem = getCurrentRivalSystem();
    const caudalLineup = selectedMatch.preCaudalLineup?.length ? selectedMatch.preCaudalLineup : players.slice(0, 11).map((player) => player.name);
    const rivalLineup = selectedMatch.preRivalLineup?.length ? selectedMatch.preRivalLineup : getCurrentRivalLineup();
    const prompt = buildTacticalPrompt({
      match: selectedMatch,
      caudalSystem,
      rivalSystem,
      caudalLineup,
      rivalLineup,
      questionnaire,
      playerNotes: selectedMatch.prePlayerNotes || {},
      rivalNotes: selectedMatch.preRivalPlayerNotes || {},
    });
    const analysis = buildTacticalAnalysis({
      caudalSystem,
      rivalSystem,
      caudalLineup,
      rivalLineup,
      questionnaire,
      playerProfiles: players,
      playerNotes: selectedMatch.prePlayerNotes || {},
      rivalProfiles: getRivalAvailablePlayers(),
      rivalNotes: selectedMatch.preRivalPlayerNotes || {},
    });
    updateSelectedMatchFields({
      preAiAnalysis: { ...analysis, prompt },
    });
  };

  const handleEventDraftChange = (field, value) => {
    setNewEventDraft((prev) => ({ ...prev, [field]: value }));
  };

  const addNewEvent = () => {
    if (!selectedMatch) return;
    const minute = newEventDraft.minute || postCurrentMinute;
    if (!minute || !newEventDraft.description) return;
    const nextEvent = {
      id: Date.now(),
      minute,
      type: newEventDraft.type,
      description: newEventDraft.description,
      player: newEventDraft.player,
      videoSeconds: Math.max(0, Math.round(Number(minute) * 60)),
    };
    updateSelectedMatchFields({ events: [...(selectedMatch.events || []), nextEvent] });
    setNewEventDraft({ minute: '', type: selectedEventType, description: '', player: '' });
  };

  const addEventType = () => {
    const name = newEventTypeDraft.name.trim();
    if (!name) return;
    const nextType = { id: `custom-${Date.now()}`, name, color: newEventTypeDraft.color };
    setEventTypes((current) => [...current, nextType]);
    setSelectedEventType(name);
    setNewEventDraft((prev) => ({ ...prev, type: name }));
    setNewEventTypeDraft({ name: '', color: 'slate' });
  };

  const updateEventType = (id, fields) => {
    setEventTypes((current) =>
      current.map((eventType) => {
        if (eventType.id !== id) return eventType;
        const nextType = { ...eventType, ...fields };
        if (selectedEventType === eventType.name && fields.name) {
          setSelectedEventType(fields.name);
          setNewEventDraft((prev) => ({ ...prev, type: fields.name }));
        }
        return nextType;
      })
    );
  };

  const removeEventType = (id) => {
    setEventTypes((current) => {
      const nextTypes = current.filter((eventType) => eventType.id !== id);
      const fallback = nextTypes[0]?.name || '';
      if (!nextTypes.some((eventType) => eventType.name === selectedEventType)) {
        setSelectedEventType(fallback);
        setNewEventDraft((prev) => ({ ...prev, type: fallback }));
      }
      return nextTypes;
    });
  };

  const seekPostVideoToEvent = (event) => {
    const seconds = Number(event.videoSeconds) || Math.max(0, Math.round(Number(event.minute || 0) * 60));
    setPostVideoStartSeconds(seconds);
    setPostCurrentMinute(event.minute || '');
  };

  const runPostAiAnalysis = () => {
    if (!selectedMatch) return;
    const events = selectedMatch.events || [];
    const losses = events.filter((event) => /pérdida|perdida/i.test(event.type)).length;
    const recoveries = events.filter((event) => /recuper/i.test(event.type)).length;
    const chances = events.filter((event) => /ocas/i.test(event.type)).length;
    updateSelectedMatchFields({
      postAiAnalysis: {
        worked: [
          selectedMatch.postFulfilled || 'Las fases que generaron continuidad y ocasiones deben revisarse en vídeo para repetir patrones.',
          recoveries ? `Se registraron ${recoveries} recuperaciones: revisar si llegaron en las zonas previstas del plan PRE.` : 'Valorar si la presión permitió recuperar cerca de portería rival.',
        ],
        notWorked: [
          selectedMatch.postNotFulfilled || 'Comparar el plan PRE con los eventos negativos para localizar qué comportamientos no aparecieron.',
          losses ? `Hubo ${losses} pérdidas registradas: analizar zona, perfil corporal y apoyos cercanos.` : 'Revisar si hubo pérdidas no registradas en salida o progresión.',
        ],
        why: selectedMatch.postWhy || 'Cruzar vídeo, eventos y resultado para separar problema táctico, técnico o de toma de decisión.',
        repeat: selectedMatch.postRepeat || selectedMatch.planConBalon || 'Repetir las acciones que permitieron progresar con control y finalizar jugadas.',
        correct: selectedMatch.postImprove || 'Corregir distancias entre líneas, reacción tras pérdida y ocupación de área.',
        train: selectedMatch.postTrainWeek || 'Entrenar presión tras pérdida, salida bajo presión y finalización tras centro o pase atrás.',
        review: selectedMatch.postIndividualObservations || `Revisar jugadores implicados en ${chances} ocasiones, pérdidas y recuperaciones clave.`,
      },
    });
  };

  const getStatsGoalEvents = () => selectedMatch?.statsGoalEvents || [];
  const getStatsScore = () => {
    const caudalGoals = getStatsGoalEvents().filter((event) => event.type === 'Gol a favor').length;
    const rivalGoals = getStatsGoalEvents().filter((event) => event.type === 'Gol en contra').length;
    return selectedMatch?.isHome
      ? { home: caudalGoals, away: rivalGoals, caudal: caudalGoals, rival: rivalGoals }
      : { home: rivalGoals, away: caudalGoals, caudal: caudalGoals, rival: rivalGoals };
  };

  const getStatsPlayerTotals = (playerName) => {
    const events = getStatsGoalEvents();
    return {
      goals: events.filter((event) => event.type === 'Gol a favor' && event.scorer === playerName).length,
      assists: events.filter((event) => event.type === 'Gol a favor' && event.assistant === playerName).length,
    };
  };

  const getStatsCalledPlayerNames = () => {
    if (selectedMatch?.statsCalledPlayers?.length) return selectedMatch.statsCalledPlayers;
    return players.map((player) => player.name);
  };

  const getStatsCalledPlayers = () => {
    const calledNames = getStatsCalledPlayerNames();
    return players.filter((player) => calledNames.includes(player.name));
  };

  const removeStatsCalledPlayer = (playerName) => {
    if (!selectedMatch) return;
    const currentCalled = getStatsCalledPlayerNames();
    const nextLineup = (selectedMatch.statsLineup || []).map((name) => (name === playerName ? '' : name));
    updateSelectedMatchFields({
      statsCalledPlayers: currentCalled.filter((name) => name !== playerName),
      statsLineup: nextLineup,
    });
  };

  const addStatsCalledPlayer = (playerName) => {
    if (!selectedMatch) return;
    const currentCalled = getStatsCalledPlayerNames();
    if (currentCalled.includes(playerName)) return;
    updateSelectedMatchFields({
      statsCalledPlayers: [...currentCalled, playerName],
    });
  };

  const getStatsPlayerData = (playerName) => {
    const lineup = selectedMatch?.statsLineup || [];
    const stored = selectedMatch?.statsPlayerData?.[playerName] || {};
    const isStarter = lineup.includes(playerName);
    const totals = getStatsPlayerTotals(playerName);
    const yellowCount = Number(stored.yellowCount ?? (stored.yellow ? 1 : 0)) || 0;
    return {
      role: isStarter ? 'Titular' : 'Suplente',
      minutes: stored.minutes ?? (isStarter ? 90 : 0),
      yellow: yellowCount > 0,
      yellowCount,
      red: stored.red || false,
      injured: stored.injured || false,
      rating: stored.rating || '',
      replacementName: stored.replacementName || '',
      goals: totals.goals,
      assists: totals.assists,
    };
  };

  const getStatsReplacementInfo = (starterName) => {
    const stats = getStatsPlayerData(starterName);
    const minutes = Number(stats.minutes || 0);
    if (stats.role !== 'Titular' || minutes <= 0 || minutes >= 90 || !stats.replacementName) return null;
    const replacement = players.find((player) => player.name === stats.replacementName);
    return {
      replacementName: stats.replacementName,
      replacement,
      minute: minutes,
      substituteMinutes: 90 - minutes,
    };
  };

  const getStatsSubstituteMinutes = (playerName) => {
    const starter = getStatsCalledPlayers().find((calledPlayer) => {
      const stats = getStatsPlayerData(calledPlayer.name);
      const minutes = Number(stats.minutes || 0);
      return stats.role === 'Titular' && minutes > 0 && minutes < 90 && stats.replacementName === playerName;
    });
    if (!starter) return 0;
    return 90 - Number(getStatsPlayerData(starter.name).minutes || 0);
  };

  const getStatsReplacementOptions = (starterName) => {
    const calledPlayers = getStatsCalledPlayers();
    const substitutes = calledPlayers.filter((player) => getStatsPlayerData(player.name).role !== 'Titular' && player.name !== starterName);
    return substitutes.length ? substitutes : calledPlayers.filter((player) => player.name !== starterName);
  };

  const updateStatsPlayerData = (playerName, fields) => {
    if (!selectedMatch) return;
    updateSelectedMatchFields({
      statsPlayerData: {
        ...(selectedMatch.statsPlayerData || {}),
        [playerName]: {
          ...(selectedMatch.statsPlayerData?.[playerName] || {}),
          ...fields,
        },
      },
    });
  };

  const updateStatsLineupSlot = (slotIndex, playerName) => {
    if (!selectedMatch || !playerName) return;
    const calledNames = getStatsCalledPlayerNames();
    const nextLineup = Array.from({ length: 11 }, (_, index) => selectedMatch.statsLineup?.[index] || '');
    const repeatedIndex = nextLineup.findIndex((name, index) => name === playerName && index !== slotIndex);
    if (repeatedIndex >= 0) nextLineup[repeatedIndex] = '';
    nextLineup[slotIndex] = playerName;
    updateSelectedMatchFields({
      statsLineup: nextLineup,
      statsCalledPlayers: calledNames.includes(playerName) ? calledNames : [...calledNames, playerName],
    });
  };

  const handleDropOnStatsLineupSlot = (slotIndex) => {
    if (!draggedPlayer) return;
    updateStatsLineupSlot(slotIndex, normalizeSquadEntry(draggedPlayer).name);
    setDraggedPlayer(null);
  };

  const openGoalAnalysisModal = () => {
    setGoalAnalysisDraft({
      ...defaultGoalAnalysisDraft,
      scorer: players[0]?.name || '',
      assistant: '',
    });
    setIsGoalAnalysisOpen(true);
  };

  const updateGoalAnalysisDraft = (field, value) => {
    setGoalAnalysisDraft((prev) => {
      if (field === 'phase') {
        return { ...prev, phase: value, subphase: goalPhaseOptions[value]?.[0] || '' };
      }
      if (field === 'type' && value === 'Gol en contra') {
        return { ...prev, type: value, scorer: '', assistant: '' };
      }
      return { ...prev, [field]: value };
    });
  };

  const saveGoalAnalysisEvent = () => {
    if (!selectedMatch || !goalAnalysisDraft.minute) return;
    const nextEvents = [
      ...(selectedMatch.statsGoalEvents || []),
      { ...goalAnalysisDraft, id: Date.now() },
    ];
    const caudalGoals = nextEvents.filter((event) => event.type === 'Gol a favor').length;
    const rivalGoals = nextEvents.filter((event) => event.type === 'Gol en contra').length;
    updateSelectedMatchFields({
      statsGoalEvents: nextEvents,
      goalsFor: String(caudalGoals),
      goalsAgainst: String(rivalGoals),
      homeScore: selectedMatch.isHome ? String(caudalGoals) : String(rivalGoals),
      awayScore: selectedMatch.isHome ? String(rivalGoals) : String(caudalGoals),
    });
    setIsGoalAnalysisOpen(false);
  };

  const renderZoneGrid = ({ value, onChange, zones = pitchZoneOptions, goal = false }) => (
    <div className={`relative w-full overflow-hidden rounded-3xl border-4 border-white/70 ${goal ? 'aspect-[4/3] min-h-[220px] bg-[#111827]' : 'aspect-[7/10] min-h-[260px] bg-[repeating-linear-gradient(90deg,#075f43_0,#075f43_16.6%,#08694a_16.6%,#08694a_33.3%)]'}`}>
      {goal ? (
        <>
          <div className="absolute inset-x-6 top-5 bottom-5 rounded-t-2xl border-4 border-white/60 border-b-0" />
          <div className="absolute inset-x-9 top-8 bottom-6 bg-[linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:22px_22px]" />
          <div className="absolute bottom-5 left-6 right-6 h-1 bg-white/70" />
        </>
      ) : (
        <>
          <div className="absolute inset-4 rounded-[1.4rem] border-2 border-white/60" />
          <div className="absolute left-4 right-4 top-1/2 h-px bg-white/40" />
          <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/35" />
          <div className="absolute left-1/2 top-4 h-20 w-40 -translate-x-1/2 rounded-b-3xl border-x-2 border-b-2 border-white/45" />
          <div className="absolute bottom-4 left-1/2 h-20 w-40 -translate-x-1/2 rounded-t-3xl border-x-2 border-t-2 border-white/45" />
        </>
      )}
      <div className={`${goal ? 'absolute inset-x-6 bottom-8 top-10' : 'absolute inset-4'} grid grid-cols-3 grid-rows-3`}>
        {zones.map((zone) => {
          const selected = goal ? value === zone : normalizePitchZone(value) === zone;
          return (
            <button
              key={zone}
              type="button"
              onClick={() => onChange(zone)}
              className={`whitespace-pre-line break-words border border-white/15 px-1 text-center font-black uppercase transition ${goal ? 'text-[8px] leading-none' : 'text-[9px] leading-tight'} ${selected ? 'bg-caudal-electric/85 text-slate-950 shadow-[0_0_35px_rgba(79,140,255,0.45)]' : goal ? 'bg-black/15 text-slate-200 hover:bg-white/10' : 'bg-black/10 text-white hover:bg-emerald-400/20'}`}
            >
              {displayZoneLabel(zone)}
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderStatsPitch = () => {
    if (!selectedMatch) return null;
    const coordinates = getFormationCoordinates(selectedMatch.statsSystem || '4-4-2');
    return (
      <div className="relative aspect-[7/8.9] min-h-[560px] overflow-hidden rounded-3xl border border-white/20 bg-[#102616] shadow-inner">
        <div className="absolute inset-4 rounded-[28px] border-2 border-white/60" />
        <div className="absolute left-4 right-4 top-1/2 h-px bg-white/45" />
        <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/45" />
        <div className="absolute left-1/2 top-4 h-24 w-56 -translate-x-1/2 rounded-b-3xl border-x-2 border-b-2 border-white/45" />
        <div className="absolute bottom-4 left-1/2 h-24 w-56 -translate-x-1/2 rounded-t-3xl border-x-2 border-t-2 border-white/45" />
        {coordinates.map((slot, slotIndex) => {
          const playerName = selectedMatch.statsLineup?.[slotIndex] || '';
          const player = players.find((item) => item.name === playerName);
          const stats = playerName ? getStatsPlayerData(playerName) : null;
          const replacementInfo = playerName ? getStatsReplacementInfo(playerName) : null;
          return (
            <div
              key={`stats-slot-${slotIndex}`}
              draggable={Boolean(player)}
              onDragStart={() => player && setDraggedPlayer(player)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.stopPropagation();
                handleDropOnStatsLineupSlot(slotIndex);
              }}
              className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 text-center ${player ? 'cursor-grab' : ''}`}
              style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
            >
              <div className={`relative flex h-16 w-16 items-center justify-center rounded-full border-2 text-sm font-black shadow-glow ${playerName ? 'border-white bg-caudal-950 text-white' : 'border-dashed border-white/40 bg-white/10 text-white/70'}`}>
                {player?.image ? (
                  <img src={player.image} alt="" className="h-full w-full rounded-full object-cover" />
                ) : (
                  <span>{player?.number || playerName?.slice(0, 2).toUpperCase() || slotIndex + 1}</span>
                )}
                {playerName ? (
                  <span className="absolute -bottom-2 left-1/2 flex h-6 min-w-6 -translate-x-1/2 items-center justify-center rounded-full bg-black px-1 text-xs font-black text-white">
                    {player?.number || slotIndex + 1}
                  </span>
                ) : null}
                {stats?.rating ? (
                  <span className="absolute -right-3 top-0 rounded-full bg-caudal-electric px-1.5 py-0.5 text-[10px] font-black text-white">
                    {stats.rating}
                  </span>
                ) : null}
                {replacementInfo ? (
                  <span className="absolute -left-5 top-8 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white" title="Sale">
                    {replacementInfo.minute}' ↓
                  </span>
                ) : null}
              </div>
              <div className="max-w-[92px] truncate rounded-xl bg-black/60 px-2 py-1 text-[10px] font-bold text-white">
                {playerName || getFormationRoles(selectedMatch.statsSystem || '4-4-2')[slotIndex]}
              </div>
              {replacementInfo ? (
                <div className="max-w-[108px] truncate rounded-xl bg-emerald-500 px-2 py-1 text-[10px] font-black text-white" title={`Entra ${replacementInfo.replacementName}`}>
                  ↑ {replacementInfo.replacementName} · {replacementInfo.substituteMinutes}'
                </div>
              ) : null}
              {stats ? (
                <div className="flex flex-wrap justify-center gap-1 text-[10px]">
                  {stats.goals ? <span title="Gol">⚽{stats.goals > 1 ? stats.goals : ''}</span> : null}
                  {stats.assists ? <span title="Asistencia">👟{stats.assists > 1 ? stats.assists : ''}</span> : null}
                  {stats.yellow ? <span title="Amarilla">🟨{stats.yellowCount > 1 ? stats.yellowCount : ''}</span> : null}
                  {stats.red ? <span title="Roja">🟥</span> : null}
                  {stats.injured ? <span title="Lesión">🚑</span> : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  const getPlayerMatchRows = (player) => {
    if (!player) return [];
    return matches
      .filter((match) =>
        playerCompetitionFilter === 'Todos' ||
        match.type === playerCompetitionFilter ||
        (playerCompetitionFilter === 'Playoff' && match.type === 'Play off')
      )
      .filter((match) => playerVenueFilter === 'Todos' || (playerVenueFilter === 'Local' ? match.isHome : !match.isHome))
      .map((match) => {
        const goalEvents = match.statsGoalEvents || [];
        const stored = match.statsPlayerData?.[player.name] || {};
        const lineup = match.statsLineup || [];
        const calledNames = match.statsCalledPlayers || [];
        const isStarter = lineup.includes(player.name);
        const isCalled = calledNames.length
          ? calledNames.includes(player.name)
          : isStarter || Boolean(stored.minutes || stored.yellow || stored.red || stored.injured || stored.rating) || goalEvents.some((event) => event.scorer === player.name || event.assistant === player.name);
        const goals = goalEvents.filter((event) => event.type === 'Gol a favor' && event.scorer === player.name);
        const assists = goalEvents.filter((event) => event.type === 'Gol a favor' && event.assistant === player.name);
        const postEvents = (match.events || []).filter((event) => event.player === player.name);
        const yellow = Number(stored.yellowCount ?? (stored.yellow ? 1 : 0)) + postEvents.filter((event) => /tarjeta/i.test(event.type) && /amarilla/i.test(event.description || '')).length;
        const red = Boolean(stored.red || postEvents.some((event) => /tarjeta/i.test(event.type) && /roja/i.test(event.description || '')));
        const injured = Boolean(stored.injured || postEvents.some((event) => /lesi/i.test(`${event.type} ${event.description}`)));
        const minutes = Number(stored.minutes ?? (isStarter ? 90 : 0)) || 0;
        return {
          match,
          isCalled,
          role: isStarter ? 'Titular' : 'Suplente',
          minutes,
          goals,
          assists,
          yellow,
          red,
          injured,
          rating: stored.rating || '',
          postEvents,
        };
      })
      .filter((row) => row.isCalled || row.minutes > 0 || row.goals.length || row.assists.length || row.yellow || row.red || row.injured);
  };

  const getPlayerAggregate = (player) => {
    const rows = getPlayerMatchRows(player);
    const played = rows.filter((row) => row.minutes > 0 || row.role === 'Titular').length;
    const starts = rows.filter((row) => row.role === 'Titular').length;
    const subs = Math.max(0, played - starts);
    const minutes = rows.reduce((sum, row) => sum + row.minutes, 0);
    const goals = rows.reduce((sum, row) => sum + row.goals.length, 0);
    const assists = rows.reduce((sum, row) => sum + row.assists.length, 0);
    const yellow = rows.reduce((sum, row) => sum + Number(row.yellow || 0), 0);
    const red = rows.filter((row) => row.red).length;
    const injured = rows.filter((row) => row.injured).length;
    const possibleMinutes = rows.length * 90;
    return {
      rows,
      played,
      starts,
      subs,
      minutes,
      participation: possibleMinutes ? Math.round((minutes / possibleMinutes) * 100) : 0,
      goals,
      assists,
      yellow,
      red,
      injured,
      goalsPer90: minutes ? (goals / minutes * 90).toFixed(2) : '0.00',
      assistsPer90: minutes ? (assists / minutes * 90).toFixed(2) : '0.00',
      directGoalParticipation: goals + assists,
    };
  };

  const countValues = (values) =>
    values.reduce((acc, value) => {
      if (!value) return acc;
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {});

  const countPitchZones = (values) =>
    values.reduce((acc, value) => {
      if (!value) return acc;
      const normalized = normalizePitchZone(value);
      acc[normalized] = (acc[normalized] || 0) + 1;
      return acc;
    }, {});

  const renderReadOnlyZoneGrid = ({ counts, zones = pitchZoneOptions, goal = false }) => (
    <div className={`relative overflow-hidden rounded-3xl border-4 border-white/70 ${goal ? 'aspect-[16/9] min-h-[180px] bg-[#111827]' : 'aspect-[7/10] bg-[repeating-linear-gradient(90deg,#075f43_0,#075f43_16.6%,#08694a_16.6%,#08694a_33.3%)]'}`}>
      {goal ? (
        <>
          <div className="absolute inset-x-6 top-5 bottom-5 rounded-t-2xl border-4 border-white/60 border-b-0" />
          <div className="absolute inset-x-10 top-9 bottom-5 bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:24px_24px]" />
          <div className="absolute bottom-5 left-6 right-6 h-1 bg-white/70" />
        </>
      ) : (
        <>
          <div className="absolute inset-4 rounded-[1.4rem] border-2 border-white/60" />
          <div className="absolute left-4 right-4 top-1/2 h-px bg-white/40" />
          <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/35" />
          <div className="absolute left-1/2 top-4 h-20 w-40 -translate-x-1/2 rounded-b-3xl border-x-2 border-b-2 border-white/45" />
          <div className="absolute bottom-4 left-1/2 h-20 w-40 -translate-x-1/2 rounded-t-3xl border-x-2 border-t-2 border-white/45" />
          <div className="absolute left-1/2 top-[11%] h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-white/70" />
          <div className="absolute bottom-[11%] left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-white/70" />
        </>
      )}
      <div className="absolute inset-4 grid grid-cols-3 grid-rows-3">
        {zones.map((zone) => {
          const count = counts[zone] || 0;
          return (
          <div key={zone} className={`flex flex-col items-center justify-center border border-white/15 px-1 text-center ${count ? 'bg-caudal-electric/75 text-slate-950 shadow-[0_0_35px_rgba(79,140,255,0.45)]' : 'bg-black/10 text-slate-200'}`}>
            <span className={`${goal ? 'text-[9px]' : 'text-[10px]'} whitespace-pre-line font-black uppercase leading-tight drop-shadow`}>{displayZoneLabel(zone)}</span>
            <strong className={`${goal ? 'mt-0 text-lg' : 'mt-1 text-xl'}`}>{count}</strong>
          </div>
          );
        })}
      </div>
    </div>
  );

  const generatePlayerReport = (player, aggregate) => {
    setPlayerReport({
      general: `${player.name} acumula ${aggregate.played} partidos, ${aggregate.minutes}' y ${aggregate.directGoalParticipation} participaciones directas de gol en el filtro actual.`,
      strengths: aggregate.goals || aggregate.assists ? 'Aporta producción ofensiva medible: revisar sus acciones de gol/asistencia para repetir zonas y sociedades.' : 'Sin producción ofensiva registrada: valorar influencia sin balón, continuidad y ocupación de zonas.',
      improve: aggregate.yellow || aggregate.red ? 'Controlar acciones disciplinarias y momentos de riesgo competitivo.' : 'Aumentar presencia en acciones decisivas si su rol lo permite.',
      trend: aggregate.rows.slice(-3).length ? `Últimos ${aggregate.rows.slice(-3).length} partidos registrados: ${aggregate.rows.slice(-3).reduce((sum, row) => sum + row.minutes, 0)} minutos.` : 'Sin tendencia reciente registrada.',
    });
  };

  const getMatchScoreData = (match) => {
    const events = match.statsGoalEvents || [];
    const caudalGoals = events.filter((event) => event.type === 'Gol a favor').length || Number(match.goalsFor) || Number(match.isHome ? match.homeScore : match.awayScore) || 0;
    const rivalGoals = events.filter((event) => event.type === 'Gol en contra').length || Number(match.goalsAgainst) || Number(match.isHome ? match.awayScore : match.homeScore) || 0;
    return { caudalGoals, rivalGoals };
  };

  const getMatchScoreLabel = (match) => {
    const score = getMatchScoreData(match);
    return match.isHome ? `C.D. Caudal ${score.caudalGoals}-${score.rivalGoals} ${match.opponent}` : `${match.opponent} ${score.rivalGoals}-${score.caudalGoals} C.D. Caudal`;
  };

  const getGroupScopedMatches = () => {
    let scoped = matches
      .filter((match) => match.status === 'Finalizado' || (match.statsGoalEvents || []).length > 0)
      .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
    if (groupCompetitionFilter === 'Liga') scoped = scoped.filter((match) => match.type === 'Liga');
    if (groupCompetitionFilter === 'Copa RFEF') scoped = scoped.filter((match) => match.type === 'Copa RFEF');
    if (groupCompetitionFilter === 'Playoff') scoped = scoped.filter((match) => match.type === 'Play off');
    if (groupCompetitionFilter === 'Amistoso') scoped = scoped.filter((match) => match.type === 'Amistoso');
    if (groupContextFilter === 'Local') scoped = scoped.filter((match) => match.isHome);
    if (groupContextFilter === 'Visitante') scoped = scoped.filter((match) => !match.isHome);
    if (groupContextFilter === 'Victorias') scoped = scoped.filter((match) => {
      const score = getMatchScoreData(match);
      return score.caudalGoals > score.rivalGoals;
    });
    if (groupContextFilter === 'Empates') scoped = scoped.filter((match) => {
      const score = getMatchScoreData(match);
      return score.caudalGoals === score.rivalGoals;
    });
    if (groupContextFilter === 'Derrotas') scoped = scoped.filter((match) => {
      const score = getMatchScoreData(match);
      return score.caudalGoals < score.rivalGoals;
    });
    if (groupContextFilter === 'Últimos 5 partidos') scoped = scoped.slice(-5);
    return scoped;
  };

  const getGroupAnalysisData = () => {
    const scoped = getGroupScopedMatches();
    const results = scoped.reduce((acc, match) => {
      const score = getMatchScoreData(match);
      if (score.caudalGoals > score.rivalGoals) acc.wins += 1;
      else if (score.caudalGoals === score.rivalGoals) acc.draws += 1;
      else acc.losses += 1;
      acc.goalsFor += score.caudalGoals;
      acc.goalsAgainst += score.rivalGoals;
      if (score.rivalGoals === 0) acc.cleanSheets += 1;
      return acc;
    }, { wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0 });
    const allGoalEvents = scoped.flatMap((match) => (match.statsGoalEvents || []).map((event) => ({ ...event, match })));
    const goalForEvents = allGoalEvents.filter((event) => event.type === 'Gol a favor');
    const goalAgainstEvents = allGoalEvents.filter((event) => event.type === 'Gol en contra');
    const points = results.wins * 3 + results.draws;
    return {
      scoped,
      allGoalEvents,
      goalForEvents,
      goalAgainstEvents,
      played: scoped.length,
      ...results,
      goalDiff: results.goalsFor - results.goalsAgainst,
      pointsPerGame: scoped.length ? (points / scoped.length).toFixed(2) : '0.00',
    };
  };

  const groupEventsByMinuteRange = (events) => {
    const ranges = ['0-15', '15-30', '30-45', '45-60', '60-75', '75-90'];
    return ranges.map((range) => {
      const [from, to] = range.split('-').map(Number);
      const isLastRange = to === 90;
      return {
        range,
        count: events.filter((event) => Number(event.minute) >= from && (isLastRange ? Number(event.minute) <= to : Number(event.minute) < to)).length,
      };
    });
  };

  const countPhases = (events) => ['Juego combinativo', 'Juego directo', 'Transición', 'ABP'].map((phase) => ({
    phase,
    count: events.filter((event) => event.phase === phase).length,
  }));

  const getSetPieceSummary = (events) => {
    const abp = events.filter((event) => event.phase === 'ABP');
    const get = (subphase) => abp.filter((event) => event.subphase === subphase).length;
    return {
      total: abp.length,
      corner: get('Córner'),
      directFreeKick: get('Falta directa'),
      freeKickHeader: get('Falta con remate'),
      penalty: get('Penalti'),
      secondBall: get('Segunda jugada'),
    };
  };

  const summarizeGroupMatches = (scopedMatches) => {
    const summary = scopedMatches.reduce((acc, match) => {
      const score = getMatchScoreData(match);
      if (score.caudalGoals > score.rivalGoals) acc.wins += 1;
      else if (score.caudalGoals === score.rivalGoals) acc.draws += 1;
      else acc.losses += 1;
      acc.played += 1;
      acc.goalsFor += score.caudalGoals;
      acc.goalsAgainst += score.rivalGoals;
      acc.cleanSheets += score.rivalGoals === 0 ? 1 : 0;
      return acc;
    }, { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0 });
    const points = summary.wins * 3 + summary.draws;
    return {
      ...summary,
      goalDiff: summary.goalsFor - summary.goalsAgainst,
      pointsPerGame: summary.played ? (points / summary.played).toFixed(2) : '0.00',
    };
  };

  const filterAssistEventsByGroupMode = (events) => {
    if (groupAssistFilter === 'Juego') return events.filter((event) => ['Juego combinativo', 'Juego directo'].includes(event.phase));
    if (groupAssistFilter === 'Transición') return events.filter((event) => event.phase === 'Transición');
    if (groupAssistFilter === 'ABP') return events.filter((event) => event.phase === 'ABP');
    return events;
  };

  const getGroupRankings = (scopedMatches) => {
    const possibleMinutes = Math.max(1, scopedMatches.length * 90);
    const byPlayer = new Map(players.map((player) => [player.name, {
      player,
      goals: 0,
      assists: 0,
      yellow: 0,
      red: 0,
      minutes: 0,
      starts: 0,
      ratingTotal: 0,
      ratingCount: 0,
    }]));

    scopedMatches.forEach((match) => {
      (match.statsGoalEvents || []).forEach((event) => {
        if (event.type !== 'Gol a favor') return;
        if (event.scorer && byPlayer.has(event.scorer)) byPlayer.get(event.scorer).goals += 1;
        if (event.assistant && byPlayer.has(event.assistant)) byPlayer.get(event.assistant).assists += 1;
      });
      players.forEach((player) => {
        const stored = match.statsPlayerData?.[player.name] || {};
        const isStarter = (match.statsLineup || []).includes(player.name);
        const minutes = Number(stored.minutes ?? (isStarter ? 90 : 0)) || 0;
        const row = byPlayer.get(player.name);
        row.minutes += minutes;
        row.starts += isStarter ? 1 : 0;
        row.yellow += Number(stored.yellowCount ?? (stored.yellow ? 1 : 0)) || 0;
        row.red += stored.red ? 1 : 0;
        if (stored.rating) {
          row.ratingTotal += Number(stored.rating) || 0;
          row.ratingCount += 1;
        }
      });
    });

    const rows = Array.from(byPlayer.values()).map((row) => ({
      ...row,
      goalParticipation: row.goals + row.assists,
      cards: row.yellow + row.red,
      minutePct: Math.round((row.minutes / possibleMinutes) * 100),
      avgRating: row.ratingCount ? row.ratingTotal / row.ratingCount : 0,
      idealScore: row.minutes * 0.03 + row.starts * 6 + row.goals * 8 + row.assists * 6 + (row.ratingCount ? (row.ratingTotal / row.ratingCount) * 4 : 0),
    }));
    const top = (key) => rows.filter((row) => row[key] > 0).sort((a, b) => b[key] - a[key]).slice(0, 5);
    return {
      rows,
      scorers: top('goals'),
      assistants: top('assists'),
      booked: rows.filter((row) => row.cards > 0).sort((a, b) => b.cards - a.cards).slice(0, 5),
      minutes: top('minutes'),
      participations: top('goalParticipation'),
      ideal: rows.filter((row) => row.idealScore > 0).sort((a, b) => b.idealScore - a.idealScore).slice(0, 11).map((row) => row.player),
    };
  };

  const getGroupTendency = (scopedMatches) =>
    scopedMatches.slice(-5).reverse().map((match) => {
      const score = getMatchScoreData(match);
      const cards = Object.values(match.statsPlayerData || {}).reduce((sum, row) => sum + (Number(row.yellowCount ?? (row.yellow ? 1 : 0)) || 0) + (row.red ? 1 : 0), 0);
      return {
        match,
        goalsFor: score.caudalGoals,
        goalsAgainst: score.rivalGoals,
        cleanSheet: score.rivalGoals === 0,
        cards,
      };
    });

  const getPlayerGroupStats = (playerName, scopedMatches) => {
    return scopedMatches.reduce((acc, match) => {
      const events = match.statsGoalEvents || [];
      const stored = match.statsPlayerData?.[playerName] || {};
      const isStarter = (match.statsLineup || []).includes(playerName);
      const minutes = Number(stored.minutes ?? (isStarter ? 90 : 0)) || 0;
      const goals = events.filter((event) => event.type === 'Gol a favor' && event.scorer === playerName).length;
      const assists = events.filter((event) => event.type === 'Gol a favor' && event.assistant === playerName).length;
      acc.minutes += minutes;
      acc.starts += isStarter ? 1 : 0;
      acc.goals += goals;
      acc.assists += assists;
      acc.yellow += Number(stored.yellowCount ?? (stored.yellow ? 1 : 0)) || 0;
      acc.red += stored.red ? 1 : 0;
      acc.rating += Number(stored.rating) || 0;
      acc.rated += stored.rating ? 1 : 0;
      return acc;
    }, { playerName, minutes: 0, starts: 0, goals: 0, assists: 0, yellow: 0, red: 0, rating: 0, rated: 0 });
  };

  const renderGroupMiniPitch = ({ counts, title }) => (
    <div className="rounded-3xl border border-white/10 bg-[#0f1e38]/80 p-5">
      <h4 className="text-sm font-black uppercase tracking-[0.18em] text-white">{title}</h4>
      <div className="mt-4">{renderReadOnlyZoneGrid({ counts })}</div>
    </div>
  );

  const renderIdealElevenPitch = (idealPlayers) => {
    const coordinates = getFormationCoordinates(idealSystem);
    const roles = getFormationRoles(idealSystem);
    return (
      <div className="relative mx-auto aspect-[7/8.9] min-h-[620px] max-w-3xl overflow-hidden rounded-3xl border border-white/20 bg-[#102616] shadow-inner">
        <div className="absolute inset-4 rounded-[28px] border-2 border-white/55" />
        <div className="absolute left-4 right-4 top-1/2 h-px bg-white/35" />
        <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/35" />
        <div className="absolute left-1/2 top-4 h-24 w-56 -translate-x-1/2 rounded-b-3xl border-x-2 border-b-2 border-white/35" />
        <div className="absolute bottom-4 left-1/2 h-24 w-56 -translate-x-1/2 rounded-t-3xl border-x-2 border-t-2 border-white/35" />
        {coordinates.map((slot, index) => {
          const player = idealPlayers[index];
          return (
            <div key={`${roles[index]}-${index}`} className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 text-center" style={{ left: `${slot.x}%`, top: `${slot.y}%` }}>
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border-2 border-caudal-electric/60 bg-caudal-950/80 text-xs font-black text-white">
                {player?.image ? <img src={player.image} alt="" className="h-full w-full object-cover" /> : player?.number || index + 1}
              </div>
              <span className="max-w-[90px] truncate rounded-xl bg-black/60 px-2 py-1 text-[10px] font-black text-white">{player?.name || roles[index]}</span>
            </div>
          );
        })}
      </div>
    );
  };

  useEffect(() => {
    if (activeTab !== 'Partidos') {
      setMatchView('lista_partidos');
      setSelectedMatchId(null);
      setMatchViewSection('PRE');
    }
  }, [activeTab]);

  useEffect(() => {
    setSelectedTimelineAction(null);
  }, [selectedPlayerProfileId, playerCompetitionFilter, playerVenueFilter]);

  const openMatchPage = (match, section) => {
    setSelectedMatchId(match.id);
    setMatchView(section === 'PRE' ? 'pre_partido' : section === 'ESTADÍSTICAS' ? 'estadisticas_partido' : 'post_partido');
    setMatchViewSection(section);
    if (section === 'PRE') {
      setPreSubTab('Informe rival');
    }
  };

  const closeMatchPage = () => {
    setMatchView('lista_partidos');
    setSelectedMatchId(null);
    setMatchViewSection('PRE');
  };

  useEffect(() => {
    if (!isMatchPanelOpen) return;
    if (matchFormSection === 'PRE' && preSectionRef.current) {
      preSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (matchFormSection === 'POST' && postSectionRef.current) {
      postSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [isMatchPanelOpen, matchFormSection]);

  const groupedPlayers = useMemo(
    () =>
      squadGroups.map((group) => ({
        ...group,
        players: players.filter((player) => group.positions.includes(player.position)),
      })),
    [players]
  );

  const filteredMatches = useMemo(
    () => (matchFilter === 'Todos' ? matches : matches.filter((match) => match.type === matchFilter)),
    [matchFilter, matches]
  );

  const matchStats = useMemo(() => {
    const scopedMatches = matchFilter === 'Todos' ? matches : matches.filter((match) => match.type === matchFilter);
    const finished = scopedMatches.filter((match) => match.status === 'Finalizado' || (match.statsGoalEvents || []).length > 0);
    const wins = finished.filter((match) => getMatchResult(match) === 'W').length;
    const goalsFor = finished.reduce((sum, match) => {
      const statGoals = (match.statsGoalEvents || []).filter((event) => event.type === 'Gol a favor').length;
      return sum + (statGoals || Number(match.goalsFor) || Number(match.isHome ? match.homeScore : match.awayScore) || 0);
    }, 0);
    const goalsAgainst = finished.reduce((sum, match) => {
      const statGoals = (match.statsGoalEvents || []).filter((event) => event.type === 'Gol en contra').length;
      return sum + (statGoals || Number(match.goalsAgainst) || Number(match.isHome ? match.awayScore : match.homeScore) || 0);
    }, 0);
    const cleanSheets = finished.filter((match) => match.cleanSheet || Number(match.goalsAgainst) === 0).length;
    const recent = finished.slice(-3).map(getMatchResult).filter(Boolean);

    return { total: scopedMatches.length, finished: finished.length, wins, goalsFor, goalsAgainst, cleanSheets, recent };
  }, [matches, matchFilter]);

  const openForm = (player = null) => {
    if (player) {
      setEditingId(player.id);
      setFormState({
        name: player.name,
        dob: player.dob,
        number: player.number,
        position: player.position,
        foot: player.foot,
        image: player.image,
      });
    } else {
      setEditingId(null);
      setFormState({
        name: '',
        dob: '',
        number: '',
        position: 'Portero',
        foot: 'Derecha',
        image: '',
      });
    }
    setIsPanelOpen(true);
  };

  const closeForm = () => {
    setIsPanelOpen(false);
    setEditingId(null);
  };

  const openTeamForm = (team = null) => {
    if (team) {
      setEditingTeamId(team.id);
      setTeamFormState({
        name: team.name,
        sourceUrl: team.sourceUrl ?? '',
        crest: team.crest ?? '',
        stadium: team.stadium ?? '',
        kitColor: team.kitColor ?? '#ef233c',
        system: team.system,
        squad: team.squad.map(normalizeSquadEntry),
      });
    } else {
      setEditingTeamId(null);
      setTeamFormState(emptyTeamForm);
    }
    setImportStatus('');
    setIsTeamPanelOpen(true);
  };

  const closeTeamForm = () => {
    setIsTeamPanelOpen(false);
    setEditingTeamId(null);
    setImportStatus('');
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleTeamChange = (event) => {
    const { name, value } = event.target;
    setTeamFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleTeamPlayerChange = (index, field, value) => {
    setTeamFormState((prev) => ({
      ...prev,
      squad: prev.squad.map((player, playerIndex) =>
        playerIndex === index ? { ...normalizeSquadEntry(player), [field]: value } : normalizeSquadEntry(player)
      ),
    }));
  };

  const handleSelectedTeamPlayerChange = (playerName, field, value) => {
    if (!selectedTeam) return;
    setTeams((current) =>
      current.map((team) => {
        if (team.id !== selectedTeam.id) return team;
        const updatePlayer = (entry) => {
          const player = normalizeSquadEntry(entry);
          return player.name === playerName ? { ...player, [field]: value } : player;
        };

        return {
          ...team,
          squad: team.squad.map(updatePlayer),
          lineup: (team.lineup ?? emptyLineup).map(updatePlayer),
          benchChart: Object.fromEntries(
            Object.entries(team.benchChart ?? emptyDepthChart).map(([starterName, slots]) => [
              starterName,
              slots.map((entry) => (entry ? updatePlayer(entry) : entry)),
            ])
          ),
        };
      })
    );
  };

  const handleAddTeamPlayer = () => {
    setTeamFormState((prev) => ({ ...prev, squad: [...prev.squad.map(normalizeSquadEntry), createBlankTeamPlayer()] }));
  };

  const handleRemoveTeamPlayer = (index) => {
    setTeamFormState((prev) => ({ ...prev, squad: prev.squad.filter((_, playerIndex) => playerIndex !== index) }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const payload = {
      id: editingId ?? Date.now(),
      name: formState.name.trim() || 'Jugador sin nombre',
      dob: formState.dob,
      number: Number(formState.number) || 0,
      position: formState.position,
      foot: formState.foot,
      image: formState.image.trim(),
    };

    if (editingId) {
      setPlayers((current) => current.map((player) => (player.id === editingId ? payload : player)));
    } else {
      setPlayers((current) => [payload, ...current]);
    }
    closeForm();
  };

  const handleDelete = (player) => {
    const confirmed = window.confirm(`¿Eliminar a ${player.name}? Esta acción no se puede deshacer.`);
    if (!confirmed) return;
    setPlayers((current) => current.filter((item) => item.id !== player.id));
  };

  const importTeamFromSource = async (sourceUrl) => {
    let imported = null;
    let lastError = null;

    for (const url of getReadableUrls(sourceUrl)) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('No se pudo leer el enlace.');
        const text = await response.text();
        const { doc, players } = extractPlayersFromHtml(text, sourceUrl);
        if (players.length === 0) throw new Error('No se detectaron jugadores.');
        imported = {
          name: extractTeamName(doc, teamFormState.name),
          crest: extractCrest(doc, sourceUrl),
          players,
        };
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!imported) throw lastError ?? new Error('No se pudo importar.');
    return imported;
  };

  const handleTeamSubmit = async (event) => {
    event.preventDefault();
    let squad = teamFormState.squad.map(normalizeSquadEntry).filter((player) => player.name.trim());
    let importedData = null;

    if (squad.length === 0 && teamFormState.sourceUrl.trim()) {
      setImportStatus('Importando plantilla...');
      try {
        importedData = await importTeamFromSource(normalizeSourceUrl(teamFormState.sourceUrl));
        squad = importedData.players;
      } catch (error) {
        setImportStatus('No pude importar ese enlace. Pega la plantilla manualmente o prueba otro enlace de plantilla.');
        return;
      }
    }

    const payload = {
      id: editingTeamId ?? Date.now(),
      name: cleanTeamDisplayName(teamFormState.name.trim() || importedData?.name || 'Equipo sin nombre'),
      crest: importedData?.crest || teamFormState.crest || teams.find((team) => team.id === editingTeamId)?.crest || '',
      stadium: teamFormState.stadium.trim(),
      kitColor: teamFormState.kitColor || '#ef233c',
      sourceUrl: normalizeSourceUrl(teamFormState.sourceUrl),
      system: teamFormState.system,
      squad,
      lineup: teams.find((team) => team.id === editingTeamId)?.lineup ?? emptyLineup,
      benchChart: teams.find((team) => team.id === editingTeamId)?.benchChart ?? emptyDepthChart,
    };

    if (editingTeamId) {
      setTeams((current) => current.map((team) => (team.id === editingTeamId ? payload : team)));
    } else {
      setTeams((current) => [payload, ...current]);
    }
    closeTeamForm();
  };

  const handleTeamDelete = (team) => {
    const confirmed = window.confirm(`¿Eliminar a ${team.name}? Esta acción no se puede deshacer.`);
    if (!confirmed) return;
    setTeams((current) => current.filter((item) => item.id !== team.id));
    if (selectedTeamId === team.id) setSelectedTeamId(null);
  };

  const handleSaveTeams = () => {
    try {
      window.localStorage.setItem(teamsStorageKey, JSON.stringify(teams));
      setSaveStatus('Equipos guardados.');
    } catch {
      setSaveStatus('No se pudieron guardar los equipos.');
    }
  };

  const openMatchForm = (match = null, section = 'PRE') => {
    if (match) {
      setEditingMatchId(match.id);
      setMatchFormState(normalizeMatch(match));
    } else {
      setEditingMatchId(null);
      setMatchFormState(emptyMatchForm);
    }
    setMatchFormSection(section);
    setIsMatchPanelOpen(true);
  };

  const closeMatchForm = () => {
    setIsMatchPanelOpen(false);
    setEditingMatchId(null);
  };

  const handleMatchChange = (event) => {
    const { name, value, type, checked } = event.target;
    if (name === 'opponent') {
      const selectedTeam = findTeamByDisplayName(teams, value);
      setMatchFormState((prev) => ({
        ...prev,
        opponent: cleanTeamDisplayName(selectedTeam?.name || value),
        opponentCrest: selectedTeam?.crest ?? prev.opponentCrest,
        preRivalSystem: prev.preRivalSystem || selectedTeam?.system || '',
      }));
      return;
    }
    setMatchFormState((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleMatchSubmit = (event) => {
    event.preventDefault();
    const payload = normalizeMatch({
      ...matchFormState,
      id: editingMatchId ?? Date.now(),
      awayTeam: matchFormState.isHome ? matchFormState.opponent : 'C.D. Caudal',
      homeTeam: matchFormState.isHome ? 'C.D. Caudal' : matchFormState.opponent,
    });

    if (editingMatchId) {
      setMatches((current) => current.map((match) => (match.id === editingMatchId ? payload : match)));
    } else {
      setMatches((current) => [payload, ...current]);
    }
    closeMatchForm();
  };

  const handleMatchDelete = (match) => {
    const confirmed = window.confirm(`¿Eliminar el partido contra ${match.opponent}?`);
    if (!confirmed) return;
    setMatches((current) => current.filter((item) => item.id !== match.id));
  };

  const handleSaveMatches = () => {
    try {
      window.localStorage.setItem(matchesStorageKey, JSON.stringify(matches));
      setSaveStatus('Partidos guardados.');
    } catch {
      setSaveStatus('No se pudieron guardar los partidos.');
    }
  };

  const handleImportSquad = async () => {
    const sourceUrl = normalizeSourceUrl(teamFormState.sourceUrl);
    if (!sourceUrl) {
      setImportStatus('Añade un enlace de BeSoccer o Transfermarkt para importar.');
      return;
    }

    setImportStatus('Importando plantilla...');
    try {
      const imported = await importTeamFromSource(sourceUrl);

      setTeamFormState((prev) => ({
        ...prev,
        name: cleanTeamDisplayName(imported.name || prev.name),
        sourceUrl,
        crest: imported.crest || prev.crest,
        squad: imported.players.map(normalizeSquadEntry),
      }));

      if (editingTeamId) {
        setTeams((current) =>
          current.map((team) => (team.id === editingTeamId ? { ...team, crest: imported.crest || team.crest } : team))
        );
      }

      setImportStatus(`Plantilla importada: ${imported.players.length} jugadores detectados.`);
    } catch (error) {
      setImportStatus('No pude importar ese enlace porque la web bloquea la lectura automática. Prueba con el enlace de plantilla exacto o pega la plantilla.');
    }
  };

  const updateTeamLineup = (teamId, updater) => {
    setTeams((current) =>
      current.map((team) => (team.id === teamId ? { ...team, lineup: updater(team.lineup ?? emptyLineup) } : team))
    );
  };

  const handleDropOnField = (event) => {
    event.preventDefault();
    if (!selectedTeam || !draggedPlayer) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(4, Math.min(88, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(4, Math.min(96, ((event.clientY - rect.top) / rect.height) * 100));

    updateTeamLineup(selectedTeam.id, (lineup) => {
      const playerName = draggedPlayer.name;
      const existing = lineup.find((item) => item.name === playerName);
      if (existing) {
        return lineup.map((item) => (item.name === playerName ? { ...item, x, y } : item));
      }
      return [...lineup.filter((item) => item.name !== playerName), { ...normalizeSquadEntry(draggedPlayer), role: 'Titular', x, y }];
    });
    setTeams((current) =>
      current.map((team) =>
        team.id === selectedTeam.id
          ? {
              ...team,
              squad: team.squad.map((entry) => {
                const player = normalizeSquadEntry(entry);
                return player.name === draggedPlayer.name ? { ...player, role: 'Titular' } : player;
              }),
            }
          : team
      )
    );
    setDraggedPlayer(null);
  };

  const removeFromLineup = (playerName) => {
    if (!selectedTeam) return;
    updateTeamLineup(selectedTeam.id, (lineup) => lineup.filter((item) => item.name !== playerName));
    setTeams((current) =>
      current.map((team) =>
        team.id === selectedTeam.id
          ? {
              ...team,
              squad: team.squad.map((entry) => {
                const player = normalizeSquadEntry(entry);
                return player.name === playerName ? { ...player, role: 'Reserva' } : player;
              }),
            }
          : team
      )
    );
  };

  const arrangeSelectedTeam = () => {
    if (!selectedTeam) return;
    const squad = selectedTeam.squad.map(normalizeSquadEntry);
    const starters = squad.filter((player) => player.role === 'Titular');
    const prioritized = starters.length > 0 ? starters : squad.slice(0, 11);
    const fieldCoordinates = getFormationCoordinates(selectedTeam.system);
    const lineup = prioritized.slice(0, 11).map((player, index) => ({ ...player, role: 'Titular', slot: index, ...fieldCoordinates[index] }));

    updateTeamLineup(selectedTeam.id, () => lineup);
  };

  const handleDropOnLineupSlot = (slotIndex) => {
    if (!selectedTeam || !draggedPlayer) return;
    const coordinates = getFormationCoordinates(selectedTeam.system)[slotIndex];
    const droppedPlayer = { ...normalizeSquadEntry(draggedPlayer), role: 'Titular', slot: slotIndex, ...coordinates };

    updateTeamLineup(selectedTeam.id, (lineup) => [
      ...lineup.filter((player) => player.name !== droppedPlayer.name && player.slot !== slotIndex),
      droppedPlayer,
    ]);
    setTeams((current) =>
      current.map((team) =>
        team.id === selectedTeam.id
          ? {
              ...team,
              squad: team.squad.map((entry) => {
                const player = normalizeSquadEntry(entry);
                return player.name === droppedPlayer.name ? { ...player, role: 'Titular' } : player;
              }),
            }
          : team
      )
    );
    setDraggedPlayer(null);
  };

  const updateSelectedTeamSystem = (system) => {
    if (!selectedTeam) return;
    const coordinates = getFormationCoordinates(system);
    setTeams((current) =>
      current.map((team) =>
        team.id === selectedTeam.id
          ? {
              ...team,
              system,
              lineup: (team.lineup ?? emptyLineup)
                .slice(0, 11)
                .map((player, index) => ({ ...player, slot: player.slot ?? index, ...coordinates[player.slot ?? index] })),
            }
          : team
      )
    );
  };

  const setSelectedTeamPlayerRole = (playerName, role) => {
    if (!selectedTeam) return;
    setTeams((current) =>
      current.map((team) =>
        team.id === selectedTeam.id
          ? {
              ...team,
              squad: team.squad.map((entry) => {
                const player = normalizeSquadEntry(entry);
                return player.name === playerName ? { ...player, role } : player;
              }),
              lineup: role === 'Reserva' ? (team.lineup ?? emptyLineup).filter((player) => player.name !== playerName) : team.lineup,
            }
          : team
      )
    );
  };

  const toggleSelectedTeamKeyPlayer = (playerName) => {
    if (!selectedTeam) return;
    setTeams((current) =>
      current.map((team) => {
        if (team.id !== selectedTeam.id) return team;
        const currentPlayer = team.squad.map(normalizeSquadEntry).find((player) => player.name === playerName);
        const nextIsKey = !currentPlayer?.isKey;

        return {
          ...team,
          squad: team.squad.map((entry) => {
            const player = normalizeSquadEntry(entry);
            return player.name === playerName ? { ...player, isKey: nextIsKey } : player;
          }),
          lineup: (team.lineup ?? emptyLineup).map((player) =>
            player.name === playerName ? { ...player, isKey: nextIsKey } : player
          ),
        };
      })
    );
  };

  const handleDropOnBenchSlot = (starterName, slotIndex) => {
    if (!selectedTeam || !draggedPlayer) return;
    const droppedPlayer = { ...normalizeSquadEntry(draggedPlayer), role: 'Reserva' };

    setTeams((current) =>
      current.map((team) => {
        if (team.id !== selectedTeam.id) return team;
        const nextBenchChart = Object.fromEntries(
          Object.entries(team.benchChart ?? emptyDepthChart).map(([chartStarter, slots]) => [
            chartStarter,
            slots.map((player) => (player?.name === droppedPlayer.name ? null : player)),
          ])
        );
        const slots = [...(nextBenchChart[starterName] ?? [null, null])].slice(0, 2);
        while (slots.length < 2) slots.push(null);
        slots[slotIndex] = droppedPlayer;
        nextBenchChart[starterName] = slots;

        return {
          ...team,
          benchChart: nextBenchChart,
          lineup: (team.lineup ?? emptyLineup).filter((player) => player.name !== droppedPlayer.name),
          squad: team.squad.map((entry) => {
            const player = normalizeSquadEntry(entry);
            return player.name === droppedPlayer.name ? { ...player, role: 'Reserva' } : player;
          }),
        };
      })
    );
    setDraggedPlayer(null);
  };

  const clearBenchSlot = (starterName, slotIndex) => {
    if (!selectedTeam) return;
    setTeams((current) =>
      current.map((team) => {
        if (team.id !== selectedTeam.id) return team;
        const slots = [...(team.benchChart?.[starterName] ?? [null, null])].slice(0, 2);
        while (slots.length < 2) slots.push(null);
        slots[slotIndex] = null;
        return { ...team, benchChart: { ...(team.benchChart ?? emptyDepthChart), [starterName]: slots } };
      })
    );
  };

  const getSelectedLineupName = () => {
    if (!selectedMatch) return '';
    return selectedMatch.preCaudalLineup?.[selectedTacticalPlayerIndex] || '';
  };

  const getSelectedRivalLineupName = () => {
    if (!selectedMatch) return '';
    return selectedMatch.preRivalLineup?.[selectedRivalTacticalPlayerIndex] || '';
  };

  const updateCaudalLineupSlot = (slotIndex, playerName) => {
    if (!selectedMatch) return;
    const nextLineup = Array.from({ length: 11 }, (_, index) => selectedMatch.preCaudalLineup?.[index] || '');
    const repeatedIndex = nextLineup.findIndex((name, index) => name === playerName && index !== slotIndex);
    if (repeatedIndex >= 0) nextLineup[repeatedIndex] = '';
    nextLineup[slotIndex] = playerName;
    updateSelectedMatchFields({ preCaudalLineup: nextLineup });
  };

  const updateRivalLineupSlot = (slotIndex, playerName) => {
    if (!selectedMatch) return;
    const nextLineup = Array.from({ length: 11 }, (_, index) => selectedMatch.preRivalLineup?.[index] || '');
    const repeatedIndex = nextLineup.findIndex((name, index) => name === playerName && index !== slotIndex);
    if (repeatedIndex >= 0) nextLineup[repeatedIndex] = '';
    nextLineup[slotIndex] = playerName;
    updateSelectedMatchFields({ preRivalLineup: nextLineup });
  };

  const clearCaudalLineupSlot = (slotIndex) => {
    if (!selectedMatch) return;
    const nextLineup = Array.from({ length: 11 }, (_, index) => selectedMatch.preCaudalLineup?.[index] || '');
    nextLineup[slotIndex] = '';
    updateSelectedMatchFields({ preCaudalLineup: nextLineup });
  };

  const clearRivalLineupSlot = (slotIndex) => {
    if (!selectedMatch) return;
    const nextLineup = Array.from({ length: 11 }, (_, index) => selectedMatch.preRivalLineup?.[index] || '');
    nextLineup[slotIndex] = '';
    updateSelectedMatchFields({ preRivalLineup: nextLineup });
  };

  const loadSuggestedCaudalLineup = () => {
    updateSelectedMatchFields({ preCaudalLineup: Array.from({ length: 11 }, (_, index) => players[index]?.name || '') });
    setSelectedTacticalPlayerIndex(0);
  };

  const loadSuggestedRivalLineup = () => {
    const rivalTeam = getRivalBaseTeam();
    updateSelectedMatchFields({
      preRivalSystem: rivalTeam?.system || getCurrentRivalSystem(),
      preRivalLineup: Array.from({ length: 11 }, (_, index) => getRivalAvailablePlayers()[index]?.name || ''),
    });
    setSelectedRivalTacticalPlayerIndex(0);
  };

  const addManualRivalPlayer = () => {
    const playerName = newRivalManualPlayerName.trim();
    if (!selectedMatch || !playerName) return;
    const rivalRoles = getFormationRoles(getCurrentRivalSystem());
    const exists = getRivalAvailablePlayers().some((player) => cleanTeamDisplayName(player.name).toLowerCase() === cleanTeamDisplayName(playerName).toLowerCase());
    const nextManualPlayers = exists
      ? selectedMatch.preRivalManualPlayers || []
      : [...(selectedMatch.preRivalManualPlayers || []), { ...createBlankTeamPlayer(), name: playerName, position: rivalRoles[selectedRivalTacticalPlayerIndex] || '' }];
    const nextLineup = Array.from({ length: 11 }, (_, index) => selectedMatch.preRivalLineup?.[index] || '');
    nextLineup[selectedRivalTacticalPlayerIndex] = playerName;
    updateSelectedMatchFields({ preRivalManualPlayers: nextManualPlayers, preRivalLineup: nextLineup });
    setNewRivalManualPlayerName('');
  };

  const updateSelectedPlayerNote = (note) => {
    if (!selectedMatch) return;
    const playerName = getSelectedLineupName();
    if (!playerName) return;
    updateSelectedMatchFields({
      prePlayerNotes: {
        ...(selectedMatch.prePlayerNotes || {}),
        [playerName]: note,
      },
    });
  };

  const updateSelectedRivalPlayerNote = (note) => {
    if (!selectedMatch) return;
    const playerName = getSelectedRivalLineupName();
    if (!playerName) return;
    updateSelectedMatchFields({
      preRivalPlayerNotes: {
        ...(selectedMatch.preRivalPlayerNotes || {}),
        [playerName]: note,
      },
    });
  };

  const renderQuestionnaireField = ({ label, field, placeholder, type = 'textarea', options = [] }) => (
    <label key={field} className="space-y-2 text-sm text-slate-300">
      <span className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</span>
      {type === 'select' ? (
        <select
          value={selectedMatch[field] || options[0] || ''}
          onChange={(event) => updateSelectedMatchFields({ [field]: event.target.value })}
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
        >
          {options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      ) : (
        <textarea
          value={selectedMatch[field] || ''}
          onChange={(event) => updateSelectedMatchFields({ [field]: event.target.value })}
          placeholder={placeholder}
          className="min-h-[86px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500"
        />
      )}
    </label>
  );

  const renderQuestionnaireSection = ({ id, title, description, fields }) => {
    const isOpen = openQuestionnaireSections[id];
    const completed = fields.filter((field) => selectedMatch[field.field]).length;
    return (
      <div key={id} className="overflow-hidden rounded-3xl border border-white/10 bg-[#0f1e38]/80">
        <button
          type="button"
          onClick={() => setOpenQuestionnaireSections((prev) => ({ ...prev, [id]: !prev[id] }))}
          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        >
          <span>
            <span className="block text-sm font-bold uppercase tracking-[0.18em] text-white">{title}</span>
            <span className="mt-1 block text-sm text-slate-400">{description}</span>
          </span>
          <span className="shrink-0 rounded-2xl bg-white/10 px-3 py-2 text-xs font-semibold text-slate-300">
            {completed}/{fields.length} {isOpen ? 'Cerrar' : 'Abrir'}
          </span>
        </button>
        {isOpen ? (
          <div className="grid gap-4 border-t border-white/10 px-5 py-5 md:grid-cols-2">
            {fields.map(renderQuestionnaireField)}
          </div>
        ) : null}
      </div>
    );
  };

  const renderSystemsPitch = () => {
    if (!selectedMatch) return null;
    const toCaudalHalf = (position) => ({ x: 5 + (100 - position.y) * 0.43, y: position.x });
    const toRivalHalf = (position) => ({ x: 95 - (100 - position.y) * 0.43, y: position.x });
    const caudalCoordinates = getFormationCoordinates(selectedMatch.preCaudalSystem || '4-4-2').map(toCaudalHalf);
    const rivalCoordinates = getFormationCoordinates(getCurrentRivalSystem()).map(toRivalHalf);
    const caudalRoles = getFormationRoles(selectedMatch.preCaudalSystem || '4-4-2');
    const rivalRoles = getFormationRoles(getCurrentRivalSystem());
    const caudalLineup = getCaudalPitchNames(selectedMatch.preCaudalLineup || [], [], caudalRoles);
    const rivalLineup = getCaudalPitchNames(selectedMatch.preRivalLineup || [], rivalRoles, rivalRoles);
    const renderPlayer = (position, index, team, lineup) => {
      const isCaudal = team === 'caudal';
      const isRival = team === 'rival';
      const isSelected = (isCaudal && selectedTacticalPlayerIndex === index) || (isRival && selectedRivalTacticalPlayerIndex === index);
      const playerName = lineup[index] || `${isCaudal ? 'Jugador' : 'Rol'} ${index + 1}`;
      const PlayerTag = isCaudal || isRival ? 'button' : 'div';
      return (
        <PlayerTag
          key={`${team}-${index}`}
          type={isCaudal || isRival ? 'button' : undefined}
          onClick={isCaudal ? () => setSelectedTacticalPlayerIndex(index) : isRival ? () => setSelectedRivalTacticalPlayerIndex(index) : undefined}
          className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 ${isCaudal ? 'text-caudal-electric' : 'text-rose-200'} ${isCaudal || isRival ? 'cursor-pointer' : ''}`}
          style={{ left: `${position.x}%`, top: `${position.y}%` }}
        >
          <span className={`flex h-9 w-9 items-center justify-center rounded-full border text-[11px] font-black shadow-lg ${isCaudal ? 'border-caudal-electric bg-caudal-950' : 'border-rose-300 bg-rose-950'} ${isSelected ? 'ring-4 ring-caudal-electric/30' : ''}`}>
            {index === 0 ? 'P' : index}
          </span>
          <span className={`max-w-[86px] truncate rounded-md px-2 py-1 text-[10px] font-semibold ${isSelected ? (isCaudal ? 'bg-caudal-electric text-slate-950' : 'bg-rose-300 text-rose-950') : 'bg-black/55 text-white'}`}>
            {playerName}
          </span>
        </PlayerTag>
      );
    };

    return (
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#0b5b3f] p-3 shadow-inner">
        <div className="relative aspect-[16/10] min-h-[320px] overflow-hidden rounded-2xl border-2 border-white/60 bg-[linear-gradient(90deg,rgba(255,255,255,0.08)_50%,transparent_50%),linear-gradient(0deg,rgba(255,255,255,0.05)_50%,transparent_50%)] bg-[length:18%_100%,100%_18%] sm:min-h-[380px]">
          <div className="absolute left-1/2 top-0 h-full w-px bg-white/60" />
          <div className="absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/60" />
          <div className="absolute left-0 top-1/2 h-48 w-24 -translate-y-1/2 border-y-2 border-r-2 border-white/60" />
          <div className="absolute right-0 top-1/2 h-48 w-24 -translate-y-1/2 border-y-2 border-l-2 border-white/60" />
          <div className="absolute left-4 top-1/2 h-24 w-10 -translate-y-1/2 border-y-2 border-r-2 border-white/50" />
          <div className="absolute right-4 top-1/2 h-24 w-10 -translate-y-1/2 border-y-2 border-l-2 border-white/50" />
          <div className="absolute left-4 top-4 rounded-xl bg-black/35 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white">
            C.D. Caudal · {selectedMatch.preCaudalSystem || '4-4-2'}
          </div>
          <div className="absolute right-4 top-4 rounded-xl bg-black/35 px-3 py-2 text-right text-xs font-bold uppercase tracking-[0.14em] text-white">
            Rival · {getCurrentRivalSystem()}
          </div>
          {caudalCoordinates.map((position, index) => renderPlayer(position, index, 'caudal', caudalLineup))}
          {rivalCoordinates.map((position, index) => renderPlayer(position, index, 'rival', rivalLineup))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-caudal-950 via-caudal-900 to-[#05101f] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-8 pt-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 rounded-3xl border border-white/5 bg-white/5 p-5 shadow-glow backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.34em] text-slate-400">Entrenador</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">C.D. Caudal de Mieres</h1>
            <p className="mt-1 text-sm text-slate-400">Mieres, Asturias</p>
          </div>
          <nav className="flex flex-wrap gap-3">
            {['Inicio', 'Plantilla', 'Equipos', 'Partidos', 'Análisis Grupal'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                  activeTab === tab
                    ? 'bg-caudal-electric text-slate-950 shadow-[0_15px_35px_rgba(79,140,255,0.22)]'
                    : 'bg-white/10 text-slate-200 hover:bg-white/15'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </header>

        {activeTab === 'Inicio' ? (
          <main className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
            <section className="space-y-6 rounded-3xl border border-white/5 bg-white/5 p-6 shadow-glow backdrop-blur-md">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-3xl bg-white p-2 shadow-sm">
                  <img src={clubCrest} alt="Escudo del C.D. Caudal" className="h-full w-full object-contain" />
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Bienvenida</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">¡Bienvenido, cuerpo técnico!</h2>
                </div>
              </div>
              <div className="space-y-3 text-slate-300">
                <p>Esta es la base para gestionar tu plantilla de manera ágil y deportiva.</p>
                <p>Gestiona alineaciones, jugadores y rápida información de la plantilla sin necesidad de backend.</p>
              </div>
              <button
                onClick={() => setActiveTab('Plantilla')}
                className="mt-4 inline-flex items-center justify-center rounded-2xl bg-caudal-electric px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff]"
              >
                Gestionar plantilla
              </button>
            </section>
            <section className="rounded-3xl border border-white/5 bg-white/5 p-6 shadow-glow backdrop-blur-md">
              <div className="flex items-center gap-4">
                <div className="h-20 w-20 rounded-3xl bg-[#15224d] p-4 shadow-inner">
                  <img
                    src={clubCrest}
                    alt="Escudo del equipo"
                    className="h-full w-full rounded-2xl object-cover"
                  />
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.35em] text-slate-400">Escudo</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">C.D. Caudal</h3>
                </div>
              </div>
              <div className="mt-6 space-y-4 rounded-3xl border border-white/10 bg-caudal-900/80 p-5">
                <p className="text-sm text-slate-300">Plantilla profesional con enfoque joven, organizada para entrenamientos y próximos pasos.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-3xl bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Jugadores</p>
                    <p className="mt-2 text-3xl font-semibold text-white">{players.length}</p>
                  </div>
                  <div className="rounded-3xl bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Sub-23</p>
                    <p className="mt-2 text-3xl font-semibold text-white">{players.filter((player) => calculateAge(player.dob) < 23).length}</p>
                  </div>
                </div>
              </div>
            </section>
          </main>
        ) : null}

        {activeTab === 'Plantilla' ? (
          <main className="space-y-6">
            {selectedPlayerProfile ? (() => {
              const aggregate = getPlayerAggregate(selectedPlayerProfile);
              const allGoalActions = aggregate.rows.flatMap((row) => row.goals.map((event) => ({ ...event, match: row.match, action: 'Gol' })));
              const allAssistActions = aggregate.rows.flatMap((row) => row.assists.map((event) => ({ ...event, match: row.match, action: 'Asistencia' })));
              const influenceActions = playerInfluenceFilter === 'Goles' ? allGoalActions : playerInfluenceFilter === 'Asistencias' ? allAssistActions : [...allGoalActions, ...allAssistActions];
              const shotZoneCounts = countPitchZones(influenceActions.map((event) => event.action === 'Gol' ? event.shotZone : event.assistZone));
              const goalZoneCounts = countValues(allGoalActions.map((event) => event.goalZone));
              const playerGoalPhaseCounts = countPhases(allGoalActions);
              const maxPlayerGoalPhase = Math.max(1, ...playerGoalPhaseCounts.map((row) => row.count));
              const timelineActions = [
                ...allGoalActions.map((event) => ({ minute: event.minute, label: '⚽', type: 'Gol', match: event.match, videoUrl: event.videoUrl, actionKey: `goal-${event.match.id}-${event.id}`, title: `Gol · ${getMatchScoreLabel(event.match)}` })),
                ...allAssistActions.map((event) => ({ minute: event.minute, label: '👟', type: 'Asistencia', match: event.match, videoUrl: event.videoUrl, actionKey: `assist-${event.match.id}-${event.id}`, title: `Asistencia · ${getMatchScoreLabel(event.match)}` })),
                ...aggregate.rows.flatMap((row) => row.postEvents.filter((event) => /tarjeta/i.test(event.type)).map((event) => ({ minute: event.minute, label: '🟨', type: 'Tarjeta', match: row.match, actionKey: `card-${row.match.id}-${event.id || event.minute}`, title: `Tarjeta · ${getMatchScoreLabel(row.match)}` }))),
              ].filter((event) => event.minute !== '');
              const assistantsToPlayer = countValues(allGoalActions.map((event) => event.assistant));
              const assistedByPlayer = countValues(allAssistActions.map((event) => event.scorer));
              const assistantRows = Object.entries(assistantsToPlayer).filter(([name]) => name);
              const assistedRows = Object.entries(assistedByPlayer).filter(([name]) => name);
              const maxSocietyCount = Math.max(1, ...assistantRows.map(([, count]) => count), ...assistedRows.map(([, count]) => count));
              const videoActions = [...allGoalActions, ...allAssistActions].filter((event) => event.videoUrl);
              return (
                <>
                  <section className="rounded-3xl border border-white/5 bg-[#07111f] p-6 shadow-glow">
                    <button onClick={() => setSelectedPlayerProfileId(null)} className="mb-5 rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white">Volver a plantilla</button>
                    <div className="grid gap-6 lg:grid-cols-[160px_1fr]">
                      <div className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-[2rem] border-8 border-white/5 bg-slate-900 text-3xl font-black text-white">
                        {selectedPlayerProfile.image ? <img src={selectedPlayerProfile.image} alt={selectedPlayerProfile.name} className="h-full w-full object-cover" /> : selectedPlayerProfile.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="rounded-2xl bg-caudal-electric px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-slate-950">{selectedPlayerProfile.position}</span>
                          <span className="text-sm font-semibold text-slate-400">#{displayDorsal(selectedPlayerProfile.number)}</span>
                          <span className="text-sm font-semibold text-slate-400">{calculateAge(selectedPlayerProfile.dob)} años</span>
                          {playerLabel(selectedPlayerProfile.dob) === 'Sub-23' ? <span className="rounded-2xl bg-white/10 px-3 py-2 text-xs font-bold uppercase text-caudal-electric">Sub-23</span> : null}
                        </div>
                        <h2 className="mt-4 text-5xl font-black uppercase tracking-tight text-white">{selectedPlayerProfile.name}</h2>
                        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                          {[
                            ['Partidos', aggregate.played],
                            ['Titularidades', aggregate.starts],
                            ['Suplencias', aggregate.subs],
                            ['Minutos', `${aggregate.minutes}'`],
                            ['Participación', `${aggregate.participation}%`],
                            ['Goles', aggregate.goals],
                            ['Asistencias', aggregate.assists],
                            ['Amarillas', aggregate.yellow],
                            ['Rojas', aggregate.red],
                            ['Lesiones', aggregate.injured],
                          ].map(([label, value]) => (
                            <div key={label} className="rounded-3xl border border-white/10 bg-white/5 p-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
                              <p className="mt-2 text-2xl font-black text-white">{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="flex flex-col gap-4 rounded-3xl border border-white/5 bg-[#091428]/80 p-5 shadow-glow lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap gap-2">
                      {['Todos', 'Liga', 'Copa RFEF', 'Playoff', 'Amistoso'].map((filter) => (
                        <button key={filter} onClick={() => setPlayerCompetitionFilter(filter)} className={`rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-[0.14em] ${playerCompetitionFilter === filter ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-slate-300'}`}>{filter}</button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {['Todos', 'Local', 'Visitante'].map((filter) => (
                        <button key={filter} onClick={() => setPlayerVenueFilter(filter)} className={`rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-[0.14em] ${playerVenueFilter === filter ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-slate-300'}`}>{filter}</button>
                      ))}
                      <button onClick={() => generatePlayerReport(selectedPlayerProfile, aggregate)} className="rounded-2xl bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-white">Generar reporte</button>
                    </div>
                  </section>

                  <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                    <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Análisis de influencia táctica</h3>
                        <div className="flex gap-2">
                          {['Todos', 'Goles', 'Asistencias'].map((filter) => (
                            <button key={filter} onClick={() => setPlayerInfluenceFilter(filter)} className={`rounded-xl px-3 py-2 text-xs font-bold ${playerInfluenceFilter === filter ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-slate-300'}`}>{filter}</button>
                          ))}
                        </div>
                      </div>
                      <div className="mt-6 grid gap-6 lg:grid-cols-2">
                        {renderReadOnlyZoneGrid({ counts: shotZoneCounts })}
                        <div className="space-y-5">
                          <div className="rounded-3xl border border-caudal-electric/20 bg-[#0f1e38] p-5 text-slate-100">
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-caudal-electric">Análisis ofensivo</p>
                            <div className="mt-4 grid gap-3">
                              {[
                                ['Goles/90', aggregate.goalsPer90, 'text-emerald-300'],
                                ['Asistencias/90', aggregate.assistsPer90, 'text-caudal-electric'],
                                ['Participación directa', aggregate.directGoalParticipation, 'text-white'],
                              ].map(([label, value, color]) => (
                                <div key={label} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                                  <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</span>
                                  <strong className={`text-xl ${color}`}>{value}</strong>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-white">Tipo de gol</p>
                            <div className="mt-4 space-y-3">
                              {playerGoalPhaseCounts.map((row) => (
                                <div key={row.phase}>
                                  <div className="flex justify-between text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">
                                    <span>{row.phase}</span>
                                    <span>{row.count}</span>
                                  </div>
                                  <div className="mt-2 h-2 rounded-full bg-white/10">
                                    <div className="h-full rounded-full bg-emerald-300" style={{ width: `${(row.count / maxPlayerGoalPhase) * 100}%` }} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-white">Diana de finalización</p>
                            <div className="mt-3 max-w-md">{renderReadOnlyZoneGrid({ counts: goalZoneCounts, zones: goalZoneOptions, goal: true })}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                        <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Sociedad ofensiva</h3>
                        <div className="mt-5 space-y-6 text-sm text-slate-300">
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Principales asistentes</p>
                            {assistantRows.length ? assistantRows.map(([name, count]) => (
                              <div key={name} className="mt-3 rounded-2xl bg-white/5 p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="truncate font-bold text-white">{name}</span>
                                  <strong className="text-caudal-electric">{count}</strong>
                                </div>
                                <div className="mt-2 h-2 rounded-full bg-white/10">
                                  <div className="h-full rounded-full bg-caudal-electric" style={{ width: `${(count / maxSocietyCount) * 100}%` }} />
                                </div>
                              </div>
                            )) : <p className="mt-2 italic text-slate-500">Sin datos registrados</p>}
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Asistencias dadas a...</p>
                            {assistedRows.length ? assistedRows.map(([name, count]) => (
                              <div key={name} className="mt-3 rounded-2xl bg-emerald-400/10 p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="truncate font-bold text-white">{name}</span>
                                  <strong className="text-emerald-300">{count}</strong>
                                </div>
                                <div className="mt-2 h-2 rounded-full bg-white/10">
                                  <div className="h-full rounded-full bg-emerald-300" style={{ width: `${(count / maxSocietyCount) * 100}%` }} />
                                </div>
                              </div>
                            )) : <p className="mt-2 italic text-slate-500">Sin datos registrados</p>}
                          </div>
                        </div>
                      </div>
                      <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                        <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Videoteca de acciones</h3>
                        <div className="mt-5 space-y-3">
                          {videoActions.length ? videoActions.map((event) => (
                            <div key={`${event.id}-${event.action}`} className="rounded-2xl bg-white/5 p-4 text-sm text-slate-300">
                              <p className="font-bold text-white">{event.action} · {event.minute}' vs {event.match.opponent}</p>
                              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">{event.match.type}</p>
                              <button type="button" onClick={() => window.open(event.videoUrl, '_blank')} className="mt-3 rounded-xl bg-caudal-electric px-3 py-2 text-xs font-bold text-slate-950">Ver vídeo</button>
                            </div>
                          )) : <p className="text-sm italic text-slate-500">Sin vídeos registrados</p>}
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                    <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Impacto en el tiempo (0' - 90')</h3>
                    <div className="relative mt-12 h-20 rounded-2xl bg-white/5">
                      <div className="absolute left-4 right-4 top-1/2 h-1 -translate-y-1/2 rounded bg-white/10" />
                      {[0, 15, 30, 45, 60, 75, 90].map((minute) => <span key={minute} className="absolute top-2 text-[10px] font-bold text-slate-500" style={{ left: `${minute / 90 * 100}%` }}>{minute}'</span>)}
                      {timelineActions.map((event, index) => (
                        <button
                          type="button"
                          key={`${event.title}-${index}`}
                          title={event.title}
                          onClick={() =>
                            setSelectedTimelineAction((current) =>
                              current?.actionKey === event.actionKey ? null : event
                            )
                          }
                          className="absolute top-9 -translate-x-1/2 rounded-full bg-caudal-electric px-2 py-1 text-xs font-black text-slate-950 transition hover:bg-white"
                          style={{ left: `${Math.min(100, Number(event.minute) / 90 * 100)}%` }}
                        >
                          {event.label}
                        </button>
                      ))}
                    </div>
                    {selectedTimelineAction ? (
                      <div className="mt-5 rounded-2xl border border-caudal-electric/30 bg-caudal-electric/10 p-4">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-caudal-electric">{selectedTimelineAction.type} · minuto {selectedTimelineAction.minute}'</p>
                        <p className="mt-2 text-sm font-bold text-white">{getMatchScoreLabel(selectedTimelineAction.match)}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">
                          {matchDisplayDate(selectedTimelineAction.match.date)} · {selectedTimelineAction.match.type} · {selectedTimelineAction.match.isHome ? 'Local' : 'Visitante'}
                        </p>
                        {selectedTimelineAction.videoUrl ? (
                          <button
                            type="button"
                            onClick={() => window.open(selectedTimelineAction.videoUrl, '_blank')}
                            className="mt-3 rounded-xl bg-caudal-electric px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-950"
                          >
                            Ver vídeo
                          </button>
                        ) : (
                          <p className="mt-3 text-xs italic text-slate-500">Sin vídeo registrado en esta acción.</p>
                        )}
                      </div>
                    ) : null}
                  </section>

                  <section className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                    <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Historial partido a partido</h3>
                    <div className="mt-5 overflow-x-auto">
                      <table className="w-full min-w-[900px] text-left text-sm">
                        <thead className="text-xs uppercase tracking-[0.16em] text-slate-500">
                          <tr>{['Fecha', 'Rival', 'L/V', 'Competición', 'Rol', 'Min', 'G', 'A', '🟨', '🟥', '🚑'].map((head) => <th key={head} className="px-3 py-3">{head}</th>)}</tr>
                        </thead>
                        <tbody>
                          {aggregate.rows.length ? aggregate.rows.map((row) => (
                            <tr key={row.match.id} className="border-t border-white/10">
                              <td className="px-3 py-4 text-slate-300">{matchDisplayDate(row.match.date)}</td>
                              <td className="px-3 py-4 font-bold text-white">{row.match.opponent}</td>
                              <td className="px-3 py-4 text-slate-300">{row.match.isHome ? 'Local' : 'Visitante'}</td>
                              <td className="px-3 py-4 text-slate-300">{row.match.type}</td>
                              <td className="px-3 py-4 text-caudal-electric">{row.role}</td>
                              <td className="px-3 py-4 text-white">{row.minutes}</td>
                              <td className="px-3 py-4 text-white">{row.goals.length}</td>
                              <td className="px-3 py-4 text-white">{row.assists.length}</td>
                              <td className="px-3 py-4">{row.yellow ? `🟨${row.yellow > 1 ? row.yellow : ''}` : '-'}</td>
                              <td className="px-3 py-4">{row.red ? '🟥' : '-'}</td>
                              <td className="px-3 py-4">{row.injured ? '🚑' : '-'}</td>
                            </tr>
                          )) : <tr><td colSpan="11" className="px-3 py-6 text-center text-slate-500">Sin datos registrados</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {playerReport ? (
                    <section className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                      <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Informe automático</h3>
                      <div className="mt-5 grid gap-4 lg:grid-cols-2">
                        {Object.entries(playerReport).map(([title, text]) => (
                          <div key={title} className="rounded-3xl bg-[#0f1e38]/80 p-5">
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{title}</p>
                            <p className="mt-3 text-sm leading-7 text-slate-300">{text}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </>
              );
            })() : (
            <>
            <section className="rounded-3xl border border-white/5 bg-white/5 p-6 shadow-glow backdrop-blur-md">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Plantilla</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Gestión de jugadores</h2>
                </div>
                <button
                  onClick={() => openForm(null)}
                  className="inline-flex items-center justify-center rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff]"
                >
                  Nuevo jugador
                </button>
              </div>
            </section>

            <div className="space-y-6">
              {groupedPlayers.map((group) => (
                <section key={group.title} className="space-y-4">
                  <div className="flex items-end justify-between border-b border-white/10 pb-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Demarcación</p>
                      <h3 className="mt-1 text-xl font-semibold text-white">{group.title}</h3>
                    </div>
                    <span className="rounded-2xl bg-white/10 px-3 py-1 text-sm font-semibold text-slate-200">
                      {group.players.length}
                    </span>
                  </div>

                  {group.players.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {group.players.map((player) => (
                        <article key={player.id} onClick={() => setSelectedPlayerProfileId(player.id)} className="group cursor-pointer rounded-3xl border border-white/5 bg-[#091428]/80 p-4 shadow-glow transition hover:-translate-y-1 hover:border-caudal-electric/40">
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-3xl bg-slate-800 text-lg font-bold text-slate-200">
                      {player.image ? (
                        <img src={player.image} alt={player.name} className="h-full w-full object-cover" />
                      ) : (
                        <span>{player.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-500">#{displayDorsal(player.number)}</p>
                      <h3 className="truncate text-lg font-semibold text-white">{player.name}</h3>
                      <p className="text-sm text-slate-400">{player.position}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 rounded-3xl border border-white/5 bg-white/5 p-4 text-sm text-slate-300">
                    <div className="flex items-center justify-between">
                      <span>Dorsal</span>
                              <strong className="text-white">{displayDorsal(player.number)}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Pierna</span>
                      <strong className="text-white">{player.foot}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Edad</span>
                      <strong className="text-white">{calculateAge(player.dob)} años</strong>
                    </div>
                    {playerLabel(player.dob) === 'Sub-23' ? (
                      <div className="flex items-center justify-between rounded-2xl bg-[#10254d] px-3 py-2 text-xs uppercase tracking-[0.25em] text-caudal-electric">
                        <span>Sub-23</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        openForm(player);
                      }}
                      className="rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/25"
                    >
                      Editar
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDelete(player);
                      }}
                      className="rounded-2xl bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/25"
                    >
                      Eliminar
                    </button>
                  </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-5 py-6 text-sm text-slate-400">
                      No hay jugadores en este grupo.
                    </div>
                  )}
                </section>
              ))}
            </div>
            </>
            )}
          </main>
        ) : null}

        {activeTab === 'Equipos' ? (
          <main className="space-y-6">
            <section className="rounded-3xl border border-white/5 bg-white/5 p-6 shadow-glow backdrop-blur-md">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Equipos</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Rivales de competición</h2>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleSaveTeams}
                    className="inline-flex items-center justify-center rounded-2xl bg-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/25"
                  >
                    Guardar equipos
                  </button>
                  <button
                    onClick={() => openTeamForm(null)}
                    className="inline-flex items-center justify-center rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff]"
                  >
                    Nuevo equipo
                  </button>
                </div>
              </div>
              {saveStatus ? <p className="mt-3 text-sm text-caudal-electric">{saveStatus}</p> : null}
            </section>

            {selectedTeam ? (
              <section className="space-y-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    onClick={() => setSelectedTeamId(null)}
                    className="inline-flex w-fit items-center justify-center rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
                  >
                    Volver a equipos
                  </button>
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => openTeamForm(selectedTeam)}
                      className="inline-flex items-center justify-center rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/25"
                    >
                      Editar equipo
                    </button>
                    <button
                      onClick={arrangeSelectedTeam}
                      className="inline-flex items-center justify-center rounded-2xl bg-caudal-electric px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff]"
                    >
                      Colocar por sistema
                    </button>
                    <select
                      value={selectedTeam.system}
                      onChange={(event) => updateSelectedTeamSystem(event.target.value)}
                      className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold text-slate-200"
                    >
                      {gameSystems.map((system) => (
                        <option key={system} value={system}>
                          {system}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-5 lg:grid-cols-[0.34fr_0.66fr]">
                  <aside className="rounded-3xl border border-white/5 bg-[#091428]/80 p-5 shadow-glow">
                    <div className="flex items-center gap-3">
                      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white p-2 text-sm font-bold text-caudal-950">
                        {selectedTeam.crest ? (
                          <img src={selectedTeam.crest} alt={`Escudo de ${selectedTeam.name}`} className="h-full w-full object-contain" />
                        ) : (
                          <span>{selectedTeam.name.split(' ').map((part) => part[0]).join('').slice(0, 3)}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Alineación</p>
                        <h3 className="truncate text-lg font-semibold text-white">{selectedTeam.name}</h3>
                      </div>
                    </div>

                    <div className="mt-5 space-y-5">
                      {selectedTeam.squad.length > 0 ? (
                        ['Titular', 'Reserva'].map((role) => (
                          <div key={role} className="space-y-2">
                            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">{role === 'Titular' ? 'Titulares' : 'Reservas'}</p>
                            {selectedTeam.squad
                              .map(normalizeSquadEntry)
                              .filter((player) => player.role === role)
                              .map((player) => (
                                <div
                                  key={player.name}
                                  draggable
                                  onDragStart={() => setDraggedPlayer(player)}
                                  onClick={() => openTeamForm(selectedTeam)}
                                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-white/20 ${
                                    player.isKey ? 'border border-amber-300/80 bg-amber-300/10' : 'bg-white/10'
                                  }`}
                                >
                                  <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-800 text-xs font-bold">
                                    {player.image ? (
                                      <img src={player.image} alt={player.name} className="h-full w-full object-cover" />
                                    ) : (
                                      player.name.split(' ').map((part) => part[0]).join('').slice(0, 2)
                                    )}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-1">
                                      <span className="block truncate">{displayPlayerName(player)}</span>
                                      {playerStatusBadges(player).map((badge) => (
                                        <span key={badge.title} title={badge.title} className={`inline-flex h-4 min-w-4 items-center justify-center rounded-sm px-1 text-[10px] font-bold ${badge.className}`}>
                                          {badge.label}
                                        </span>
                                      ))}
                                    </span>
                                    {getPlayerMeta(player) ? <span className="block truncate text-xs text-slate-400">{getPlayerMeta(player)}</span> : null}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setSelectedTeamPlayerRole(player.name, role === 'Titular' ? 'Reserva' : 'Titular');
                                    }}
                                    className="rounded-xl bg-caudal-950/80 px-2 py-1 text-xs font-semibold text-slate-200 hover:bg-caudal-900"
                                  >
                                    {role === 'Titular' ? 'A reserva' : 'Hacer titular'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openTeamForm(selectedTeam);
                                    }}
                                    className="rounded-xl bg-white/10 px-2 py-1 text-xs font-semibold text-slate-200 hover:bg-white/20"
                                  >
                                    Editar
                                  </button>
                                </div>
                              ))}
                          </div>
                        ))
                      ) : (
                        <p className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-slate-400">
                          Añade jugadores en la ficha del equipo.
                        </p>
                      )}
                    </div>
                  </aside>

                  <div
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={handleDropOnField}
                    className="relative mx-auto aspect-[7/8.9] max-h-[760px] min-h-[620px] w-full max-w-[800px] overflow-hidden rounded-3xl border border-caudal-electric/25 bg-[radial-gradient(circle_at_center,rgba(79,140,255,0.22),transparent_34%),linear-gradient(180deg,rgba(8,32,75,0.96),rgba(5,18,46,0.98))] shadow-glow"
                  >
                    <div className="absolute inset-4 rounded-[28px] border-2 border-white/40" />
                    <div className="absolute left-4 right-4 top-1/2 h-px bg-white/35" />
                    <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/35" />
                    <div className="absolute left-1/2 top-4 h-24 w-56 -translate-x-1/2 rounded-b-3xl border-x-2 border-b-2 border-white/35" />
                    <div className="absolute bottom-4 left-1/2 h-24 w-56 -translate-x-1/2 rounded-t-3xl border-x-2 border-t-2 border-white/35" />
                    {getFormationCoordinates(selectedTeam.system).map((slot, slotIndex) => {
                      const slotPlayer = getLineupSlotMap(selectedTeam.lineup ?? emptyLineup).get(slotIndex);
                      return (
                        <div
                          key={`${selectedTeam.system}-${slotIndex}`}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.stopPropagation();
                            handleDropOnLineupSlot(slotIndex);
                          }}
                          className={`absolute flex h-16 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border text-xs font-semibold ${
                            slotPlayer
                              ? 'border-transparent text-transparent'
                              : 'border-dashed border-white/35 bg-white/10 text-white/80'
                          }`}
                          style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                        >
                          {slotPlayer ? '' : slotIndex + 1}
                        </div>
                      );
                    })}
                    {(selectedTeam.lineup ?? emptyLineup).map((player) => (
                      <button
                        key={player.name}
                        draggable
                        onDragStart={() => setDraggedPlayer(player)}
                        onDoubleClick={() => removeFromLineup(player.name)}
                        onClick={() => toggleSelectedTeamKeyPlayer(player.name)}
                        className="absolute flex w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center"
                        style={{ left: `${player.x}%`, top: `${player.y}%` }}
                        title="Arrastra para mover. Clic marca destacado. Doble clic quita del campo."
                      >
                        <span
                          onClick={(event) => {
                            event.stopPropagation();
                            removeFromLineup(player.name);
                          }}
                          className="absolute right-2 top-2 z-20 flex h-4 w-4 items-center justify-center rounded-full bg-red-500/80 text-[9px] font-bold text-white opacity-70 shadow transition hover:opacity-100"
                          title="Quitar del once"
                        >
                          X
                        </span>
                        <span
                          className={`relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border-2 bg-caudal-950/70 shadow-glow ${
                            player.isKey ? 'border-amber-300' : 'border-caudal-electric/60'
                          }`}
                        >
                          {player.number ? (
                            <span className="absolute left-1 top-1 z-10 rounded-md bg-caudal-electric px-1.5 py-0.5 text-[10px] font-bold leading-none text-slate-950">
                              {player.number}
                            </span>
                          ) : null}
                          {player.image ? (
                            <img src={player.image} alt={player.name} className="h-full w-full object-cover" />
                          ) : (
                            player.name.split(' ').map((part) => part[0]).join('').slice(0, 2)
                          )}
                        </span>
                        <span className="mt-1 flex max-w-24 items-center gap-1 text-xs font-semibold leading-tight text-white drop-shadow">
                          <span className="truncate">{displayPlayerName(player)}</span>
                          {playerStatusBadges(player).map((badge) => (
                            <span key={badge.title} title={badge.title} className={`inline-flex h-4 min-w-4 items-center justify-center rounded-sm px-1 text-[10px] font-bold ${badge.className}`}>
                              {badge.label}
                            </span>
                          ))}
                        </span>
                        <div
                          className="absolute top-full mt-1 flex w-24 flex-col gap-1"
                        >
                          {[0, 1].map((benchSlotIndex) => {
                            const benchPlayer = getBenchForStarter(player, selectedTeam.benchChart)[benchSlotIndex];
                            return (
                              <span
                                key={`${player.name}-bench-${benchSlotIndex}`}
                                draggable={Boolean(benchPlayer)}
                                onDragStart={(event) => {
                                  if (!benchPlayer) return;
                                  event.stopPropagation();
                                  setDraggedPlayer(benchPlayer);
                                }}
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) => {
                                  event.stopPropagation();
                                  handleDropOnBenchSlot(player.name, benchSlotIndex);
                                }}
                                onDoubleClick={(event) => {
                                  event.stopPropagation();
                                  clearBenchSlot(player.name, benchSlotIndex);
                                }}
                                className={`relative block min-h-4 max-w-24 truncate rounded-lg px-2 py-0.5 pr-4 text-[11px] leading-tight drop-shadow ${
                                  benchPlayer ? 'bg-caudal-950/70 text-slate-200' : 'border border-dashed border-white/25 text-white/45'
                                }`}
                                title={benchPlayer ? getPlayerMeta(benchPlayer) : 'Arrastra un reserva aquí'}
                              >
                                {benchPlayer ? (
                                  <span className="flex items-center gap-1">
                                    <span className="truncate">{displayPlayerName(benchPlayer)}</span>
                                    {playerStatusBadges(benchPlayer).map((badge) => (
                                      <span key={badge.title} title={badge.title} className={`inline-flex h-3 min-w-3 items-center justify-center rounded-sm px-0.5 text-[9px] font-bold ${badge.className}`}>
                                        {badge.label}
                                      </span>
                                    ))}
                                  </span>
                                ) : (
                                  `Reserva ${benchSlotIndex + 1}`
                                )}
                                {benchPlayer ? (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      clearBenchSlot(player.name, benchSlotIndex);
                                    }}
                                    className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-bold text-red-300 hover:text-red-100"
                                    title="Quitar reserva"
                                  >
                                    X
                                  </button>
                                ) : null}
                              </span>
                            );
                          })}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            ) : teams.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {teams.map((team) => (
                  <article
                    key={team.id}
                    onClick={() => setSelectedTeamId(team.id)}
                    className="group relative min-h-72 cursor-pointer overflow-hidden rounded-3xl border border-white/5 bg-[#091428]/80 p-8 text-center shadow-glow transition hover:-translate-y-1 hover:border-caudal-electric/40"
                  >
                    <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-white/10 p-2 ring-8 ring-white/5">
                      <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl bg-white p-3 text-lg font-bold text-caudal-950">
                        {team.crest ? (
                          <img src={team.crest} alt={`Escudo de ${team.name}`} className="h-full w-full object-contain" />
                        ) : (
                          <span>{team.name.split(' ').map((part) => part[0]).join('').slice(0, 3)}</span>
                        )}
                      </div>
                    </div>
                    <h3 className="mt-7 truncate text-xl font-black uppercase text-white">{cleanTeamDisplayName(team.name)}</h3>
                    <p className="mt-2 text-sm font-semibold uppercase tracking-[0.12em] text-slate-400">{team.stadium || 'Estadio sin definir'}</p>
                    <p className="mt-3 text-sm font-bold uppercase tracking-[0.14em] text-caudal-electric">Sistema: {team.system}</p>
                    <div className="absolute inset-x-0 bottom-0 h-2" style={{ backgroundColor: team.kitColor ?? '#ef233c' }} />

                    <div className="mt-8 flex justify-center gap-3 opacity-0 transition group-hover:opacity-100">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          openTeamForm(team);
                        }}
                        className="rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/25"
                      >
                        Editar
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          handleTeamDelete(team);
                        }}
                        className="rounded-2xl bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/25"
                      >
                        Eliminar
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <section className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-8 text-sm text-slate-400">
                Todavía no hay equipos cargados.
              </section>
            )}
          </main>
        ) : null}

        {activeTab === 'Análisis Grupal' ? (() => {
          const groupData = getGroupAnalysisData();
          const scopedMatches = groupData.scoped;
          const hasData = groupData.played > 0;
          const minuteFor = groupEventsByMinuteRange(groupData.goalForEvents);
          const minuteAgainst = groupEventsByMinuteRange(groupData.goalAgainstEvents);
          const maxMinuteGoals = Math.max(1, ...minuteFor.map((row) => row.count), ...minuteAgainst.map((row) => row.count));
          const phaseFor = countPhases(groupData.goalForEvents);
          const phaseAgainst = countPhases(groupData.goalAgainstEvents);
          const assistZoneCounts = countPitchZones(filterAssistEventsByGroupMode(groupData.goalForEvents).map((event) => event.assistZone));
          const shotSourceEvents = groupShotFilter === 'Goles a favor'
            ? groupData.goalForEvents
            : groupShotFilter === 'Goles en contra'
              ? groupData.goalAgainstEvents
              : [...groupData.goalForEvents, ...groupData.goalAgainstEvents];
          const shotZoneCounts = countPitchZones(shotSourceEvents.map((event) => event.shotZone));
          const abpFor = getSetPieceSummary(groupData.goalForEvents);
          const abpAgainst = getSetPieceSummary(groupData.goalAgainstEvents);
          const localSummary = summarizeGroupMatches(scopedMatches.filter((match) => match.isHome));
          const awaySummary = summarizeGroupMatches(scopedMatches.filter((match) => !match.isHome));
          const trend = getGroupTendency(scopedMatches);
          const rankings = getGroupRankings(scopedMatches);
          const resultDonut = `conic-gradient(#34d399 0 ${groupData.played ? (groupData.wins / groupData.played) * 100 : 0}%, #facc15 ${groupData.played ? (groupData.wins / groupData.played) * 100 : 0}% ${groupData.played ? ((groupData.wins + groupData.draws) / groupData.played) * 100 : 0}%, #f87171 ${groupData.played ? ((groupData.wins + groupData.draws) / groupData.played) * 100 : 0}% 100%)`;
          const abpReading = (forGoals, againstGoals) => {
            if (!forGoals && !againstGoals) return 'neutro';
            if (forGoals >= againstGoals + 2) return 'fuerte';
            if (againstGoals >= forGoals + 2) return 'vulnerable';
            return 'neutro';
          };
          const abpGlobalReading = abpReading(abpFor.total, abpAgainst.total);
          const rankingList = (rows, valueKey, empty = 'sin datos suficientes') => (
            rows.length ? rows.map((row) => (
              <div key={row.player.name} className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-4 py-3">
                <span className="truncate text-sm font-bold text-white">{row.player.name}</span>
                <strong className="text-caudal-electric">
                  {row[valueKey]}{valueKey === 'minutes' ? ` · ${row.minutePct}%` : ''}
                </strong>
              </div>
            )) : <p className="rounded-2xl bg-white/5 p-4 text-sm italic text-slate-500">{empty}</p>
          );

          return (
            <main className="space-y-6">
              <section className="rounded-3xl border border-white/5 bg-white/5 p-6 shadow-glow backdrop-blur-md">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Análisis Grupal</p>
                    <h2 className="mt-2 text-3xl font-black uppercase text-white">Métricas colectivas del equipo</h2>
                    <p className="mt-2 text-sm text-slate-400">
                      {hasData ? `${groupData.played} partidos en el filtro actual` : 'sin datos suficientes'}
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
                      {['Todos', 'Liga', 'Copa RFEF', 'Playoff', 'Amistoso'].map((filter) => (
                        <button
                          key={filter}
                          type="button"
                          onClick={() => setGroupCompetitionFilter(filter)}
                          className={`rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-[0.12em] transition ${groupCompetitionFilter === filter ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-slate-300 hover:bg-white/15'}`}
                        >
                          {filter}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
                      {['Todos', 'Local', 'Visitante', 'Últimos 5 partidos', 'Victorias', 'Empates', 'Derrotas'].map((filter) => (
                        <button
                          key={filter}
                          type="button"
                          onClick={() => setGroupContextFilter(filter)}
                          className={`rounded-2xl px-4 py-2 text-xs font-black uppercase tracking-[0.12em] transition ${groupContextFilter === filter ? 'bg-emerald-300 text-slate-950' : 'bg-white/10 text-slate-300 hover:bg-white/15'}`}
                        >
                          {filter}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Resumen competitivo</h3>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  {[
                    ['Partidos jugados', groupData.played],
                    ['Victorias', groupData.wins],
                    ['Empates', groupData.draws],
                    ['Derrotas', groupData.losses],
                    ['Goles a favor', groupData.goalsFor],
                    ['Goles en contra', groupData.goalsAgainst],
                    ['Diferencia goles', groupData.goalDiff],
                    ['Puntos/partido', groupData.pointsPerGame],
                    ['Porterías a cero', groupData.cleanSheets],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-3xl border border-white/5 bg-white/5 p-5">
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
                      <p className="mt-3 text-3xl font-black text-white">{value}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="grid gap-6 xl:grid-cols-[0.85fr_1.4fr]">
                <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                  <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Distribución de resultados</h3>
                  <div className="mx-auto mt-8 flex h-48 w-48 items-center justify-center rounded-full" style={{ background: resultDonut }}>
                    <div className="flex h-28 w-28 items-center justify-center rounded-full bg-[#091428] text-sm font-black uppercase text-slate-300">
                      {hasData ? `${groupData.played} PJ` : 'sin datos'}
                    </div>
                  </div>
                  <div className="mt-6 grid grid-cols-3 gap-3 text-center">
                    {[
                      ['Victorias', groupData.wins, 'text-emerald-300'],
                      ['Empates', groupData.draws, 'text-amber-300'],
                      ['Derrotas', groupData.losses, 'text-red-300'],
                    ].map(([label, value, color]) => (
                      <div key={label} className="rounded-2xl bg-white/5 p-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
                        <p className={`mt-2 text-2xl font-black ${color}`}>{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Goles por tramos</h3>
                    <div className="flex gap-4 text-xs font-bold uppercase text-slate-400">
                      <span className="text-caudal-electric">Favor</span>
                      <span className="text-red-300">Contra</span>
                    </div>
                  </div>
                  <div className="mt-8 grid h-72 grid-cols-6 items-end gap-3 border-b border-white/10 pb-4">
                    {minuteFor.map((row, index) => (
                      <div key={row.range} className="flex h-full flex-col items-center justify-end gap-2">
                        <div className="flex h-56 w-full items-end justify-center gap-1">
                          <div className="w-5 rounded-t-lg bg-caudal-electric" style={{ height: `${(row.count / maxMinuteGoals) * 100}%` }} title={`Favor: ${row.count}`} />
                          <div className="w-5 rounded-t-lg bg-red-400" style={{ height: `${(minuteAgainst[index].count / maxMinuteGoals) * 100}%` }} title={`Contra: ${minuteAgainst[index].count}`} />
                        </div>
                        <span className="text-[10px] font-bold text-slate-500">{row.range}'</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="grid gap-6 xl:grid-cols-2">
                {[
                  ['Cómo marcamos', phaseFor, 'bg-caudal-electric'],
                  ['Cómo encajamos', phaseAgainst, 'bg-red-400'],
                ].map(([title, rows, colorClass]) => {
                  const maxPhase = Math.max(1, ...rows.map((row) => row.count));
                  return (
                    <div key={title} className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                      <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">{title}</h3>
                      <div className="mt-6 space-y-4">
                        {rows.map((row) => (
                          <div key={row.phase}>
                            <div className="flex justify-between text-xs font-bold uppercase text-slate-400">
                              <span>{row.phase}</span>
                              <span>{row.count}</span>
                            </div>
                            <div className="mt-2 h-3 rounded-full bg-white/10">
                              <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${(row.count / maxPhase) * 100}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </section>

              <section className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Origen de asistencias</h3>
                    <div className="flex flex-wrap gap-2">
                      {['Todas', 'Juego', 'Transición', 'ABP'].map((filter) => (
                        <button key={filter} onClick={() => setGroupAssistFilter(filter)} className={`rounded-xl px-3 py-2 text-xs font-bold uppercase ${groupAssistFilter === filter ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-slate-300'}`}>{filter}</button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-5">{renderReadOnlyZoneGrid({ counts: assistZoneCounts })}</div>
                </div>

                <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Zonas de remate / finalización</h3>
                    <div className="flex flex-wrap gap-2">
                      {['Goles a favor', 'Goles en contra', 'Ambos'].map((filter) => (
                        <button key={filter} onClick={() => setGroupShotFilter(filter)} className={`rounded-xl px-3 py-2 text-xs font-bold uppercase ${groupShotFilter === filter ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-slate-300'}`}>{filter}</button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-5">{renderReadOnlyZoneGrid({ counts: shotZoneCounts })}</div>
                </div>
              </section>

              <section className="grid gap-6 xl:grid-cols-2">
                {[
                  ['ABP ofensiva', abpFor, 'Eficacia ABP', abpFor.total ? `${Math.round((abpFor.total / Math.max(1, groupData.goalsFor)) * 100)}% de goles a favor` : 'sin datos suficientes'],
                  ['ABP defensiva', abpAgainst, 'Vulnerabilidad ABP', abpAgainst.total ? `${Math.round((abpAgainst.total / Math.max(1, groupData.goalsAgainst)) * 100)}% de goles encajados` : 'sin datos suficientes'],
                ].map(([title, summary, metric, value]) => (
                  <div key={title} className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                    <div className="flex items-start justify-between gap-4">
                      <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">{title}</h3>
                      <span className={`rounded-2xl px-3 py-2 text-xs font-black uppercase ${abpGlobalReading === 'fuerte' ? 'bg-emerald-400/15 text-emerald-300' : abpGlobalReading === 'vulnerable' ? 'bg-red-400/15 text-red-300' : 'bg-white/10 text-slate-300'}`}>
                        {title === 'ABP ofensiva' ? abpGlobalReading : abpGlobalReading}
                      </span>
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      {[
                        ['Córner', summary.corner],
                        ['Falta directa', summary.directFreeKick],
                        ['Falta con remate', summary.freeKickHeader],
                        ['Penalti', summary.penalty],
                        ['Segunda jugada', summary.secondBall],
                      ].map(([label, count]) => (
                        <div key={label} className="rounded-2xl bg-white/5 p-4">
                          <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{label}</p>
                          <p className="mt-2 text-2xl font-black text-white">{count}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-5 rounded-2xl bg-white/5 p-4">
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{metric}</p>
                      <p className="mt-2 text-sm font-bold text-slate-200">{value}</p>
                    </div>
                  </div>
                ))}
              </section>

              <section className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                  <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Local vs visitante</h3>
                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead className="text-xs uppercase tracking-[0.14em] text-slate-500">
                        <tr>{['Contexto', 'PJ', 'V', 'E', 'D', 'GF', 'GC', 'PPG', 'PC'].map((head) => <th key={head} className="px-3 py-3">{head}</th>)}</tr>
                      </thead>
                      <tbody>
                        {[
                          ['Local', localSummary],
                          ['Visitante', awaySummary],
                        ].map(([label, row]) => (
                          <tr key={label} className="border-t border-white/10">
                            <td className="px-3 py-4 font-bold text-white">{label}</td>
                            <td className="px-3 py-4 text-slate-300">{row.played}</td>
                            <td className="px-3 py-4 text-emerald-300">{row.wins}</td>
                            <td className="px-3 py-4 text-amber-300">{row.draws}</td>
                            <td className="px-3 py-4 text-red-300">{row.losses}</td>
                            <td className="px-3 py-4 text-white">{row.goalsFor}</td>
                            <td className="px-3 py-4 text-white">{row.goalsAgainst}</td>
                            <td className="px-3 py-4 text-caudal-electric">{row.pointsPerGame}</td>
                            <td className="px-3 py-4 text-white">{row.cleanSheets}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                  <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Tendencia últimos partidos</h3>
                  <div className="mt-5 space-y-3">
                    {trend.length ? trend.map((row) => (
                      <div key={row.match.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-2xl bg-white/5 p-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-white">{row.match.opponent}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-500">{matchDisplayDate(row.match.date)} · {row.match.type} · {row.match.isHome ? 'Local' : 'Visitante'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-black text-white">{row.goalsFor}-{row.goalsAgainst}</p>
                          <p className="text-xs text-slate-400">{row.cleanSheet ? 'Portería a cero' : 'Encajado'} · {row.cards} tarjetas</p>
                        </div>
                      </div>
                    )) : <p className="rounded-2xl bg-white/5 p-4 text-sm italic text-slate-500">sin datos suficientes</p>}
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Ranking individual</h3>
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <div>
                    <p className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">Máximos goleadores</p>
                    {rankingList(rankings.scorers, 'goals')}
                  </div>
                  <div>
                    <p className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">Máximos asistentes</p>
                    {rankingList(rankings.assistants, 'assists')}
                  </div>
                  <div>
                    <p className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">Más amonestados</p>
                    {rankingList(rankings.booked, 'cards')}
                  </div>
                  <div>
                    <p className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">Más minutos</p>
                    {rankingList(rankings.minutes, 'minutes')}
                  </div>
                  <div>
                    <p className="mb-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">Participaciones de gol</p>
                    {rankingList(rankings.participations, 'goalParticipation')}
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white">Once ideal</h3>
                    <p className="mt-2 text-sm text-slate-500">Calculado por minutos, titularidades, goles, asistencias y valoración registrada.</p>
                  </div>
                  <select value={idealSystem} onChange={(event) => setIdealSystem(event.target.value)} className="rounded-2xl border border-white/10 bg-white px-5 py-3 text-sm font-black text-slate-950">
                    {['4-4-2', '4-2-3-1', '4-3-3', '5-3-2'].map((system) => <option key={system}>{system}</option>)}
                  </select>
                </div>
                <div className="mt-6">
                  {rankings.ideal.length ? renderIdealElevenPitch(rankings.ideal) : <p className="rounded-2xl bg-white/5 p-6 text-center text-sm italic text-slate-500">sin datos suficientes</p>}
                </div>
              </section>
            </main>
          );
        })() : null}

        {activeTab === 'Partidos' ? (
          <main className="space-y-6">
            <section className="rounded-3xl border border-white/5 bg-white/5 p-6 shadow-glow backdrop-blur-md">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Partidos</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Calendario y análisis</h2>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button onClick={handleSaveMatches} className="rounded-2xl bg-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/25">
                    Guardar partidos
                  </button>
                  <button onClick={() => openMatchForm(null)} className="rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff]">
                    Nuevo partido
                  </button>
                </div>
              </div>
              {saveStatus ? <p className="mt-3 text-sm text-caudal-electric">{saveStatus}</p> : null}
            </section>

            {matchView === 'lista_partidos' ? (
              <>
                <div className="flex flex-wrap gap-3">
              {matchFilters.map((filter) => (
                <button
                  key={filter}
                  onClick={() => setMatchFilter(filter)}
                  className={`rounded-2xl px-5 py-2 text-sm font-semibold uppercase tracking-[0.12em] transition ${
                    matchFilter === filter ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-slate-300 hover:bg-white/15'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <button onClick={() => openMatchForm(null)} className="min-h-40 rounded-3xl border border-dashed border-white/15 bg-white/[0.03] p-5 text-left transition hover:border-caudal-electric/60">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-caudal-electric/15 text-3xl text-caudal-electric">+</span>
                <p className="mt-8 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Nuevo partido</p>
              </button>
              <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-5 shadow-glow">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Partidos totales</p>
                <p className="mt-4 text-4xl font-semibold text-white">{matchStats.total}</p>
                {matchFilter === 'Todos' ? (
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs uppercase text-slate-400">
                    {matchTypes.map((type) => (
                      <div key={type} className="rounded-xl bg-white/5 px-2 py-1">
                        <span className="block truncate">{type}</span>
                        <strong className="text-white">{matches.filter((match) => match.type === type).length}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-caudal-electric">{matchFilter}</p>
                )}
              </div>
              <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-5 shadow-glow">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Efectividad</p>
                <p className="mt-4 text-3xl font-semibold text-emerald-400">{matchStats.wins} Victorias</p>
                <div className="mt-4 h-2 rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${matchStats.finished ? (matchStats.wins / matchStats.finished) * 100 : 0}%` }} />
                </div>
              </div>
              <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-5 shadow-glow">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Balance de goles</p>
                <p className="mt-4 text-3xl font-semibold text-white">{matchStats.goalsFor} - {matchStats.goalsAgainst}</p>
                <p className="mt-2 text-xs uppercase text-slate-500">Favor / Contra</p>
              </div>
              <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-5 shadow-glow">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Forma reciente</p>
                <div className="mt-5 flex gap-2">
                  {(matchStats.recent.length ? matchStats.recent : ['-', '-', '-']).map((result, index) => (
                    <span key={`${result}-${index}`} className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-400/60 text-sm font-bold text-emerald-300">{result}</span>
                  ))}
                </div>
                <p className="mt-5 text-xs uppercase text-slate-500">Porterías a cero: {matchStats.cleanSheets}</p>
              </div>
            </div>

            <section className="space-y-4">
              <h3 className="border-l-4 border-caudal-electric pl-3 text-sm font-bold uppercase tracking-[0.25em] text-white">Calendario general</h3>
              {filteredMatches.length > 0 ? (
                <div className="grid gap-4 xl:grid-cols-2">
                  {filteredMatches.map((match) => {
                    const activeSection = matchSections[match.id] ?? 'PRE';
                    const caudalIsHome = match.isHome;
                    const statsEvents = match.statsGoalEvents || [];
                    const statsCaudalGoals = statsEvents.filter((event) => event.type === 'Gol a favor').length;
                    const statsRivalGoals = statsEvents.filter((event) => event.type === 'Gol en contra').length;
                    const hasStatsScore = statsEvents.length > 0;
                    const cardHomeScore = hasStatsScore ? (match.isHome ? statsCaudalGoals : statsRivalGoals) : match.homeScore || 0;
                    const cardAwayScore = hasStatsScore ? (match.isHome ? statsRivalGoals : statsCaudalGoals) : match.awayScore || 0;
                    const played = hasStatsScore || match.status === 'Finalizado';
                    const caudalResultGoals = hasStatsScore ? statsCaudalGoals : Number(match.goalsFor || (match.isHome ? match.homeScore : match.awayScore) || 0);
                    const rivalResultGoals = hasStatsScore ? statsRivalGoals : Number(match.goalsAgainst || (match.isHome ? match.awayScore : match.homeScore) || 0);
                    const resultStripeClass = !played
                      ? 'bg-slate-400'
                      : caudalResultGoals > rivalResultGoals
                        ? 'bg-emerald-400'
                        : caudalResultGoals < rivalResultGoals
                          ? 'bg-red-500'
                          : 'bg-amber-300';
                    const cardPlayerRows = Object.entries(match.statsPlayerData || {})
                      .filter(([, stats]) => stats.yellow || stats.red || stats.injured)
                      .map(([name, stats]) => ({ name, stats }));
                    return (
                      <article key={match.id} className="relative overflow-hidden rounded-3xl border border-white/5 bg-[#091428]/80 shadow-glow">
                        <div className={`h-2 w-full ${resultStripeClass}`} />
                        <div className="absolute right-4 top-4 z-10 flex gap-2">
                          <button onClick={() => openMatchForm(match)} className="rounded-xl bg-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/25">Editar</button>
                          <button onClick={() => handleMatchDelete(match)} className="rounded-xl bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-100 hover:bg-red-500/25">Eliminar</button>
                        </div>
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 p-5">
                          <div className="text-center">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white p-2">
                              <img src={caudalIsHome ? clubCrest : match.opponentCrest || clubCrest} alt="" className="h-full w-full object-contain" />
                            </div>
                            <p className="mt-2 text-sm font-bold text-white">{caudalIsHome ? 'C.D. Caudal' : match.opponent}</p>
                          </div>
                          <div className="text-center">
                            <p className="rounded-xl bg-caudal-950 px-3 py-1 text-xs text-slate-400">{matchDisplayDate(match.date)}</p>
                            <p className="mt-3 text-4xl font-bold text-white">{played ? `${cardHomeScore} - ${cardAwayScore}` : 'vs'}</p>
                            <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{match.type} {match.round}</p>
                            {match.stadium ? <p className="mt-1 text-xs font-semibold text-slate-400">{match.stadium}</p> : null}
                            {hasStatsScore || cardPlayerRows.length ? (
                              <div className="mt-2 text-xs leading-5 text-slate-400">
                                {statsEvents.filter((event) => event.type === 'Gol a favor').map((event) => (
                                  <p key={event.id}>⚽ {event.scorer || 'Caudal'} {event.minute}'{event.assistant ? ` · 👟 ${event.assistant}` : ''}</p>
                                ))}
                                {statsEvents.filter((event) => event.type === 'Gol en contra').map((event) => (
                                  <p key={event.id}>⚽ {match.opponent || 'Rival'} {event.minute}'</p>
                                ))}
                                {cardPlayerRows.map(({ name, stats }) => (
                                  <p key={name}>{name} {stats.yellow ? '🟨' : ''}{stats.red ? ' 🟥' : ''}{stats.injured ? ' 🚑' : ''}</p>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <div className="text-center">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 p-2 text-lg font-bold text-white">
                              {caudalIsHome ? (match.opponentCrest ? <img src={match.opponentCrest} alt="" className="h-full w-full object-contain" /> : match.opponent.slice(0, 2).toUpperCase()) : <img src={clubCrest} alt="" className="h-full w-full object-contain" />}
                            </div>
                            <p className="mt-2 text-sm font-bold text-white">{caudalIsHome ? match.opponent : 'C.D. Caudal'}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 border-t border-white/10">
                          {['PRE', 'ESTADÍSTICAS', 'POST'].map((section) => (
                            <button
                              key={section}
                              onClick={() => {
                                setMatchSections((prev) => ({ ...prev, [match.id]: section }));
                                openMatchPage(match, section);
                              }}
                              className={`px-3 py-3 text-xs font-bold uppercase tracking-[0.12em] ${activeSection === section ? 'bg-caudal-electric text-slate-950' : 'bg-white/[0.03] text-slate-500 hover:text-white'}`}>
                              {section}
                            </button>
                          ))}
                        </div>
                        <div className="p-3 text-sm text-slate-300"></div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-8 text-sm text-slate-400">No hay partidos en este filtro.</div>
              )}
            </section>
              </>
            ) : selectedMatch ? (
              <section className="space-y-6">
                <div className="rounded-3xl border border-white/5 bg-white/5 p-6 shadow-glow backdrop-blur-md">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <button onClick={closeMatchPage} className="mb-3 inline-flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20">
                        ← Volver a partidos
                      </button>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{matchView === 'pre_partido' ? 'Pre partido' : matchView === 'estadisticas_partido' ? 'Estadísticas' : 'Post partido'}</p>
                      <h2 className="mt-2 text-3xl font-semibold text-white">{matchView === 'pre_partido' ? 'PRE partido' : matchView === 'estadisticas_partido' ? 'Estadísticas del partido' : 'POST partido'}</h2>
                      <p className="mt-2 text-sm text-slate-400">{matchDisplayDate(selectedMatch.date)} · {selectedMatch.type} · {selectedMatch.round}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-3xl bg-[#091428]/90 p-4">
                        <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Rival</p>
                        <p className="mt-3 text-xl font-semibold text-white">{selectedMatch.opponent || 'Sin rival'}</p>
                        {selectedMatch.stadium ? <p className="mt-2 text-sm text-slate-400">Estadio: {selectedMatch.stadium}</p> : null}
                      </div>
                      <div className="rounded-3xl bg-[#091428]/90 p-4">
                        <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Resultado</p>
                        <p className="mt-3 text-3xl font-semibold text-white">{selectedMatch.status === 'Finalizado' ? `${selectedMatch.homeScore || 0} - ${selectedMatch.awayScore || 0}` : 'Pendiente'}</p>
                        <p className="mt-2 text-sm uppercase tracking-[0.2em] text-slate-400">{selectedMatch.status}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-3">
                    {['PRE', 'ESTADÍSTICAS', 'POST'].map((section) => (
                      <button
                        key={section}
                        onClick={() => openMatchPage(selectedMatch, section)}
                        className={`rounded-2xl px-4 py-3 text-sm font-semibold uppercase tracking-[0.12em] ${matchViewSection === section ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-slate-200 hover:bg-white/15'}`}>
                        {section}
                      </button>
                    ))}
                  </div>
                </div>

                {matchView === 'pre_partido' ? (
                  <section className="space-y-6">
                    <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">PRE partido</p>
                          <h3 className="mt-2 text-2xl font-semibold text-white">Preparación táctica</h3>
                          <p className="mt-2 text-sm text-slate-400">Gestiona el informe rival y los sistemas enfrentados.</p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {['Informe rival', 'Sistemas enfrentados'].map((tab) => (
                            <button
                              key={tab}
                              onClick={() => setPreSubTab(tab)}
                              className={`rounded-2xl px-4 py-3 text-sm font-semibold uppercase tracking-[0.12em] ${preSubTab === tab ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-slate-200 hover:bg-white/15'}`}>
                              {tab}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {preSubTab === 'Informe rival' ? (
                      <div className="space-y-6">
                        <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                          <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
                            <label className="space-y-2 text-sm text-slate-300">
                              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Enlace del informe Canva</span>
                              <input
                                type="url"
                                value={selectedMatch.preCanvaLink || ''}
                                onChange={(event) => updateSelectedMatchFields({ preCanvaLink: event.target.value })}
                                placeholder="https://www.canva.com/..."
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
                              />
                            </label>
                            <button
                              type="button"
                              disabled={!getCanvaEmbedUrl(selectedMatch.preCanvaLink)}
                              onClick={() => setIsCanvaPreviewOpen(true)}
                              className="h-fit rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff] disabled:cursor-not-allowed disabled:bg-slate-600/40"
                            >
                              Ampliar informe
                            </button>
                          </div>
                          {selectedMatch.preCanvaLink ? (
                            getCanvaEmbedUrl(selectedMatch.preCanvaLink) ? (
                              <div className="mt-6 overflow-hidden rounded-3xl border border-white/10 bg-[#0f1e38]/80">
                                <iframe
                                  title="Informe Canva"
                                  src={getCanvaEmbedUrl(selectedMatch.preCanvaLink)}
                                  className="h-[70vh] min-h-[520px] w-full"
                                  allowFullScreen
                                />
                              </div>
                            ) : (
                              <div className="mt-6 rounded-3xl bg-[#0f1e38]/80 p-5 text-sm text-slate-400">
                                Este enlace no parece ser de Canva. Usa un enlace de Canva para verlo dentro de la app.
                              </div>
                            )
                          ) : (
                            <div className="mt-6 rounded-3xl bg-[#0f1e38]/80 p-5 text-sm text-slate-400">
                              Pega un enlace de Canva para visualizar el informe aquí.
                            </div>
                          )}
                        </div>

                        <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                          <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Notas rápidas</h4>
                          <textarea
                            value={selectedMatch.preNotes || ''}
                            onChange={(event) => updateSelectedMatchFields({ preNotes: event.target.value })}
                            placeholder="Resumen rápido del rival, estilo de juego y puntos clave..."
                            className="mt-4 min-h-[180px] w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white placeholder:text-slate-500"
                          />
                        </div>

                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="grid gap-6 lg:grid-cols-2">
                          <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Campo 1</p>
                                <h4 className="mt-2 text-xl font-semibold text-white">C.D. Caudal</h4>
                              </div>
                            </div>
                            <label className="space-y-2 text-sm text-slate-300">
                              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Sistema</span>
                              <select
                                value={selectedMatch.preCaudalSystem || '4-4-2'}
                                onChange={(event) => updateSelectedMatchFields({ preCaudalSystem: event.target.value })}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
                              >
                                {gameSystems.map((system) => (
                                  <option key={system} value={system}>{system}</option>
                                ))}
                              </select>
                            </label>
                          </div>

                          <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Campo 2</p>
                                <h4 className="mt-2 text-xl font-semibold text-white">Rival</h4>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const rivalTeam = getRivalBaseTeam();
                                  if (rivalTeam) {
                                    updateSelectedMatchFields({
                                      opponent: cleanTeamDisplayName(rivalTeam.name),
                                      opponentCrest: rivalTeam.crest || selectedMatch.opponentCrest,
                                      preRivalSystem: rivalTeam.system,
                                    });
                                  }
                                }}
                                className="rounded-2xl bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white hover:bg-white/15"
                              >
                                Cargar desde Equipos
                              </button>
                            </div>
                            <label className="space-y-2 text-sm text-slate-300">
                              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Sistema</span>
                              <select
                                value={getCurrentRivalSystem()}
                                onChange={(event) => updateSelectedMatchFields({ preRivalSystem: event.target.value })}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
                              >
                                {gameSystems.map((system) => (
                                  <option key={system} value={system}>{system}</option>
                                ))}
                              </select>
                            </label>
                          </div>
                        </div>

                        <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                          <div className="mb-5">
                            <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Cuestionario para análisis IA</h4>
                            <p className="mt-2 text-sm text-slate-400">Rellena lo que sepas del rival y de vuestra intención de partido. Con esto la IA construye el plan.</p>
                          </div>
                          <div className="space-y-3">
                            {[
                              {
                                id: 'rivalAttack',
                                title: 'Rival con balón',
                                description: 'Cómo inicia, progresa, finaliza y dónde genera peligro.',
                                fields: [
                                  { label: 'Cómo juega el rival', field: 'preRivalStyle', placeholder: 'Ej. equipo directo, laterales profundos, mucho balón parado...' },
                                  { label: 'Organización ofensiva rival', field: 'preRivalOffensiveOrganization', placeholder: 'Estructura, alturas, comportamientos con balón...' },
                                  { label: 'Sistema base rival', field: 'preRivalBaseSystem', placeholder: 'Sistema con balón si cambia respecto al dibujo inicial...' },
                                  { label: 'Salida rival', field: 'preRivalBuildUp', type: 'select', options: ['Combinativo', 'Directo', 'Mixto'] },
                                  { label: 'Cómo inicia juego', field: 'preRivalStartPlay', placeholder: 'Portero corto/largo, centrales abiertos, pivote, lateral...' },
                                  { label: 'Cómo progresa', field: 'preRivalProgression', placeholder: 'Por dentro, por fuera, tercer hombre, balón directo...' },
                                  { label: 'Cómo finaliza', field: 'preRivalFinishing', placeholder: 'Centros, tiros frontales, pase atrás, balón parado...' },
                                  { label: 'Jugadores clave ofensivos', field: 'preRivalOffensiveKeyPlayers', placeholder: 'Nombres y por qué son importantes...' },
                                  { label: 'Dónde genera más peligro', field: 'preRivalDangerZones', placeholder: 'Banda derecha, intervalo lateral-central, frontal...' },
                                  { label: 'Cómo ataca bandas', field: 'preRivalWideAttack', placeholder: 'Dobladas, extremos a pie cambiado, centros tempranos...' },
                                  { label: 'Cómo ocupa área', field: 'preRivalBoxOccupation', placeholder: 'Primer palo, segundo palo, rechace, frontal...' },
                                ],
                              },
                              {
                                id: 'rivalDefense',
                                title: 'Rival sin balón',
                                description: 'Bloque, presión, espacios y cómo defiende situaciones clave.',
                                fields: [
                                  { label: 'Organización defensiva rival', field: 'preRivalDefensiveOrganization', placeholder: 'Cómo se ordenan sin balón...' },
                                  { label: 'Sistema defensivo', field: 'preRivalDefensiveSystem', placeholder: 'Ej. 4-4-2 defendiendo, 5-4-1, marcas...' },
                                  { label: 'Bloque defensivo', field: 'preRivalDefensiveBlock', type: 'select', options: ['Alto', 'Medio', 'Bajo'] },
                                  { label: 'Altura del bloque', field: 'preRivalBlockHeightDetail', placeholder: 'Dónde esperan y cuándo saltan...' },
                                  { label: 'Presión rival', field: 'preRivalPressure', type: 'select', options: ['Alta', 'Media', 'Baja'] },
                                  { label: 'Tipo de presión', field: 'preRivalPressureType', placeholder: 'Hombre a hombre, orientada a banda, sobre pivote...' },
                                  { label: 'Dónde deja espacios', field: 'preRivalSpacesAllowed', placeholder: 'Espalda de laterales, entre líneas, lado débil...' },
                                  { label: 'Cómo defiende centros', field: 'preRivalDefendsCrosses', placeholder: 'Defiende área, marcas, punto penal, rechace...' },
                                  { label: 'Cómo defiende espalda de centrales', field: 'preRivalDefendsBack', placeholder: 'Línea alta/baja, centrales lentos, coberturas...' },
                                  { label: 'Cómo defiende segunda jugada', field: 'preRivalSecondBallDefense', placeholder: 'Quién recoge rechace, si se parte, si acumula...' },
                                  { label: 'Fortalezas del rival', field: 'preRivalStrengths', placeholder: 'Qué hacen muy bien y qué debemos proteger...' },
                                  { label: 'Debilidades del rival', field: 'preRivalWeaknesses', placeholder: 'Dónde sufren: espalda, centros laterales, presión, duelos...' },
                                ],
                              },
                              {
                                id: 'transitions',
                                title: 'Transiciones',
                                description: 'Qué hacen ambos equipos tras pérdida y tras robo.',
                                fields: [
                                  { label: 'Transiciones rival', field: 'preRivalTransitions', type: 'select', options: ['Directas', 'Equilibradas', 'Pausadas'] },
                                  { label: 'Qué hace tras pérdida', field: 'preRivalAfterLoss', placeholder: 'Presiona, repliega, falta táctica, queda partido...' },
                                  { label: 'Qué hace tras robo', field: 'preRivalAfterRecovery', placeholder: 'Primer pase vertical, busca punta, temporiza...' },
                                  { label: 'Jugadores que lanzan transición', field: 'preRivalTransitionLaunchers', placeholder: 'Nombres, perfil, pase, conducción...' },
                                  { label: 'Zonas donde corre mejor', field: 'preRivalBestRunningZones', placeholder: 'Banda izquierda, espalda lateral, carril central...' },
                                  { label: 'Qué hacer tras pérdida', field: 'preCaudalAfterLoss', placeholder: 'Presión inmediata, cerrar dentro, falta táctica...' },
                                  { label: 'Qué hacer tras robo', field: 'preCaudalAfterRecovery', placeholder: 'Primer pase, atacar espalda, asegurar posesión...' },
                                ],
                              },
                              {
                                id: 'setPieces',
                                title: 'ABP',
                                description: 'Balón parado ofensivo y defensivo del rival.',
                                fields: [
                                  { label: 'Córners ofensivos', field: 'preRivalCornersFor', placeholder: 'Tipo de golpeo, movimientos, bloqueos...' },
                                  { label: 'Córners defensivos', field: 'preRivalCornersAgainst', placeholder: 'Zona, hombre, deja rechace, marcas débiles...' },
                                  { label: 'Faltas laterales', field: 'preRivalWideFreeKicks', placeholder: 'Cómo las lanzan y cómo las defienden...' },
                                  { label: 'Lanzadores', field: 'preRivalSetPieceTakers', placeholder: 'Nombres y pierna...' },
                                  { label: 'Rematadores principales', field: 'preRivalMainHeaders', placeholder: 'Nombres, zona de remate, bloqueos...' },
                                ],
                              },
                              {
                                id: 'caudalPlan',
                                title: 'Nuestro plan',
                                description: 'Plan con balón, sin balón y espacios que queremos atacar.',
                                fields: [
                                  { label: 'Nuestra intención para ganar', field: 'preCaudalIntent', placeholder: 'Ej. presión alta, atacar espalda de laterales, controlar mediocampo...' },
                                  { label: 'Plan con balón', field: 'preCaudalBuildPlan', placeholder: 'Qué queremos hacer cuando tenemos balón...' },
                                  { label: 'Cómo queremos iniciar', field: 'preCaudalStartPlay', placeholder: 'Salida corta/larga, atraer, jugar directo...' },
                                  { label: 'Por dónde queremos progresar', field: 'preCaudalProgressionPlan', placeholder: 'Carril central, lado débil, banda concreta...' },
                                  { label: 'Dónde queremos atacar', field: 'preCaudalAttackZones', placeholder: 'Intervalos, espalda, frontal, centros...' },
                                  { label: 'Qué jugadores queremos activar', field: 'preCaudalPlayersToActivate', placeholder: 'Nombres y cómo activarles...' },
                                  { label: 'Qué espacios queremos buscar', field: 'preCaudalSpacesToFind', placeholder: 'Espalda lateral, zona pivote, segundo palo...' },
                                  { label: 'Dónde queremos presionar', field: 'preCaudalPressPlan', placeholder: 'Central derecho, lateral, pase al pivote...' },
                                  { label: 'Qué jugadores rivales queremos tapar', field: 'preCaudalRivalsToBlock', placeholder: 'Nombres y líneas de pase a cerrar...' },
                                  { label: 'Cómo defender sus puntos fuertes', field: 'preCaudalDefendStrengths', placeholder: 'Ayudas, coberturas, emparejamientos...' },
                                  { label: 'Qué evitar', field: 'preCaudalAvoid', placeholder: 'Pérdidas interiores, faltas laterales, ida y vuelta...' },
                                ],
                              },
                              {
                                id: 'duels',
                                title: 'Duelos individuales',
                                description: 'Emparejamientos y jugadores que condicionan el partido.',
                                fields: [
                                  { label: 'Emparejamientos clave', field: 'preKeyMatchups', placeholder: 'Ej. nuestro lateral vs su extremo, pivote vs mediapunta...' },
                                  { label: 'Jugador nuestro a potenciar', field: 'preCaudalPlayerToBoost', placeholder: 'Nombre, zona y por qué...' },
                                  { label: 'Jugador rival a vigilar', field: 'preRivalPlayerToWatch', placeholder: 'Nombre, amenaza y cómo reducirle...' },
                                  { label: 'Duelos importantes', field: 'preImportantDuels', placeholder: 'Duelos físicos, velocidad, juego aéreo, segunda jugada...' },
                                ],
                              },
                            ].map(renderQuestionnaireSection)}
                          </div>
                        </div>

                        <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                              <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Sistemas sobre campo</h4>
                              <p className="mt-2 text-sm text-slate-400">Pincha un puesto del Caudal y asigna un jugador de la plantilla.</p>
                            </div>
                            <div className="flex flex-wrap gap-3">
                              <button
                                type="button"
                                onClick={loadSuggestedCaudalLineup}
                                className="rounded-2xl bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white hover:bg-white/15"
                              >
                                Once Caudal
                              </button>
                              <button
                                type="button"
                                onClick={() => clearCaudalLineupSlot(selectedTacticalPlayerIndex)}
                                className="rounded-2xl bg-red-500/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-red-100 hover:bg-red-500/25"
                              >
                                Limpiar Caudal
                              </button>
                              <button
                                type="button"
                                onClick={loadSuggestedRivalLineup}
                                className="rounded-2xl bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white hover:bg-white/15"
                              >
                                Once rival
                              </button>
                              <button
                                type="button"
                                onClick={() => clearRivalLineupSlot(selectedRivalTacticalPlayerIndex)}
                                className="rounded-2xl bg-red-500/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-red-100 hover:bg-red-500/25"
                              >
                                Limpiar rival
                              </button>
                            </div>
                          </div>
                          <div className="grid min-w-0 gap-5 2xl:grid-cols-[260px_minmax(0,1fr)_260px]">
                            <div className="min-w-0 rounded-3xl bg-[#0f1e38]/80 p-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Plantilla Caudal</p>
                              <p className="mt-2 text-sm text-slate-400">
                                Puesto seleccionado: <span className="font-semibold text-white">{getFormationRoles(selectedMatch.preCaudalSystem || '4-4-2')[selectedTacticalPlayerIndex]}</span>
                              </p>
                              <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
                                {players.map((player) => {
                                  const isAssigned = selectedMatch.preCaudalLineup?.includes(player.name);
                                  const isCurrent = getSelectedLineupName() === player.name;
                                  return (
                                    <button
                                      key={player.id}
                                      type="button"
                                      onClick={() => updateCaudalLineupSlot(selectedTacticalPlayerIndex, player.name)}
                                      className={`w-full min-w-0 rounded-2xl px-3 py-3 text-left text-sm transition ${isCurrent ? 'bg-caudal-electric text-slate-950' : isAssigned ? 'bg-white/10 text-slate-300' : 'bg-white/5 text-white hover:bg-white/10'}`}
                                    >
                                      <span className="block truncate font-semibold">{player.name}</span>
                                      <span className={`mt-1 block text-xs ${isCurrent ? 'text-slate-800' : 'text-slate-500'}`}>
                                        {[player.position, player.foot].filter(Boolean).join(' · ')}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            {renderSystemsPitch()}
                            <div className="min-w-0 rounded-3xl bg-[#0f1e38]/80 p-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Plantilla rival</p>
                              <p className="mt-2 text-sm text-slate-400">
                                Puesto seleccionado: <span className="font-semibold text-white">{getFormationRoles(getCurrentRivalSystem())[selectedRivalTacticalPlayerIndex]}</span>
                              </p>
                              <div className="mt-4 grid gap-2">
                                <input
                                  value={newRivalManualPlayerName}
                                  onChange={(event) => setNewRivalManualPlayerName(event.target.value)}
                                  placeholder="Jugador manual"
                                  className="w-full min-w-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                                />
                                <button
                                  type="button"
                                  onClick={addManualRivalPlayer}
                                  className="w-full rounded-2xl bg-rose-300 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-rose-950"
                                >
                                  Añadir
                                </button>
                              </div>
                              <div className="mt-4 max-h-[360px] space-y-2 overflow-y-auto pr-1">
                                {getRivalAvailablePlayers().length ? (
                                  getRivalAvailablePlayers().map((player) => {
                                    const isAssigned = selectedMatch.preRivalLineup?.includes(player.name);
                                    const isCurrent = getSelectedRivalLineupName() === player.name;
                                    return (
                                      <button
                                        key={player.name}
                                        type="button"
                                        onClick={() => updateRivalLineupSlot(selectedRivalTacticalPlayerIndex, player.name)}
                                        className={`w-full min-w-0 rounded-2xl px-3 py-3 text-left text-sm transition ${isCurrent ? 'bg-rose-300 text-rose-950' : isAssigned ? 'bg-white/10 text-slate-300' : 'bg-white/5 text-white hover:bg-white/10'}`}
                                      >
                                        <span className="block truncate font-semibold">{player.name}</span>
                                        <span className={`mt-1 block text-xs ${isCurrent ? 'text-rose-900' : 'text-slate-500'}`}>
                                          {[player.position, player.foot].filter(Boolean).join(' · ') || 'Sin perfil'}
                                        </span>
                                      </button>
                                    );
                                  })
                                ) : (
                                  <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-slate-400">
                                    Vincula el partido a un equipo rival o añade jugadores manuales.
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="mt-4 rounded-3xl bg-[#0f1e38]/80 p-5">
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Aportaciones individuales seleccionadas</p>
                            <div className="mt-3 grid gap-4 lg:grid-cols-3">
                              <label className="space-y-2 text-sm text-slate-300">
                                <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Nota jugador Caudal</span>
                                <textarea
                                  value={(selectedMatch.prePlayerNotes || {})[getSelectedLineupName()] || ''}
                                  onChange={(event) => updateSelectedPlayerNote(event.target.value)}
                                  disabled={!getSelectedLineupName()}
                                  placeholder="Ej. llega justo físicamente, atacar su banda, buen golpeo, ayudar al lateral..."
                                  className="min-h-[150px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
                                />
                              </label>
                              <label className="space-y-2 text-sm text-slate-300">
                                <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Característica rival</span>
                                <textarea
                                  value={(selectedMatch.preRivalPlayerNotes || {})[getSelectedRivalLineupName()] || ''}
                                  onChange={(event) => updateSelectedRivalPlayerNote(event.target.value)}
                                  disabled={!getSelectedRivalLineupName()}
                                  placeholder="Ej. muy rápido al espacio, zurdo cerrado, sufre defendiendo centros..."
                                  className="min-h-[150px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
                                />
                              </label>
                              <div>
                            {selectedMatch.preAiAnalysis?.individualByPlayer?.[selectedTacticalPlayerIndex] ? (
                              <div className="mt-3">
                                <h5 className="text-lg font-semibold text-white">{selectedMatch.preAiAnalysis.individualByPlayer[selectedTacticalPlayerIndex].playerName}</h5>
                                {getSelectedRivalLineupName() ? (
                                  <p className="mt-1 text-sm text-rose-200">Rival seleccionado: {getSelectedRivalLineupName()}</p>
                                ) : null}
                                <ul className="mt-3 space-y-2 text-sm leading-7 text-slate-300">
                                  {selectedMatch.preAiAnalysis.individualByPlayer[selectedTacticalPlayerIndex].advice.map((item) => (
                                    <li key={item}>{item}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : (
                              <p className="mt-3 text-sm text-slate-400">Pulsa "Analizar sistemas" y después selecciona un jugador del Caudal en el campo.</p>
                            )}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Análisis táctico IA</h4>
                              <p className="mt-2 text-sm text-slate-400">El sistema compara las dos formaciones previstas y muestra los puntos clave.</p>
                            </div>
                            <button
                              type="button"
                              onClick={runAiAnalysis}
                              className="rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff]"
                            >
                              Analizar sistemas
                            </button>
                          </div>
                          {selectedMatch.preAiAnalysis ? (
                            <div className="mt-6 space-y-4">
                              <div className="grid gap-4 lg:grid-cols-2">
                                {[
                                  { title: 'Lectura general del partido', value: selectedMatch.preAiAnalysis.generalReading },
                                  { title: 'Ventajas para el C.D. Caudal', value: selectedMatch.preAiAnalysis.advantages },
                                  { title: 'Riesgos principales', value: selectedMatch.preAiAnalysis.risks },
                                  { title: 'Cómo atacar al rival', value: selectedMatch.preAiAnalysis.attackPlan },
                                  { title: 'Cómo defender al rival', value: selectedMatch.preAiAnalysis.defendPlan },
                                  { title: 'Transiciones', value: selectedMatch.preAiAnalysis.transitionsPlan },
                                  { title: 'Duelos individuales clave', value: selectedMatch.preAiAnalysis.duelsPlan },
                                  { title: 'Plan de partido recomendado', value: selectedMatch.preAiAnalysis.recommendedPlan },
                                  { title: 'Ajustes si el partido se complica', value: selectedMatch.preAiAnalysis.complicationAdjustments },
                                ].map((group) => (
                                  <div key={group.title} className="rounded-3xl bg-[#0f1e38]/80 p-5">
                                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{group.title}</p>
                                    {Array.isArray(group.value) ? (
                                      <ul className="mt-3 space-y-3 text-sm leading-7 text-slate-300">
                                        {group.value.map((item) => (
                                          <li key={item}>{item}</li>
                                        ))}
                                      </ul>
                                    ) : (
                                      <p className="mt-3 text-sm leading-7 text-slate-300">{group.value || 'Analiza los sistemas y las alineaciones para generar una recomendación concreta.'}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="mt-6 rounded-3xl bg-[#0f1e38]/80 p-5 text-sm text-slate-400">Pulsa "Analizar sistemas" para obtener una previsión automática.</div>
                          )}
                        </div>
                      </div>
                    )}
                  </section>
                ) : matchView === 'estadisticas_partido' ? (
                  <section className="space-y-6">
                    <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                      <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Resumen de marcador</h3>
                      <div className="mt-6 grid items-center gap-6 lg:grid-cols-[1fr_auto_1fr]">
                        <div className="text-center">
                          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-white p-3 shadow-glow">
                            <img src={clubCrest} alt="" className="h-full w-full object-contain" />
                          </div>
                          <p className="mt-3 text-sm font-bold text-white">C.D. Caudal</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Resultado</p>
                          <p className="mt-2 text-6xl font-black text-white">{getStatsScore().home} - {getStatsScore().away}</p>
                        </div>
                        <div className="text-center">
                          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-white/10 p-3 shadow-glow">
                            {selectedMatch.opponentCrest ? <img src={selectedMatch.opponentCrest} alt="" className="h-full w-full object-contain" /> : <span className="text-xl font-black text-white">{selectedMatch.opponent?.slice(0, 2).toUpperCase()}</span>}
                          </div>
                          <p className="mt-3 text-sm font-bold text-white">{selectedMatch.opponent || 'Rival'}</p>
                        </div>
                      </div>
                      <div className="mt-6 grid gap-4 lg:grid-cols-3">
                        <div className="rounded-3xl bg-[#0f1e38]/80 p-5">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Goles Caudal</p>
                          <div className="mt-3 space-y-2 text-sm text-slate-300">
                            {getStatsGoalEvents().filter((event) => event.type === 'Gol a favor').length ? getStatsGoalEvents().filter((event) => event.type === 'Gol a favor').map((event) => (
                              <p key={event.id}>{event.minute}' ⚽ {event.scorer || 'Sin goleador'} · {event.subphase}{event.assistant ? ` · 👟 ${event.assistant}` : ''}</p>
                            )) : <p>Sin goles registrados.</p>}
                          </div>
                        </div>
                        <div className="rounded-3xl bg-[#0f1e38]/80 p-5">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Goles rivales</p>
                          <div className="mt-3 space-y-2 text-sm text-slate-300">
                            {getStatsGoalEvents().filter((event) => event.type === 'Gol en contra').length ? getStatsGoalEvents().filter((event) => event.type === 'Gol en contra').map((event) => (
                              <p key={event.id}>{event.minute}' · {event.phase} · {event.subphase}</p>
                            )) : <p>Sin goles rivales registrados.</p>}
                          </div>
                        </div>
                        <div className="rounded-3xl bg-[#0f1e38]/80 p-5">
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Disciplina y lesiones</p>
                          <div className="mt-3 space-y-2 text-sm text-slate-300">
                            {getStatsCalledPlayers().filter((player) => getStatsPlayerData(player.name).yellow || getStatsPlayerData(player.name).red || getStatsPlayerData(player.name).injured).length ? (
                              getStatsCalledPlayers().filter((player) => getStatsPlayerData(player.name).yellow || getStatsPlayerData(player.name).red || getStatsPlayerData(player.name).injured).map((player) => {
                                const stats = getStatsPlayerData(player.name);
                                return (
                                  <p key={player.id}>
                                    {player.name} {stats.yellow ? `🟨${stats.yellowCount > 1 ? stats.yellowCount : ''}` : ''}{stats.red ? ' 🟥' : ''}{stats.injured ? ' 🚑' : ''}
                                  </p>
                                );
                              })
                            ) : (
                              <p>Sin tarjetas ni lesiones.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Eventos clave</h3>
                          <p className="mt-2 text-sm text-slate-400">Análisis de goles con fase, subfase y mapas visuales.</p>
                        </div>
                        <button type="button" onClick={openGoalAnalysisModal} className="rounded-2xl bg-red-500 px-5 py-3 text-sm font-bold uppercase tracking-[0.14em] text-white">
                          Añadir análisis de gol
                        </button>
                      </div>
                      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {getStatsGoalEvents().length ? getStatsGoalEvents().map((event) => (
                          <div key={event.id} className="rounded-3xl bg-[#0f1e38]/80 p-5">
                            <p className="text-sm font-black text-caudal-electric">{event.minute}' · {event.type}</p>
                            <p className="mt-2 text-sm font-semibold text-white">{event.type === 'Gol a favor' ? event.scorer || 'Sin goleador' : selectedMatch.opponent || 'Rival'}</p>
                            {event.assistant ? <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-500">Asist. {event.assistant}</p> : null}
                            <p className="mt-3 text-sm text-slate-300">{event.phase} · {event.subphase}</p>
                            <p className="mt-1 text-xs text-slate-500">Remate: {normalizePitchZone(event.shotZone)} · Asistencia: {normalizePitchZone(event.assistZone)} · Portería: {event.goalZone}</p>
                          </div>
                        )) : <div className="rounded-3xl bg-[#0f1e38]/80 p-6 text-sm text-slate-400">No hay eventos clave todavía.</div>}
                      </div>
                    </div>

                    <div className="grid gap-6 xl:grid-cols-[1.35fr_0.75fr]">
                      <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Disposición táctica</h3>
                            <p className="mt-2 text-sm text-slate-400">Arrastra convocados al campo y modifica posiciones por sistema.</p>
                          </div>
                          <select value={selectedMatch.statsSystem || '4-4-2'} onChange={(event) => updateSelectedMatchFields({ statsSystem: event.target.value })} className="rounded-2xl border border-white/10 bg-white px-5 py-3 text-sm font-black text-slate-950">
                            {gameSystems.map((system) => <option key={system} value={system}>{system}</option>)}
                          </select>
                        </div>
                        <div className="mt-5">{renderStatsPitch()}</div>
                      </div>
                      <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                        <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Convocados disponibles</h3>
                        <div className="mt-5 max-h-[620px] space-y-3 overflow-y-auto pr-1">
                          {getStatsCalledPlayers().map((player) => {
                            const stats = getStatsPlayerData(player.name);
                            return (
                              <div key={player.id} draggable onDragStart={() => setDraggedPlayer(player)} className={`rounded-3xl px-4 py-3 ${stats.role === 'Titular' ? 'bg-caudal-electric/20 text-white' : 'bg-white/5 text-slate-300'}`}>
                                <div className="flex items-center gap-3">
                                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-sm font-black text-slate-950">{player.number || '-'}</span>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-bold">{player.name}</p>
                                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{stats.role}</p>
                                  </div>
                                  <button type="button" onClick={() => removeStatsCalledPlayer(player.name)} className="rounded-xl bg-red-500/15 px-3 py-2 text-xs font-bold text-red-100">
                                    Borrar
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-5 rounded-3xl border border-dashed border-white/10 bg-black/15 p-4">
                          <h4 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Sin convocar</h4>
                          <div className="mt-3 max-h-[260px] space-y-2 overflow-y-auto pr-1">
                            {players.filter((player) => !getStatsCalledPlayerNames().includes(player.name)).length ? (
                              players.filter((player) => !getStatsCalledPlayerNames().includes(player.name)).map((player) => (
                                <div key={player.id} className="flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-3 text-slate-300">
                                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-xs font-black text-white">{player.number || '-'}</span>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-bold">{player.name}</p>
                                    <p className="text-xs text-slate-500">{player.position}</p>
                                  </div>
                                  <button type="button" onClick={() => addStatsCalledPlayer(player.name)} className="rounded-xl bg-caudal-electric px-3 py-2 text-xs font-black text-slate-950">
                                    Añadir
                                  </button>
                                </div>
                              ))
                            ) : (
                              <p className="rounded-2xl bg-white/5 px-3 py-3 text-sm text-slate-500">No hay jugadores fuera de convocatoria.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                      <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Rendimiento individual</h3>
                      <div className="mt-5 overflow-x-auto">
                        <table className="w-full min-w-[980px] text-left text-sm">
                          <thead className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            <tr>
                              {['Jugador', 'Rol', 'Minutos', 'Cambio por', 'Goles', 'Asistencias', 'Amarilla', 'Roja', 'Lesión', 'Valoración'].map((head) => <th key={head} className="px-3 py-3">{head}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {[...getStatsCalledPlayers()].sort((a, b) => (getStatsPlayerData(a.name).role === 'Titular' ? -1 : 1) - (getStatsPlayerData(b.name).role === 'Titular' ? -1 : 1)).map((player) => {
                              const stats = getStatsPlayerData(player.name);
                              const minutes = Number(stats.minutes || 0);
                              const canReplace = stats.role === 'Titular' && minutes > 0 && minutes < 90;
                              const substituteMinutes = stats.role === 'Suplente' ? getStatsSubstituteMinutes(player.name) : 0;
                              const displayedMinutes = substituteMinutes || stats.minutes;
                              return (
                                <tr key={player.id} className={`border-t border-white/10 ${stats.role === 'Titular' ? 'bg-caudal-electric/10' : 'bg-white/[0.02]'}`}>
                                  <td className="px-3 py-4 font-bold text-white">{player.name}</td>
                                  <td className="px-3 py-4 text-xs uppercase tracking-[0.14em] text-caudal-electric">{stats.role}</td>
                                  <td className="px-3 py-4"><input type="number" min="0" max="90" value={displayedMinutes} onChange={(event) => updateStatsPlayerData(player.name, { minutes: event.target.value, replacementName: Number(event.target.value) >= 90 ? '' : stats.replacementName })} className="w-20 rounded-xl bg-white px-3 py-2 font-bold text-slate-950" /></td>
                                  <td className="px-3 py-4">
                                    <select
                                      value={stats.replacementName}
                                      disabled={!canReplace}
                                      onChange={(event) => updateStatsPlayerData(player.name, { replacementName: event.target.value })}
                                      className="w-52 rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
                                    >
                                      <option value="">{canReplace ? 'Seleccionar suplente' : 'Sin cambio'}</option>
                                      {getStatsReplacementOptions(player.name).map((replacement) => (
                                        <option key={replacement.id} value={replacement.name}>{replacement.name}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="px-3 py-4 text-white">{stats.goals}</td>
                                  <td className="px-3 py-4 text-white">{stats.assists}</td>
                                  <td className="px-3 py-4">
                                    <div className="flex gap-1">
                                      {[1, 2].map((cardNumber) => {
                                        const active = stats.yellowCount >= cardNumber;
                                        return (
                                          <button
                                            key={cardNumber}
                                            type="button"
                                            onClick={() => {
                                              const nextCount = active && stats.yellowCount === cardNumber ? cardNumber - 1 : cardNumber;
                                              updateStatsPlayerData(player.name, { yellowCount: nextCount, yellow: nextCount > 0 });
                                            }}
                                            className={`flex h-7 w-7 items-center justify-center rounded-md border text-[10px] font-black transition ${active ? 'border-yellow-200 bg-yellow-300 text-slate-950 shadow-[0_0_18px_rgba(253,224,71,0.35)]' : 'border-white/20 bg-white/10 text-slate-500 hover:bg-white/15'}`}
                                            title={`${cardNumber} amarilla${cardNumber > 1 ? 's' : ''}`}
                                          >
                                            {cardNumber}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </td>
                                  <td className="px-3 py-4">
                                    <button
                                      type="button"
                                      onClick={() => updateStatsPlayerData(player.name, { red: !stats.red })}
                                      className={`flex h-7 w-7 items-center justify-center rounded-md border text-xs font-black transition ${stats.red ? 'border-red-200 bg-red-500 text-white shadow-[0_0_18px_rgba(239,68,68,0.35)]' : 'border-white/20 bg-white/10 text-slate-500 hover:bg-white/15'}`}
                                      title="Roja"
                                    >
                                      R
                                    </button>
                                  </td>
                                  <td className="px-3 py-4"><button type="button" onClick={() => updateStatsPlayerData(player.name, { injured: !stats.injured })} className={`rounded-xl px-3 py-2 text-sm font-black ${stats.injured ? 'bg-red-100 text-red-700' : 'bg-white/10 text-slate-300'}`}>+</button></td>
                                  <td className="px-3 py-4">
                                    <select
                                      value={stats.rating}
                                      onChange={(event) => updateStatsPlayerData(player.name, { rating: event.target.value })}
                                      className={`w-16 rounded-xl px-2 py-2 text-center text-sm font-black outline-none transition ${stats.rating ? 'bg-emerald-300 text-slate-950' : 'bg-emerald-50 text-slate-400'}`}
                                    >
                                      <option value="">-</option>
                                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rating) => (
                                        <option key={rating} value={rating}>{rating}</option>
                                      ))}
                                    </select>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </section>
                ) : (
                  <section className="space-y-6">
                    <div className="grid gap-6 xl:grid-cols-[1.45fr_0.85fr]">
                      <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">POST partido</p>
                            <h3 className="mt-2 text-2xl font-semibold text-white">Vídeo y análisis de partido</h3>
                            <p className="mt-2 text-sm text-slate-400">Revisa acciones, salta a eventos y compara el plan con lo que ocurrió.</p>
                          </div>
                          <label className="w-full space-y-2 text-sm text-slate-300 lg:max-w-md">
                            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Enlace YouTube</span>
                            <input
                              value={selectedMatch.postVideoLink || ''}
                              onChange={(event) => updateSelectedMatchFields({ postVideoLink: event.target.value })}
                              placeholder="https://www.youtube.com/watch?v=..."
                              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500"
                            />
                          </label>
                        </div>
                        <div className="mt-6 rounded-3xl bg-[#0f1e38]/80 p-3">
                          {getYouTubeEmbedUrl(selectedMatch.postVideoLink, postVideoStartSeconds) ? (
                            <div className="relative overflow-hidden rounded-3xl bg-black shadow-inner" style={{ paddingTop: '56.25%' }}>
                              <iframe
                                key={`${selectedMatch.postVideoLink}-${postVideoStartSeconds}`}
                                src={getYouTubeEmbedUrl(selectedMatch.postVideoLink, postVideoStartSeconds)}
                                title="Post partido video"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                                className="absolute inset-0 h-full w-full"
                              />
                            </div>
                          ) : (
                            <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-dashed border-white/10 bg-black/20 text-center text-sm text-slate-400">
                              Sin vídeo asignado
                            </div>
                          )}
                        </div>
                      </div>

                      <aside className="space-y-6">
                        <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                          <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Botonera editable</h4>
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            {eventTypes.map((eventType) => (
                              <button
                                key={eventType.id}
                                type="button"
                                onClick={() => {
                                  setSelectedEventType(eventType.name);
                                  handleEventDraftChange('type', eventType.name);
                                  handleEventDraftChange('minute', postCurrentMinute);
                                }}
                                className={`rounded-3xl px-4 py-4 text-sm font-semibold transition ${eventButtonClass(eventType.color)} ${selectedEventType === eventType.name ? 'ring-2 ring-caudal-electric' : ''}`}>
                                {eventType.name}
                              </button>
                            ))}
                          </div>
                          <div className="mt-5 space-y-3">
                            {eventTypes.map((eventType) => (
                              <div key={`edit-${eventType.id}`} className="grid gap-2 rounded-2xl bg-white/5 p-3 sm:grid-cols-[1fr_110px_auto]">
                                <input
                                  value={eventType.name}
                                  onChange={(event) => updateEventType(eventType.id, { name: event.target.value })}
                                  className="min-w-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white"
                                />
                                <select
                                  value={eventType.color}
                                  onChange={(event) => updateEventType(eventType.id, { color: event.target.value })}
                                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white"
                                >
                                  {eventColorOptions.map((color) => (
                                    <option key={color} value={color}>{color}</option>
                                  ))}
                                </select>
                                <button type="button" onClick={() => removeEventType(eventType.id)} className="rounded-xl bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-100">
                                  Eliminar
                                </button>
                              </div>
                            ))}
                            <div className="grid gap-2 rounded-2xl bg-white/5 p-3 sm:grid-cols-[1fr_110px_auto]">
                              <input
                                value={newEventTypeDraft.name}
                                onChange={(event) => setNewEventTypeDraft((prev) => ({ ...prev, name: event.target.value }))}
                                placeholder="Nuevo evento"
                                className="min-w-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-slate-500"
                              />
                              <select
                                value={newEventTypeDraft.color}
                                onChange={(event) => setNewEventTypeDraft((prev) => ({ ...prev, color: event.target.value }))}
                                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white"
                              >
                                {eventColorOptions.map((color) => (
                                  <option key={color} value={color}>{color}</option>
                                ))}
                              </select>
                              <button type="button" onClick={addEventType} className="rounded-xl bg-caudal-electric px-3 py-2 text-xs font-semibold text-slate-950">
                                Añadir
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                          <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Registrar evento</h4>
                          <div className="mt-5 space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                              <label className="space-y-2 text-sm text-slate-300">
                                <span>Minuto actual</span>
                                <input
                                  value={postCurrentMinute}
                                  onChange={(event) => {
                                    setPostCurrentMinute(event.target.value);
                                    handleEventDraftChange('minute', event.target.value);
                                  }}
                                  placeholder="Ej. 72"
                                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
                                />
                              </label>
                              <label className="space-y-2 text-sm text-slate-300">
                                <span>Jugador</span>
                                <input
                                  value={newEventDraft.player}
                                  onChange={(event) => handleEventDraftChange('player', event.target.value)}
                                  placeholder="Opcional"
                                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
                                />
                              </label>
                            </div>
                            <label className="space-y-2 text-sm text-slate-300">
                              <span>Descripción breve</span>
                              <textarea
                                value={newEventDraft.description}
                                onChange={(event) => handleEventDraftChange('description', event.target.value)}
                                placeholder="Qué ocurrió y por qué importa..."
                                className="min-h-[110px] w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white placeholder:text-slate-500"
                              />
                            </label>
                            <button type="button" onClick={addNewEvent} className="w-full rounded-3xl bg-caudal-electric px-5 py-4 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff]">
                              Guardar evento
                            </button>
                          </div>
                        </div>
                      </aside>
                    </div>

                    <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Historial de eventos</h4>
                          <p className="mt-2 text-sm text-slate-400">Haz clic en un evento para saltar el vídeo a ese minuto.</p>
                        </div>
                        <span className="rounded-2xl bg-white/10 px-3 py-2 text-xs uppercase tracking-[0.18em] text-slate-300">{(selectedMatch.events || []).length} eventos</span>
                      </div>
                      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {(selectedMatch.events || []).length > 0 ? (
                          [...(selectedMatch.events || [])].reverse().map((event) => (
                            <button key={event.id} type="button" onClick={() => seekPostVideoToEvent(event)} className="rounded-3xl bg-[#0f1e38]/80 p-4 text-left transition hover:bg-white/10">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-white">{event.type} - {event.minute}'</p>
                                  <p className="text-sm text-slate-400">{event.player || 'Sin jugador definido'}</p>
                                </div>
                                <span className={`rounded-2xl px-3 py-2 text-xs uppercase tracking-[0.18em] ${eventButtonClass(event.type)}`}>{event.minute}'</span>
                              </div>
                              <p className="mt-3 text-sm leading-7 text-slate-300">{event.description}</p>
                            </button>
                          ))
                        ) : (
                          <div className="rounded-3xl bg-[#0f1e38]/80 p-6 text-sm text-slate-400">No se han registrado eventos postpartido todavía.</div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                      <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Comparativa PRE vs POST</h4>
                      <div className="mt-5 grid gap-4 lg:grid-cols-2">
                        {[
                          { label: 'PRE - Plan con balón', value: selectedMatch.planConBalon },
                          { label: 'PRE - Plan sin balón', value: selectedMatch.planSinBalon },
                          { label: 'PRE - Transiciones', value: selectedMatch.planTransiciones },
                          { label: 'PRE - Claves individuales', value: selectedMatch.preKeyMatchups || selectedMatch.planClave },
                          { label: 'PRE - Objetivo', value: selectedMatch.planObjetivo },
                        ].map((item) => (
                          <div key={item.label} className="rounded-3xl bg-[#0f1e38]/80 p-5">
                            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                            <p className="mt-3 text-sm leading-7 text-slate-300">{item.value || 'Sin dato PRE registrado.'}</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-5 grid gap-4 lg:grid-cols-2">
                        {[
                          { label: 'Qué ocurrió realmente', field: 'postReality' },
                          { label: 'Qué se cumplió', field: 'postFulfilled' },
                          { label: 'Qué no se cumplió', field: 'postNotFulfilled' },
                          { label: 'Por qué', field: 'postWhy' },
                          { label: 'Ajuste para próximos partidos', field: 'postNextAdjustment' },
                          { label: 'Notas POST', field: 'postNotes' },
                        ].map((item) => (
                          <label key={item.field} className="space-y-2 text-sm text-slate-300">
                            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">{item.label}</span>
                            <textarea
                              value={selectedMatch[item.field] || ''}
                              onChange={(event) => updateSelectedMatchFields({ [item.field]: event.target.value })}
                              className="min-h-[110px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500"
                            />
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Análisis IA Post partido</h4>
                          <p className="mt-2 text-sm text-slate-400">Placeholder estructurado usando PRE, eventos, resultado y notas POST.</p>
                        </div>
                        <button type="button" onClick={runPostAiAnalysis} className="rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff]">
                          Analizar partido con IA
                        </button>
                      </div>
                      {selectedMatch.postAiAnalysis ? (
                        <div className="mt-5 grid gap-4 lg:grid-cols-2">
                          {[
                            { title: 'Qué funcionó', value: selectedMatch.postAiAnalysis.worked },
                            { title: 'Qué no funcionó', value: selectedMatch.postAiAnalysis.notWorked },
                            { title: 'Por qué', value: selectedMatch.postAiAnalysis.why },
                            { title: 'Qué repetir', value: selectedMatch.postAiAnalysis.repeat },
                            { title: 'Qué corregir', value: selectedMatch.postAiAnalysis.correct },
                            { title: 'Qué entrenar esta semana', value: selectedMatch.postAiAnalysis.train },
                            { title: 'Jugadores o zonas a revisar', value: selectedMatch.postAiAnalysis.review },
                          ].map((item) => (
                            <div key={item.title} className="rounded-3xl bg-[#0f1e38]/80 p-5">
                              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{item.title}</p>
                              {Array.isArray(item.value) ? (
                                <ul className="mt-3 space-y-2 text-sm leading-7 text-slate-300">
                                  {item.value.map((line) => <li key={line}>{line}</li>)}
                                </ul>
                              ) : (
                                <p className="mt-3 text-sm leading-7 text-slate-300">{item.value}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-5 rounded-3xl bg-[#0f1e38]/80 p-5 text-sm text-slate-400">Pulsa "Analizar partido con IA" para generar una lectura postpartido estructurada.</div>
                      )}
                    </div>

                    <div className="rounded-3xl border border-white/5 bg-[#091428]/80 p-6 shadow-glow">
                      <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-white">Conclusiones finales</h4>
                      <div className="mt-5 grid gap-4 lg:grid-cols-2">
                        {[
                          { label: 'Qué repetir', field: 'postRepeat' },
                          { label: 'Qué mejorar', field: 'postImprove' },
                          { label: 'Qué entrenar esta semana', field: 'postTrainWeek' },
                          { label: 'Observaciones individuales', field: 'postIndividualObservations' },
                        ].map((item) => (
                          <label key={item.field} className="space-y-2 text-sm text-slate-300">
                            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">{item.label}</span>
                            <textarea
                              value={selectedMatch[item.field] || ''}
                              onChange={(event) => updateSelectedMatchFields({ [item.field]: event.target.value })}
                              className="min-h-[120px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500"
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  </section>
                )}
              </section>
            ) : (
              <section className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-8 text-sm text-slate-400">Partido no encontrado.</section>
            )}
          </main>
        ) : null}
      </div>

      {isCanvaPreviewOpen && selectedMatch && getCanvaEmbedUrl(selectedMatch.preCanvaLink) ? (
        <div className="fixed inset-0 z-50 bg-black/80 p-3 backdrop-blur-sm sm:p-6">
          <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-caudal-950 shadow-glow">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-400">PRE partido</p>
                <h3 className="mt-1 text-lg font-semibold text-white">Previsualización informe Canva</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCanvaPreviewOpen(false)}
                className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15"
              >
                Cerrar
              </button>
            </div>
            <iframe
              title="Informe Canva ampliado"
              src={getCanvaEmbedUrl(selectedMatch.preCanvaLink)}
              className="min-h-0 flex-1 bg-white"
              allowFullScreen
            />
          </div>
        </div>
      ) : null}

      {isGoalAnalysisOpen && selectedMatch ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-6">
          <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-white/10 bg-[#111b2a] shadow-glow">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500 text-xl font-black text-white">+</span>
                <h3 className="text-lg font-black uppercase tracking-[0.18em] text-white">Añadir análisis del gol</h3>
              </div>
              <button type="button" onClick={() => setIsGoalAnalysisOpen(false)} className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-slate-200">Cerrar</button>
            </div>
            <div className="space-y-6 px-6 py-6">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="grid grid-cols-2 rounded-3xl border border-white/10 bg-white/5 p-1">
                  {['Gol a favor', 'Gol en contra'].map((type) => (
                    <button key={type} type="button" onClick={() => updateGoalAnalysisDraft('type', type)} className={`rounded-2xl px-4 py-3 text-sm font-bold uppercase tracking-[0.12em] ${goalAnalysisDraft.type === type ? 'bg-emerald-500 text-white' : 'text-slate-400'}`}>{type}</button>
                  ))}
                </div>
                <div className="grid grid-cols-2 rounded-3xl border border-white/10 bg-white/5 p-1">
                  {['1ª parte', '2ª parte'].map((half) => (
                    <button key={half} type="button" onClick={() => updateGoalAnalysisDraft('half', half)} className={`rounded-2xl px-4 py-3 text-sm font-bold uppercase tracking-[0.12em] ${goalAnalysisDraft.half === half ? 'bg-caudal-electric text-slate-950' : 'text-slate-400'}`}>{half}</button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Minuto</span>
                  <input value={goalAnalysisDraft.minute} onChange={(event) => updateGoalAnalysisDraft('minute', event.target.value)} placeholder="Min" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
                </label>
                {goalAnalysisDraft.type === 'Gol a favor' ? (
                  <>
                    <label className="space-y-2 text-sm text-slate-300">
                      <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Goleador</span>
                      <select value={goalAnalysisDraft.scorer} onChange={(event) => updateGoalAnalysisDraft('scorer', event.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
                        <option value="">Seleccionar...</option>
                        {players.map((player) => <option key={player.id} value={player.name}>{player.name}</option>)}
                      </select>
                    </label>
                    <label className="space-y-2 text-sm text-slate-300">
                      <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Asistente</span>
                      <select value={goalAnalysisDraft.assistant} onChange={(event) => updateGoalAnalysisDraft('assistant', event.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
                        <option value="">Sin asistencia</option>
                        {players.map((player) => <option key={player.id} value={player.name}>{player.name}</option>)}
                      </select>
                    </label>
                  </>
                ) : null}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Fase del juego</span>
                  <select value={goalAnalysisDraft.phase} onChange={(event) => updateGoalAnalysisDraft('phase', event.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
                    {Object.keys(goalPhaseOptions).map((phase) => <option key={phase} value={phase}>{phase}</option>)}
                  </select>
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Subfase</span>
                  <select value={goalAnalysisDraft.subphase} onChange={(event) => updateGoalAnalysisDraft('subphase', event.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white">
                    {(goalPhaseOptions[goalAnalysisDraft.phase] || []).map((subphase) => <option key={subphase} value={subphase}>{subphase}</option>)}
                  </select>
                </label>
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <div>
                  <p className="mb-3 text-center text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Zona de remate</p>
                  {renderZoneGrid({ value: goalAnalysisDraft.shotZone, onChange: (zone) => updateGoalAnalysisDraft('shotZone', zone) })}
                </div>
                <div>
                  <p className="mb-3 text-center text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Zona de asistencia</p>
                  {renderZoneGrid({ value: goalAnalysisDraft.assistZone, onChange: (zone) => updateGoalAnalysisDraft('assistZone', zone) })}
                </div>
                <div>
                  <p className="mb-3 text-center text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Zona portería</p>
                  {renderZoneGrid({ value: goalAnalysisDraft.goalZone, onChange: (zone) => updateGoalAnalysisDraft('goalZone', zone), zones: goalZoneOptions, goal: true })}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Superficie de contacto</p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {['Pie derecho', 'Pie izquierdo', 'Cabeza', 'Otro'].map((contact) => (
                      <button key={contact} type="button" onClick={() => updateGoalAnalysisDraft('contact', contact)} className={`rounded-2xl px-4 py-3 text-sm font-bold ${goalAnalysisDraft.contact === contact ? 'bg-caudal-electric text-slate-950' : 'bg-white/10 text-slate-300'}`}>{contact}</button>
                    ))}
                  </div>
                </div>
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-500">URL del vídeo opcional</span>
                  <input value={goalAnalysisDraft.videoUrl} onChange={(event) => updateGoalAnalysisDraft('videoUrl', event.target.value)} placeholder="https://..." className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
                </label>
              </div>

              <button type="button" onClick={saveGoalAnalysisEvent} className="w-full rounded-3xl bg-caudal-electric px-5 py-4 text-sm font-black uppercase tracking-[0.16em] text-slate-950">
                Guardar análisis de gol
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isPanelOpen ? (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/50 px-4 py-6 backdrop-blur-sm sm:px-6">
          <div className="mx-auto flex h-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-caudal-950 shadow-glow">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-slate-400">{editingId ? 'Editar jugador' : 'Nuevo jugador'}</p>
                <h3 className="mt-2 text-xl font-semibold text-white">Formulario de jugador</h3>
              </div>
              <button onClick={closeForm} className="rounded-full bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10">
                Cerrar
              </button>
            </div>
            <form onSubmit={handleSubmit} className="min-h-0 space-y-5 overflow-y-auto px-6 py-6 sm:px-8">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Nombre completo</span>
                  <input
                    required
                    name="name"
                    value={formState.name}
                    onChange={handleChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner placeholder:text-slate-500"
                    placeholder="Ej. Pablo Núñez"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Fecha de nacimiento</span>
                  <input
                    required
                    type="date"
                    name="dob"
                    value={formState.dob}
                    onChange={handleChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Dorsal</span>
                  <input
                    required
                    type="number"
                    name="number"
                    min="1"
                    value={formState.number}
                    onChange={handleChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner"
                    placeholder="7"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Posición</span>
                  <select
                    required
                    name="position"
                    value={formState.position}
                    onChange={handleChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner"
                  >
                    {positions.map((position) => (
                      <option key={position} value={position}>
                        {position}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Pierna hábil</span>
                  <select
                    required
                    name="foot"
                    value={formState.foot}
                    onChange={handleChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner"
                  >
                    {footOptions.map((foot) => (
                      <option key={foot} value={foot}>
                        {foot}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="space-y-2 text-sm text-slate-300">
                <span>URL de imagen</span>
                <input
                  name="image"
                  type="url"
                  value={formState.image}
                  onChange={handleChange}
                  className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner"
                  placeholder="https://..."
                />
              </label>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={closeForm}
                  className="inline-flex items-center justify-center rounded-3xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-2xl bg-caudal-electric px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff]"
                >
                  Guardar jugador
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isTeamPanelOpen ? (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/50 px-4 py-6 backdrop-blur-sm sm:px-6">
          <div className="mx-auto flex h-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-caudal-950 shadow-glow">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-slate-400">{editingTeamId ? 'Editar equipo' : 'Nuevo equipo'}</p>
                <h3 className="mt-2 text-xl font-semibold text-white">Ficha del rival</h3>
              </div>
              <button onClick={closeTeamForm} className="rounded-full bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10">
                Cerrar
              </button>
            </div>

            <form onSubmit={handleTeamSubmit} className="min-h-0 space-y-5 overflow-y-auto px-6 py-6 sm:px-8">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Enlace del equipo</span>
                  <input
                    required
                    name="sourceUrl"
                    value={teamFormState.sourceUrl}
                    onChange={handleTeamChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner placeholder:text-slate-500"
                    placeholder="https://es.besoccer.com/equipo/plantilla/..."
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Nombre del equipo</span>
                  <input
                    name="name"
                    value={teamFormState.name}
                    onChange={handleTeamChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner placeholder:text-slate-500"
                    placeholder="Se rellena al importar"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>URL escudo</span>
                  <input
                    name="crest"
                    value={teamFormState.crest}
                    onChange={handleTeamChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner placeholder:text-slate-500"
                    placeholder="Se rellena al importar"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Estadio</span>
                  <input
                    name="stadium"
                    value={teamFormState.stadium}
                    onChange={handleTeamChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner placeholder:text-slate-500"
                    placeholder="Ej. El Bayu"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Color camiseta</span>
                  <input
                    name="kitColor"
                    type="color"
                    value={teamFormState.kitColor}
                    onChange={handleTeamChange}
                    className="h-[46px] w-full rounded-3xl border border-white/10 bg-white/5 px-3 py-2 shadow-inner"
                  />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span>Sistema habitual</span>
                  <select
                    required
                    name="system"
                    value={teamFormState.system}
                    onChange={handleTeamChange}
                    className="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-inner"
                  >
                    {gameSystems.map((system) => (
                      <option key={system} value={system}>
                        {system}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex flex-col gap-2 rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-400">
                  El importador intenta rellenar nombre, escudo, jugadores y fotos desde el enlace.
                </p>
                <button
                  type="button"
                  onClick={handleImportSquad}
                  className="inline-flex items-center justify-center rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/25"
                >
                  Importar plantilla
                </button>
              </div>
              {importStatus ? <p className="text-sm text-caudal-electric">{importStatus}</p> : null}

              <section className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-semibold text-slate-200">Plantilla</p>
                  <button
                    type="button"
                    onClick={handleAddTeamPlayer}
                    className="inline-flex w-fit items-center justify-center rounded-2xl bg-white/15 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/25"
                  >
                    Añadir jugador
                  </button>
                </div>

                <div className="space-y-3">
                  {teamFormState.squad.length > 0 ? (
                    teamFormState.squad.map((entry, index) => {
                      const player = normalizeSquadEntry(entry);
                      return (
                        <div key={`${player.id}-${index}`} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                          <div className="grid gap-3">
                            <div className="grid gap-3 md:grid-cols-[1fr_1fr_0.45fr]">
                              <input
                                value={player.name}
                                onChange={(event) => handleTeamPlayerChange(index, 'name', event.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white shadow-inner placeholder:text-slate-500"
                                placeholder="Nombre"
                              />
                              <input
                                value={player.image}
                                onChange={(event) => handleTeamPlayerChange(index, 'image', event.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white shadow-inner placeholder:text-slate-500"
                                placeholder="URL foto"
                              />
                              <input
                                value={player.number}
                                onChange={(event) => handleTeamPlayerChange(index, 'number', event.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white shadow-inner placeholder:text-slate-500"
                                placeholder="Dorsal"
                              />
                            </div>
                            <div className="grid gap-3 md:grid-cols-[1fr_0.45fr_0.7fr_auto]">
                              <select
                                value={player.position}
                                onChange={(event) => handleTeamPlayerChange(index, 'position', event.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white shadow-inner"
                              >
                                <option value="">Posición</option>
                                {positions.map((position) => (
                                  <option key={position} value={position}>
                                    {position}
                                  </option>
                                ))}
                              </select>
                              <input
                                value={player.age}
                                onChange={(event) => handleTeamPlayerChange(index, 'age', event.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white shadow-inner placeholder:text-slate-500"
                                placeholder="Edad"
                              />
                              <select
                                value={player.role}
                                onChange={(event) => handleTeamPlayerChange(index, 'role', event.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white shadow-inner"
                              >
                                <option value="Titular">Titular</option>
                                <option value="Reserva">Reserva</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => handleRemoveTeamPlayer(index)}
                                className="rounded-2xl bg-red-500/15 px-3 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/25"
                              >
                                Quitar
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <label className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-sm text-slate-200">
                              <input
                                type="checkbox"
                                checked={player.isKey}
                                onChange={(event) => handleTeamPlayerChange(index, 'isKey', event.target.checked)}
                                className="h-4 w-4 accent-[#4f8cff]"
                              />
                              Destacado
                              </label>
                              <label className="inline-flex items-center gap-2 rounded-2xl bg-yellow-300/10 px-3 py-2 text-sm text-yellow-100">
                              <input
                                type="checkbox"
                                checked={player.yellowRisk}
                                onChange={(event) => handleTeamPlayerChange(index, 'yellowRisk', event.target.checked)}
                                className="h-4 w-4 accent-yellow-300"
                              />
                              Amarilla
                              </label>
                              <label className="inline-flex items-center gap-2 rounded-2xl bg-red-500/10 px-3 py-2 text-sm text-red-100">
                              <input
                                type="checkbox"
                                checked={player.suspended}
                                onChange={(event) => handleTeamPlayerChange(index, 'suspended', event.target.checked)}
                                className="h-4 w-4 accent-red-500"
                              />
                              Roja
                              </label>
                              <label className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-3 py-2 text-sm text-slate-100">
                              <input
                                type="checkbox"
                                checked={player.injured}
                                onChange={(event) => handleTeamPlayerChange(index, 'injured', event.target.checked)}
                                className="h-4 w-4 accent-red-500"
                              />
                              Cruz
                              </label>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-3xl border border-dashed border-white/10 px-5 py-6 text-sm text-slate-400">
                      Importa desde el enlace o añade jugadores manualmente.
                    </div>
                  )}
                </div>
              </section>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={closeTeamForm}
                  className="inline-flex items-center justify-center rounded-3xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-2xl bg-caudal-electric px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#7aacff]"
                >
                  Guardar equipo
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isMatchPanelOpen ? (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/50 px-4 py-6 backdrop-blur-sm sm:px-6">
          <div className="mx-auto flex h-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-caudal-950 shadow-glow">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
              <div>
                <h3 className="text-xl font-black uppercase tracking-[0.18em] text-white">{editingMatchId ? 'Editar partido' : 'Nuevo partido'}</h3>
              </div>
              <button onClick={closeMatchForm} className="text-3xl leading-none text-slate-500 hover:text-white">
                ×
              </button>
            </div>

            <form onSubmit={handleMatchSubmit} className="min-h-0 space-y-5 overflow-y-auto px-6 py-6 sm:px-8">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Rival</span>
                  <input
                    required
                    list="opponent-teams"
                    name="opponent"
                    value={matchFormState.opponent}
                    onChange={handleMatchChange}
                    placeholder="Escribe o selecciona..."
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500"
                  />
                  <datalist id="opponent-teams">
                    {teams.map((team) => (
                      <option key={team.id} value={cleanTeamDisplayName(team.name)} />
                    ))}
                  </datalist>
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Competición</span>
                  <select name="type" value={matchFormState.type} onChange={handleMatchChange} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white">
                    {matchTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Jornada</span>
                  <input name="round" value={matchFormState.round} onChange={handleMatchChange} placeholder="0" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Fecha</span>
                  <input type="date" name="date" value={matchFormState.date} onChange={handleMatchChange} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white" />
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Condición</span>
                  <select name="isHome" value={matchFormState.isHome ? 'true' : 'false'} onChange={(event) => setMatchFormState((prev) => ({ ...prev, isHome: event.target.value === 'true' }))} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white">
                    <option value="true">Local</option>
                    <option value="false">Visitante</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm text-slate-300">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Jugado</span>
                  <span className="flex h-[46px] items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setMatchFormState((prev) => ({ ...prev, status: prev.status === 'Finalizado' ? 'Previa' : 'Finalizado' }))}
                      className={`relative h-7 w-14 rounded-full transition ${matchFormState.status === 'Finalizado' ? 'bg-caudal-electric' : 'bg-white/15'}`}
                    >
                      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${matchFormState.status === 'Finalizado' ? 'left-8' : 'left-1'}`} />
                    </button>
                    <span className="text-xs font-bold uppercase text-slate-500">{matchFormState.status === 'Finalizado' ? 'Sí' : 'No'}</span>
                  </span>
                </label>
              </div>

              <label className="space-y-2 text-sm text-slate-300">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Estadio</span>
                <input name="stadium" value={matchFormState.stadium} onChange={handleMatchChange} placeholder="Ej. Hermanos Antuña" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white" />
              </label>

              <div className="flex justify-end gap-3">
                <button type="button" onClick={closeMatchForm} className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200">Cancelar</button>
                <button type="submit" className="rounded-2xl bg-caudal-electric px-6 py-3 text-sm font-semibold text-slate-950">Guardar encuentro</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
