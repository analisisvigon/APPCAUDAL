import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const outputDirectory = join(repoRoot, 'artifacts', 'rival-corner-references');
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'appcaudal-rival-corner-qa-'));
const browserCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);
const browserPath = browserCandidates.find(existsSync);
if (!browserPath) throw new Error('No se encontró Chrome o Edge para generar las capturas.');

const cssFiles = (await readdir(join(repoRoot, 'dist', 'assets'))).filter((file) => file.endsWith('.css'));
const css = (await Promise.all(cssFiles.map((file) => readFile(join(repoRoot, 'dist', 'assets', file), 'utf8')))).join('\n');
const escapeCss = (value) => value.replace(/<\/style/gi, '<\\/style');
const html = (content, { background = '#06101f', width = 1200 } = {}) => `<!doctype html>
<html lang="es"><head><meta charset="UTF-8"><style>${escapeCss(css)}</style></head>
<body style="margin:0;min-width:${width}px;background:${background};font-family:Inter,Arial,sans-serif"><div id="qa-root">${content}</div></body></html>`;

const screenshot = (name, markup, { width, height, background } = {}) => new Promise(async (resolve, reject) => {
  const pagePath = join(temporaryDirectory, `${name}.html`);
  const imagePath = join(outputDirectory, `${name}.png`);
  const profilePath = join(temporaryDirectory, `profile-${name}`);
  await writeFile(pagePath, html(markup, { background, width }), 'utf8');
  const child = spawn(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-breakpad',
    '--disable-crash-reporter',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${width},${height}`,
    `--user-data-dir=${profilePath}`,
    `--screenshot=${imagePath}`,
    pathToFileURL(pagePath).href,
  ], { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.once('error', reject);
  child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(stderr || `Chrome terminó con ${code}`)));
});

const roles = (values = {}) => [
  { id: 'corner_taker', printLabel: 'Lanzador', players: values.corner_taker || [] },
  { id: 'corner_target', printLabel: 'Rematadores', players: values.corner_target || [] },
  { id: 'corner_second_ball', printLabel: 'Rechace', players: values.corner_second_ball || [] },
  { id: 'corner_stay_back', printLabel: 'Atrás', players: values.corner_stay_back || [] },
];
const referencePlay = (id, name, values) => ({ id, name, roles: roles(values) });
const diagram = {
  id: 'corner-defensivo-qa',
  tipo: 'corner_defensivo',
  titulo: 'Defensa de córner · estructura base',
  orden: 1,
  consigna: '',
  elements: [],
};
const match = { opponent: 'Rival QA', isHome: true, date: '2026-09-17' };

const vite = await createServer({ configFile: false, esbuild: { jsx: 'automatic' }, server: { middlewareMode: true }, appType: 'custom' });
try {
  await mkdir(outputDirectory, { recursive: true });
  const { default: Panel } = await vite.ssrLoadModule('/src/components/tactical/SetPieceResponsibilityPanel.jsx');
  const { default: Sheet } = await vite.ssrLoadModule('/src/components/print/SetPieceDiagramPrintSheet.jsx');

  const panel = renderToStaticMarkup(createElement('main', { className: 'min-h-screen p-8 text-white' },
    createElement('div', { className: 'w-[340px] rounded-xl border border-caudal-electric/30 bg-caudal-950/95 px-3 py-3 shadow-2xl' },
      createElement(Panel, {
        player: { name: 'Pablo García', number: 10 },
        phase: 'offensive',
        responsibilityId: 'off_rematador',
        canAssign: true,
        onAssign() {}, onRemove() {},
      })
    )
  ));
  await screenshot('01-asignacion-referencias', panel, { width: 520, height: 760 });

  const toggle = renderToStaticMarkup(createElement('main', { className: 'min-h-screen p-10 text-white' },
    createElement('section', { className: 'max-w-4xl border border-white/10 bg-[#0b1629] p-5' },
      createElement('label', { className: 'grid gap-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-slate-500' },
        createElement('span', null, 'Jugada'),
        createElement('select', { className: 'h-10 w-full border border-white/10 bg-black/20 px-3 text-xs font-black normal-case tracking-normal text-white', defaultValue: 'corner' },
          createElement('option', { value: 'corner' }, 'Córner corto + bloqueo')
        )
      ),
      createElement('div', { className: 'mt-2 flex gap-1.5' },
        ...['Nueva jugada', 'Guardar', 'Duplicar', 'Eliminar'].map((label) => createElement('button', { key: label, className: 'border border-white/10 bg-white/[0.04] px-3 py-2 text-[9px] font-black uppercase text-slate-300' }, label))
      ),
      createElement('label', { className: 'mt-2 inline-flex min-h-9 items-center gap-2 border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[9px] font-black uppercase tracking-[0.08em] text-slate-200' },
        createElement('input', { type: 'checkbox', defaultChecked: true, className: 'h-4 w-4 accent-caudal-electric' }),
        'Incluir referencias rival en IMPRESIÓN'
      )
    )
  ));
  await screenshot('02-toggle-impresion', toggle, { width: 980, height: 320 });

  const onePlay = [referencePlay('rival-corner-1', 'Córner corto', {
    corner_taker: ['7 Alex Arias'],
    corner_target: ['21 Xurde', '8 Tineo', '5 Trabanco', '9 Fassani', '4 Madrigal', '10 M. Secades'],
    corner_second_ball: ['17 C. Cid'],
    corner_stay_back: ['18 D. Ruiz', '11 Nino'],
  })];
  const twoPlays = [...onePlay, referencePlay('rival-corner-2', 'Córner cerrado', {
    corner_taker: ['12 Alejandro Fernández', '7 Mario García'],
    corner_target: ['5 Diego Álvarez', '4 Pedro González', '11 Álvaro Fernández', '18 Martín Rodríguez', '20 Sergio Menéndez', '21 Ignacio García'],
    corner_second_ball: ['8 Luis Martínez', '6 Óscar Álvarez'],
    corner_stay_back: ['2 Juan Pérez', '3 David Alonso'],
  })];
  const threePlays = [...twoPlays, referencePlay('rival-corner-3', 'Bloqueo primer palo', {
    corner_taker: [],
    corner_target: ['4 Pedro González', '11 Álvaro Fernández', '18 Martín Rodríguez', '20 Sergio Menéndez', '21 Ignacio García', '23 Alejandro Suárez', '25 Maximiliano Rodríguez', '27 Francisco Javier Menéndez'],
    corner_second_ball: ['6 Óscar Álvarez', '8 Luis Martínez', '16 Roberto Fernández'],
    corner_stay_back: ['2 Juan Pérez', '3 David Alonso', '14 Hugo Iglesias', '22 Miguel Ángel Suárez'],
  })];
  const renderSheet = (references) => renderToStaticMarkup(createElement('div', { className: 'p-4' }, createElement(Sheet, {
    match, title: 'Córner defensivo', diagrams: [diagram], players: [], rivalCornerReferences: references,
  })));
  await screenshot('03-corner-defensivo-una-jugada', renderSheet(onePlay), { width: 1200, height: 860, background: '#d1d5db' });
  await screenshot('04-corner-defensivo-dos-jugadas', renderSheet(twoPlays), { width: 1200, height: 860, background: '#d1d5db' });
  await screenshot('05-corner-defensivo-sin-referencias', renderSheet([]), { width: 1200, height: 860, background: '#d1d5db' });
  await screenshot('06-corner-defensivo-tres-jugadas-stress', renderSheet(threePlays), { width: 1200, height: 860, background: '#d1d5db' });
} finally {
  await vite.close();
  await rm(temporaryDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

console.log(`Capturas generadas en ${outputDirectory}`);
