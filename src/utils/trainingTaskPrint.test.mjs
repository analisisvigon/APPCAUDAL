import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { loadTrainingTaskPrintData, printableMediaUrl } from './trainingTaskPrintData.js';
import { createTrainingTaskBoardElement, TRAINING_CONDITIONAL_MATERIALS } from './trainingTaskBoardElements.js';
import { createTrainingTaskEditorSceneV1 } from './trainingTaskEditorPayload.js';
import { createTrainingTaskMetricCalibration } from './trainingTaskSpatial.js';

const base = { id: 'a', club_id: 'club', name: 'Ejercicio completo', task_code: 'RON-01', task_type: 'rondos',
  objective: 'Conservar', description: 'Inicio\n' + 'Desarrollo largo. '.repeat(1000) + 'FINAL DESCRIPCIÓN',
  exercise_rules: 'Regla\n'.repeat(500) + 'FINAL REGLAS', variants: 'Variante real',
  tactical_content_offensive: 'Ataque real', tactical_content_defensive: 'Defensa real',
  tactical_content: 'Herencia real', technical_content: 'Técnica real', stage_keys: ['senior'],
  editor_payload: { schemaVersion: 1, board: { pitchType: 'full', elements: [
    { id: 'ball', type: 'ball', x: 50, y: 36 },
    ...TRAINING_CONDITIONAL_MATERIALS.map((material, index) => ({
      ...createTrainingTaskBoardElement(`conditional:${material.id}`, () => `conditional-${index}`),
      x: 10 + (index % 8) * 11,
      y: 12 + Math.floor(index / 8) * 20,
    })),
  ] }, assignments: { players: [], teamColors: {} } } };
