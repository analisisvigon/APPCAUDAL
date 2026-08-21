import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPlayerProfilePrintReport, getPlayerReportActionUrl } from './playerProfilePrintReport.js';

assert.equal(getPlayerReportActionUrl('https://video.example/goal?t=72'), 'https://video.example/goal?t=72');
assert.equal(getPlayerReportActionUrl('javascript:alert(1)'), '', 'el PDF no admite enlaces no navegables o inseguros');
assert.equal(getPlayerReportActionUrl('/partidos/inventado'), '', 'no se inventan rutas internas sin URL absoluta real');

const metrics = [{ label: 'Minutos', value: "1840'" }, { label: 'Goles', value: 5 }];
const filtered = buildPlayerProfilePrintReport({
  identity: { name: 'Borja Rodríguez' },
  filters: { competition: 'Liga', venue: 'Visitante', influence: 'Asistencias' },
  metrics,
  production: { goalsPer90: 0.24, assistsPer90: 0.34, directGoalParticipation: 12 },
  actions: [
    { id: 'assist-10', type: 'Asistencia', minute: 10, opponent: 'CD Praviano', url: 'https://video.example/assist?t=10' },
    { id: 'goal-72', type: 'Gol', minute: 72, opponent: 'Rival', url: '' },
  ],
  history: [{ id: 'match-1', goals: 1, assists: 1, goalLinks: ['https://video.example/goal?t=72'], assistLinks: ['javascript:alert(1)'] }],
});

assert.deepEqual(filtered.filters, { competition: 'Liga', venue: 'Visitante', influence: 'Asistencias' }, 'el informe conserva exactamente los filtros activos');
assert.deepEqual(filtered.metrics, metrics, 'el layout reutiliza los indicadores ya calculados por el perfil');
assert.equal(filtered.actions[0].url, 'https://video.example/assist?t=10', 'la URL exacta con timestamp se conserva');
assert.equal(filtered.actions[1].url, '', 'una acción sin URL permanece como registro sin botón decorativo');
assert.deepEqual(filtered.history[0].goalLinks, ['https://video.example/goal?t=72']);
assert.deepEqual(filtered.history[0].assistLinks, [], 'el historial sólo conserva enlaces reales y seguros');
assert.equal(filtered.summaryHistory.length, 1, 'el historial corto se integra en la primera página');
assert.equal(filtered.productionActions.length, 2, 'la videoteca compacta se integra en la segunda página');
assert.deepEqual(filtered.pagePlan, ['summary', 'production'], 'un caso corto como Borja no genera una tercera página por separación artificial');

const compact = buildPlayerProfilePrintReport({ identity: { name: 'Sin muestra' }, metrics, live: { eventCount: 0 }, actions: [], history: [], timeline: [] });
assert.equal(compact.live, null, 'un registro en vivo vacío se omite por completo');
assert.deepEqual(compact.pagePlan, ['summary', 'production'], 'los bloques vacíos no crean una tercera página');

const overflow = buildPlayerProfilePrintReport({
  actions: Array.from({ length: 7 }, (_, index) => ({ id: `a-${index}`, type: 'Gol', minute: index + 1 })),
  history: Array.from({ length: 9 }, (_, index) => ({ id: `m-${index}` })),
});
assert.deepEqual(overflow.pagePlan, ['summary', 'production', 'overflow'], 'la tercera página sólo aparece cuando existe desbordamiento real');
assert.equal(overflow.summaryHistory.length, 8);
assert.equal(overflow.overflowHistory.length, 1);
assert.equal(overflow.productionActions.length, 6);
assert.equal(overflow.overflowActions.length, 1);

const componentSource = fs.readFileSync(new URL('../components/print/PlayerProfilePdfReport.jsx', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const printCss = fs.readFileSync(new URL('../styles/print.css', import.meta.url), 'utf8');

assert.match(componentSource, /data-player-pdf-page="summary"/);
assert.match(componentSource, /data-player-pdf-page="production"/);
assert.match(componentSource, /data-player-pdf-page="overflow"/);
assert.match(componentSource, /href=\{action\.url\}/, 'la videoteca imprime anchors reales');
assert.match(componentSource, /href=\{url\}/, 'cada gol o asistencia enlazable conserva su anchor individual en el historial');
assert.match(componentSource, /links=\{row\.goalLinks\}/, 'los goles enlazables permanecen navegables en el historial');
assert.match(componentSource, /links=\{row\.assistLinks\}/, 'las asistencias enlazables permanecen navegables en el historial');
assert.match(componentSource, /action\.url \? <a href=\{action\.url\}/, 'una acción sin URL no recibe un enlace falso');
assert.match(componentSource, /<HistoryTable rows=\{report\.summaryHistory\}/, 'el historial corto se imprime en la primera página');
assert.match(componentSource, /<Timeline groups=\{report\.timeline\}/, 'el impacto temporal comparte la segunda página y no crea una hoja propia');
assert.match(componentSource, /Principales asistentes/);
assert.match(componentSource, /Asistencias dadas a/);
assert.match(componentSource, /report\.live \?/, 'el registro en vivo sólo se monta cuando contiene muestra');
assert.match(componentSource, /Historial partido a partido/);
assert.doesNotMatch(componentSource, /window\.open|onClick=/, 'el PDF no simula enlaces mediante botones JavaScript');
assert.match(appSource, /createPortal\(<PlayerProfilePdfReport report=\{playerPdfReport\} \/>, document\.body\)/, 'el informe A4 se monta fuera del DOM interactivo');
assert.match(appSource, /competition:\s*playerCompetitionFilter[\s\S]*venue:\s*playerVenueFilter/, 'el modelo recibe los filtros activos');
assert.match(printCss, /\.player-pdf-page\s*\{[\s\S]*width:\s*210mm;[\s\S]*height:\s*297mm;/, 'cada página tiene geometría A4 explícita');
assert.match(printCss, /\.player-pdf-page:last-child\s*\{[\s\S]*page-break-after:\s*auto;/, 'la última página no fuerza una hoja vacía adicional');
assert.match(printCss, /--player-pdf-electric:\s*#20bfea/, 'la versión impresa recupera el azul eléctrico de APPCAUDAL');
assert.match(printCss, /\.player-pdf-action-grid article\s*\{[\s\S]*min-height:\s*15mm/, 'la videoteca utiliza fichas compactas y no miniaturas ficticias');

console.log('playerProfilePrintReport tests passed');
