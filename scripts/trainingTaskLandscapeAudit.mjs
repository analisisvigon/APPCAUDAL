import assert from 'node:assert/strict';
import { createServer as httpServer } from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const dir = await mkdtemp(join(tmpdir(), 'nexo-task-pdf-'));
const vite = await createServer({ configFile: false, esbuild: { jsx: 'automatic' }, server: { middlewareMode: true }, appType: 'custom' });
let chrome, server, ws, pdfBuffer;
try {
  const { TrainingTaskBatchPrintPages } = await vite.ssrLoadModule('/src/components/training/TrainingTaskBatchPrint.jsx');
  const task = { id: 'synthetic', name: 'Mantenimiento cuadrado por dentro — caso sintético', taskCode: 'TEST-01', taskType: 'rondos',
    created_at: '2026-11-01T12:00:00Z', playersSpec: '4v4+3', playersMin: 11, playersMax: 11, seriesCount: 3, minutesPerSeries: 4,
    durationMinutes: 12, spaceWidthM: 25, spaceLengthM: 25, objective: 'Conservar el balón y encontrar apoyos interiores.',
    description: 'Dos equipos mantienen la posesión con tres apoyos.\nTras pérdida, presionar y recuperar la organización.',
    exerciseRules: 'Máximo dos contactos.\nPuntuar tras conectar con el apoyo interior.', technicalContent: 'Control orientado y pase tenso.',
    tacticalOffensiveContent: 'Amplitud, líneas de pase y tercer hombre.', tacticalDefensiveContent: 'Cerrar líneas interiores y presionar al poseedor.',
    material: 'Balones, conos y petos.', variants: 'Limitar a un contacto a los apoyos.', observations: 'Rotar los comodines.',
    editorPayload: { schemaVersion: 1, board: { pitchType: 'full', elements: [
      { id: 'zone', type: 'zone', x: 20, y: 15, width: 60, height: 40, color: 'yellow', label: 'Zona interior' },
      ...Array.from({ length: 11 }, (_, i) => ({ id: 'p' + i, type: 'participant', x: 25 + i % 4 * 15, y: 20 + Math.floor(i / 4) * 15, label: String(i + 1), color: 'blue' })),
      { id: 'arrow', type: 'arrow', x1: 25, y1: 20, x2: 55, y2: 35 },
    ] }, assignments: { players: [], teamColors: {} } },
    media: [{ id: 'video', source: 'url', kind: 'video', provider: 'youtube', title: 'Vídeo de referencia', originalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }],
    feedback: [{ id: 'post', usedOn: '2026-11-02', rating: 4, post: 'Buena circulación. Mejorar los apoyos tras pérdida.' }],
  };
  const css = await readFile('src/components/training/trainingTaskBatchPrint.css', 'utf8');
  const layout = await readFile('src/utils/trainingTaskPrintLayout.js', 'utf8');
  const { PlannedSessionPrintPages } = await vite.ssrLoadModule('/src/components/training/PlannedSessionPrint.jsx');
  const { PlannedSessionBatchPrintPages } = await vite.ssrLoadModule('/src/components/training/PlannedSessionBatchPrint.jsx');
  const session = (id) => ({ id, editor: { session_date: '2026-11-01', session_number: id,
    header: { objectives: 'Conservar el balón', material: 'Conos y balones' }, slots: [{ id: 'slot-' + id, phase: 'activation', duration: 12,
      items: [{ id: 'item-' + id, kind: 'library_task', minutes: 12,
        snapshot: { snapshot_version: 1, source_task_id: task.id, source: { name: task.name, description: task.description,
          editor_payload: task.editorPayload, material: task.material }, working: {} } }] }] },
    roster: [], availability: {}, distribution: { formation_key: null, player_layout: [], space_zones: [] }, positionById: new Map() });
  const selected = { team_name: 'Equipo de prueba', label: '2026/27' };
  const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
  const globalCss = await readFile('src/styles/print.css', 'utf8');
  const sessionCss = await readFile('src/components/training/plannedSessionDocument.css', 'utf8') + await readFile('src/components/training/plannedSessionPrint.css', 'utf8');
  const makeHtml = (markup, portal, key) => '<!doctype html><meta charset="utf-8"><style>' + globalCss + sessionCss + css +
    '</style><div class="' + portal + '">' + markup + '</div><script type="module">' + layout +
    '\nwindow.auditFit = () => fitTrainingTaskPrintSheets(document.querySelectorAll(".task-export-sheet")); window.auditReady = "' + key + '";</script>';
  const cases = {
    'task-single': { count: 1, portal: 'task-export-portal', markup: render(TrainingTaskBatchPrintPages, { tasks: [task] }) },
    'task-batch': { count: 2, portal: 'task-export-portal', markup: render(TrainingTaskBatchPrintPages, { tasks: [task, { ...task, id: 'second', name: 'Segunda tarea' }] }) },
    'session-single': { count: 1, portal: 'planned-print-portal', markup: render(PlannedSessionPrintPages, { ...session(1), selected }) },
    'session-batch': { count: 2, portal: 'planned-print-portal planned-print-batch-portal', markup: render(PlannedSessionBatchPrintPages, { sessions: [session(1), session(2)], selected }) },
  };
  server = httpServer((req, res) => {
    if (req.url === '/tasks.pdf' && pdfBuffer) { res.setHeader('Content-Type', 'application/pdf'); res.end(pdfBuffer); return; }
    const key = req.url.slice(1); const entry = cases[key] || cases['task-batch'];
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(makeHtml(entry.markup, entry.portal, key));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + dir, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = (await readFile(join(dir, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await new Promise(r => setTimeout(r, 100)); }
  }
  assert.ok(port, 'Chrome debe arrancar');
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  const target = targets.find(entry => entry.type === 'page' && entry.url === 'about:blank');
  assert.ok(target, 'Página de prueba disponible');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', event => { const message = JSON.parse(event.data); if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); } });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const key = ++id; pending.set(key, m => m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)); ws.send(JSON.stringify({ id: key, method, params })); });
  const evaluate = async (expression) => { const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
  await send('Page.enable');
  for (const [key, entry] of Object.entries(cases)) {
  await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/' + key });
  for (let i = 0; i < 100 && !await evaluate('window.auditReady === ' + JSON.stringify(key)); i++) await new Promise(r => setTimeout(r, 50));
  assert.equal(await evaluate('window.auditReady'), key);
  await evaluate('document.fonts.ready.then(() => window.auditFit())');
  await send('Emulation.setEmulatedMedia', { media: 'print' });
  await evaluate('window.auditFit()');
  const pdf = await send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
  pdfBuffer = Buffer.from(pdf.data, 'base64');
  const pdfText = pdfBuffer.toString('latin1');
  assert.equal((pdfText.match(/\/Type \/Page\b/g) || []).length, entry.count, key + ': número exacto de páginas');
  const boxes = [...pdfText.matchAll(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/g)];
  assert.ok(boxes.length && boxes.every(box => Math.abs(Number(box[1]) - 841.89) < 2 && Math.abs(Number(box[2]) - 595.28) < 2), key + ': A4 horizontal');
  assert.ok([...pdfText.matchAll(/\/Rotate\s+(-?\d+)/g)].every(match => Number(match[1]) % 360 === 0), 'Sin rotaciones de 90 grados');
  if (key.startsWith('task')) assert.match(pdfText, /\/URI \(https:\/\/www.youtube.com/, 'Enlace activo en el PDF');
  await writeFile(join(dir, key + '.pdf'), pdfBuffer);
  if (key.startsWith('task')) {
  const overflow = await evaluate(`(() => { document.querySelector('.task-export-content p').textContent = 'Texto muy largo '.repeat(6000); try { window.auditFit(); return ''; } catch(e) { return e.message; } })()`);
  assert.match(overflow, /Mantenimiento cuadrado.*Reduce o selecciona/s);
  }
  await send('Emulation.setEmulatedMedia', { media: 'screen' });
  await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/tasks.pdf' });
  await new Promise(r => setTimeout(r, 2500));
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(dir, key + '.png'), Buffer.from(screenshot.data, 'base64'));
  console.log(key + ': ' + entry.count + ' páginas A4 horizontales, sin rotación. ' + join(dir, key + '.pdf'));
  }
} finally {
  ws?.close(); chrome?.kill(); server?.close(); await vite.close();
}
