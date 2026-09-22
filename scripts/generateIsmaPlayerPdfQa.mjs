import fs from 'node:fs/promises';
import path from 'node:path';
import { buildPlayerProfilePrintReport } from '../src/utils/playerProfilePrintReport.js';
import { createPlayerProfilePdf } from '../src/utils/playerProfilePdfExport.js';

const outputDirectory = path.resolve('artifacts/player-profile-pdf-finalization-qa');
await fs.mkdir(outputDirectory, { recursive: true });

const goalZones = [
  'Alta izquierda', 'Alta centro', 'Alta derecha',
  'Media izquierda', 'Media centro', 'Media derecha',
  'Baja izquierda', 'Baja centro', 'Baja derecha',
].map((label, index) => ({ value: `goal-zone-${index}`, label, count: index === 1 ? 2 : 0 }));

const pitchZones = Array.from({ length: 9 }, (_, index) => ({
  value: `pitch-zone-${index}`,
  label: `Zona ${index + 1}`,
  count: index === 1 ? 2 : 0,
}));

const goalUrl = 'https://video.example/isma-ceares-goal?t=4680';
const assistUrl = 'https://video.example/isma-ceares-assist?t=4860';
const secondGoalUrl = 'https://video.example/isma-goal?t=3240';
const opponents = [
  ["L'Entregu CF", '23/08/2026', 'Copa RFEF'],
  ['CD Praviano', '30/08/2026', 'Copa RFEF'],
  ['Marino de Luanco', '02/09/2026', 'Copa RFEF'],
  ['CD Lealtad', '06/09/2026', 'Copa RFEF'],
  ['Astur CF', '08/09/2026', 'Copa RFEF'],
  ['Salamanca CF UDS', '09/09/2026', 'Copa RFEF'],
  ['Unión Club Ceares', '13/09/2026', 'Liga'],
  ['CD Covadonga', '20/09/2026', 'Liga'],
];

const positionMatches = opponents.map(([opponent], index) => ({
  matchId: `isma-${index + 1}`,
  opponent,
  segments: [{
    matchId: `isma-${index + 1}`,
    playerId: 'isma-cerro',
    fromMinute: 0,
    toMinute: 90,
    minutes: 90,
    position: 'Extremo izquierdo',
    system: index === 6 ? '4-4-2' : '4-2-3-1',
    identified: true,
  }],
}));

const history = opponents.map(([opponent, date, competition], index) => ({
  id: `isma-${index + 1}`,
  date,
  opponent,
  result: index === 6 ? '1-0' : '1-1',
  outcome: index === 6 ? 'V' : 'E',
  competition,
  venue: index % 2 ? 'V' : 'L',
  role: 'Titular',
  minutes: "90'",
  goals: index === 4 || index === 6 ? 1 : '-',
  assists: index === 6 ? 1 : '-',
  cards: '-',
  injury: '-',
  goalLinks: index === 6 ? [goalUrl] : index === 4 ? [secondGoalUrl] : [],
  assistLinks: index === 6 ? [assistUrl] : [],
}));

