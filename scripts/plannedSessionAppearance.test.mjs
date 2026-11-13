// Local fixtures only: no Supabase connection or real player mutations.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const cache = path.resolve('node_modules/.cache');
mkdirSync(cache, { recursive: true });
async function bundle(name) {
  const outfile = path.join(cache, `session-appearance-${name}.mjs`);
  await build({ entryPoints: [path.resolve(`src/components/training/${name}.jsx`)], bundle: true,
    platform: 'node', format: 'esm', jsx: 'automatic', outfile,
    external: ['react', 'react-dom', 'react/jsx-runtime'], loader: { '.css': 'empty' }, logLevel: 'silent' });
  return import(pathToFileURL(outfile).href);
}
const { PlannedSessionPrintPages } = await bundle('PlannedSessionPrint');
const { PlannedSessionBatchPrintPages } = await bundle('PlannedSessionBatchPrint');
const { default: PlannedSessionRoster } = await bundle('PlannedSessionRoster');
const { default: Board } = await bundle('TrainingTaskBoardPreview');
const pdfTextMatrices = (pdf) => {
  const matrices = [];
  for (const stream of pdf.matchAll(/(\d+)\s+0\s+obj([\s\S]*?)stream\r?\n/g)) {
    if (!stream[2].includes('/FlateDecode')) continue;
    const start = stream.index + stream[0].length;
    const end = pdf.indexOf('endstream', start);
    const bytes = Buffer.from(pdf.slice(start, end).replace(/\r?\n$/, ''), 'latin1');
    const decoded = inflateSync(bytes).toString('latin1');
    for (const matrix of decoded.matchAll(/([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\s+[-+]?\d*\.?\d+\s+[-+]?\d*\.?\d+\s+Tm\b/g)) {
      matrices.push([Number(matrix[1]), Number(matrix[2]), Number(matrix[3]), Number(matrix[4])]);
    }
  }
  return matrices;
};
const payload = { schemaVersion: 1, board: { pitchType: 'full', elements: [
  { id: 'red', type: 'participant', colorKey: 'red', x: 30, y: 22, label: 'R' },
  { id: 'blue', type: 'participant', colorKey: 'blue', x: 65, y: 45, label: 'A' },
  { id: 'goal', type: 'goal', colorKey: 'white', x: 90, y: 36, rotation: 90 },
  { id: 'mini', type: 'mini_goal', colorKey: 'white', x: 8, y: 36, rotation: -90 },
  { id: 'zone', type: 'zone', colorKey: 'orange', x: 35, y: 28, width: 22, height: 15, label: 'Zona' },
  { id: 'arrow', type: 'arrow', colorKey: 'white', x1: 30, y1: 22, x2: 65, y2: 45 },
  { id: 'text', type: 'text', colorKey: 'white', x: 50, y: 60, label: 'Apoyo' },
  { id: 'cone', type: 'cone', colorKey: 'orange', x: 22, y: 42 },
] } };
const geometry = (markup) => [...markup.matchAll(/\b(?:viewBox|cx|cy|x|y|x1|y1|x2|y2|d|transform|r|rx|width|height)="([^"]*)"/g)]
  .map((match) => match[0]);
for (const pitchType of ['full', 'half', 'blank', 'penalty-area']) {
  const board = { ...payload, board: { ...payload.board, pitchType } };
  const before = JSON.stringify(board);
  const green = renderToStaticMarkup(React.createElement(Board, { payload: board }));
  const bw = renderToStaticMarkup(React.createElement(Board, { payload: board, pitchAppearance: 'bw' }));
  for (const markup of [green, bw]) {
    assert.match(markup, /fill="#dc2626"/);
    assert.match(markup, /fill="#2563eb"/);
    assert.match(markup, /fill="#f97316"/);
    assert.match(markup, /Apoyo/);
  }
  assert.match(green, /fill="#176b3a"/);
  assert.doesNotMatch(bw, /#176b3a|grayscale|stroke="#f8fafc"/);
  assert.match(bw, /stroke="#374151"/);
  // Grass striping is decorative; all field and overlay geometry is identical.
  const unstripedGreen = green.replace(/<rect[^>]*opacity="0\.0(?:25|35)"[^>]*><\/rect>|<rect[^>]*opacity="0\.0(?:25|35)"[^>]*\/>/g, '');
  assert.deepEqual(geometry(bw), geometry(unstripedGreen), `${pitchType}: positions and dimensions unchanged`);
  assert.equal(JSON.stringify(board), before);
}

const session = { id: 'fixture', editor: { session_date: '2026-11-13', session_number: 9,
  header: { objectives: 'Progresar con apoyos', material: 'Conos y petos' }, slots: [
    { id: 'exercise', phase: 'main', duration: '15', items: [{ id: 'item', kind: 'library_task',
      snapshot: { source: { name: 'Ejercicio de prueba', description: 'Desarrollo completo', editor_payload: payload }, working: {} }, working: {} }] },
  ] }, roster: [
    { player_id: 'p1', player_name_snapshot: 'Jugador convocado', position_key_snapshot: 'defender' },
    { player_id: 'p2', player_name_snapshot: 'Jugador disponible', position_key_snapshot: 'forward' },
    { player_id: 'p3', player_name_snapshot: 'Jugador lesionado', position_key_snapshot: 'goalkeeper' },
    { player_id: 'p4', player_name_snapshot: 'Jugador ausente', position_key_snapshot: 'midfielder' },
    { player_id: 'p5', player_name_snapshot: 'Jugador adaptado', position_key_snapshot: 'defender' },
  ], availability: {
    p1: { status: 'first_team', observation: 'Entrena con el primer equipo' },
    p3: { status: 'injured' },
    p4: { status: 'absent' },
    p5: { status: 'adapted' },
  },
  distribution: { formation_key: null, player_layout: [], space_zones: [
    { slot_id: 'exercise', x: 20, y: 20, w: 40, h: 30, color: 'blue' },
  ] }, positionById: new Map() };
const selected = { team_name: 'Equipo de prueba', label: '2026/2027' };
const before = JSON.stringify(session);
const chrome = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium', '/usr/bin/google-chrome']
  .filter(Boolean).find(existsSync);
assert.ok(chrome, 'Chrome/Edge required for real PDF checks');
const output = mkdtempSync(path.join(tmpdir(), 'nexo-session-appearance-'));
const css = ['plannedSessionDocument.css', 'plannedSessionPrint.css'].map((file) =>
  readFileSync(`src/components/training/${file}`, 'utf8')).join('\n');
const screenRoster = renderToStaticMarkup(React.createElement(PlannedSessionRoster, {
  roster: session.roster, frozen: true, availability: session.availability,
}));
for (const pitchAppearance of ['green', 'bw']) {
  for (const batch of [false, true]) {
    const markup = renderToStaticMarkup(batch
      ? React.createElement(PlannedSessionBatchPrintPages, { sessions: [session, { ...session, id: 'second' }], selected, pitchAppearance })
      : React.createElement(PlannedSessionPrintPages, { ...session, selected, pitchAppearance }));
    assert.match(markup, /Jugador convocado<\/span><small class="planned-roster-status-abbreviation" aria-hidden="true">1EQ<\/small>/);
    assert.match(markup, /Jugador lesionado<\/span><small class="planned-roster-status-abbreviation" aria-hidden="true">LES<\/small>/);
    assert.match(markup, /Jugador ausente<\/span><small class="planned-roster-status-abbreviation" aria-hidden="true">AUS<\/small>/);
    assert.match(markup, /Jugador adaptado<\/span><small class="planned-roster-status-abbreviation" aria-hidden="true">ADAP<\/small>/);
    assert.doesNotMatch(markup, /Jugador disponible<\/span><small class="planned-roster-status-abbreviation"/);
    assert.match(markup, /Primer equipo/);
    assert.match(markup, /Disponibles <strong>1<\/strong>/);
    assert.match(markup, /Ausentes <strong>1<\/strong>/);
    assert.match(markup, /Lesionados <strong>1<\/strong>/);
    assert.match(markup, /Trabajo adaptado <strong>1<\/strong>/);
    assert.match(markup, /Primer equipo <strong>1<\/strong>/);
    assert.match(markup, /Entrena con el primer equipo/);
    for (const position of ['goalkeeper', 'defender', 'midfielder', 'forward']) {
      assert.match(markup, new RegExp(`planned-roster-group-${position}`));
    }
    assert.equal(JSON.stringify(session), before);
    const name = `${batch ? 'batch' : 'individual'}-${pitchAppearance}`;
    const html = path.join(output, `${name}.html`);
    const pdf = path.join(output, `${name}.pdf`);
    writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"><style>${css}
      body{margin:0}.planned-print-pages{visibility:visible}.planned-print-pages:not(:last-child)>.planned-print-sheet:last-child{break-after:page}
      .roster-screen-probe{position:absolute;top:-1000mm;left:0;width:297mm}@media print{.roster-screen-probe{display:none!important}}
      </style></head><body><div class="roster-screen-probe">${screenRoster}</div>${markup}
      <script>window.addEventListener('load',()=>{const positions=['goalkeeper','defender','midfielder','forward'];const colors=(root)=>positions.map((position)=>{const heading=document.querySelector(root+' .planned-roster-group-'+position+' > b');return heading?getComputedStyle(heading).backgroundColor:'missing'}).join('|');document.documentElement.dataset.screenRosterHeadingColors=colors('.roster-screen-probe');document.documentElement.dataset.printRosterHeadingColors=colors('.planned-print-pages');const abbreviations=[...document.querySelectorAll('.planned-print-pages .planned-roster-status-abbreviation')];document.documentElement.dataset.printRosterStatusColors=abbreviations.map((status)=>getComputedStyle(status).color).join('|');const overflow=(root)=>[...document.querySelectorAll(root+' .planned-roster-player')].some((player)=>player.scrollWidth>player.clientWidth+1||[...player.querySelectorAll('.planned-roster-name,.planned-roster-status-abbreviation')].some((part)=>part.scrollWidth>part.clientWidth+1));document.documentElement.dataset.screenRosterOverflow=String(overflow('.roster-screen-probe'));document.documentElement.dataset.printRosterOverflow=String(overflow('.planned-print-pages'))});</script></body></html>`);
    execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions',
      '--no-pdf-header-footer', `--print-to-pdf=${pdf}`, pathToFileURL(html).href], { timeout: 30000, stdio: 'pipe' });
    const bytes = readFileSync(pdf).toString('latin1');
    const pages = (bytes.match(/\/Type\s*\/Page\b/g) || []).length;
    assert.equal(pages, batch ? 4 : 2);
    const boxes = [...bytes.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)];
    assert.equal(boxes.length, pages);
    assert.ok(boxes.every((box) => Math.abs(Number(box[1]) - 841.89) < 1 && Math.abs(Number(box[2]) - 595.28) < 1));
    assert.doesNotMatch(bytes, /\/Rotate\s+(90|270)/);
    const matrices = pdfTextMatrices(bytes);
    assert.ok(matrices.length, `${name}: el PDF debe contener texto medible`);
    assert.ok(matrices.every(([, b, c]) => Math.abs(b) < 0.001 && Math.abs(c) < 0.001),
      `${name}: el texto debe leerse frontalmente`);
    if (!batch && pitchAppearance === 'green') {
      const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
        '--disable-extensions', '--dump-dom', pathToFileURL(html).href],
      { timeout: 30000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const headings = 'rgb\\(234, 242, 251\\)\\|rgb\\(237, 244, 238\\)\\|rgb\\(241, 237, 247\\)\\|rgb\\(251, 240, 229\\)';
      assert.match(dom, new RegExp(`data-screen-roster-heading-colors="${headings}"`));
      assert.match(dom, new RegExp(`data-print-roster-heading-colors="${headings}"`));
      assert.match(dom, /data-print-roster-status-colors="rgb\(174, 29, 50\)\|rgb\(152, 101, 0\)\|rgb\(29, 78, 216\)\|rgb\(174, 29, 50\)"/);
      assert.match(dom, /data-screen-roster-overflow="false"/);
      assert.match(dom, /data-print-roster-overflow="false"/);
    }
    execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions',
      '--window-size=1200,1700', `--screenshot=${path.join(output, `${name}.png`)}`, pathToFileURL(html).href],
    { timeout: 30000, stdio: 'pipe' });
    console.log(`${name}: ${pages} A4 landscape pages`);
  }
}
console.log(`PDFs and previews: ${output}`);
