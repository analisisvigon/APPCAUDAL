import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildSetPiecePrintPages } from './setPiecePrintModel.js';

const css = fs.readFileSync(new URL('../styles/print.css', import.meta.url), 'utf8');
const sheet = fs.readFileSync(new URL('../components/print/SetPieceDiagramPrintSheet.jsx', import.meta.url), 'utf8');

const printMediaStart = css.lastIndexOf('@media print');
assert.ok(printMediaStart >= 0, 'debe existir el contrato de impresión compartido');
const printMedia = css.slice(printMediaStart);

assert.equal(css.includes('.player-dossier-report'), false, 'el antiguo dossier web no conserva reglas de impresión globales');
assert.equal(/@page\s*\{/.test(css), false, 'no existe un @page anónimo que imponga orientación o márgenes a otros documentos');
assert.match(css, /@page portrait\s*\{\s*size: A4 portrait;\s*margin: 0;/);
assert.match(css, /@page landscape\s*\{\s*size: A4 landscape;\s*margin: 0;/);

assert.equal(/html,\s*body,\s*#root\s*\{[^}]*width:\s*210mm/s.test(printMedia), false, 'el PDF individual no fuerza 210 mm sobre el root de ABP');
assert.match(printMedia, /html:has\(body > \.player-profile-print-portal\),[\s\S]*width: 210mm !important;[\s\S]*min-height: 297mm !important;/);
assert.equal(printMedia.includes('body > .print-dossier-portal {'), false, 'el portal individual no usa un selector genérico compartido con ABP');
assert.equal(printMedia.includes('body:has(> .print-dossier-portal)'), false, 'la geometría del portal queda discriminada por tipo de documento');

const abpRule = css.match(/\.set-piece-pro-sheet\s*\{([^}]*)\}/)?.[1] || '';
assert.match(abpRule, /--abp-page-width:\s*297mm/);
assert.match(abpRule, /--abp-page-height:\s*210mm/);
assert.match(abpRule, /width:\s*297mm/);
assert.match(abpRule, /max-width:\s*297mm/);
assert.match(abpRule, /height:\s*210mm/);
assert.match(abpRule, /max-height:\s*210mm/);
assert.match(abpRule, /box-sizing:\s*border-box/);
assert.match(abpRule, /overflow:\s*hidden/);
assert.equal(/transform\s*:\s*scale\(|zoom\s*:/.test(abpRule), false, 'la hoja ABP no usa escalado global');

assert.match(printMedia, /\.lineup-print-sheet\.set-piece-pro-sheet\s*\{[\s\S]*width: var\(--abp-page-width\) !important;[\s\S]*height: var\(--abp-page-height\) !important;/);
assert.match(sheet, /data-page-format="A4-landscape"/);
assert.match(sheet, /set-piece-pro-sheet abp-print-page \$\{preview \? 'set-piece-preview-sheet set-piece-is-preview' : ''\}/, 'preview e impresión usan el mismo nodo y geometría');

const plays = Array.from({ length: 3 }, (_, index) => ({
  id: `play-${index + 1}`,
  titulo: `Jugada ${index + 1}`,
  orden: index + 1,
  tipo: 'corner_ofensivo',
  elements: [],
}));
const pages = buildSetPiecePrintPages(plays, []);
assert.deepEqual(pages.map((page) => page.plays.length), [2, 1], 'la tercera jugada comienza una nueva hoja');
assert.equal(pages.every((page) => page.plays.length <= 2), true, 'ninguna hoja contiene más de dos jugadas');

console.log('setPiecePrintIsolation tests passed');
