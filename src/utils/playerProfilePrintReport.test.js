import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildPlayerCompetitionProfile,
  buildPlayerDossierSectionPlan,
  buildPlayerOffensiveConnections,
  buildPlayerProductionMapLayout,
  buildPlayerProfilePrintReport,
  getPlayerReportActionUrl,
} from './playerProfilePrintReport.js';

assert.equal(getPlayerReportActionUrl('https://video.example/goal?t=72'), 'https://video.example/goal?t=72');
assert.equal(getPlayerReportActionUrl('javascript:alert(1)'), '', 'el PDF no admite enlaces no navegables o inseguros');
assert.equal(getPlayerReportActionUrl('/partidos/inventado'), '', 'no se inventan rutas internas sin URL absoluta real');

const filtered = buildPlayerProfilePrintReport({
  identity: { name: 'Borja Rodríguez', team: 'C.D. Caudal de Mieres', season: '2026/27' },
  filters: { competition: 'Liga', venue: 'Visitante' },
  seasonSummary: { played: 25, starts: 22, minutes: 1950, minutesPerMatch: 78, starterPercentage: 88, goals: 2, assists: 5, goalContributions: 7, yellow: 3, red: 0, injuries: 1, benchEntries: 3 },
  competitionBreakdown: [
    { key: 'league', label: 'Liga', played: 22, starts: 20, minutes: 1740, goals: 2, assists: 4 },
    { key: 'cup', label: 'Copa RFEF', played: 3, starts: 2, minutes: 210, goals: 0, assists: 1 },
    { key: 'empty', label: 'Sin participación', played: 0, starts: 0, minutes: 0, goals: 0, assists: 0 },
  ],
  production: { goalsPer90: 0.09, assistsPer90: 0.23, goalContributionsPer90: 0.32, goalContributions: 7 },
  actions: [
    { id: 'assist-10', type: 'Asistencia', minute: 10, opponent: 'CD Praviano', date: '16/08/2026', scorer: 'Jairo Cárcaba', assistZoneLabel: 'F. Creación derecha', phase: 'Juego combinativo', url: 'https://video.example/assist?t=10' },
    { id: 'goal-72', type: 'Gol', minute: 72, opponent: 'Rival', result: '2-1', contact: 'Pie izquierdo', shotZoneLabel: 'F. Finalización centro', goalZoneLabel: 'Alta derecha', assistant: 'Compañero', url: '' },
  ],
  history: [{ id: 'match-1', goals: 1, assists: 1, goalLinks: ['https://video.example/goal?t=72'], assistLinks: ['javascript:alert(1)'] }],
  influenceMaps: [
    { key: 'all', label: 'Todos', zones: [{ value: 'finalizacion_centro', count: 3 }] },
    { key: 'goals', label: 'Goles', zones: [{ value: 'finalizacion_centro', count: 1 }] },
    { key: 'assists', label: 'Asistencias', zones: [{ value: 'creacion_derecha', count: 2 }] },
  ],
  goalAnalysis: {
    bodyParts: { values: [{ label: 'Pie izquierdo', count: 1 }], known: 1, missing: 0, total: 1 },
    types: { phases: [{ label: 'Juego combinativo', count: 1 }], subphases: [] },
    target: { zones: [{ value: 'alta_derecha', label: 'Alta derecha', count: 1 }], known: 1, missing: 0, total: 1 },
  },
});

