// Prueba visual local y sintética; no accede a Supabase ni a datos reales.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTrainingTaskEditorSceneV1 } from '../src/utils/trainingTaskEditorPayload.js';
import { createTrainingTaskMetricCalibration } from '../src/utils/trainingTaskSpatial.js';
import { TRAINING_TASK_PRINT_PAGE_RULE } from '../src/utils/trainingTaskPrintOrientation.js';

const root = path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), '..');
const cache = path.join(root, 'node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const bundle = path.join(cache, 'appcaudal-task-print-ssr.mjs');
await build({ entryPoints: [path.join(root, 'src/components/training/TrainingTaskBatchPrint.jsx')],
  bundle: true, platform: 'node', format: 'esm', jsx: 'automatic', outfile: bundle,
  external: ['react', 'react-dom', 'react/jsx-runtime'], loader: { '.css': 'empty' }, logLevel: 'silent' });
const { TrainingTaskBatchPrintPages } = await import(`${pathToFileURL(bundle).href}?v=${Date.now()}`);
const fitBundle = await build({ entryPoints: [path.join(root, 'src/utils/trainingTaskPrintLayout.js')],
  bundle: true, platform: 'browser', format: 'iife', globalName: 'NexoTaskPrintLayout', write: false, logLevel: 'silent' });
const fitScript = fitBundle.outputFiles[0].text;

const browserCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);
const browser = browserCandidates.find(existsSync);
assert.ok(browser, 'Se necesita Chrome o Edge para la prueba visual de tareas.');

const metricPayload = createTrainingTaskEditorSceneV1({ pitchType: 'full',
  metricCalibration: createTrainingTaskMetricCalibration('full'),
  elements: [
    { id: 'cone-a', type: 'cone', x: 10, y: 10 },
    { id: 'cone-b', type: 'cone', x: 25, y: 10 },
    { id: 'zone', type: 'zone', x: 35, y: 18, width: 25, height: 20, colorKey: 'blue' },
  ], measurements: [{ id: 'measure', from: { kind: 'element', elementId: 'cone-a' },
    to: { kind: 'element', elementId: 'cone-b' } }],
});
const common = { taskType: 'rondos', taskCode: 'VIS-01', created_at: '2026-11-28T10:00:00Z',
  objective: 'Conservar y progresar con apoyos.', description: 'Circular con ritmo.\nOrientar el control hacia el siguiente pase.',
  exerciseRules: 'Dos toques.\nCambio de rol tras pérdida.', technicalContent: 'Pase y control orientado.',
  tacticalOffensiveContent: 'Fijar y encontrar al tercer hombre.', tacticalDefensiveContent: 'Presión inmediata.',
  material: 'Balones, petos y conos.', playersMin: 8, playersMax: 12, durationMinutes: 18,
  spaceWidthM: 25, spaceLengthM: 20, media: [], feedback: [] };
