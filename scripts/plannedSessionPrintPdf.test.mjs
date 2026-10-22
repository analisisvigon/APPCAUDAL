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
import { autoPlayerLayout } from '../src/utils/plannedSessionDistributions.js';

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
  two_brief: [slot('m1', 'main'), slot('m2', 'main')],
  three_normal: [slot('a', 'activation'), slot('m1', 'main'), slot('m2', 'main'), slot('m3', 'main')],
  four_normal: [slot('a', 'activation'), ...[1, 2, 3, 4].map((i) => slot(`m${i}`, 'main'))],
  four_boards: [slot('a', 'activation', [library('a')]), ...[1, 2, 3, 4].map((i) => slot(`m${i}`, 'main', [library(`m${i}`)]))],
  two_boards: [slot('m1', 'main', [library('m1')]), slot('m2', 'main', [library('m2')])],
  activation_main_cooldown: [slot('a', 'activation'), slot('m1', 'main'), slot('m2', 'main'), slot('c', 'cooldown')],
  parallel: [slot('a', 'activation'), slot('m1', 'main', [free('m1a'), free('m1b')]), slot('m2', 'main'), slot('c', 'cooldown')],
  board_teams: [slot('a', 'activation', [library('a')]), slot('m1', 'main', [library('m1')]), slot('m2', 'main')],
  roster_24: [slot('a', 'activation'), slot('m1', 'main'), slot('m2', 'main')],
  player_board_24: [slot('a', 'activation'), slot('m1', 'main'), slot('m2', 'main')],
  player_board_433: [slot('a', 'activation'), slot('m1', 'main'), slot('m2', 'main')],
  player_board_532: [slot('a', 'activation'), slot('m1', 'main'), slot('m2', 'main')],
  long_text: [slot('a', 'activation'), slot('m1', 'main', [libraryWithLongText()]), slot('m2', 'main')],
  overfull: [slot('a', 'activation'), slot('m1', 'main', [free('m1', 'Contenido excepcionalmente extenso. '.repeat(160))])],
};
// Nombres de los 24 jugadores aprobados por el propietario; fixture local, sin consultar producción.
const approvedRosterNames = [
  ['goalkeeper', 'Alex González'], ['goalkeeper', 'Samuel González'],
  ['defender', 'Borja Rodríguez'], ['defender', 'Cristian Ebea'],
  ['defender', 'Iago Delgado'], ['defender', 'José Martínez'],
  ['defender', 'Julio Rodríguez'], ['defender', 'Marcos Barroso'],
  ['defender', 'Marcos Trabanco'], ['defender', 'Omar Falah'],
  ['defender', 'Roberto Albuquerque'],
  ['midfielder', 'Agustín Porto'], ['midfielder', 'Julio Delgado'],
  ['midfielder', 'Kike Fanjul'], ['midfielder', 'Lucas Suárez'],
  ['midfielder', 'Vicente Antuña'],
  ['forward', 'Cristian Acerete'], ['forward', 'Daniel Palalcio'],
  ['forward', 'David Fernández García'], ['forward', 'Diego Boza'],
  ['forward', 'Isaac Martín'], ['forward', 'Isma Cerro'],
  ['forward', 'Jairo Cárcaba'], ['forward', 'Óscar Fernández'],
];
for (const [name, slots] of Object.entries(fixtures)) {
  const editor = { ...base, slots };
  const playerBoard = name.startsWith('player_board_');
  const boardFormation = name === 'player_board_433' ? '4-3-3'
    : name === 'player_board_532' ? '5-3-2' : '4-2-3-1';
  const roster = (name === 'roster_24' || playerBoard) ? approvedRosterNames.map(([position, playerName], index) => ({
    player_id: `fixture-player-${index}`, player_name_snapshot: playerName,
    position_key_snapshot: position,
  })) : [];
  const positionKeys = ['goalkeeper', 'goalkeeper', 'right_back', 'right_back',
    'centre_back', null, 'centre_back', 'centre_back', 'left_back', 'centre_back', 'left_back',
    'holding_midfield', 'central_midfield', 'central_midfield', 'attacking_midfield', 'left_midfield',
    'right_winger', 'centre_forward', 'centre_forward', 'centre_forward', 'second_striker',
    'left_winger', 'centre_forward', 'centre_forward'];
  const positionById = new Map(roster.map((player, index) => [player.player_id, positionKeys[index]]));
  const boardLayout = playerBoard ? autoPlayerLayout(roster, positionById, boardFormation) : [];
  const centralAnchor = boardLayout.find((item) => item.player_id === 'fixture-player-4');
  const savedPlayerDistribution = { formation_key: playerBoard ? boardFormation : null,
    player_layout: boardLayout.map((item) => item.player_id === 'fixture-player-5'
      ? { player_id: item.player_id, placement: 'manual', x: centralAnchor.x, y: centralAnchor.y } : item),
    space_zones: [] };
  const markup = renderToStaticMarkup(React.createElement(PlannedSessionPrintPages, { editor,
    selected: { team_id: '85a16f33-9fe5-44d4-b85d-37d73651ebf6', team_name: 'C.D. Caudal', label: '2026/2027' },
    roster, positionById, playerDistribution: savedPlayerDistribution,
    availability: (name === 'roster_24' || playerBoard) ? {
      'fixture-player-1': { status: 'injured' },
      'fixture-player-10': { status: 'absent' },
      'fixture-player-16': { status: 'adapted' },
    } : {} }));
  assert.doesNotMatch(markup, /<button|<textarea|<input|Cambiar tarea de Biblioteca|Más detalles/);
  if (name === 'two_brief' || name === 'two_boards') assert.match(markup, /data-layout="two"/);
  if (name === 'three_normal') assert.match(markup, /data-layout="three"/);
  if (name === 'four_normal' || name === 'four_boards') assert.match(markup, /data-layout="grid"/);
  if (name === 'board_teams') assert.match(markup, /Pepe[\s\S]*Luis/);
  if (name === 'roster_24') {
    for (const [, playerName] of approvedRosterNames) assert.ok(markup.includes(playerName), playerName);
    assert.match(markup, /Nº jugadores[\s\S]*22/);
    assert.equal((markup.match(/planned-roster-group-two-columns/g) || []).length, 3,
      'defensas, centrocampistas y delanteros usan dos columnas');
    assert.equal((markup.match(/planned-roster-player-no-training/g) || []).length, 2);
    assert.equal((markup.match(/planned-roster-player-adapted/g) || []).length, 1);
  }
  if (name === 'parallel') {
    assert.match(markup, /Tarea A[\s\S]*Tarea B/);
    assert.equal((markup.match(/Tiempo total:/g) || []).length, slots.length,
      'la duración se cuenta una sola vez por ejercicio, también con tareas A y B');
  }
  if (playerBoard) {
    assert.equal((markup.match(/title="(?:Alex|Samuel|Borja|Cristian|Iago|José|Julio|Marcos|Omar|Roberto|Agustín|Kike|Lucas|Vicente|Daniel|David|Diego|Isaac|Isma|Jairo|Óscar)/g) || []).length, 24);
    assert.doesNotMatch(markup, /Restablecer distribución automática|<select/);
  }
  const css = pathToFileURL(path.join(root, 'src/components/training/plannedSessionPrint.css')).href;
  const documentCss = pathToFileURL(path.join(root, 'src/components/training/plannedSessionDocument.css')).href;
  const globalPrint = pathToFileURL(path.join(root, 'src/styles/print.css')).href;
  const crest = pathToFileURL(path.join(root, 'public/pwa-512x512.png')).href;
  const previewCss = (name === 'roster_24' || playerBoard) ? '<style media="screen">body{margin:0}.planned-print-portal{position:static;left:auto;visibility:visible;pointer-events:auto}</style>' : '';
  const boardCheck = playerBoard ? `<script>window.addEventListener('load', () => {
    const field = document.querySelector('.planned-distribution-player-field');
    const bounds = field.getBoundingClientRect();
    const cards = [...field.querySelectorAll('.planned-distribution-player-group')];
    const outside = cards.some((card) => { const box = card.getBoundingClientRect(); return box.left < bounds.left - 1 || box.right > bounds.right + 1 || box.top < bounds.top - 1 || box.bottom > bounds.bottom + 1; });
    const overlap = cards.some((left, index) => cards.slice(index + 1).some((right) => { const a = left.getBoundingClientRect(), b = right.getBoundingClientRect(); return a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1; }));
    const textOverflow = cards.some((card) => { const box = card.getBoundingClientRect(); return card.scrollHeight > card.clientHeight + 1 || card.scrollWidth > card.clientWidth + 1 || [...card.querySelectorAll('span,b')].some((part) => { const text = part.getBoundingClientRect(); return text.left < box.left - 1 || text.right > box.right + 1 || text.top < box.top - 1 || text.bottom > box.bottom + 1 || part.scrollWidth > part.clientWidth + 1 || part.scrollHeight > part.clientHeight + 1; }); });
    document.documentElement.dataset.playerBoardOutside = String(outside);
    document.documentElement.dataset.playerBoardOverlap = String(overlap);
    document.documentElement.dataset.playerBoardTextOverflow = String(textOverflow);
    field.style.height = '63mm';
    const screenBounds = field.getBoundingClientRect();
    const screenOutside = cards.some((card) => { const box = card.getBoundingClientRect(); return box.left < screenBounds.left - 1 || box.right > screenBounds.right + 1 || box.top < screenBounds.top - 1 || box.bottom > screenBounds.bottom + 1; });
    const screenPairs = cards.flatMap((left, index) => cards.slice(index + 1).filter((right) => { const a = left.getBoundingClientRect(), b = right.getBoundingClientRect(); return a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1; }).map((right) => left.querySelector('b').textContent + '/' + right.querySelector('b').textContent));
    const screenOverlap = screenPairs.length > 0;
    const screenTextOverflow = cards.some((card) => { const box = card.getBoundingClientRect(); return card.scrollHeight > card.clientHeight + 1 || [...card.querySelectorAll('span,b')].some((part) => { const text = part.getBoundingClientRect(); return text.top < box.top - 1 || text.bottom > box.bottom + 1 || part.scrollWidth > part.clientWidth + 1 || part.scrollHeight > part.clientHeight + 1; }); });
    document.documentElement.dataset.playerBoardScreenOutside = String(screenOutside);
    document.documentElement.dataset.playerBoardScreenOverlap = String(screenOverlap);
    document.documentElement.dataset.playerBoardScreenPairs = screenPairs.join(',');
    document.documentElement.dataset.playerBoardScreenTextOverflow = String(screenTextOverflow);
    field.style.height = '';
  });</script>` : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${globalPrint}"><link rel="stylesheet" href="${documentCss}"><link rel="stylesheet" href="${css}">${previewCss}</head><body><div class="planned-print-portal"><style media="print">@page { size: A4 landscape; margin: 0; }</style>${markup.replaceAll('/pwa-512x512.png', crest)}</div><script>window.addEventListener('load', () => { const limit = 210 * 96 / 25.4; const sheets = [...document.querySelectorAll('.planned-print-sheet')]; document.documentElement.dataset.printOverflow = String(sheets.length > 2 || sheets.some((sheet) => sheet.getBoundingClientRect().height > limit + 2 || sheet.scrollHeight > limit + 2)); const defender = [...document.querySelectorAll('.planned-roster-group')].find((group) => group.querySelector('b')?.textContent === 'Defensas'); document.documentElement.dataset.defenderColumns = defender ? getComputedStyle(defender.querySelector('.planned-roster-players')).gridTemplateColumns.split(' ').length : 0; document.documentElement.dataset.rosterOverflow = String([...document.querySelectorAll('.planned-roster-player')].some((player) => player.scrollWidth > player.clientWidth + 1)); });</script>${boardCheck}</body></html>`;
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
  if (name === 'roster_24') {
    const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
      '--disable-extensions', '--dump-dom', pathToFileURL(htmlPath).href],
    { timeout: 30000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    assert.match(dom, /data-print-overflow="false"/);
    assert.match(dom, /data-defender-columns="2"/);
    assert.match(dom, /data-roster-overflow="false"/);
    const previewPath = path.join(output, 'roster_24_preview.png');
    execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions',
      '--window-size=1200,900', `--screenshot=${previewPath}`, pathToFileURL(htmlPath).href],
    { timeout: 30000, stdio: 'pipe' });
    assert.ok(existsSync(previewPath));
    console.log(`Vista previa de los 24 jugadores: ${previewPath}`);
  }
  if (playerBoard) {
    const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
      '--disable-extensions', '--dump-dom', pathToFileURL(htmlPath).href],
    { timeout: 30000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    assert.match(dom, /data-player-board-outside="false"/);
    assert.match(dom, /data-player-board-overlap="false"/);
    assert.match(dom, /data-player-board-text-overflow="false"/);
    assert.match(dom, /data-player-board-screen-outside="false"/);
    assert.equal(/data-player-board-screen-overlap="true"/.test(dom), false,
      `${name}: solapamientos en edición: ${dom.match(/data-player-board-screen-pairs="([^"]*)"/)?.[1]}`);
    assert.match(dom, /data-player-board-screen-text-overflow="false"/);
    const previewPath = path.join(output, `${name}_preview.png`);
    execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions',
      '--window-size=1200,900', `--screenshot=${previewPath}`, pathToFileURL(htmlPath).href],
    { timeout: 30000, stdio: 'pipe' });
    console.log(`Vista previa de pizarra con 24 jugadores: ${previewPath}`);
  }
  console.log(`${name}: ${pdfPath}`);
}
console.log(`PDFs de prueba: ${output}`);
