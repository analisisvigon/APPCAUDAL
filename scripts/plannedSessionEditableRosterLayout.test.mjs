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
const bundle = path.join(cache, 'planned-session-editable-roster-ssr.mjs');
await build({ entryPoints: [path.join(root, 'src/components/training/PlannedSessionRoster.jsx')],
  bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', outfile: bundle,
  external: ['react', 'react-dom', 'react/jsx-runtime'], loader: { '.css': 'empty' }, logLevel: 'silent' });
const { default: PlannedSessionRoster } = await import(pathToFileURL(bundle).href);

const names = [
  'AY OUB AL HADIYA', 'AL BANOUDI', 'SUFYAN', 'ALI TAREK', 'MUBASHER',
  'Jugador central 6', 'Jugador lateral 7', 'Jugador medio 8', 'Jugador extremo 9',
  'Jugador delantero 10', 'Jugador central 11', 'Jugador lateral 12', 'Jugador medio 13',
  'Jugador extremo 14', 'Jugador delantero 15', 'Jugador central 16', 'Jugador lateral 17',
  'Jugador medio 18', 'Jugador extremo 19', 'Jugador delantero 20', 'Jugador central 21',
  'Jugador lateral 22', 'Jugador medio 23', 'Jugador extremo 24', 'Jugador delantero 25',
];
const positions = ['goalkeeper', 'centre_back', 'right_back', 'holding_midfield', 'right_winger', 'centre_forward'];
const roster = names.map((name, index) => ({ id: `membership-${index}`, player_id: `player-${index}`,
  name, player_name_snapshot: name, position_key_snapshot: 'defender' }));
const positionById = new Map(roster.map((row, index) =>
  [row.player_id, positions[index % positions.length]]));
const availability = {
  'player-0': { status: 'first_team', observation: 'Convocatoria del primer equipo' },
  'player-1': { status: 'injured', observation: 'Revisar molestias antes de entrenar' },
  'player-2': { status: 'absent', observation: '' },
  'player-3': { status: 'adapted', observation: 'Trabajo individual' },
};
const guests = [
  { id: 'guest-1', name: 'Invitado central', origin_team: 'JUV',
    position_group: 'central', status: 'available', is_guest: true },
  { id: 'guest-2', name: 'Invitado delantero', origin_team: '',
    position_group: 'forward', status: 'adapted', is_guest: true },
];
const markup = renderToStaticMarkup(React.createElement(PlannedSessionRoster, {
  roster, guests, frozen: true, availability, positionById, canEdit: true, canEditGuests: true,
  onAvailability() {},
}));

