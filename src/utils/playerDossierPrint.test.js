import assert from 'node:assert/strict';
import fs from 'node:fs';
import { jsPDF } from 'jspdf';
import { inspectPlayerDossier, printPlayerDossier } from './playerDossierPrint.js';
import { auditPlayerPdfLinkAnnotations, createPlayerProfilePdf } from './playerProfilePdfExport.js';

const createReportNode = ({ width = 900, height = 2400, text = 'Borja Rodríguez Minutos Partidos Titularidades Goles Asistencias', blocks = 8 } = {}) => ({
  childElementCount: blocks,
  clientHeight: height,
  clientWidth: width,
  innerText: text,
  scrollHeight: height,
  scrollWidth: width,
  getBoundingClientRect: () => ({ width, height }),
  querySelectorAll: () => Array.from({ length: blocks }),
});
const createDocument = (nodes) => ({ querySelectorAll: () => nodes });

const populatedNode = createReportNode();
const inspection = inspectPlayerDossier(createDocument([populatedNode]));
assert.equal(inspection.valid, true, 'un perfil completo con cabecera, estadísticas y bloques es imprimible');
assert.equal(inspection.scrollHeight, 2400, 'la validación usa la altura completa del informe y no sólo el viewport');
assert.equal(inspection.exportableBlockCount, 8, 'el informe contiene bloques exportables');
assert.match(inspection.textPreview, /Borja Rodríguez.*Minutos.*Goles/, 'el contenido textual visible llega a impresión');

let printCalls = 0;
const printed = printPlayerDossier({
  documentRef: createDocument([populatedNode]),
  print: () => { printCalls += 1; },
  logger: { info() {}, error() {} },
});
assert.equal(printed.printed, true);
assert.equal(printCalls, 1, 'un informe válido abre una única impresión con contenido');

for (const nodes of [[], [createReportNode({ width: 0 })], [createReportNode({ height: 0 })], [createReportNode({ text: '' })], [populatedNode, populatedNode]]) {
  printCalls = 0;
  const result = printPlayerDossier({
    documentRef: createDocument(nodes),
    print: () => { printCalls += 1; },
    logger: { info() {}, error() {} },
  });
  assert.equal(result.printed, false, 'un nodo ausente, duplicado, vacío o 0×0 no se exporta');
  assert.equal(printCalls, 0);
}

const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const printCss = fs.readFileSync(new URL('../styles/print.css', import.meta.url), 'utf8');
const lastGlobalVisibilityReset = printCss.lastIndexOf('body * {');
const playerVisibilityOverride = printCss.indexOf('.player-profile-print-portal,', lastGlobalVisibilityReset);
const overrideBlock = printCss.slice(playerVisibilityOverride, printCss.indexOf('}', playerVisibilityOverride) + 1);

