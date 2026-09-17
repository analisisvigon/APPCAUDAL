import assert from 'node:assert/strict';

const endpoint = process.env.FACING_SYSTEMS_CDP || 'http://127.0.0.1:9223';
const viewportArgument = process.argv.find((argument) => argument.startsWith('--viewport='));
const viewportMatch = viewportArgument?.slice('--viewport='.length).match(/^(\d+)x(\d+)$/);
const viewport = viewportMatch
  ? { width: Number(viewportMatch[1]), height: Number(viewportMatch[2]) }
  : { width: 1440, height: 900 };
const pages = await fetch(`${endpoint}/json/list`).then((response) => response.json());
const page = pages.find((item) => item.type === 'page' && item.url.includes('/qa-facing-systems.html'));
assert.ok(page?.webSocketDebuggerUrl, 'No se encontro la pagina QA en Chrome DevTools Protocol.');

const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
const exceptions = [];
const consoleErrors = [];
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
  if (message.id && pending.has(message.id)) {
    const operation = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) operation.reject(new Error(message.error.message));
    else operation.resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    consoleErrors.push(message.params.args.map((arg) => arg.value || arg.description || '').join(' '));
  }
  if (message.method === 'Page.javascriptDialogOpening') {
    void send('Page.handleJavaScriptDialog', { accept: true });
  }
});

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: viewport.width,
  height: viewport.height,
  deviceScaleFactor: 1,
  mobile: viewport.width <= 768,
});
const analysisScenario = process.argv.includes('--empty') ? 'empty' : 'full';
const auditUrl = new URL(page.url);
auditUrl.searchParams.set('analysis', analysisScenario);
await send('Page.navigate', { url: auditUrl.href });

const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Error evaluando JavaScript en la pagina.');
  return result.result?.value;
};

const waitFor = async (expression, message, timeoutMs = 12000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const bodyText = await evaluate('document.body.innerText.slice(-3000)');
  const qaErrors = await evaluate('window.__FACING_SYSTEMS_QA__?.errors || []');
  throw new Error(`${message}\n${bodyText}\nQA errors: ${JSON.stringify(qaErrors)}`);
};

const clickButton = async (label, contextExpression = 'document') => {
  const clicked = await evaluate(`(() => {
    const context = ${contextExpression};
    const button = [...context.querySelectorAll('button')].find((item) => item.innerText.trim().toLocaleLowerCase('es') === ${JSON.stringify(label.toLocaleLowerCase('es'))});
    if (!button) return false;
    button.click();
    return true;
  })()`);
  assert.equal(clicked, true, `No se encontro el boton ${label}.`);
};

await waitFor(`[...document.querySelectorAll('button')].some((item) => item.innerText.trim() === 'Partidos')`, 'La aplicacion no termino de cargar.');
exceptions.length = 0;
consoleErrors.length = 0;
await clickButton('Partidos');
await waitFor(`document.body.innerText.includes('Rival QA')`, 'No aparecio el partido QA.');
await clickButton('PRE', `[...document.querySelectorAll('article')].find((item) => item.innerText.includes('Rival QA'))`);
await waitFor(`document.body.innerText.includes('PRE partido') && document.body.innerText.includes('SISTEMAS ENFRENTADOS')`, 'No se abrio el PRE del partido.');
await clickButton('Sistemas enfrentados');
await waitFor(`document.querySelector('[data-tactical-surface="facing-systems"]')`, 'No se abrio Sistemas enfrentados.');
await new Promise((resolve) => setTimeout(resolve, 500));