const photo = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="500"><rect width="1200" height="500" fill="#dbeafe"/><circle cx="160" cy="250" r="110" fill="#dc2626"/><rect x="360" y="80" width="720" height="340" fill="#1d4ed8"/></svg>');
const conservationPayload = createTrainingTaskEditorSceneV1({ pitchType: 'full',
  metricCalibration: createTrainingTaskMetricCalibration('full'),
  elements: [
    { id: 'zone-left', type: 'zone', x: 8, y: 8, width: 28, height: 44, colorKey: 'blue' },
    { id: 'zone-right', type: 'zone', x: 69, y: 8, width: 28, height: 44, colorKey: 'red' },
    ...Array.from({ length: 14 }, (_, index) => ({ id: `player-${index}`, type: 'participant',
      x: 14 + (index % 7) * 12.5, y: index < 7 ? 20 : 40, colorKey: index < 7 ? 'blue' : 'red' })),
  ],
});
const tasks = [
  { ...common, id: 'conservation', name: 'Conservación 6vs6 +1C +1P con zonas', taskCode: 'CON-6611',
    editorPayload: conservationPayload, playersMin: 14, playersMax: 14, seriesCount: 4, minutesPerSeries: 4,
    description: 'Dos equipos conservan el balón y progresan entre zonas con apoyo del comodín.\nEl portero participa como apoyo exterior y reinicia tras cada pérdida.',
    exerciseRules: 'Máximo dos toques.\nPunto al enlazar las tres zonas.\nTras pérdida, presión inmediata durante cinco segundos.',
    technicalContent: 'Pase, perfil corporal, control orientado y temporización.',
    tacticalOffensiveContent: 'Crear superioridad, fijar dentro y progresar por el lado débil.',
    tacticalDefensiveContent: 'Cerrar líneas interiores y orientar la presión.',
    tacticalContent: 'Conservación y ocupación racional de espacios.',
    variants: 'Limitar al comodín a un toque y exigir cambio de orientación antes de puntuar.',
    observations: 'Corregir distancias de relación y altura del apoyo exterior.' },
  { ...common, id: 'metric', name: 'Tarea con pizarra métrica', editorPayload: metricPayload },
  { ...common, id: 'photo', name: 'Tarea con fotografía panorámica', taskCode: 'VIS-02', editorPayload: {},
    printImage: { url: photo, name: 'Fotografía panorámica completa' } },
];
const markup = renderToStaticMarkup(React.createElement(TrainingTaskBatchPrintPages, { tasks }));
const css = pathToFileURL(path.join(root, 'src/components/training/trainingTaskBatchPrint.css')).href;
const output = mkdtempSync(path.join(tmpdir(), 'appcaudal-task-print-'));
const htmlPath = path.join(output, 'tasks.html');
const pdfPath = path.join(output, 'tasks.pdf');
const screenshotPath = path.join(output, 'tasks-print-render.png');
const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${css}"><style media="print">${TRAINING_TASK_PRINT_PAGE_RULE}</style><style media="screen">body{margin:0}.task-export-portal{position:static;left:auto;visibility:visible;pointer-events:auto}</style></head><body><div class="task-export-portal">${markup}</div><script>${fitScript}</script><script>addEventListener('load',()=>{const sheets=[...document.querySelectorAll('.task-export-sheet')];try{NexoTaskPrintLayout.fitTrainingTaskPrintSheets(sheets);document.documentElement.dataset.fitError='';}catch(error){document.documentElement.dataset.fitError=error.message;}const escaped=sheets.some(s=>s.scrollHeight>s.clientHeight+3||s.scrollWidth>s.clientWidth+3);const fonts=[...document.querySelectorAll('.task-export-content p')].map(n=>parseFloat(getComputedStyle(n).fontSize));document.documentElement.dataset.overflow=String(escaped);document.documentElement.dataset.legible=String(fonts.every(size=>size>=12));const image=document.querySelector('.task-export-image img');document.documentElement.dataset.imageFit=image?getComputedStyle(image).objectFit:'missing';});</script></body></html>`;
writeFileSync(htmlPath, html, 'utf8');
execFileSync(browser, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions',
  '--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, pathToFileURL(htmlPath).href], { timeout: 30000, stdio: 'pipe' });
assert.ok(existsSync(pdfPath));
const pdf = readFileSync(pdfPath).toString('latin1');
const pages = (pdf.match(/\/Type\s*\/Page\b/g) || []).length;
assert.equal(pages, 3, 'tres tareas generan exactamente tres hojas');
assert.equal((pdf.match(/\/MediaBox\s*\[\s*0\s+0\s+841\.9[\d]*\s+594\.9[\d]*\s*\]/g) || []).length, pages,
  'cada tarea usa A4 horizontal real');
assert.doesNotMatch(pdf, /\/Rotate\s+(?:90|180|270)\b/, 'el PDF no gira contenido dentro de hojas verticales');
const dom = execFileSync(browser, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions',
  '--dump-dom', pathToFileURL(htmlPath).href], { timeout: 30000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
assert.match(dom, /data-overflow="false"/);
assert.match(dom, /data-fit-error=""/);
assert.match(dom, /data-legible="true"/);
assert.match(dom, /data-image-fit="contain"/);
execFileSync(browser, ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions',
  '--window-size=1400,1900', `--screenshot=${screenshotPath}`, pathToFileURL(htmlPath).href],
{ timeout: 30000, stdio: 'pipe' });
assert.ok(existsSync(screenshotPath), 'se captura visualmente la misma composición usada para generar el PDF');
console.log(`Tareas: ${pages} páginas A4 horizontales; PDF y captura: ${output}`);