assert.equal(filtered.seasonSummary.starterPercentage, 88, 'el dossier conserva el porcentaje objetivo de titularidad');
assert.equal(filtered.competitionBreakdown.length, 2, 'se omiten competiciones sin participación');
assert.deepEqual(filtered.competitionBreakdown.map((row) => row.goalContributions), [6, 1], 'G+A por competición se calcula desde eventos reales');
assert.deepEqual(filtered.competitionBreakdown.map((row) => row.minutesPerMatch), [79, 70], 'Min/PJ usa exclusivamente minutos y participaciones del filtro');
assert.equal(filtered.actions[0].url, 'https://video.example/assist?t=10', 'la URL exacta con timestamp se conserva');
assert.equal(filtered.actions[0].date, '16/08/2026', 'la videoteca conserva la fecha real de la acción');
assert.equal(filtered.actions[1].url, '', 'una acción sin URL permanece registrada pero no entra en la videoteca');
assert.equal(filtered.actions[1].contact, 'Pie izquierdo', 'la ficha PDF conserva la parte del cuerpo oficial');
assert.equal(filtered.actions[0].scorer, 'Jairo Cárcaba', 'la asistencia conserva el goleador asociado');
assert.equal(filtered.actions[0].assistZoneLabel, 'F. Creación derecha', 'la asistencia conserva su zona canónica');
assert.deepEqual(filtered.history[0].goalLinks, ['https://video.example/goal?t=72']);
assert.deepEqual(filtered.history[0].assistLinks, [], 'el historial sólo conserva enlaces reales y seguros');
assert.equal(filtered.productionActions.length, 1, 'Acciones en vídeo sólo contiene acciones con URL canónica');
assert.equal(filtered.videoActions.length, 1, 'la videoteca lógica sólo contiene URL canónica real');
assert.deepEqual(filtered.pagePlan, ['summary', 'production'], 'el volumen normal genera exactamente dos A4');
assert.deepEqual(filtered.influenceMaps.map((map) => map.zones[0].count), [3, 1, 2], 'Todos, Goles y Asistencias conservan datasets independientes');
assert.deepEqual(filtered.influenceMapLayout.maps.map((map) => map.key), ['all', 'goals', 'assists']);

assert.deepEqual(buildPlayerCompetitionProfile([
  { key: 'copa_rfef', label: 'Copa RFEF', logoUrl: 'https://assets.example/copa.png', played: 2 },
]), { mode: 'single', key: 'copa_rfef', label: 'Copa RFEF', logoUrl: 'https://assets.example/copa.png', icon: '' }, 'una sola competición real conserva su nombre y logo aunque el filtro superior sea Todos');
assert.equal(buildPlayerCompetitionProfile([
  { key: 'league', label: 'Liga', played: 20 },
  { key: 'cup', label: 'Copa RFEF', played: 2 },
]).label, 'Temporada completa', 'varias competiciones se resumen sin mostrar un escudo engañoso');

const emptyZones = (key) => ({ key, label: key, zones: [{ value: 'zone', count: 0 }] });
assert.deepEqual(buildPlayerProductionMapLayout({
  maps: [emptyZones('all'), emptyZones('goals'), emptyZones('assists')],
  seasonSummary: { goals: 0, assists: 2 },
}).maps.map((map) => map.key), ['all', 'assists'], 'sin goles se elimina su mapa y Todos/Asistencias ocupan dos columnas');
assert.deepEqual(buildPlayerProductionMapLayout({
  maps: [emptyZones('all'), emptyZones('goals'), emptyZones('assists')],
  seasonSummary: { goals: 1, assists: 0 },
}).maps.map((map) => map.key), ['all', 'goals'], 'sin asistencias se elimina su mapa sin perder una categoría oficial sin zona');
const noProductionMaps = buildPlayerProductionMapLayout({
  maps: [emptyZones('all'), emptyZones('goals'), emptyZones('assists')],
  seasonSummary: { goals: 0, assists: 0 },
});
assert.deepEqual(noProductionMaps.maps, [], 'sin acciones ni zonas no se reserva espacio vacío');
assert.equal(noProductionMaps.columns, 0);
assert.equal(buildPlayerProductionMapLayout({
  maps: [emptyZones('goals')],
  seasonSummary: { goals: 1, assists: 0 },
}).columns, 1, 'si sólo existe una categoría real el diseño usa una columna centrada');

