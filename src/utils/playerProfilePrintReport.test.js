import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPlayerProfilePrintReport, getPlayerReportActionUrl } from './playerProfilePrintReport.js';

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
    { id: 'assist-10', type: 'Asistencia', minute: 10, opponent: 'CD Praviano', date: '16/08/2026', url: 'https://video.example/assist?t=10' },
    { id: 'goal-72', type: 'Gol', minute: 72, opponent: 'Rival', url: '' },
  ],
  history: [{ id: 'match-1', goals: 1, assists: 1, goalLinks: ['https://video.example/goal?t=72'], assistLinks: ['javascript:alert(1)'] }],
  influenceMaps: [
    { key: 'all', label: 'Todos', zones: [{ value: 'finalizacion_centro', count: 3 }] },
    { key: 'goals', label: 'Goles', zones: [{ value: 'finalizacion_centro', count: 1 }] },
    { key: 'assists', label: 'Asistencias', zones: [{ value: 'creacion_derecha', count: 2 }] },
  ],
});

assert.equal(filtered.seasonSummary.starterPercentage, 88, 'el dossier conserva el porcentaje objetivo de titularidad');
assert.equal(filtered.competitionBreakdown.length, 2, 'se omiten competiciones sin participación');
assert.deepEqual(filtered.competitionBreakdown.map((row) => row.goalContributions), [6, 1], 'G+A por competición se calcula desde eventos reales');
assert.equal(filtered.actions[0].url, 'https://video.example/assist?t=10', 'la URL exacta con timestamp se conserva');
assert.equal(filtered.actions[0].date, '16/08/2026', 'la videoteca conserva la fecha real de la acción');
assert.equal(filtered.actions[1].url, '', 'una acción sin URL permanece registrada pero no entra en la videoteca');
assert.deepEqual(filtered.history[0].goalLinks, ['https://video.example/goal?t=72']);
assert.deepEqual(filtered.history[0].assistLinks, [], 'el historial sólo conserva enlaces reales y seguros');
assert.equal(filtered.productionActions.length, 1, 'Acciones en vídeo sólo contiene acciones con URL canónica');
assert.deepEqual(filtered.pagePlan, ['summary', 'production'], 'el volumen normal genera exactamente dos A4');
assert.deepEqual(filtered.influenceMaps.map((map) => map.zones[0].count), [3, 1, 2], 'Todos, Goles y Asistencias conservan datasets independientes');

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
assert.equal(noProduction.productionActions.length, 0, 'sin vídeos reales no se generan CTA falsos');
assert.deepEqual(noProduction.pagePlan, ['summary', 'production'], 'la ausencia de producción no crea páginas vacías');

const dense = buildPlayerProfilePrintReport({
  actions: Array.from({ length: 27 }, (_, index) => ({ id: `a-${index}`, type: 'Gol', minute: index + 1, url: `https://video.example/${index}` })),
  history: Array.from({ length: 53 }, (_, index) => ({ id: `m-${index}` })),
});
assert.equal(dense.summaryHistory.length, 18);
assert.deepEqual(dense.historyOverflow.map((page) => page.length), [30, 5], 'el historial largo se pagina sin recortar filas');
assert.deepEqual(dense.actionOverflow.map((page) => page.length), [16, 1], 'la videoteca larga se pagina sin recortar acciones');
assert.equal(dense.pagePlan.length, 6, 'sólo se añaden páginas cuando el volumen excede dos A4');

const componentSource = fs.readFileSync(new URL('../components/print/PlayerProfilePdfReport.jsx', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const printCss = fs.readFileSync(new URL('../styles/print.css', import.meta.url), 'utf8');
const footballMapSource = fs.readFileSync(new URL('../components/visualization/FootballZoneMap.jsx', import.meta.url), 'utf8');

assert.match(componentSource, /data-player-pdf-page="summary"/);
assert.match(componentSource, /data-player-pdf-page="production"/);
assert.match(componentSource, /HistoryContinuationPage/);
assert.match(componentSource, /VideoContinuationPage/);
assert.match(componentSource, /Rendimiento · Temporada/);
assert.match(componentSource, /Rendimiento por competición/);
assert.match(componentSource, /Historial partido a partido/);
assert.match(componentSource, /Todas las acciones/);
assert.match(componentSource, /Producción ofensiva/);
assert.match(componentSource, /Conexiones de gol/);
assert.match(componentSource, /Acciones en vídeo/);
assert.match(componentSource, /data-player-video-link="history"/, 'el historial conserva enlaces PDF identificables');
assert.match(componentSource, /data-player-video-link="library"/, 'todo el CTA de videoteca conserva su enlace PDF');
assert.doesNotMatch(componentSource, /Impacto en el tiempo|player-pdf-timeline/, 'se elimina por completo el timeline subjetivo');
assert.doesNotMatch(componentSource, /Evolución de temporada|seasonStages|rating/, 'se eliminan evolución y notas del dossier');
assert.doesNotMatch(componentSource, /window\.open|onClick=/, 'el PDF no simula enlaces mediante JavaScript');
assert.match(appSource, /team:\s*'C\.D\. Caudal de Mieres'/, 'el modelo recibe el equipo real');
assert.match(appSource, /competitionBreakdown:\s*pdfCompetitionRows/, 'el desglose se construye desde partidos filtrados reales');
assert.match(appSource, /goalContributionsPer90/, 'G+A\/90 se calcula desde minutos y eventos oficiales');
assert.match(appSource, /opponentCrest:\s*row\.match\.opponentCrest/, 'el historial recibe el escudo rival cuando existe');
assert.match(appSource, /date:\s*matchDisplayDate\(event\.match\.date\)/, 'la videoteca recibe la fecha real');
assert.match(appSource, /result:\s*score\.hasScore \? [`]?[\s\S]*?: 'Sin datos'/, 'un partido sin resultado no se convierte artificialmente en 0-0');
assert.match(appSource, /createPortal\(<PlayerProfilePdfReport report=\{playerPdfReport\} \/>, document\.body\)/, 'el dossier A4 se monta fuera del DOM interactivo');
assert.match(footballMapSource, /<circle cx="34" cy="52\.5"[\s\S]*<rect x="14" y="2"[\s\S]*<rect x="24" y="2"[\s\S]*className="pitch-goal"/, 'los tres mapas reutilizan un campo con círculo, áreas, áreas pequeñas y porterías');
assert.match(printCss, /Dossier profesional individual 2026\/27/);
assert.match(printCss, /\.player-pdf-primary-stats\s*\{[\s\S]*grid-template-columns:\s*repeat\(5/, 'las métricas principales tienen jerarquía numérica propia');
assert.match(printCss, /\.player-pdf-history col\.opponent \{ width:\s*39mm;/, 'el rival recibe anchura suficiente y evita truncados administrativos');
assert.match(printCss, /\.football-zone-map\.is-print\s*\{[\s\S]*width:\s*45mm/, 'los tres campos conservan proporción legible en A4');
assert.doesNotMatch(printCss.slice(printCss.indexOf('Dossier profesional individual 2026/27')), /transform:\s*scale\(/, 'el dossier no se resuelve escalando globalmente una pantalla web');

console.log('playerProfilePrintReport tests passed');