const media = [{ id: 'video', task_id: 'a', source: 'url', kind: 'video', provider: 'youtube',
  title: 'Vídeo real', original_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', caption: 'Consigna del vídeo' },
{ id: 'private', task_id: 'a', source: 'upload', kind: 'document', original_name: 'privado.pdf', storage_path: 'secret-path' }];
const feedback = Array.from({ length: 205 }, (_, i) => ({ id: String(i), task_id: 'a', used_on: '2026-11-01',
  rating: i % 2 ? null : 4, post_text: 'Observación POST ' + i }));
const client = { from(table) {
  const filters = [];
  return { select() { return this; }, eq(key, value) { filters.push([key, value]); return this; }, order() { return this; },
    single() { assert.deepEqual(filters, [['id', 'a']]); return { data: base }; },
    range(start, end) { assert.deepEqual(filters, [['task_id', 'a']]);
      return { data: (table === 'training_task_media' ? media : feedback).slice(start, Math.min(end + 1, start + 50)) }; },
  };
} };
const before = JSON.stringify({ base, media, feedback });
const task = await loadTrainingTaskPrintData(client, 'a');
assert.equal(task.feedback.length, 205);
assert.equal(task.media.length, 2);
assert.equal(JSON.stringify({ base, media, feedback }), before);
const photoClient = {
  from(table) { return { select() { return this; }, eq() { return this; }, order() { return this; },
    single() { return { data: { ...base, id: 'photo-source', editor_payload: {}, name: 'Tarea con foto' } }; },
    range(start) { return { data: table === 'training_task_media' && start === 0 ? [{ id: 'photo-media',
      task_id: 'photo-source', kind: 'image', source: 'upload', storage_path: 'club/task/photo.webp',
      original_name: 'foto.webp', is_primary: true }] : [] }; },
  }; },
  storage: { from(bucket) { assert.equal(bucket, 'training-task-files'); return {
    createSignedUrl(path) { assert.equal(path, 'club/task/photo.webp'); return { data: { signedUrl: 'https://signed.test/photo.webp' } }; },
  }; } },
};
const photoTask = await loadTrainingTaskPrintData(photoClient, 'photo-source');
assert.deepEqual(photoTask.printImage, { url: 'https://signed.test/photo.webp', name: 'foto.webp' });
await assert.rejects(loadTrainingTaskPrintData({ from: () => ({ select() { return this; }, eq() { return this; }, single: () => ({ error: new Error('denied') }) }) }, 'a'), /denied/);
assert.equal(printableMediaUrl({ source: 'url', originalUrl: 'javascript:alert(1)' }), '');
assert.equal(printableMediaUrl({ source: 'url', originalUrl: 'https://example.com/video?token=secret' }), '');
assert.equal(printableMediaUrl({ source: 'upload', originalUrl: 'https://example.com/private' }), '');
const vite = await createServer({ configFile: false, esbuild: { jsx: 'automatic' }, server: { middlewareMode: true }, appType: 'custom' });
try {
  const { TrainingTaskPrintSheet, TrainingTaskBatchPrintPages } = await vite.ssrLoadModule('/src/components/training/TrainingTaskBatchPrint.jsx');
  const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
  const simple = render(TrainingTaskPrintSheet, { task: { id: 'simple', name: 'Sencilla', objective: 'Objetivo', editorPayload: {} } });
  assert.doesNotMatch(simple, /Multimedia|Evaluación posterior|Diseño de la tarea|undefined|—/);
  const photoHtml = render(TrainingTaskPrintSheet, { task: { id: 'photo', name: 'Fotografía', editorPayload: {},
    printImage: { url: 'https://example.test/foto.webp', name: 'Foto completa' } } });
  assert.match(photoHtml, /task-export-image[\s\S]*task-export-image-frame[\s\S]*<img/);
  assert.match(photoHtml, /https:\/\/example\.test\/foto\.webp/);
  const html = render(TrainingTaskPrintSheet, { task });
  for (const text of ['RON-01', 'Variante real', 'Ataque real', 'Defensa real', 'Herencia real', 'Técnica real',
    'FINAL DESCRIPCIÓN', 'FINAL REGLAS', 'Vídeo real', 'Consigna del vídeo', 'privado.pdf', 'Observación POST 204', 'Valoración 4/5']) assert.ok(html.includes(text), text);
  assert.match(html, /<svg/);
  TRAINING_CONDITIONAL_MATERIALS.forEach((material) => assert.ok(
    html.includes(`data-training-material="${material.id}"`),
    `PDF markup includes ${material.name}`,
  ));
  assert.match(html, /href="https:\/\/www.youtube.com/);
  assert.doesNotMatch(html, /secret-path|<video|<iframe|<button/);
  const metricPayload = createTrainingTaskEditorSceneV1({
    pitchType: 'full',
    metricCalibration: createTrainingTaskMetricCalibration('full'),
    elements: [
      { id: 'cone-metric-a', type: 'cone', x: 10, y: 10 },
      { id: 'cone-metric-b', type: 'cone', x: 20, y: 10 },
      { id: 'zone-metric', type: 'zone', x: 30, y: 15, width: 25, height: 20, colorKey: 'blue' },
    ],
    measurements: [{ id: 'distance-metric', from: { kind: 'element', elementId: 'cone-metric-a' }, to: { kind: 'element', elementId: 'cone-metric-b' } }],
  });
  const metricHtml = render(TrainingTaskPrintSheet, { task: { id: 'metric', name: 'Métrica', editorPayload: metricPayload } });
  assert.match(metricHtml, /viewBox="0 0 105 60"/, 'el PDF conserva la proporción real del campo');
  assert.match(metricHtml, /25\.0 × 20\.0 m/, 'el PDF conserva las dimensiones de zona');
  assert.match(metricHtml, />10\.0 m</, 'el PDF conserva la distancia medida');
  const batch = render(TrainingTaskBatchPrintPages, { tasks: [task, { id: 'b', name: 'Segunda', editorPayload: {} }] });
  assert.equal((batch.match(/class="task-export-sheet"/g) || []).length, 2);
  assert.ok(batch.indexOf('FINAL REGLAS') < batch.indexOf('data-task-id="b"'));
  console.log('training task complete PDF tests passed');
} finally { await vite.close(); }
