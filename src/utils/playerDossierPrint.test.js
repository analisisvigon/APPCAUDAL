import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inspectPlayerDossier, printPlayerDossier } from './playerDossierPrint.js';

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
assert.match(appSource, /printPlayerDossier\([\s\S]*?window\.print\(\)/, 'el botón valida el informe específico antes de abrir la impresión nativa');
assert.ok(playerVisibilityOverride > lastGlobalVisibilityReset, 'la visibilidad del perfil se restaura después del reset global que causaba páginas blancas');
assert.match(overrideBlock, /visibility:\s*visible\s*!important/, 'el contenido del perfil vence el visibility hidden global');

console.log('playerDossierPrint tests passed');