const noProduction = buildPlayerProfilePrintReport({
  identity: { name: 'Sin producción', season: '2026/27' },
  seasonSummary: { played: 4, starts: 1, minutes: 130 },
  actions: [{ id: 'no-video', type: 'Gol', minute: 40, url: '' }],
  history: [],
  influenceMaps: [
    { key: 'all', label: 'Todos', zones: [] },
    { key: 'goals', label: 'Goles', zones: [] },
    { key: 'assists', label: 'Asistencias', zones: [] },
  ],
});
assert.equal(noProduction.productionActions.length, 0, 'una acción oficial sin vídeo no recibe una ficha de vídeo falsa');
assert.equal(noProduction.videoActions.length, 0, 'sin vídeos reales no se generan CTA falsos');
assert.deepEqual(noProduction.pagePlan, ['summary'], 'la ausencia de producción no crea páginas vacías');

const dense = buildPlayerProfilePrintReport({
  actions: Array.from({ length: 27 }, (_, index) => ({ id: `a-${index}`, type: 'Gol', minute: index + 1, url: `https://video.example/${index}` })),
  history: Array.from({ length: 53 }, (_, index) => ({ id: `m-${index}` })),
});
assert.equal(dense.summaryHistory.length, 18);
assert.deepEqual(dense.historyOverflow.map((page) => page.length), [30, 5], 'el historial largo se pagina sin recortar filas');
assert.deepEqual(dense.actionOverflow.map((page) => page.length), [10, 10, 1], 'la videoteca larga se pagina sin recortar acciones');
assert.equal(dense.pagePlan.length, 7, 'sólo se añaden páginas cuando el volumen excede dos A4');

const borjaConnections = buildPlayerOffensiveConnections({
  playerName: 'Borja Rodríguez',
  society: [{ name: 'Jairo Cárcaba', given: 1, received: 0 }],
});
assert.deepEqual(borjaConnections, [{
  id: 'given-0-Jairo Cárcaba',
  direction: 'given',
  from: 'Borja Rodríguez',
  to: 'Jairo Cárcaba',
  count: 1,
}], 'la conexión real Borja Rodríguez → Jairo Cárcaba se conserva completa');

const jairoConnections = buildPlayerOffensiveConnections({
  playerName: 'Jairo Cárcaba',
  society: [{ name: 'Borja Rodríguez', given: 0, received: 1 }],
});
assert.equal(jairoConnections[0]?.direction, 'received', 'Jairo distingue la asistencia recibida de la asistencia dada');

const noConnections = buildPlayerProfilePrintReport({
  identity: { name: 'Jugador sin conexiones' },
  society: [{ name: 'Compañero', given: 0, received: 0 }],
});
assert.deepEqual(noConnections.offensiveConnections, [], 'cero conexiones no crea filas vacías');
assert.deepEqual(noConnections.connectionOverflow, [], 'cero conexiones no crea páginas vacías');

const defensiveOnly = buildPlayerProfilePrintReport({
  identity: { name: 'Defensa sin producción' },
  seasonSummary: { played: 20, starts: 18, minutes: 1700, goals: 0, assists: 0 },
  history: [{ id: 'def-1', minutes: "90'", goals: '-', assists: '-' }],
  influenceMaps: [{ key: 'all', zones: [] }, { key: 'goals', zones: [] }, { key: 'assists', zones: [] }],
});
assert.equal(defensiveOnly.hasProduction, false, 'un defensa sin G/A no reserva una página ofensiva vacía');
assert.deepEqual(defensiveOnly.pagePlan, ['summary']);

const positionUsage = { positions: [{ position: 'Delantero', minutes: 90, percentage: 100 }], totalMinutes: 90, determinedMinutes: 90, unknownMinutes: 0, valid: true };
assert.deepEqual(buildPlayerProfilePrintReport({ identity: { name: 'Jugador posicional' }, positionUsage }).positionUsage, positionUsage, 'el modelo conserva el cálculo táctico sin reinterpretarlo');