assert.match(appSource, /exportPlayerProfilePdf\(\{[\s\S]*?report:\s*playerPdfModel/, 'el botón entrega el modelo normalizado directamente al generador vectorial');
assert.doesNotMatch(appSource, /printPlayerDossier\([\s\S]*?window\.print\(\)/, 'el PDF individual no vuelve a delegarse en un destino de impresión que pueda rasterizar los enlaces');
assert.ok(playerVisibilityOverride > lastGlobalVisibilityReset, 'la visibilidad del perfil se restaura después del reset global que causaba páginas blancas');
assert.match(overrideBlock, /visibility:\s*visible\s*!important/, 'el contenido del perfil vence el visibility hidden global');

const videoUrl = 'https://video.example/borja-assist?t=600';
const linkedPdf = new jsPDF({ unit: 'mm', format: 'a4' });
linkedPdf.text('ABRIR VIDEO', 20, 20);
linkedPdf.link(20, 12, 35, 10, { url: videoUrl });
const linkedAudit = auditPlayerPdfLinkAnnotations(linkedPdf.output('arraybuffer'), [videoUrl]);
assert.equal(linkedAudit.linkAnnotations, 1, 'el archivo PDF contiene una anotación de subtipo Link');
assert.equal(linkedAudit.uriAnnotations, 1, 'la anotación contiene una acción URI');
assert.deepEqual(linkedAudit.urls, [videoUrl], 'la URI del PDF coincide exactamente con la URL canónica');
assert.equal(linkedAudit.valid, true, 'el PDF se considera válido cuando conserva la URL esperada');

const parenthesizedUrl = 'https://video.example/action_(assist)?t=600';
const parenthesizedPdf = new jsPDF({ unit: 'mm', format: 'a4' });
parenthesizedPdf.link(20, 12, 35, 10, { url: parenthesizedUrl });
const parenthesizedAudit = auditPlayerPdfLinkAnnotations(parenthesizedPdf.output('arraybuffer'), [parenthesizedUrl]);
assert.deepEqual(parenthesizedAudit.urls, [parenthesizedUrl], 'el auditor interpreta escapes PDF en URLs canónicas con paréntesis');
assert.equal(parenthesizedAudit.valid, true);

const pdfWithoutLink = new jsPDF({ unit: 'mm', format: 'a4' });
pdfWithoutLink.text('ABRIR VIDEO', 20, 20);
const failedAudit = auditPlayerPdfLinkAnnotations(pdfWithoutLink.output('arraybuffer'), [videoUrl]);
assert.equal(failedAudit.linkAnnotations, 0);
assert.equal(failedAudit.valid, false, 'un PDF rasterizado sin anotaciones no supera la validación');
assert.deepEqual(failedAudit.missingUrls, [videoUrl]);

const componentSource = fs.readFileSync(new URL('../components/print/PlayerProfilePdfReport.jsx', import.meta.url), 'utf8');
const exporterSource = fs.readFileSync(new URL('./playerProfilePdfExport.js', import.meta.url), 'utf8');
assert.match(componentSource, /data-player-video-link="history"/, 'los enlaces inequívocos del historial se identifican para la auditoría');
assert.match(componentSource, /data-player-video-link="library"/, 'el botón de videoteca se identifica para la auditoría');
assert.doesNotMatch(componentSource, /data-player-video-link="timeline"/, 'el dossier profesional ya no incluye el gráfico de impacto temporal');
assert.doesNotMatch(exporterSource, /html2canvas|toDataURL\(['"]image\/png/, 'el generador no captura ni rasteriza el DOM');
assert.match(exporterSource, /pdf\.link\([\s\S]*?\{ url \}\)/, 'el generador vectorial crea anotaciones PDF estándar');
assert.match(exporterSource, /auditPlayerPdfLinkAnnotations\(arrayBuffer, expectedVideoUrls\)/, 'el binario final se audita antes de iniciar la descarga');

const jairoVideoUrl = 'https://youtu.be/9HXdIkVodbM';
const goalZones = ['alta_izquierda', 'alta_centro', 'alta_derecha', 'media_izquierda', 'media_centro', 'media_derecha', 'baja_izquierda', 'baja_centro', 'baja_derecha']
  .map((value) => ({ value, label: value.replaceAll('_', ' '), count: value === 'alta_centro' ? 1 : 0 }));
const jairoReport = {
  identity: { name: 'Jairo Cárcaba', number: 14, position: 'Delantero', age: '34 años', foot: 'derecho', team: 'C.D. Caudal', season: '2026/2027' },
  filters: { competition: 'Copa RFEF', venue: 'Todos' },
  validation: { seasonValid: true, production: { valid: true } },
  seasonSummary: { played: 2, starts: 2, minutes: 180, minutesPerMatch: 90, starterPercentage: 100, goals: 1, assists: 0, goalContributions: 1, yellow: 0, red: 0, injuries: 0, benchEntries: 0 },
  competitionBreakdown: [{ key: 'copa_rfef', label: 'Copa RFEF', played: 2, starts: 2, minutes: 180, goals: 1, assists: 0, goalContributions: 1 }],
  positionUsage: { positions: [{ position: 'Extremo izquierdo', minutes: 90, percentage: 50 }, { position: 'Delantero', minutes: 90, percentage: 50 }], totalMinutes: 180, determinedMinutes: 180, unknownMinutes: 0, valid: true },
  production: { goalsPer90: '0.50', assistsPer90: '0.00', goalContributionsPer90: '0.50', goalContributions: 1 },
  influenceMaps: ['Todos', 'Goles', 'Asistencias'].map((label, index) => ({ key: index === 0 ? 'all' : label.toLowerCase(), label, zones: Array.from({ length: 9 }, (_, zone) => ({ value: `zone-${zone}`, label: `Zona ${zone + 1}`, count: index < 2 && zone === 1 ? 1 : 0 })) })),
  goalAnalysis: {
    bodyParts: { values: [{ label: 'Cabeza', count: 1 }], known: 1, missing: 0, total: 1 },
    types: { phases: [{ label: 'Juego directo', count: 1 }], known: 1, missing: 0, total: 1 },
    target: { zones: goalZones, known: 1, missing: 0, total: 1 },
  },
  offensiveConnections: [{ id: 'received-borja', from: 'Borja Rodríguez', to: 'Jairo Cárcaba', count: 1 }],
  videoActions: [{ id: 'goal-10', type: 'Gol', minute: '10', opponent: 'CD Praviano', competition: 'Copa RFEF', date: '16/08/2026', phase: 'Juego directo', shotZoneLabel: 'F. Finalización centro', goalZoneLabel: 'Alta centro', contact: 'Cabeza', assistant: 'Borja Rodríguez', url: jairoVideoUrl }],
  history: [{ id: 'match-1', date: '16/08/2026', opponent: 'CD Praviano', result: '1-0', outcome: 'V', competition: 'Copa RFEF', venue: 'L', role: 'Titular', minutes: "90'", goals: 1, assists: '-', cards: '-', injury: '-', goalLinks: [jairoVideoUrl], assistLinks: [] }],
};
const vectorResult = await createPlayerProfilePdf({ report: jairoReport, fetchImpl: null });
assert.equal(vectorResult.vector, true, 'el dossier final se declara vectorial');
assert.deepEqual(vectorResult.pageSections, ['PERFIL Y RENDIMIENTO COMPETITIVO', 'PRODUCCIÓN, ZONAS Y VÍDEO']);
assert.ok(vectorResult.audit.linkAnnotations >= 2, 'historial y videoteca contienen enlaces PDF reales');
assert.deepEqual(vectorResult.audit.missingUrls, []);
assert.ok(vectorResult.audit.urls.includes(jairoVideoUrl));
assert.deepEqual(vectorResult.presentationAudit.playerPhoto, { background: 'white', fit: 'contain', centered: true, imageLoaded: false, source: '' }, 'el fallback del PDF ocupa el mismo marco blanco');
assert.deepEqual(vectorResult.presentationAudit.scope, { season: '2026/2027', competition: 'Copa RFEF', venue: 'Local + visitante' }, 'el ámbito traduce el filtro global de localía sin repetir etiquetas vacías');
assert.deepEqual(vectorResult.presentationAudit.footer, { contact: 'analisisvigon@gmail.com', pages: 2 }, 'el contacto profesional se integra en todas las páginas del PDF');

const transparentPng = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lSxWAAAAAElFTkSuQmCC', 'base64'));
const normalPhotoResult = await createPlayerProfilePdf({
  report: { ...jairoReport, identity: { ...jairoReport.identity, image: 'https://images.example/jairo-original.png' } },
  fetchImpl: async () => ({ ok: true, blob: async () => new Blob([transparentPng], { type: 'image/png' }) }),
});
assert.equal(normalPhotoResult.presentationAudit.playerPhoto.imageLoaded, true, 'una foto convencional se incorpora al PDF vectorial');
const transparentPhotoResult = await createPlayerProfilePdf({
  report: { ...jairoReport, identity: { ...jairoReport.identity, name: 'Borja Rodríguez', image: 'https://images.example/borja-transparent.png' } },
  fetchImpl: async () => ({ ok: true, blob: async () => new Blob([transparentPng], { type: 'image/png' }) }),
});
assert.deepEqual(transparentPhotoResult.presentationAudit.playerPhoto, { background: 'white', fit: 'contain', centered: true, imageLoaded: true, source: 'https://images.example/borja-transparent.png' }, 'un PNG con transparencia se inserta centrado sobre blanco en el PDF final');
assert.ok(exporterSource.indexOf('drawPositionUsage(pdf, report.positionUsage, y)') < exporterSource.indexOf("sectionTitle(pdf, 'Historial partido a partido'"), 'las posiciones se insertan en página 1 antes del historial');
await assert.rejects(
  createPlayerProfilePdf({ report: { ...jairoReport, positionUsage: { totalMinutes: 90, determinedMinutes: 120 }, validation: { ...jairoReport.validation, positionUsage: { valid: false } } }, fetchImpl: null }),
  /minutos por posición/,
  'un reparto que supera los minutos reales bloquea el PDF',
);

const scenarioZones = (counts = []) => goalZones.map((zone, index) => ({ ...zone, count: Number(counts[index] || 0) }));
const makeScenarioReport = ({
  name = 'Jugador de prueba',
  goals = 0,
  assists = 0,
  targetCounts = [],
  targetMissing = 0,
  videos = 0,
  matches = 1,
  filters = { competition: 'Todas las competiciones', venue: 'Todos' },
  teamName = 'Club de prueba',
  teamCrest = '',
  opponentCrest = '',
  positionUsage = { positions: [{ position: 'Centrocampista', minutes: 90, percentage: 100 }], totalMinutes: 90, determinedMinutes: 90, unknownMinutes: 0, valid: true },
} = {}) => {
  const targetKnown = targetCounts.reduce((sum, count) => sum + Number(count || 0), 0);
  const contributions = goals + assists;
  return {
    identity: { name, number: 8, position: 'Centrocampista', team: teamName, teamCrest, season: '2026/2027' },
    filters,
    validation: { seasonValid: true, production: { valid: true } },
    seasonSummary: { played: matches, starts: matches, minutes: matches * 90, minutesPerMatch: 90, starterPercentage: 100, goals, assists, goalContributions: contributions },
    competitionBreakdown: [{ key: 'scope', label: filters.competition, played: matches, starts: matches, minutes: matches * 90, goals, assists, goalContributions: contributions }],
    positionUsage,
    production: { goalsPer90: goals, assistsPer90: assists, goalContributionsPer90: contributions, goalContributions: contributions },
    influenceMaps: ['all', 'goals', 'assists'].map((key) => ({ key, label: key, zones: Array.from({ length: 9 }, (_, index) => ({ value: `zone-${index}`, count: index === 0 ? (key === 'goals' ? goals : key === 'assists' ? assists : contributions) : 0 })) })),
    goalAnalysis: {
      bodyParts: { values: goals ? [{ label: 'Cabeza', count: goals }] : [], known: goals, missing: 0, total: goals },
      types: { phases: goals ? [{ label: 'Juego directo', count: goals }] : [], known: goals, missing: 0, total: goals },
      target: { zones: scenarioZones(targetCounts), known: targetKnown, missing: targetMissing, total: goals },
    },
    offensiveConnections: assists ? [{ id: 'given', direction: 'given', from: name, to: 'Compañero', count: assists }] : [],
    videoActions: Array.from({ length: videos }, (_, index) => ({ id: `video-${index}`, type: index % 2 ? 'Asistencia' : 'Gol', minute: String(index + 1), opponent: `Rival ${index + 1}`, competition: filters.competition, url: `https://video.example/scenario-${index}` })),
    history: Array.from({ length: matches }, (_, index) => ({ id: `match-${index}`, date: `${String((index % 28) + 1).padStart(2, '0')}/08/2026`, opponent: `Rival ${index + 1}`, opponentCrest, result: '1-0', outcome: 'V', competition: filters.competition, venue: index % 2 ? 'V' : 'L', role: 'Titular', minutes: "90'", goals: '-', assists: '-', cards: '-', injury: '-', goalLinks: [], assistLinks: [] })),
  };
};

const mandatoryScenarios = [
  ['A · 1 gol', { goals: 1, targetCounts: [0, 1] }],
  ['B · varios goles', { goals: 4, targetCounts: [1, 2, 1] }],
  ['C · asistencias', { assists: 2 }],
  ['D · goles y asistencias', { goals: 2, assists: 2, targetCounts: [1, 1] }],
  ['E · 0 G/A', {}],
  ['F · sin goal_zone', { goals: 1, targetMissing: 1 }],
  ['G · algunas goal_zone', { goals: 3, targetCounts: [1, 1], targetMissing: 1 }],
  ['H · todas las goal_zone', { goals: 9, targetCounts: Array(9).fill(1) }],
  ['I · sin vídeo', { goals: 1, targetCounts: [1], videos: 0 }],
  ['J · múltiples vídeos', { goals: 1, targetCounts: [1], videos: 18 }],
  ['K · nombre largo', { name: 'Jugador Con Un Nombre Extraordinariamente Largo y Compuesto', goals: 1, targetCounts: [1] }],
  ['L · club sin escudo', { teamCrest: '', goals: 1, targetCounts: [1] }],
  ['M · rival sin escudo', { opponentCrest: '', goals: 1, targetCounts: [1] }],
  ['N · temporada completa', { matches: 48, goals: 8, assists: 4, targetCounts: [1, 2, 1, 1, 1, 1, 0, 1] }],
  ['O · filtro Liga', { filters: { competition: 'Liga', venue: 'Todos' }, goals: 1, targetCounts: [1] }],
  ['P · filtro Copa', { filters: { competition: 'Copa RFEF', venue: 'Todos' }, goals: 1, targetCounts: [1] }],
  ['Q · filtro Local', { filters: { competition: 'Todas las competiciones', venue: 'Local' }, goals: 1, targetCounts: [1] }],
  ['R · filtro Visitante', { filters: { competition: 'Todas las competiciones', venue: 'Visitante' }, goals: 1, targetCounts: [1] }],
  ['S · varias posiciones', { positionUsage: { positions: [{ position: 'Lateral izquierdo', minutes: 120, percentage: 80 }, { position: 'Central izquierdo', minutes: 30, percentage: 20 }], totalMinutes: 180, determinedMinutes: 150, unknownMinutes: 30, valid: true }, goals: 1, targetCounts: [1] }],
];

for (const [label, options] of mandatoryScenarios) {
  const result = await createPlayerProfilePdf({ report: makeScenarioReport(options), fetchImpl: null });
  assert.equal(result.pages, result.pageSections.length, `${label}: cada página contiene una sección real`);
  assert.ok(result.pageSections.every(Boolean), `${label}: no se generan páginas vacías`);
  assert.equal(result.audit.missingUrls.length, 0, `${label}: conserva todos sus enlaces`);
}

const zeroProduction = await createPlayerProfilePdf({ report: makeScenarioReport(), fetchImpl: null });
assert.deepEqual(zeroProduction.pageSections, ['PERFIL Y RENDIMIENTO COMPETITIVO'], 'E: 0 G/A no reserva una página ofensiva vacía');
const multiVideo = await createPlayerProfilePdf({ report: makeScenarioReport({ goals: 1, targetCounts: [1], videos: 18 }), fetchImpl: null });
assert.equal(multiVideo.audit.linkAnnotations, 18, 'J: cada uno de los vídeos múltiples conserva una anotación Link/URI');
assert.ok(multiVideo.pages > 2, 'J: una videoteca extensa pagina en vez de comprimirse');
const fullSeason = await createPlayerProfilePdf({ report: makeScenarioReport({ matches: 48, goals: 8, assists: 4, targetCounts: [1, 2, 1, 1, 1, 1, 0, 1] }), fetchImpl: null });
assert.ok(fullSeason.pages > 2, 'N: una temporada completa pagina sin comprimir el historial');

const globalScope = await createPlayerProfilePdf({ report: makeScenarioReport({ filters: { season: '2026/2027', competition: 'Temporada', venue: 'Todos' }, goals: 1, targetCounts: [1] }), fetchImpl: null });
assert.deepEqual(globalScope.presentationAudit.scope, { season: '2026/2027', competition: 'Todas las competiciones', venue: 'Local + visitante' }, 'el ámbito global representa temporada, todas las competiciones y ambas localías');
const localScope = await createPlayerProfilePdf({ report: makeScenarioReport({ filters: { competition: 'Liga', venue: 'Local' }, goals: 1, targetCounts: [1] }), fetchImpl: null });
assert.deepEqual(localScope.presentationAudit.scope, { season: '2026/2027', competition: 'Liga', venue: 'Local' });
const awayScope = await createPlayerProfilePdf({ report: makeScenarioReport({ filters: { competition: 'Copa RFEF', venue: 'Visitante' }, goals: 1, targetCounts: [1] }), fetchImpl: null });
assert.deepEqual(awayScope.presentationAudit.scope, { season: '2026/2027', competition: 'Copa RFEF', venue: 'Visitante' });

const caudalCrestUrl = 'https://assets.example/cd-caudal-crest.png';
const crestResult = await createPlayerProfilePdf({
  report: makeScenarioReport({ teamName: 'C.D. Caudal de Mieres', teamCrest: caudalCrestUrl, goals: 1, assists: 1, targetCounts: [1], videos: 2 }),
  fetchImpl: async () => ({ ok: true, blob: async () => new Blob([transparentPng], { type: 'image/png' }) }),
});
assert.deepEqual(crestResult.presentationAudit.clubIdentity, {
  name: 'C.D. Caudal de Mieres',
  crestSource: caudalCrestUrl,
  crestLoaded: true,
  season: '2026/2027',
}, 'el PDF carga el escudo recibido desde el modelo del club sin hardcodear otra URL');
assert.equal(crestResult.audit.linkAnnotations, 2, 'la prueba completa con escudo conserva un enlace PDF real por tarjeta de vídeo');
assert.deepEqual(crestResult.audit.missingUrls, []);
if (process.env.PLAYER_DOSSIER_QA_PDF) fs.writeFileSync(process.env.PLAYER_DOSSIER_QA_PDF, Buffer.from(crestResult.arrayBuffer));

const multiplePositions = await createPlayerProfilePdf({
  report: makeScenarioReport({
    positionUsage: {
      positions: [
        { position: 'Carrilero izquierdo', minutes: 20, percentage: 10 },
        { position: 'Lateral izquierdo', minutes: 140, percentage: 70 },
        { position: 'Central izquierdo', minutes: 40, percentage: 20 },
      ],
      totalMinutes: 220,
      determinedMinutes: 200,
      unknownMinutes: 20,
      valid: true,
    },
    goals: 1,
    targetCounts: [1],
  }),
  fetchImpl: null,
});
assert.deepEqual(multiplePositions.presentationAudit.positions.map(({ position, minutes, percentage }) => [position, minutes, percentage]), [
  ['Lateral izquierdo', 140, 70],
  ['Central izquierdo', 40, 20],
  ['Carrilero izquierdo', 20, 10],
], 'las posiciones se presentan por minutos descendentes y conservan el porcentaje sobre minutos identificados');

const sortedConnections = await createPlayerProfilePdf({
  report: { ...makeScenarioReport({ assists: 1 }), offensiveConnections: [
    { from: 'Nombre muy largo del primer jugador', to: 'Nombre muy largo del segundo jugador', count: 1 },
    { from: 'Jugador A', to: 'Jugador B', count: 4 },
    { from: 'Jugador C', to: 'Jugador D', count: 2 },
  ] },
  fetchImpl: null,
});
assert.deepEqual(sortedConnections.presentationAudit.connections.map(({ count }) => count), [4, 2, 1], 'las conexiones se ordenan globalmente por participaciones antes de paginar');

console.log('playerDossierPrint tests passed');
