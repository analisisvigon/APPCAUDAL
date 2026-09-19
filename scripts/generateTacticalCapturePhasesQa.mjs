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
const outputDirectory = join(repoRoot, 'artifacts', 'tactical-capture-visual-phases');
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'appcaudal-tactical-capture-qa-'));
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
const appCss = (await Promise.all(cssFiles.map((file) => readFile(join(repoRoot, 'dist', 'assets', file), 'utf8')))).join('\n');
const qaCss = `
  * { box-sizing: border-box; }
  body { margin: 0; background: #020812; font-family: Inter, Arial, sans-serif; }
  .qa-tactical-pitch { position: relative; aspect-ratio: 7 / 8.4; overflow: hidden; border: 2px solid rgba(255,255,255,.62); background: linear-gradient(90deg,#0c4c39 0 12.5%,#0f5940 12.5% 25%,#0c4c39 25% 37.5%,#0f5940 37.5% 50%,#0c4c39 50% 62.5%,#0f5940 62.5% 75%,#0c4c39 75% 87.5%,#0f5940 87.5%); box-shadow: inset 0 0 80px rgba(0,0,0,.35); }
  .qa-tactical-pitch::before { position:absolute; inset:4% 5%; border:2px solid rgba(255,255,255,.7); content:''; }
  .qa-halfway { position:absolute; top:50%; right:5%; left:5%; height:2px; background:rgba(255,255,255,.7); }
  .qa-circle { position:absolute; top:50%; left:50%; width:22%; aspect-ratio:1; transform:translate(-50%,-50%); border:2px solid rgba(255,255,255,.7); border-radius:50%; }
  .qa-box { position:absolute; left:27%; width:46%; height:15%; border:2px solid rgba(255,255,255,.7); }
  .qa-box--top { top:4%; border-top:0; }
  .qa-box--bottom { bottom:4%; border-bottom:0; }
  .qa-player { position:absolute; display:grid; width:48px; height:48px; place-items:center; transform:translate(-50%,-50%); border:3px solid white; border-radius:50%; box-shadow:0 5px 14px rgba(0,0,0,.42); color:white; font-size:15px; font-weight:950; }
  .qa-player--rival { background:#e11d48; }
  .qa-player--caudal { background:#172554; border-color:#60a5fa; }
  .qa-ball { position:absolute; top:50%; left:50%; width:20px; height:20px; transform:translate(-50%,-50%); border:3px solid #0f172a; border-radius:50%; background:white; box-shadow:0 3px 8px rgba(0,0,0,.4); }
`;
const escapeCss = (value) => value.replace(/<\/style/gi, '<\\/style');
const html = (content) => `<!doctype html><html lang="es"><head><meta charset="UTF-8"><style>${escapeCss(appCss)}\n${qaCss}</style></head><body>${content}</body></html>`;