assert.equal((markup.match(/aria-label="Disponibilidad de /g) || []).length, 27);
assert.equal((markup.match(/aria-label="Editar observación de /g) || []).length, 25);
assert.match(markup, /AY OUB AL HADIYA/);
assert.match(markup, /AL BANOUDI/);
assert.match(markup, /SUFYAN/);
assert.match(markup, /ALI TAREK/);
assert.match(markup, /MUBASHER/);
assert.match(markup, /Plantilla <strong>25<\/strong>/);
assert.match(markup, /Invitados <strong>2<\/strong>/);
assert.match(markup, /Participantes <strong>24<\/strong>/);
assert.match(markup, /Total sesión <strong>27<\/strong>/);
assert.match(markup, /Disponibles <strong>22<\/strong>/);
assert.match(markup, /Ausentes <strong>1<\/strong>/);
assert.match(markup, /Lesionados <strong>1<\/strong>/);
assert.match(markup, /Trabajo adaptado <strong>2<\/strong>/);
assert.match(markup, /Invitado central<\/span><small class="planned-roster-guest-badge">INV<\/small>/);
assert.equal((markup.match(/class="planned-roster-guest-editor"/g) || []).length, 2);

const emptyMarkup = renderToStaticMarkup(React.createElement(PlannedSessionRoster, {
  roster: [], guests: [], frozen: true, canEditGuests: true,
}));
assert.equal((emptyMarkup.match(/\+ Añadir invitado/g) || []).length, 6,
  'cada demarcación permite añadir invitados aunque no tenga jugadores');
assert.doesNotMatch(emptyMarkup, /class="planned-roster-player /,
  'los grupos vacíos no crean filas vacías de jugadores');

const chromeCandidates = [
  process.env.CHROME_PATH,
  process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '',
  process.platform === 'win32' ? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' : '',
  process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '',
  process.platform === 'linux' ? '/usr/bin/google-chrome' : '',
  process.platform === 'linux' ? '/usr/bin/chromium' : '',
].filter(Boolean);
const chrome = chromeCandidates.find(existsSync);
assert.ok(chrome, 'Se necesita Chrome o Edge para comprobar la maquetación editable.');

const css = readFileSync(path.join(root, 'src/components/training/plannedSessionDocument.css'), 'utf8');
const output = mkdtempSync(path.join(tmpdir(), 'nexo-session-editable-roster-'));
const viewportCases = [
  { width: 390, height: 900, zoom: 0.32 },
  { width: 768, height: 1000, zoom: 0.64 },
  { width: 1280, height: 1000, zoom: 1 },
];

for (const viewport of viewportCases) {
  const htmlPath = path.join(output, `editable-${viewport.width}.html`);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}
    body{margin:0;background:#e2e8f0}.planned-document-viewport{height:100vh}
    .planned-document-pages{zoom:${viewport.zoom}}
    </style></head><body><div class="planned-document-viewport"><div class="planned-document-pages">
    <article class="planned-session-sheet"><div class="roster-probe">${markup}</div></article></div></div>
    <script>window.addEventListener('load',()=>{const root=document.querySelector('.roster-probe');
      const roster=root.querySelector('.planned-sheet-roster');
      const players=[...root.querySelectorAll('.planned-roster-player')];
      const names=[...root.querySelectorAll('.planned-roster-name')];
      const overlaps=players.some(player=>{const items=[...player.querySelectorAll(':scope > .planned-roster-name,:scope > .planned-roster-status-abbreviation,:scope > select,:scope > details')];
        return items.some((left,i)=>items.slice(i+1).some(right=>{const a=left.getBoundingClientRect(),b=right.getBoundingClientRect();
          return a.width&&b.width&&a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1}))});
      document.documentElement.dataset.groupColumns=String(getComputedStyle(roster).gridTemplateColumns.split(' ').length);
      document.documentElement.dataset.playerCount=String(players.length);
      document.documentElement.dataset.selectorCount=String(root.querySelectorAll('select').length);
      document.documentElement.dataset.noteEditorCount=String(root.querySelectorAll('.planned-roster-observation-editor').length);
      document.documentElement.dataset.badNameWrap=String(names.some(name=>getComputedStyle(name).wordBreak!=='normal'||getComputedStyle(name).overflowWrap!=='normal'));
      document.documentElement.dataset.playerOverflow=String(players.some(player=>player.scrollWidth>player.clientWidth+1||
        [...player.querySelectorAll('.planned-roster-name,.planned-roster-status-abbreviation')].some(item=>item.scrollWidth>item.clientWidth+1)));
      document.documentElement.dataset.controlOverlap=String(overlaps);
      document.documentElement.dataset.rosterHeightMm=String(Math.round(roster.getBoundingClientRect().height/(${96 / 25.4}*${viewport.zoom})));
      document.documentElement.dataset.pageOverflow=String(document.querySelector('.planned-document-viewport').scrollWidth>
        document.querySelector('.planned-document-viewport').clientWidth+1);
    });</script></body></html>`;
  writeFileSync(htmlPath, html, 'utf8');
  const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--disable-extensions', `--window-size=${viewport.width},${viewport.height}`,
    '--dump-dom', pathToFileURL(htmlPath).href], { timeout: 30000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  assert.match(dom, /data-group-columns="3"/, `${viewport.width}px: los seis grupos deben quedar en tres columnas`);
  assert.match(dom, /data-player-count="27"/);
  assert.match(dom, /data-selector-count="33"/);
  assert.match(dom, /data-note-editor-count="25"/);
  assert.match(dom, /data-bad-name-wrap="false"/);
  assert.match(dom, /data-player-overflow="false"/);
  assert.match(dom, /data-control-overlap="false"/);
  assert.match(dom, /data-page-overflow="false"/, `${viewport.width}px: el ajuste del documento no debe añadir scroll horizontal`);
  const height = Number(dom.match(/data-roster-height-mm="(\d+)"/)?.[1]);
  assert.ok(height <= 100, `${viewport.width}px: altura del roster ${height}mm debe ser razonable con invitados`);
  if (viewport.width === 1280) {
    const screenshot = path.join(output, 'editable-roster-25-players.png');
    execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions',
      `--window-size=${viewport.width},${viewport.height}`, `--screenshot=${screenshot}`,
      pathToFileURL(htmlPath).href], { timeout: 30000, stdio: 'pipe' });
    console.log(`Editable roster preview: ${screenshot}`);
  }
}

const comparisonPath = path.join(output, 'editable-roster-before-after.png');
const comparisonHtml = path.join(output, 'editable-roster-before-after.html');
writeFileSync(comparisonHtml, `<!doctype html><html><head><meta charset="utf-8"><style>${css}
  body{margin:0;padding:16px;background:#dbe3eb;font:700 16px Arial,sans-serif}
  .comparison{display:grid;grid-template-columns:repeat(2,297mm);gap:12px;width:max-content}
  .comparison h1{margin:0 0 8px}
  .comparison .planned-document-viewport{width:297mm;height:210mm;padding:0;overflow:hidden}
  .comparison .planned-document-pages{display:block;width:297mm;min-width:0;zoom:.9}
  .comparison .planned-session-sheet{margin:0;box-shadow:none}
  .roster-before .planned-sheet-roster{grid-template-columns:repeat(6,minmax(0,1fr))!important}
  .roster-before .planned-roster-group-two-columns .planned-roster-players{
    grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(var(--roster-rows),auto);grid-auto-flow:column}
  .roster-before .planned-roster-player{flex-wrap:nowrap}
  .roster-before .planned-roster-name{flex:1 1 auto;min-width:0;overflow-wrap:anywhere;word-break:normal}
  .roster-before .planned-roster-player select{max-width:19mm;margin-left:auto;font-size:6pt}
  .roster-before .planned-roster-group-two-columns .planned-roster-player select{max-width:12mm}
  </style></head><body><div class="comparison">
  <section><h1>Antes · seis columnas</h1><div class="planned-document-viewport roster-before"><div class="planned-document-pages">
    <article class="planned-session-sheet"><div class="roster-probe">${markup}</div></article>
  </div></div></section><section><h1>Después · tres columnas, controles adaptables</h1>
    <div class="planned-document-viewport"><div class="planned-document-pages">
    <article class="planned-session-sheet"><div class="roster-probe">${markup}</div></article>
  </div></div></section></div></body></html>`, 'utf8');
execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions',
  '--window-size=2500,950', `--screenshot=${comparisonPath}`,
  pathToFileURL(comparisonHtml).href], { timeout: 30000, stdio: 'pipe' });
console.log(`Before/after roster comparison: ${comparisonPath}`);
console.log('planned session editable roster layout tests passed');