const longName = 'Compañero Con Un Nombre Extraordinariamente Largo y Compuesto';
const oneConnection = buildPlayerProfilePrintReport({
  identity: { name: 'Borja Rodríguez' },
  society: [{ name: longName, given: 0, received: 2 }],
});
assert.equal(oneConnection.productionConnections.length, 1, 'una conexión permanece en la página de producción');
assert.equal(oneConnection.productionConnections[0].from, longName, 'los nombres largos no se truncan en el modelo');
assert.deepEqual(oneConnection.pagePlan, ['summary', 'production']);

const manyConnections = buildPlayerProfilePrintReport({
  identity: { name: 'Borja Rodríguez' },
  society: Array.from({ length: 29 }, (_, index) => ({ name: `Compañero ${index + 1}`, given: index + 1, received: 0 })),
});
assert.equal(manyConnections.offensiveConnections.length, 29, 'ninguna conexión se descarta por volumen');
assert.equal(manyConnections.productionConnections.length, 5, 'el PDF selecciona las cinco conexiones más relevantes');
assert.deepEqual(manyConnections.productionConnections.map((connection) => connection.count), [29, 28, 27, 26, 25]);
assert.deepEqual(manyConnections.connectionOverflow, [], 'las conexiones menos relevantes no crean páginas de ruido visual');
assert.deepEqual(manyConnections.pagePlan, ['summary', 'production']);

const consecutiveSections = buildPlayerDossierSectionPlan({
  competitionBreakdown: [{ played: 2 }],
  positionUsage,
  history: [{ id: 'm-1' }],
  production: { goalContributions: 1 },
  influenceMaps: [{ zones: [{ count: 1 }] }],
  offensiveConnections: [{ count: 1 }],
  goalAnalysis: { bodyParts: { total: 0 }, types: { total: 0 }, target: { total: 0 } },
  videoActions: [{ url: 'https://video.example/assist' }],
});
assert.deepEqual(consecutiveSections.map(({ key, number }) => [key, number]), [
  ['performance', '01'],
  ['competitions', '02'],
  ['history', '03'],
  ['zones', '04'],
  ['production', '05'],
  ['connections', '06'],
  ['videos', '07'],
], 'al integrar posiciones en cabecera, Historial ocupa 03 y los bloques siguientes mantienen numeración consecutiva');