const screenshot = (name, content, { width = 1920, height = 1080 } = {}) => new Promise(async (resolve, reject) => {
  const pagePath = join(temporaryDirectory, `${name}.html`);
  const imagePath = join(outputDirectory, `${name}.png`);
  const profilePath = join(temporaryDirectory, `profile-${name}`);
  await writeFile(pagePath, html(content), 'utf8');
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

const pitch = `
  <div class="facing-tactical-board qa-tactical-pitch" aria-label="Campo táctico de control QA">
    <span class="qa-halfway"></span><span class="qa-circle"></span>
    <span class="qa-box qa-box--top"></span><span class="qa-box qa-box--bottom"></span>
    <span class="qa-player qa-player--rival" style="left:50%;top:12%">9</span>
    <span class="qa-player qa-player--rival" style="left:20%;top:27%">11</span>
    <span class="qa-player qa-player--rival" style="left:50%;top:30%">10</span>
    <span class="qa-player qa-player--rival" style="left:80%;top:27%">7</span>
    <span class="qa-player qa-player--rival" style="left:34%;top:43%">6</span>
    <span class="qa-player qa-player--rival" style="left:66%;top:43%">8</span>
    <span class="qa-player qa-player--caudal" style="left:18%;top:61%">3</span>
    <span class="qa-player qa-player--caudal" style="left:40%;top:59%">5</span>
    <span class="qa-player qa-player--caudal" style="left:60%;top:59%">4</span>
    <span class="qa-player qa-player--caudal" style="left:82%;top:61%">2</span>
    <span class="qa-player qa-player--caudal" style="left:50%;top:84%">1</span>
    <span class="qa-ball"></span>
  </div>`;

const cases = [
  {
    file: 'A-defensa-bloque-alto', phase: 'defensive', phaseLabel: 'Fase defensiva', situation: 'Bloque alto',
    description: 'Saltar sobre primera construcción. Extremos orientan hacia fuera y el pivote protege el pase interior.',
  },
  {
    file: 'B-defensa-bloque-bajo', phase: 'defensive', phaseLabel: 'Fase defensiva', situation: 'Bloque bajo',
    description: 'Cerrar carril central, defender el área con dos líneas juntas y preparar la salida tras recuperación.',
  },
  {
    file: 'C-ataque-inicio', phase: 'offensive', phaseLabel: 'Fase ofensiva', situation: 'Inicio', playStyle: 'Juego combinativo',
    description: 'Atraer la primera presión para encontrar al hombre libre a la espalda de la primera línea.',
  },
  {
    file: 'D-ataque-creacion', phase: 'offensive', phaseLabel: 'Fase ofensiva', situation: 'Creación', playStyle: 'Juego combinativo',
    description: 'Fijar por dentro, dar amplitud con laterales y atacar el intervalo cuando el rival cierre el centro.',
  },
  {
    file: 'E-transicion-defensa-ataque', phase: 'transition', transitionType: 'offensive_transition', phaseLabel: 'Transiciones', situation: 'Ataque rápido · Campo defensivo',
    description: 'Primer pase hacia delante y ocupación inmediata de los tres carriles para superar la reorganización rival.',
  },
  {
    file: 'F-transicion-ataque-defensa', phase: 'transition', transitionType: 'defensive_transition', phaseLabel: 'Transiciones', situation: 'Presión tras pérdida · Campo ofensivo',
    description: 'Cerrar al poseedor y las líneas cercanas durante los primeros segundos; si supera la presión, replegar.',
  },
];

const vite = await createServer({ configFile: false, esbuild: { jsx: 'automatic' }, server: { middlewareMode: true }, appType: 'custom' });
try {
  await mkdir(outputDirectory, { recursive: true });
  const { default: TacticalCaptureSidebar } = await vite.ssrLoadModule('/src/components/tactical/TacticalCaptureSidebar.jsx');
  const { buildTacticalCapturePresentation } = await vite.ssrLoadModule('/src/utils/tacticalCapturePresentation.js');

  const renderCase = (qaCase) => {
    const presentation = buildTacticalCapturePresentation({
      phaseLabel: qaCase.phaseLabel,
      situationLabel: qaCase.situation,
      playStyleLabel: qaCase.playStyle,
      selectedPlay: { description: qaCase.description },
    });
    const sidebar = renderToStaticMarkup(createElement(TacticalCaptureSidebar, {
      phase: qaCase.phase,
      transitionType: qaCase.transitionType,
      presentation,
    }));
    return `<div class="tactical-capture-root" data-tactical-capture="true" role="dialog" aria-label="Vista de captura táctica">
      <button type="button" class="tactical-capture-exit">Salir de captura</button>
      <main class="tactical-capture-stage"><section class="tactical-capture-board-shell" aria-label="Campo táctico">${pitch}</section>${sidebar}</main>
    </div>`;
  };

  for (const qaCase of cases) {
    await screenshot(qaCase.file, renderCase(qaCase));
  }

  const responsiveCases = [
    { file: 'QA-1440x900-defensa', source: cases[0], width: 1440, height: 900 },
    { file: 'QA-1366x768-ataque', source: cases[3], width: 1366, height: 768 },
    { file: 'QA-768x1024-transicion', source: cases[4], width: 768, height: 1024 },
  ];
  for (const qaCase of responsiveCases) {
    await screenshot(qaCase.file, renderCase(qaCase.source), qaCase);
  }
} finally {
  await vite.close();
  await rm(temporaryDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

console.log(`Capturas de fase y comprobaciones responsive generadas en ${outputDirectory}`);