const phaseSnapshots = [];
const captureSnapshots = [];
for (const phase of ['defensive', 'offensive', 'transition', 'set_piece']) {
  const changed = await evaluate(`(() => {
    const select = [...document.querySelectorAll('select')].find((item) => item.closest('label')?.innerText.includes('FASE DEL JUEGO'));
    if (!select) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(select, ${JSON.stringify(phase)});
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  assert.equal(changed, true, 'No se encontro el selector de fase del juego.');
  await waitFor(`(() => {
    const select = [...document.querySelectorAll('select')].find((item) => item.closest('label')?.innerText.includes('FASE DEL JUEGO'));
    return select?.value === ${JSON.stringify(phase)} && document.querySelector('[data-tactical-surface="facing-systems"]');
  })()`, `No se renderizo la fase ${phase}.`);
  await new Promise((resolve) => setTimeout(resolve, 150));
  phaseSnapshots.push(await evaluate(`(() => ({
    phase: ${JSON.stringify(phase)},
    errorBoundary: document.body.innerText.includes('Error cargando Sistemas enfrentados'),
    tacticalSurfaceCount: document.querySelectorAll('[data-tactical-surface="facing-systems"]').length,
    interactionModes: [...document.querySelectorAll('[data-tactical-surface="facing-systems"]')].map((item) => item.dataset.interactionMode),
    qaErrors: window.__FACING_SYSTEMS_QA__?.errors || [],
  }))()`));

  await clickButton('Modo captura');
  await waitFor(`document.querySelector('[data-tactical-capture="true"]')`, `No se abrio el modo captura de ${phase}.`);
  await new Promise((resolve) => setTimeout(resolve, 100));
  captureSnapshots.push(await evaluate(`(() => ({
    phase: ${JSON.stringify(phase)},
    captureCount: document.querySelectorAll('[data-tactical-capture="true"]').length,
    tacticalSurfaceCount: document.querySelectorAll('[data-tactical-surface="facing-systems"]').length,
    interactionModes: [...document.querySelectorAll('[data-tactical-surface="facing-systems"]')].map((item) => item.dataset.interactionMode),
    qaErrors: window.__FACING_SYSTEMS_QA__?.errors || [],
  }))()`));
  const closeLabel = phase === 'set_piece' ? 'Salir' : 'Salir de captura';
  await clickButton(closeLabel, `document.querySelector('[data-tactical-capture="true"]')`);
  await waitFor(`!document.querySelector('[data-tactical-capture="true"]')`, `No se cerro el modo captura de ${phase}.`);
}

let interactionSnapshot = null;
if (analysisScenario === 'full') {
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  const defensiveSelected = await evaluate(`(() => {
    const select = [...document.querySelectorAll('select')].find((item) => item.closest('label')?.innerText.includes('FASE DEL JUEGO'));
    if (!select) return false;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, 'defensive');
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  assert.equal(defensiveSelected, true, 'No se pudo volver a la fase defensiva para probar la interaccion.');
  await waitFor(`document.querySelector('[data-tactical-surface="facing-systems"]')?.dataset.interactionMode === 'navigate'`, 'Mover no activo el modo de navegacion.');

  const touchPolicies = await evaluate(`(() => {
    const board = document.querySelector('[data-tactical-surface="facing-systems"]');
    const player = document.querySelector('[aria-label^="Seleccionar Rival"]');
    const ball = document.querySelector('[data-tactical-surface="facing-systems"] [role="img"]');
    return {
      board: getComputedStyle(board).touchAction,
      player: getComputedStyle(player).touchAction,
      ball: getComputedStyle(ball).touchAction,
    };
  })()`);

  const dragTarget = async (selector, delta) => {
    const before = await evaluate(`(() => {
      const item = document.querySelector(${JSON.stringify(selector)});
      const rect = item.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, left: item.parentElement?.style.left || item.style.left, top: item.parentElement?.style.top || item.style.top };
    })()`);
    await evaluate(`(() => {
      const item = document.querySelector(${JSON.stringify(selector)});
      item.setPointerCapture = () => {};
      item.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 91,
        pointerType: 'mouse',
        buttons: 1,
        clientX: ${before.x},
        clientY: ${before.y},
      }));
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await evaluate(`document.querySelector('[data-tactical-surface="facing-systems"]').dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 91,
      pointerType: 'mouse',
      buttons: 1,
      clientX: ${before.x + delta.x},
      clientY: ${before.y + delta.y},
    }))`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await evaluate(`(() => {
      const board = document.querySelector('[data-tactical-surface="facing-systems"]');
      board.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 91, pointerType: 'mouse' }));
      board.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 91, pointerType: 'mouse' }));
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const after = await evaluate(`(() => {
      const item = document.querySelector(${JSON.stringify(selector)});
      return { left: item.parentElement?.style.left || item.style.left, top: item.parentElement?.style.top || item.style.top };
    })()`);
    return { before, after };
  };

  await clickButton('Mover');
  const playerDrag = await dragTarget('[aria-label^="Seleccionar Rival"]', { x: 24, y: 18 });
  const ballDrag = await dragTarget('[data-tactical-surface="facing-systems"] [role="img"]', { x: -18, y: 22 });

  const drawArrow = async (toolLabel) => {
    await clickButton(toolLabel);
    await waitFor(`document.querySelector('[data-tactical-surface="facing-systems"]')?.dataset.interactionMode === 'draw'`, `${toolLabel} no activo el modo de dibujo.`);
    const before = await evaluate(`document.querySelectorAll('[marker-end="url(#defensive-play-arrow)"]').length`);
    await evaluate(`document.querySelector('[data-tactical-surface="facing-systems"]').scrollIntoView({ block: 'center', inline: 'center' })`);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const points = await evaluate(`(() => {
      const board = document.querySelector('[data-tactical-surface="facing-systems"]');
      const rect = board.getBoundingClientRect();
      return {
        start: { x: rect.left + rect.width * 0.28, y: rect.top + rect.height * 0.37 },
        end: { x: rect.left + rect.width * 0.68, y: rect.top + rect.height * 0.46 },
      };
    })()`);
    await evaluate(`(() => {
      const board = document.querySelector('[data-tactical-surface="facing-systems"]');
      board.setPointerCapture = () => {};
      board.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 92,
        pointerType: 'mouse',
        buttons: 1,
        clientX: ${points.start.x},
        clientY: ${points.start.y},
      }));
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await evaluate(`document.querySelector('[data-tactical-surface="facing-systems"]').dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 92,
      pointerType: 'mouse',
      buttons: 1,
      clientX: ${points.end.x},
      clientY: ${points.end.y},
    }))`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await evaluate(`document.querySelector('[data-tactical-surface="facing-systems"]').dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      pointerId: 92,
      pointerType: 'mouse',
      clientX: ${points.end.x},
      clientY: ${points.end.y},
    }))`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const after = await evaluate(`document.querySelectorAll('[marker-end="url(#defensive-play-arrow)"]').length`);
    return { before, after, mode: await evaluate(`document.querySelector('[data-tactical-surface="facing-systems"]')?.dataset.interactionMode`) };
  };

  const passDraw = await drawArrow('Pase');
  const movementDraw = await drawArrow('Movimiento');
  await clickButton('Seleccionar');
  await waitFor(`document.querySelector('[data-tactical-surface="facing-systems"]')?.dataset.interactionMode === 'navigate'`, 'Seleccionar no recupero el modo de navegacion.');
  interactionSnapshot = {
    touchPolicies,
    playerDrag,
    ballDrag,
    passDraw,
    movementDraw,
    selectMode: await evaluate(`document.querySelector('[data-tactical-surface="facing-systems"]')?.dataset.interactionMode`),
    qaErrors: await evaluate(`window.__FACING_SYSTEMS_QA__?.errors || []`),
  };
}

const summary = await evaluate(`(() => ({
  viewport: { width: window.innerWidth, height: window.innerHeight },
  errorBoundary: document.body.innerText.includes('Error cargando Sistemas enfrentados'),
  bodyText: document.body.innerText.slice(-4000),
  qaErrors: window.__FACING_SYSTEMS_QA__?.errors || [],
  tacticalSurfaceCount: document.querySelectorAll('[data-tactical-surface="facing-systems"]').length,
  interactionModes: [...document.querySelectorAll('[data-tactical-surface="facing-systems"]')].map((item) => item.dataset.interactionMode),
}))()`);

process.stdout.write(`${JSON.stringify({ analysisScenario, viewport, summary, phaseSnapshots, captureSnapshots, interactionSnapshot, exceptions, consoleErrors }, null, 2)}\n`);
socket.close();

assert.equal(summary.errorBoundary, false, 'El error boundary capturo una excepcion en Sistemas enfrentados.');
assert.deepEqual(summary.viewport, viewport, 'Chrome no aplico el viewport solicitado.');
assert.equal(exceptions.length, 0, 'Chrome notifico una excepcion de runtime.');
assert.equal(summary.qaErrors.length, 0, 'La pagina registro un error global o una promesa rechazada.');
assert.ok(summary.tacticalSurfaceCount > 0, 'No se renderizo la superficie tactica activa.');
assert.equal(phaseSnapshots.length, 4, 'No se auditaron las cuatro fases.');
for (const snapshot of phaseSnapshots) {
  assert.equal(snapshot.errorBoundary, false, `El error boundary capturo la fase ${snapshot.phase}.`);
  assert.ok(snapshot.tacticalSurfaceCount > 0, `No se renderizo la fase ${snapshot.phase}.`);
  assert.equal(snapshot.qaErrors.length, 0, `La fase ${snapshot.phase} registro errores globales.`);
}
assert.equal(captureSnapshots.length, 4, 'No se audito la captura de las cuatro fases.');
for (const snapshot of captureSnapshots) {
  assert.ok(snapshot.captureCount > 0, `No se abrio la captura de ${snapshot.phase}.`);
  assert.ok(snapshot.tacticalSurfaceCount > 0, `No se renderizo la pizarra en captura para ${snapshot.phase}.`);
  assert.deepEqual(snapshot.interactionModes, ['readonly'], `La captura de ${snapshot.phase} no es de solo lectura.`);
  assert.equal(snapshot.qaErrors.length, 0, `La captura de ${snapshot.phase} registro errores globales.`);
}
if (interactionSnapshot) {
  assert.ok(['manipulation', 'pan-x pan-y pinch-zoom'].includes(interactionSnapshot.touchPolicies.board), 'Mover sobre el cesped no conserva el scroll tactil.');
  assert.equal(interactionSnapshot.touchPolicies.player, 'none', 'El jugador no reserva el gesto tactil para drag.');
  assert.equal(interactionSnapshot.touchPolicies.ball, 'none', 'El balon no reserva el gesto tactil para drag.');
  assert.notDeepEqual(
    [interactionSnapshot.playerDrag.before.left, interactionSnapshot.playerDrag.before.top],
    [interactionSnapshot.playerDrag.after.left, interactionSnapshot.playerDrag.after.top],
    'Mover no desplazo al jugador.'
  );
  assert.notDeepEqual(
    [interactionSnapshot.ballDrag.before.left, interactionSnapshot.ballDrag.before.top],
    [interactionSnapshot.ballDrag.after.left, interactionSnapshot.ballDrag.after.top],
    'Mover no desplazo el balon.'
  );
  assert.ok(interactionSnapshot.passDraw.after > interactionSnapshot.passDraw.before, 'Pase no dibujo una flecha.');
  assert.ok(interactionSnapshot.movementDraw.after > interactionSnapshot.movementDraw.before, 'Movimiento no dibujo una flecha.');
  assert.equal(interactionSnapshot.passDraw.mode, 'draw', 'Pase no mantuvo el modo draw.');
  assert.equal(interactionSnapshot.movementDraw.mode, 'draw', 'Movimiento no mantuvo el modo draw.');
  assert.equal(interactionSnapshot.selectMode, 'navigate', 'Seleccionar no permite scroll sobre el cesped.');
  assert.equal(interactionSnapshot.qaErrors.length, 0, 'Las interacciones tactiles registraron errores globales.');
}