const baseSource = {
  identity: {
    name: 'Isma Cerro',
    number: 10,
    position: 'Extremo izquierdo',
    age: '',
    foot: 'Derecho',
    team: 'C.D. Caudal de Mieres',
    season: '2026/2027',
  },
  filters: { competition: 'Todas las competiciones', venue: 'Local + visitante' },
  seasonSummary: {
    played: 8, starts: 8, minutes: 720, minutesPerMatch: 90,
    starterPercentage: 100, minutesPlayedPercentage: 100, possibleMinutes: 720,
    goals: 2, assists: 1, goalContributions: 3, yellow: 0, red: 0, injuries: 0, benchEntries: 0,
  },
  competitionBreakdown: [
    { key: 'copa_rfef', label: 'Copa RFEF', played: 6, starts: 6, minutes: 540, goals: 1, assists: 0 },
    { key: 'league', label: 'Liga', played: 2, starts: 2, minutes: 180, goals: 1, assists: 1 },
  ],
  positionUsage: {
    positions: [{ position: 'Extremo izquierdo', minutes: 720, percentage: 100 }],
    totalMinutes: 720, determinedMinutes: 720, identifiedMinutes: 720,
    unknownMinutes: 0, unidentifiedMinutes: 0, valid: true, matches: positionMatches,
  },
  production: { goalsPer90: '0.25', assistsPer90: '0.13', goalContributionsPer90: '0.38', goalContributions: 3 },
  influenceMaps: [
    { key: 'all', label: 'Todos', zones: pitchZones.map((zone) => ({ ...zone, count: zone.count + (zone.value === 'pitch-zone-4' ? 1 : 0) })) },
    { key: 'goals', label: 'Goles', zones: pitchZones },
    { key: 'assists', label: 'Asistencias', zones: pitchZones.map((zone) => ({ ...zone, count: zone.value === 'pitch-zone-4' ? 1 : 0 })) },
  ],
  goalAnalysis: {
    bodyParts: { values: [{ label: 'Pie derecho', count: 2 }], known: 2, missing: 0, total: 2 },
    types: { phases: [{ label: 'ABP', count: 2 }], known: 2, missing: 0, total: 2 },
    target: { zones: goalZones, known: 2, missing: 0, total: 2 },
  },
  society: [{ name: 'Compañero', given: 1, received: 0 }],
  actions: [
    { id: 'isma-ceares-goal', type: 'Gol', minute: 78, opponent: 'Unión Club Ceares', url: goalUrl },
    { id: 'isma-ceares-assist', type: 'Asistencia', minute: 81, opponent: 'Unión Club Ceares', url: assistUrl },
    { id: 'isma-second-goal', type: 'Gol', minute: 54, opponent: 'Astur CF', url: secondGoalUrl },
  ],
  history,
};

const writeQa = async (filename, source) => {
  const report = buildPlayerProfilePrintReport(source);
  const result = await createPlayerProfilePdf({ report, fetchImpl: null });
  const pdfPath = path.join(outputDirectory, filename);
  await fs.writeFile(pdfPath, Buffer.from(result.arrayBuffer));
  return { pdfPath, report, result };
};

const isma = await writeQa('isma-cerro-finalizacion.pdf', baseSource);
const multipleCategories = await writeQa('finalizacion-varias-categorias.pdf', {
  ...baseSource,
  identity: { ...baseSource.identity, name: 'QA varias categorías' },
  seasonSummary: { ...baseSource.seasonSummary, goals: 15, goalContributions: 16 },
  production: { ...baseSource.production, goalsPer90: '1.88', goalContributionsPer90: '2.00', goalContributions: 16 },
  goalAnalysis: {
    ...baseSource.goalAnalysis,
    bodyParts: {
      values: [
        { label: 'Pie derecho', count: 12 },
        { label: 'Cabeza en acción prolongada', count: 2 },
        { label: 'Pie izquierdo', count: 1 },
      ],
      known: 15, missing: 0, total: 15,
    },
    types: {
      phases: [
        { label: 'ABP', count: 9 },
        { label: 'Juego combinativo', count: 5 },
        { label: 'Transición ofensiva', count: 1 },
      ],
      known: 15, missing: 0, total: 15,
    },
    target: { ...baseSource.goalAnalysis.target, total: 15 },
  },
});

const summarize = ({ pdfPath, report, result }) => ({
  pdfPath,
  pages: result.pages,
  pageSections: result.pageSections,
  sectionPlan: result.presentationAudit.sectionPlan,
  linkAudit: result.audit,
  bodyParts: report.goalAnalysis.bodyParts,
  goalTypes: report.goalAnalysis.types,
  hasStandaloneVideoSection: result.pageSections.some((section) => /vídeo/i.test(section))
    || result.presentationAudit.sectionPlan.some((section) => section.key === 'videos'),
});

const audit = {
  generatedAt: new Date().toISOString(),
  fixtureBasis: 'Caso visual solicitado: Isma Cerro, 2 goles con pie derecho, 2 goles ABP y enlaces de gol/asistencia en la fila de Ceares.',
  isma: summarize(isma),
  multipleCategories: summarize(multipleCategories),
};
await fs.writeFile(path.join(outputDirectory, 'audit.json'), `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify(audit, null, 2));
