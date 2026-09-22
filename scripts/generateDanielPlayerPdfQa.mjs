import fs from 'node:fs/promises';
import path from 'node:path';
import { buildPlayerProfilePrintReport } from '../src/utils/playerProfilePrintReport.js';
import { createPlayerProfilePdf } from '../src/utils/playerProfilePdfExport.js';
import { resolveOpponentTeamIdentity } from '../src/utils/opponentTeamIdentity.js';

const outputDirectory = path.resolve('artifacts/player-profile-pdf-position-system-qa');
await fs.mkdir(outputDirectory, { recursive: true });
const crestBytes = await fs.readFile(path.resolve('public/pwa-192x192.png'));
const canonicalCrest = `data:image/png;base64,${crestBytes.toString('base64')}`;

const teams = [
  { id: 'entregu', name: "L'Entregu CF", crest: canonicalCrest },
  { id: 'praviano', name: 'CD Praviano', crest: canonicalCrest },
  { id: 'marino', name: 'Marino de Luanco', crest: canonicalCrest },
  { id: 'lealtad', name: 'CD Lealtad', crest: canonicalCrest },
  { id: 'astur', name: 'Astur CF', crest: canonicalCrest },
  { id: 'salamanca', name: 'Salamanca UDS', crest: canonicalCrest },
  { id: 'ceares', name: 'Unión Club Ceares', crest: canonicalCrest },
  { id: 'covadonga', name: 'CD Covadonga', crest: canonicalCrest },
];

const matchDefinitions = [
  ['entregu', "L'Entregu CF", '23/08/2026', 40, [['Extremo derecho', '4-2-3-1', 5, 45]]],
  ['praviano', 'CD Praviano', '30/08/2026', 27, [['Extremo derecho', '4-2-3-1', 63, 71], ['Extremo derecho', '4-2-3-1', 71, 84], ['Extremo derecho', '4-2-3-1', 84, 90]]],
  ['marino', 'Marino de Luanco', '02/09/2026', 30, [['Extremo derecho', '4-3-3', 60, 90]]],
  ['lealtad', 'CD Lealtad', '06/09/2026', 8, [['Extremo izquierdo', '4-3-3', 82, 90]]],
  ['astur', 'Astur CF', '08/09/2026', 30, [['Extremo derecho', '4-2-3-1', 60, 90]]],
  ['salamanca', 'Salamanca CF UDS', '09/09/2026', 40, [['Extremo derecho', '4-3-3', 50, 70], ['Extremo derecho', '4-2-3-1', 70, 90]]],
  ['ceares', 'Unión Club Ceares', '13/09/2026', 12, [['Extremo derecho', '4-4-2', 78, 90]]],
  ['covadonga', 'CD Covadonga', '20/09/2026', 36, [['Carrilero derecho', '5-2-3', 54, 90]]],
];

const positionMatches = matchDefinitions.map(([teamId, opponent, date, minutes, definitions], matchIndex) => ({
  matchId: `daniel-${teamId}`,
  opponent,
  date,
  totalMinutes: minutes,
  segments: definitions.map(([position, system, fromMinute, toMinute], index) => ({
    matchId: `daniel-${teamId}`,
    playerId: 'daniel-palacio',
    fromMinute,
    toMinute,
    minutes: toMinute - fromMinute,
    position,
    system,
    identified: Boolean(position),
    id: `${matchIndex}-${index}`,
  })),
}));

const history = matchDefinitions.map(([teamId, opponent, date, minutes], index) => {
  const opponentIdentity = resolveOpponentTeamIdentity({
    match: { equipoRivalId: teamId, opponent },
    teams,
  });
  return {
    id: `daniel-${teamId}`,
    date,
    opponent,
    opponentCrest: opponentIdentity.crest,
    opponentTeamId: opponentIdentity.teamId,
    opponentCrestSource: opponentIdentity.source,
    result: index === 5 ? '2-3' : index % 3 === 0 ? '1-0' : '1-1',
    outcome: index === 5 ? 'D' : index % 3 === 0 ? 'V' : 'E',
    competition: index < 6 ? 'Copa RFEF' : 'Liga',
    venue: index % 2 ? 'V' : 'L',
    role: index === 6 ? 'Suplente' : 'Titular',
    minutes: `${minutes}'`,
    goals: '-',
    assists: '-',
    cards: '-',
    injury: '-',
    goalLinks: [],
    assistLinks: [],
  };
});

