// Prueba visual local; no conecta con Supabase ni usa datos de producción.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), '..');
const cache = path.join(root, 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = path.join(cache, 'appcaudal-planned-print-ssr.mjs');
await build({ entryPoints: [path.join(root, 'src/components/training/PlannedSessionPrint.jsx')],
  bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', outfile: bundle,
  external: ['react', 'react-dom', 'react/jsx-runtime'], loader: { '.css': 'empty' }, logLevel: 'silent' });
const { PlannedSessionPrintPages } = await import(pathToFileURL(bundle).href);
const output = mkdtempSync(path.join(tmpdir(), 'appcaudal-session-print-'));
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
assert.ok(existsSync(chrome), 'Chrome local necesario para generar los PDFs de prueba');
const board = {
  schemaVersion: 1,
  board: { pitchType: 'full', elements: [
    { id: 'player-1', type: 'participant', x: 18, y: 22 },
    { id: 'player-2', type: 'participant', x: 69, y: 48 },
    { id: 'ball-1', type: 'ball', x: 45, y: 36 },
  ] },
  assignments: { teamColors: { 'team-1': 'blue', 'team-2': 'red' }, players: [
    { teamKey: 'team-1', role: 'player', colorKey: 'blue', playerRef: { globalPlayerId: 'p1', snapshot: { name: 'Pepe' } } },
    { teamKey: 'team-2', role: 'player', colorKey: 'red', playerRef: { globalPlayerId: 'p2', snapshot: { name: 'Luis' } } },
  ] },
};
const free = (id, description = 'Rondo de conservación con apoyos y cambio de orientación.') => ({
  id: `${id}-item`, kind: 'free', title: `Ejercicio ${id}`, description,
});
const library = (id, description = 'Ataque organizado con balón y presión tras pérdida.') => ({
  id: `${id}-item`, kind: 'library_task', sourceTaskId: `${id}-source`, minutes: '',
  snapshot: { source_task_id: `${id}-source`, source: { name: `Tarea con pizarra ${id}`,
    description, material: 'Petos y balones', editor_payload: board,
    space_width_m: 35, space_length_m: 45 }, working: {} }, working: {},
});
const libraryWithLongText = () => {
  const item = library('m1', 'Desarrollo detallado: '.repeat(18));
  item.snapshot.source.material = 'Petos, conos, balones y apoyos exteriores. '.repeat(6);
  return item;
};
const slot = (id, phase, items = [free(id)]) => ({ id, phase, duration: '12', items });
const base = { id: 'fixture', session_date: '2026-10-25', session_number: 1,
  header: { starts_at: '10:00', location: 'Morf. patrón', period_label: 'Periodo de prueba',
    morphology_pattern: 'MD+2', next_opponent_label: 'Rival', objectives: 'Conservar y progresar.',
    material: 'Balones, petos y conos.', notes: 'Observaciones generales.',
    staff_observations: 'Ajustar cargas de trabajo.' } };
const fixtures = {
  four_normal: [slot('a', 'activation'), ...[1, 2, 3, 4].map((i) => slot(`m${i}`, 'main'))],
  activation_main_cooldown: [slot('a', 'activation'), slot('m1', 'main'), slot('m2', 'main'), slot('c', 'cooldown')],
  parallel: [slot('a', 'activation'), slot('m1', 'main', [free('m1a'), free('m1b')]), slot('m2', 'main'), slot('c', 'cooldown')],
  board_teams: [slot('a', 'activation', [library('a')]), slot('m1', 'main', [library('m1')]), slot('m2', 'main')],
  long_text: [slot('a', 'activation'), slot('m1', 'main', [libraryWithLongText()]), slot('m2', 'main')],
  overfull: [slot('a', 'activation'), slot('m1', 'main', [free('m1', 'Contenido excepcionalmente extenso. '.repeat(160))])],
};
for (const [name, slots] of Object.entries(fixtures)) {
  const editor = { ...base, slots };
  const markup = renderToStaticMarkup(React.createElement(PlannedSessionPrintPages, { editor,
    selected: { team_id: '85a16f33-9fe5-44d4-b85d-37d73651ebf6', team_name: 'C.D. Caudal', label: '2026/2027' } }));
  assert.doesNotMatch(markup, /<button|<textarea|<input|Cambiar tarea de Biblioteca|Más detalles/);
  if (name === 'board_teams') assert.match(markup, /Pepe[\s\S]*Luis/);
  if (name === 'parallel') assert.match(markup, /Tarea A[\s\S]*Tarea B/);
  const css = pathToFileURL(path.join(root, 'src/components/training/plannedSessionPrint.css')).href;
  const globalPrint = pathToFileURL(path.join(root, 'src/styles/print.css')).href;
  const crest = pathToFileURL(path.join(root, 'public/pwa-512x512.png')).href;
  const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${globalPrint}"><link rel="stylesheet" href="${css}"></head><body><div class="planned-print-portal"><style media="print">@page { size: A4 landscape; margin: 0; }</style>${markup.replaceAll('/pwa-512x512.png', crest)}</div><script>window.addEventListener('load', () => { const limit = 210 * 96 / 25.4; document.documentElement.dataset.printOverflow = String([...document.querySelectorAll('.planned-print-sheet')].length > 2 || [...document.querySelectorAll('.planned-print-sheet')].some((sheet) => sheet.getBoundingClientRect().height > limit + 2 || sheet.scrollHeight > limit + 2)); });</script></body></html>`;
  const htmlPath = path.join(output, `${name}.html`);
  const pdfPath = path.join(output, `${name}.pdf`);
  writeFileSync(htmlPath, html, 'utf8');
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions',
    '--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, pathToFileURL(htmlPath).href],
  { timeout: 30000, stdio: 'pipe' });
  assert.ok(existsSync(pdfPath), `no se generó ${name}.pdf`);
  const pdf = readFileSync(pdfPath).toString('latin1');
  const pages = (pdf.match(/\/Type\s*\/Page\b/g) || []).length;
  if (name === 'overfull') assert.ok(pages > 2, 'el contenido excesivo debe continuar sin truncarse');
  else assert.equal(pages, 2, `${name}: la sesión normal cabe en dos hojas A4`);
  assert.equal((pdf.match(/\/MediaBox\s*\[\s*0\s+0\s+841\.9[\d]*\s+594\.9[\d]*\s*\]/g) || []).length,
    pages, `${name}: cada hoja debe ser A4 horizontal real`);
  assert.doesNotMatch(pdf, /\/Rotate\s+(?:90|180|270)\b/, `${name}: sin rotaciones`);
  if (name === 'four_normal' || name === 'overfull') {
    const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
      '--disable-extensions', '--dump-dom', pathToFileURL(htmlPath).href],
    { timeout: 30000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    assert.match(dom, new RegExp(`data-print-overflow="${name === 'overfull'}"`),
      `${name}: la medición real del DOM debe distinguir contenido normal y excesivo`);
  }
  console.log(`${name}: ${pdfPath}`);
}
console.log(`PDFs de prueba: ${output}`);
