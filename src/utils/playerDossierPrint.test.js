import assert from 'node:assert/strict';
import fs from 'node:fs';
import { jsPDF } from 'jspdf';
import { inspectPlayerDossier, printPlayerDossier } from './playerDossierPrint.js';
import { auditPlayerPdfLinkAnnotations } from './playerProfilePdfExport.js';

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

assert.match(appSource, /<PlayerProfilePdfReport report=\{playerPdfReport\}/, 'el flujo selecciona el informe A4 específico y no la ficha web');
assert.match(appSource, /exportPlayerProfilePdf\(\{[\s\S]*?documentRef:\s*document/, 'el botón usa el generador controlado que puede escribir anotaciones PDF');
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
assert.match(exporterSource, /pdf\.link\(link\.x, link\.y, link\.width, link\.height, \{ url: link\.url \}\)/, 'el generador crea anotaciones PDF sobre los anchors actuales');
assert.match(exporterSource, /auditPlayerPdfLinkAnnotations\(arrayBuffer, expectedVideoUrls\)/, 'el binario final se audita antes de iniciar la descarga');

console.log('playerDossierPrint tests passed');