const componentSource = fs.readFileSync(new URL('../components/print/PlayerProfilePdfReport.jsx', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const printCss = fs.readFileSync(new URL('../styles/print.css', import.meta.url), 'utf8');
const footballMapSource = fs.readFileSync(new URL('../components/visualization/FootballZoneMap.jsx', import.meta.url), 'utf8');

assert.match(componentSource, /data-player-pdf-page="summary"/);
assert.match(componentSource, /data-player-pdf-page="production"/);
assert.match(componentSource, /HistoryContinuationPage/);
assert.match(componentSource, /ConnectionsContinuationPage/);
assert.match(componentSource, /VideoContinuationPage/);
assert.match(componentSource, /Rendimiento · Temporada/);
assert.match(componentSource, /Rendimiento por competición/);
assert.match(componentSource, /Historial partido a partido/);
assert.match(componentSource, /Todas las acciones/);
assert.match(componentSource, /Producción ofensiva/);
assert.match(componentSource, /Conexiones ofensivas/);
assert.match(componentSource, /Acciones en vídeo/);
assert.match(componentSource, /Análisis objetivo de finalización/);
assert.match(componentSource, /Cómo marca/);
assert.match(componentSource, /Destino en portería/);
assert.match(componentSource, /data-player-video-link="history"/, 'el historial conserva enlaces PDF identificables');
assert.match(componentSource, /data-player-video-link="library"/, 'todo el CTA de videoteca conserva su enlace PDF');
assert.doesNotMatch(componentSource, /Impacto en el tiempo|player-pdf-timeline/, 'se elimina por completo el timeline subjetivo');
assert.doesNotMatch(componentSource, /Evolución de temporada|seasonStages|rating/, 'se eliminan evolución y notas del dossier');
assert.doesNotMatch(componentSource, /window\.open|onClick=/, 'el PDF no simula enlaces mediante JavaScript');
assert.match(appSource, /team:\s*getOwnClubDisplayName\(pdfOwnTeam\?\.name\)/, 'el modelo recibe el nombre oficial de presentación sin modificar el dato almacenado');
assert.match(appSource, /teamCrest:\s*pdfOwnTeam\?\.crest \|\| clubCrest/, 'el PDF reutiliza el escudo canónico de APPCAUDAL si el registro propio no lo incluye');
assert.match(appSource, /image:\s*getPlayerAvatarSource\(selectedPlayerProfile\)/, 'el PDF reutiliza la fuente de foto de mayor resolución disponible en el perfil');
assert.match(appSource, /competitionBreakdown:\s*pdfCompetitionRows/, 'el desglose se construye desde partidos filtrados reales');
assert.match(appSource, /logoUrl:\s*competition\.logoUrl \|\| ''/, 'el modelo PDF conserva el logo real del catálogo de competiciones');
assert.match(appSource, /<PlayerPositionUsageSummary usage=\{playerPositionUsage\}/, 'la ficha App mantiene íntegro su bloque posicional completo');
assert.match(appSource, /goalContributionsPer90/, 'G+A\/90 se calcula desde minutos y eventos oficiales');
assert.match(appSource, /opponentCrest:\s*row\.match\.opponentCrest/, 'el historial recibe el escudo rival cuando existe');
assert.match(appSource, /date:\s*matchDisplayDate\(match\.date\)/, 'la ficha de acción recibe la fecha real');
assert.match(appSource, /result:\s*score\.hasScore \? [`]?[\s\S]*?: 'Sin datos'/, 'un partido sin resultado no se convierte artificialmente en 0-0');
assert.match(appSource, /report:\s*playerPdfModel/, 'el modelo normalizado llega directamente al renderizador PDF');
assert.match(footballMapSource, /<circle cx="34" cy="52\.5"[\s\S]*<rect x="14" y="2"[\s\S]*<rect x="24" y="2"[\s\S]*className="pitch-goal"/, 'los tres mapas reutilizan un campo con círculo, áreas, áreas pequeñas y porterías');
assert.match(printCss, /Dossier profesional individual 2026\/27/);
assert.match(printCss, /\.player-pdf-primary-stats\s*\{[\s\S]*grid-template-columns:\s*repeat\(5/, 'las métricas principales tienen jerarquía numérica propia');
assert.match(printCss, /\.player-pdf-history col\.opponent \{ width:\s*39mm;/, 'el rival recibe anchura suficiente y evita truncados administrativos');
assert.match(printCss, /\.football-zone-map\.is-print\s*\{[\s\S]*width:\s*45mm/, 'los tres campos conservan proporción legible en A4');
const finalDossierCssStart = printCss.indexOf('Dossier profesional individual 2026/27');
const connectionCssStart = printCss.indexOf('.player-pdf-connections {', finalDossierCssStart);
const connectionCss = printCss.slice(connectionCssStart, printCss.indexOf('.player-pdf-actions {', connectionCssStart));
assert.match(connectionCss, /grid-template-columns:\s*minmax\(0, 1fr\)/, 'las conexiones se apilan sin comprimir dos filas en una columna estrecha');
assert.match(connectionCss, /line-height:\s*1\.28/, 'los nombres disponen de altura de línea explícita');
assert.match(connectionCss, /padding:\s*2\.2mm 0/, 'cada conexión reserva espacio vertical legible');
assert.doesNotMatch(connectionCss, /overflow:\s*hidden|text-overflow:\s*ellipsis/, 'los nombres nunca se recortan ni se sustituyen por elipsis');
assert.doesNotMatch(printCss.slice(printCss.indexOf('Dossier profesional individual 2026/27')), /transform:\s*scale\(/, 'el dossier no se resuelve escalando globalmente una pantalla web');

console.log('playerProfilePrintReport tests passed');
