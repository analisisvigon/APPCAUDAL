import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const baselineRoot = join(root, 'tests', 'visual-baselines', 'tactical-board', 'contract');
const update = process.argv.includes('--update');
const viewports = [[1440, 900], [1920, 1080], [768, 1024], [390, 844]];
const port = 4178;
const url = `http://127.0.0.1:${port}/tests/tactical-board-harness.html`;
const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const chrome = chromeCandidates.find(existsSync);

if (!chrome) throw new Error('Chrome/Chromium no encontrado. Define CHROME_PATH.');

const canvasSource = readFileSync(join(root, 'src', 'components', 'print', 'SetPieceDiagramCanvas.jsx'), 'utf8');
const boardSource = readFileSync(join(root, 'src', 'components', 'tactical', 'TacticalPhaseEditor.jsx'), 'utf8');
const cssSource = readFileSync(join(root, 'src', 'index.css'), 'utf8');
[
  ['contrato documentado', 'VISUAL CONTRACT: do not modify without running tactical-board visual tests.'],
  ['viewBox vertical', "viewBox={verticalPitch ? '0 0 72 100' : '0 0 100 72'}"],
  ['ancho lógico vertical', 'const maxX = verticalPitch ? 72 : 100'],
  ['alto lógico vertical', 'const maxY = verticalPitch ? 100 : 72'],
  ['césped contractual', 'fill="#0b4a36"'],
].forEach(([label, value]) => {
  if (!canvasSource.includes(value)) throw new Error(`Contrato roto: ${label}.`);
});
[
  ['width', 'width: 100%;'],
  ['height', 'height: auto;'],
  ['max-height', 'max-height: min(72vh, 760px);'],
  ['touch', 'touch-action: none;'],
].forEach(([label, value]) => {
  if (!cssSource.includes(value)) throw new Error(`Contrato CSS roto: ${label}.`);
});
[
  ['clave aislada del tablero', "const BOARD_KEY = 'systems_board'"],
  ['hidratación persistente', 'initialBoards[BOARD_KEY]'],
  ['persistencia de posiciones', 'playerPositions: normalizePositions(nextPlayers)'],
  ['persistencia del tablero', '[BOARD_KEY]: board'],
  ['aislamiento por rival', '[opponentKey]'],
].forEach(([label, value]) => {
  if (!boardSource.includes(value)) throw new Error(`Contrato funcional roto: ${label}.`);
});

mkdirSync(baselineRoot, { recursive: true });
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const temporaryRoot = mkdtempSync(join(tmpdir(), 'tactical-board-contract-'));
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
let ready = false;
for (let attempt = 0; attempt < 80; attempt += 1) {
  try {
    const response = await fetch(url);
    if (response.ok) { ready = true; break; }
  } catch {
    // The server is still starting.
  }
  await sleep(100);
}
if (!ready) {
  vite.kill();
  throw new Error('No se pudo iniciar el arnés visual.');
}

const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const decodeMetrics = (html) => {
  const match = html.match(/data-tactical-board-metrics="([^"]+)"/);
  if (!match) throw new Error('El arnés no publicó métricas DOM.');
  return JSON.parse(decodeURIComponent(match[1].replaceAll('&amp;', '&')));
};
const assertNear = (actual, expected, label) => {
  const denominator = Math.max(Math.abs(expected), 1);
  if (Math.abs(actual - expected) / denominator > 0.001) throw new Error(`${label}: ${actual} != ${expected}`);
};

try {
  for (const [width, height] of viewports) {
    const name = `${width}x${height}`;
    const screenshot = join(temporaryRoot, `${name}.png`);
    const profile = join(temporaryRoot, `profile-${name}`);
    const commonArgs = [
      '--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`,
      '--hide-scrollbars', '--run-all-compositor-stages-before-draw', '--virtual-time-budget=3000',
      `--window-size=${width},${height}`,
    ];
    const capture = spawnSync(chrome, [...commonArgs, `--screenshot=${screenshot}`, url], { encoding: 'utf8' });
    if (capture.status !== 0 || !existsSync(screenshot)) throw new Error(`Falló captura ${name}: ${capture.stderr}`);
    const dom = spawnSync(chrome, [...commonArgs, '--dump-dom', url], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    if (dom.status !== 0) throw new Error(`Falló lectura DOM ${name}: ${dom.stderr}`);
    const metrics = decodeMetrics(dom.stdout);
    const baselineImage = join(baselineRoot, `${name}.png`);
    const baselineMetrics = join(baselineRoot, `${name}.json`);
    if (update || !existsSync(baselineImage) || !existsSync(baselineMetrics)) {
      writeFileSync(baselineImage, readFileSync(screenshot));
      writeFileSync(baselineMetrics, `${JSON.stringify(metrics, null, 2)}\n`);
      continue;
    }
    if (hash(screenshot) !== hash(baselineImage)) throw new Error(`${name}: diferencia visual distinta de 0%.`);
    const expected = JSON.parse(readFileSync(baselineMetrics, 'utf8'));
    if (metrics.viewBox !== '0 0 72 100' || metrics.viewBox !== expected.viewBox) throw new Error(`${name}: viewBox modificado.`);
    assertNear(metrics.wrapper.width, expected.wrapper.width, `${name} wrapperWidth`);
    assertNear(metrics.wrapper.height, expected.wrapper.height, `${name} wrapperHeight`);
    assertNear(metrics.svg.width, expected.svg.width, `${name} svgWidth`);
    assertNear(metrics.svg.height, expected.svg.height, `${name} svgHeight`);
    if (metrics.playerPositions.length !== 22) throw new Error(`${name}: se esperaban 22 jugadores.`);
    if (JSON.stringify(metrics.playerPositions) !== JSON.stringify(expected.playerPositions)) throw new Error(`${name}: coordenadas de jugadores modificadas.`);
    if (JSON.stringify(metrics.connectionPositions) !== JSON.stringify(expected.connectionPositions)) throw new Error(`${name}: trazado de conexiones modificado.`);
  }
  for (const [caudal, rival] of [['4-4-2', '4-4-2'], ['4-3-3', '4-3-3'], ['5-3-2', '4-4-2']]) {
    const profile = join(temporaryRoot, `profile-system-${caudal}-${rival}`);
    const scenarioUrl = `${url}?caudal=${encodeURIComponent(caudal)}&rival=${encodeURIComponent(rival)}`;
    const dom = spawnSync(chrome, [
      '--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`,
      '--virtual-time-budget=3000', '--window-size=1440,900', '--dump-dom', scenarioUrl,
    ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    if (dom.status !== 0) throw new Error(`Falló escenario ${caudal} vs ${rival}.`);
    const metrics = decodeMetrics(dom.stdout);
    if (metrics.viewBox !== '0 0 72 100' || metrics.playerPositions.length !== 22) {
      throw new Error(`Escenario ${caudal} vs ${rival}: geometría o jugadores incorrectos.`);
    }
  }
  console.log(`Tactical board visual contract passed: ${viewports.length} viewports, diferencia 0%.`);
} finally {
  vite.kill();
  rmSync(temporaryRoot, { recursive: true, force: true });
}