const baseSource = {
  identity: {
    name: 'Daniel Palacio',
    number: 17,
    position: 'Extremo derecho',
    age: Number.NaN,
    foot: 'Derecho',
    team: 'C.D. Caudal de Mieres',
    season: '2026/2027',
  },
  filters: { competition: 'Todas las competiciones', venue: 'Local + visitante' },
  seasonSummary: { played: 8, starts: 7, minutes: 223, minutesPerMatch: 28, starterPercentage: 88, minutesPlayedPercentage: 31, possibleMinutes: 720, goals: 0, assists: 0, goalContributions: 0, yellow: 0, red: 0, injuries: 0, benchEntries: 1 },
  competitionBreakdown: [
    { key: 'copa_rfef', label: 'Copa RFEF', played: 6, starts: 6, minutes: 175, goals: 0, assists: 0 },
    { key: 'league', label: 'Liga', played: 2, starts: 1, minutes: 48, goals: 0, assists: 0 },
  ],
  positionUsage: {
    positions: [
      { position: 'Extremo derecho', minutes: 179, percentage: 80 },
      { position: 'Carrilero derecho', minutes: 36, percentage: 16 },
      { position: 'Extremo izquierdo', minutes: 8, percentage: 4 },
    ],
    totalMinutes: 223,
    determinedMinutes: 223,
    identifiedMinutes: 223,
    unknownMinutes: 0,
    unidentifiedMinutes: 0,
    valid: true,
    matches: positionMatches,
  },
  history,
  influenceMaps: [],
  actions: [],
};

const writePdf = async (name, source) => {
  const report = buildPlayerProfilePrintReport(source);
  const result = await createPlayerProfilePdf({ report });
  const pdfPath = path.join(outputDirectory, `${name}.pdf`);
  await fs.writeFile(pdfPath, Buffer.from(result.arrayBuffer));
  return { report, result, pdfPath };
};

const daniel = await writePdf('daniel-palacio-8-partidos', baseSource);

const longMatches = Array.from({ length: 36 }, (_, index) => {
  const matchId = `long-${index + 1}`;
  const variant = index % 6;
  const definitions = variant === 0
    ? [['Extremo derecho', '4-2-3-1', 0, 30], ['Extremo derecho', '4-2-3-1', 30, 60], ['Extremo derecho', '4-2-3-1', 60, 90]]
    : variant === 1
      ? [['Extremo derecho', '4-3-3', 0, 45], ['Extremo derecho', '4-2-3-1', 45, 90]]
      : variant === 2
        ? [['Extremo derecho', '4-2-3-1', 0, 60], ['Lateral derecho', '4-4-2', 60, 90]]
        : variant === 3
          ? [['Extremo derecho', '', 0, 90]]
          : variant === 4
            ? [['', '4-2-3-1', 0, 90]]
            : [['', '', 0, 90]];
  return {
    matchId,
    opponent: index === 7 ? 'Club Deportivo Rival con Nombre Administrativo Extraordinariamente Largo' : `Rival de temporada ${index + 1}`,
    segments: definitions.map(([position, system, fromMinute, toMinute]) => ({ matchId, playerId: 'long-player', fromMinute, toMinute, minutes: toMinute - fromMinute, position, system, identified: Boolean(position) })),
  };
});
const longHistory = longMatches.map((match, index) => ({
  id: match.matchId,
  date: `${String((index % 28) + 1).padStart(2, '0')}/${String(8 + Math.floor(index / 28)).padStart(2, '0')}/2026`,
  opponent: match.opponent,
  opponentCrest: index % 5 ? canonicalCrest : '',
  opponentCrestSource: index % 5 ? 'team_id' : 'missing',
  result: '1-1', outcome: 'E', competition: index % 2 ? 'Liga' : 'Copa RFEF', venue: index % 2 ? 'V' : 'L', role: 'Titular', minutes: "90'", goals: '-', assists: '-', cards: '-', injury: '-', goalLinks: [], assistLinks: [],
}));
const longSource = {
  ...baseSource,
  identity: { ...baseSource.identity, name: 'Jugador QA · temporada larga', age: '' },
  seasonSummary: { ...baseSource.seasonSummary, played: 36, starts: 36, minutes: 3240, minutesPerMatch: 90, starterPercentage: 100, minutesPlayedPercentage: 100, possibleMinutes: 3240 },
  competitionBreakdown: [{ key: 'all', label: 'Temporada completa', played: 36, starts: 36, minutes: 3240, goals: 0, assists: 0 }],
  positionUsage: { positions: [], totalMinutes: 0, determinedMinutes: 0, identifiedMinutes: 0, unknownMinutes: 0, unidentifiedMinutes: 0, valid: true, matches: longMatches },
  history: longHistory,
};
const long = await writePdf('temporada-larga-36-partidos', longSource);

const audit = {
  generatedAt: new Date().toISOString(),
  daniel: {
    pdf: daniel.pdfPath,
    pages: daniel.result.pages,
    age: daniel.report.identity.age,
    positionUsage: daniel.report.positionUsage.positions,
    historyPositionSystem: daniel.report.history.map((row) => ({ opponent: row.opponent, lines: row.positionSystemLines })),
    opponentCrests: daniel.result.presentationAudit.opponentCrests.map(({ opponent, resolutionSource, loaded, placeholder, error }) => ({ opponent, resolutionSource, loaded, placeholder, error })),
  },
  long: {
    pdf: long.pdfPath,
    pages: long.result.pages,
    pageSections: long.result.pageSections,
    opponentCrests: long.result.presentationAudit.opponentCrests.map(({ opponent, resolutionSource, loaded, placeholder, error }) => ({ opponent, resolutionSource, loaded, placeholder, error })),
  },
};
await fs.writeFile(path.join(outputDirectory, 'audit.json'), `${JSON.stringify(audit, null, 2)}\n`);
console.log(JSON.stringify(audit, null, 2));
