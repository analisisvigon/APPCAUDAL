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
  const html = '<!doctype html><meta charset="utf-8"><style>' + css + '@page task-library {size:A4 landscape;margin:0} .task-export-portal {position:static;visibility:visible}</style><div class="task-export-portal">' +
    renderToStaticMarkup(React.createElement(TrainingTaskBatchPrintPages, { tasks: [task, { ...task, id: 'second', name: 'Segunda tarea' }] })) +
    '</div><script type="module">' + layout + '\nwindow.auditFit = () => fitTrainingTaskPrintSheets(document.querySelectorAll(".task-export-sheet"));</script>';
  server = httpServer((req, res) => {
    if (req.url === '/tasks.pdf' && pdfBuffer) { res.setHeader('Content-Type', 'application/pdf'); res.end(pdfBuffer); return; }
    res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html);
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
  await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port });
  for (let i = 0; i < 100 && !await evaluate('Boolean(window.auditFit)'); i++) await new Promise(r => setTimeout(r, 50));
  if (!await evaluate('Boolean(window.auditFit)')) throw new Error(await evaluate('location.href + " " + document.body.innerText.slice(0, 1000)'));
  await evaluate('document.fonts.ready.then(() => window.auditFit())');
  await send('Emulation.setEmulatedMedia', { media: 'print' });
  await evaluate('window.auditFit()');
  const pdf = await send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
  pdfBuffer = Buffer.from(pdf.data, 'base64');
  const pdfText = pdfBuffer.toString('latin1');
  assert.equal((pdfText.match(/\/Type \/Page\b/g) || []).length, 2, 'Dos tareas, exactamente dos páginas');
  const box = /\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/.exec(pdfText);
  assert.ok(box && Math.abs(Number(box[1]) - 841.89) < 2 && Math.abs(Number(box[2]) - 595.28) < 2, 'A4 horizontal');
  await writeFile(join(dir, 'tasks.pdf'), pdfBuffer);
  const overflow = await evaluate(`(() => { document.querySelector('.task-export-content p').textContent = 'Texto muy largo '.repeat(6000); try { window.auditFit(); return ''; } catch(e) { return e.message; } })()`);
  assert.match(overflow, /Mantenimiento cuadrado.*Reduce o selecciona/s);
  await send('Emulation.setEmulatedMedia', { media: 'screen' });
  await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:' + server.address().port + '/tasks.pdf' });
  await new Promise(r => setTimeout(r, 2500));
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(dir, 'pdf-preview.png'), Buffer.from(screenshot.data, 'base64'));
  console.log('PDF audit passed; two tasks and overflow rejection. Artifact: ' + join(dir, 'tasks.pdf'));
} finally {
  ws?.close(); chrome?.kill(); server?.close(); await vite.close();
}
