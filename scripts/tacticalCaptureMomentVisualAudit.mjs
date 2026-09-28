import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const endpoint = process.env.FACING_SYSTEMS_CDP || 'http://127.0.0.1:9223';
const outputDirectory = fileURLToPath(new URL('../artifacts/tactical-capture-moment-variants/', import.meta.url));
const pages = await fetch(`${endpoint}/json/list`).then((response) => response.json());
const page = pages.find((item) => item.type === 'page' && item.url.includes('/qa-facing-systems.html'));
assert.ok(page?.webSocketDebuggerUrl, 'No se encontró la página QA en Chrome DevTools Protocol.');

const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
let commandId = 0;
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++commandId;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const operation = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) operation.reject(new Error(message.error.message));
  else operation.resolve(message.result);
});

await send('Runtime.enable');
await send('Page.enable');

const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Error evaluando la página.');
  }
  return result.result?.value;
};

const waitFor = async (expression, message, timeoutMs = 15000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
};

const clickButton = async (label, contextExpression = 'document') => {
  const clicked = await evaluate(`(() => {
    const context = ${contextExpression};
    const button = [...context.querySelectorAll('button')]
      .find((item) => item.innerText.trim().toLocaleLowerCase('es') === ${JSON.stringify(label.toLocaleLowerCase('es'))});
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert.equal(clicked, true, `No se encontró el botón ${label}.`);
};

const selectValue = async (value) => {
  const changed = await evaluate(`(() => {
    const select = [...document.querySelectorAll('select')]
      .find((item) => [...item.options].some((option) => option.value === ${JSON.stringify(value)}));
    if (!select) return false;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(value)});
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  assert.equal(changed, true, `No se encontró el selector para ${value}.`);
};

const setViewport = async ({ width, height }) => {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width <= 768,
  });
};

const openQa = async (viewport) => {
  await setViewport(viewport);
  const auditUrl = new URL(page.url);
  auditUrl.searchParams.set('analysis', 'full');
  await send('Page.navigate', { url: auditUrl.href });
  await waitFor(
    `[...document.querySelectorAll('button')].some((item) => item.innerText.trim() === 'Partidos')`,
    'La aplicación QA no terminó de cargar.'
  );
  await clickButton('Partidos');
  await waitFor(`document.body.innerText.includes('Rival QA')`, 'No apareció el partido QA.');
  await clickButton('PRE', `[...document.querySelectorAll('article')].find((item) => item.innerText.includes('Rival QA'))`);
  await waitFor(`document.body.innerText.includes('SISTEMAS ENFRENTADOS')`, 'No se abrió el PRE del partido.');
  await clickButton('Sistemas enfrentados');
  await waitFor(`document.querySelector('[data-tactical-surface="facing-systems"]')`, 'No se abrió Sistemas Enfrentados.');
};

const captureCase = async ({ file, phase, moment, viewport }) => {
  await selectValue(phase);
  await waitFor(`(() => {
    const phaseSelect = [...document.querySelectorAll('select')]
      .find((item) => [...item.options].some((option) => option.value === ${JSON.stringify(phase)}));
    return phaseSelect?.value === ${JSON.stringify(phase)};
  })()`, `No se activó la fase ${phase}.`);
  await selectValue(moment);
  await waitFor(`(() => {
    const momentSelect = [...document.querySelectorAll('select')]
      .find((item) => [...item.options].some((option) => option.value === ${JSON.stringify(moment)}));
    return momentSelect?.value === ${JSON.stringify(moment)};
  })()`, `No se activó el momento ${moment}.`);
  await clickButton('Modo captura');
  await waitFor(`document.querySelector('.tactical-capture-sidebar[data-capture-moment="${moment}"]')`, `Captura no expuso ${moment}.`);
  await new Promise((resolve) => setTimeout(resolve, 180));

  const audit = await evaluate(`(() => {
    const panel = document.querySelector('.tactical-capture-sidebar');
    const board = document.querySelector('.tactical-capture-board-shell .facing-tactical-board');
    const stage = document.querySelector('.tactical-capture-stage');
    const panelStyles = getComputedStyle(panel);
    const boardRect = board.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    return {
      phase: panel.dataset.capturePhase,
      moment: panel.dataset.captureMoment,
      baseAccent: panelStyles.getPropertyValue('--capture-base-accent-rgb').trim(),
      momentAccent: panelStyles.getPropertyValue('--capture-moment-accent-rgb').trim(),
      board: { x: boardRect.x, y: boardRect.y, width: boardRect.width, height: boardRect.height },
      panel: { x: panelRect.x, y: panelRect.y, width: panelRect.width, height: panelRect.height },
      stage: { width: stageRect.width, height: stageRect.height },
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      fieldBeforePanel: boardRect.top <= panelRect.top,
    };
  })()`);
  assert.equal(audit.moment, moment);
  assert.ok(audit.board.width > 0 && audit.board.height > 0, `${file}: el campo debe ser visible.`);
  assert.ok(audit.scrollWidth <= audit.viewportWidth, `${file}: no debe haber overflow horizontal.`);
  if (viewport.width <= 768) assert.equal(audit.fieldBeforePanel, true, `${file}: el campo debe preceder al panel en móvil.`);

  const screenshot = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    fromSurface: true,
  });
  await writeFile(`${outputDirectory}${file}.png`, Buffer.from(screenshot.data, 'base64'));
  await clickButton('Salir de captura', `document.querySelector('[data-tactical-capture="true"]')`);
  await waitFor(`!document.querySelector('[data-tactical-capture="true"]')`, `${file}: no se cerró la captura.`);
  return audit;
};

await mkdir(outputDirectory, { recursive: true });
const desktop = { width: 1920, height: 1080 };
await openQa(desktop);

const cases = [
  { file: 'desktop-defensa-bloque-alto', phase: 'defensive', moment: 'high_block', viewport: desktop },
  { file: 'desktop-defensa-bloque-medio', phase: 'defensive', moment: 'mid_block', viewport: desktop },
  { file: 'desktop-defensa-bloque-bajo', phase: 'defensive', moment: 'low_block', viewport: desktop },
  { file: 'desktop-ataque-inicio', phase: 'offensive', moment: 'build_up', viewport: desktop },
  { file: 'desktop-ataque-creacion', phase: 'offensive', moment: 'creation', viewport: desktop },
  { file: 'desktop-ataque-finalizacion', phase: 'offensive', moment: 'finishing', viewport: desktop },
];
const audits = [];
for (const item of cases) audits.push({ file: item.file, ...(await captureCase(item)) });

const defensiveAudits = audits.filter((item) => item.phase === 'defensive');
assert.equal(new Set(defensiveAudits.map((item) => item.momentAccent)).size, 3, 'Las tres variantes defensivas deben distinguirse.');
assert.equal(new Set(defensiveAudits.map((item) => item.baseAccent)).size, 1, 'Las tres variantes defensivas deben mantener la familia azul.');
assert.equal(new Set(defensiveAudits.map((item) => `${item.board.width}x${item.board.height}`)).size, 1, 'El campo debe conservar dimensiones idénticas entre variantes defensivas.');

const offensiveAudits = audits.filter((item) => item.phase === 'offensive');
assert.equal(new Set(offensiveAudits.map((item) => item.momentAccent)).size, 3, 'Las tres variantes ofensivas deben distinguirse.');
assert.equal(new Set(offensiveAudits.map((item) => item.baseAccent)).size, 1, 'Las tres variantes ofensivas deben mantener la familia ámbar.');

const mobile = { width: 390, height: 844 };
await setViewport(mobile);
audits.push({ file: 'mobile-defensa-bloque-bajo', ...(await captureCase({ file: 'mobile-defensa-bloque-bajo', phase: 'defensive', moment: 'low_block', viewport: mobile })) });
audits.push({ file: 'mobile-ataque-inicio', ...(await captureCase({ file: 'mobile-ataque-inicio', phase: 'offensive', moment: 'build_up', viewport: mobile })) });

await writeFile(`${outputDirectory}audit.json`, `${JSON.stringify(audits, null, 2)}\n`, 'utf8');
socket.close();
console.log(`Capturas reales y auditoría visual guardadas en ${outputDirectory}`);
