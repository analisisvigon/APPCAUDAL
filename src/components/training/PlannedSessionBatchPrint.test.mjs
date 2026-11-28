import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { createTrainingTaskBoardElement, TRAINING_CONDITIONAL_MATERIALS } from '../../utils/trainingTaskBoardElements.js';

const vite = await createServer({ configFile: false, esbuild: { jsx: 'automatic' },
  server: { middlewareMode: true }, appType: 'custom' });
try {
  const { PlannedSessionBatchPrintPages } = await vite.ssrLoadModule(
    '/src/components/training/PlannedSessionBatchPrint.jsx');
  const conditionalPayload = { schemaVersion: 1, board: { pitchType: 'full', elements:
    TRAINING_CONDITIONAL_MATERIALS.map((material, index) => ({
      ...createTrainingTaskBoardElement(`conditional:${material.id}`, () => `conditional-${index}`),
      x: 10 + (index % 8) * 11,
      y: 12 + Math.floor(index / 8) * 20,
    })) } };
  const slot = (id, phase) => ({ id, phase, duration: '15', items: [{ id: `${id}-task`, kind: 'free',
    title: `Título ${id}`, description: `Desarrollo ${id}` }] });
  const librarySlot = { id: 'library', phase: 'main', duration: '15', items: [{
    id: 'library-task', kind: 'library_task', sourceTaskId: 'source-task', minutes: '15',
    snapshot: { snapshot_version: 1, source_task_id: 'source-task', working: {}, source: {
      name: 'Biblioteca', description: 'Desarrollo original', material: 'Conos',
      exercise_rules: 'Dos toques\nGol doble', tactical_content: 'Contenido heredado',
      tactical_content_offensive: 'Atacar por fuera', tactical_content_defensive: 'Cerrar el centro',
      editor_payload: conditionalPayload,
    } }, working: { exercise_rules: 'Tres toques\nGol doble' },
  }] };
  const photoSlot = { id: 'photo', phase: 'main', duration: '15', items: [{
    id: 'photo-task', kind: 'library_task', sourceTaskId: 'photo-source', minutes: '15',
    snapshot: { snapshot_version: 1, source_task_id: 'photo-source', working: {}, source: {
      name: 'Tarea con fotografía', description: 'Referencia visual completa', editor_payload: {},
    } }, working: {},
  }] };
  const session = (id, number, slots) => ({
    id,
    editor: { session_date: '2026-10-20', session_number: number, header: { material: `Material ${id}` }, slots },
    roster: [], availability: {},
    distribution: { formation_key: null, player_layout: [], space_zones: [] },
    positionById: new Map(), sessionValue: '', fieldDimensions: null, exerciseDimensions: {}, mcNumber: '',
    activityImages: id === 'one' ? { 'activation-task': [
      { id: 'image-1', originalName: 'Uno.png', signedUrl: 'https://example.test/uno.png' },
      { id: 'image-2', originalName: 'Dos.webp', signedUrl: 'https://example.test/dos.webp' },
    ] } : {},
    libraryTaskImages: id === 'one' ? { 'photo-source': {
      id: 'photo-image', originalName: 'Fotografía completa.webp',
      signedUrl: 'https://example.test/fotografia-completa.webp',
    } } : {},
  });
  const markup = renderToStaticMarkup(React.createElement(PlannedSessionBatchPrintPages, {
    sessions: [session('one', 7, [slot('activation', 'activation'), librarySlot, photoSlot]),
      session('two', 8, Array.from({ length: 5 }, (_, index) => slot(`main-${index}`, 'main')))],
    selected: { team_name: 'Equipo', label: '2026/27' }, leagueLogoUrl: '',
  }));
  assert.equal((markup.match(/class="planned-print-pages"/g) || []).length, 2,
    'cada sesión mantiene su propia composición de hojas');
  assert.equal((markup.match(/class="planned-print-sheet /g) || []).length, 4,
    'cada sesión conserva todo el contenido sin crear una tercera hoja');
  for (const label of ['Título activation', 'Título main-0', 'Título main-4',
    'Material one', 'Material two', 'Nº sesión']) assert.ok(markup.includes(label), label);
  assert.ok(markup.includes('>7</b>') && markup.includes('>8</b>'),
    'se conserva la numeración original de cada sesión');
  TRAINING_CONDITIONAL_MATERIALS.forEach((material) => assert.ok(
    markup.includes(`data-training-material="${material.id}"`),
    `la impresión de sesión representa ${material.name}`,
  ));
  for (const content of ['Tres toques', 'Gol doble', 'Contenido heredado',
    'Atacar por fuera', 'Cerrar el centro']) assert.ok(markup.includes(content), content);
  assert.doesNotMatch(markup, /Dos toques/, 'la copia editada sustituye su valor original en el PDF');
  assert.ok(markup.includes('data-image-count="2"') && markup.includes('https://example.test/uno.png'),
    'las imágenes de actividades libres se incluyen en el PDF conjunto con su cuadrícula');
  assert.match(markup, /planned-print-library-image[\s\S]*https:\/\/example\.test\/fotografia-completa\.webp/,
    'una tarea sin pizarra representa su fotografía completa en el PDF conjunto');
  assert.doesNotMatch(markup, /<button|<input|<textarea/, 'las hojas no contienen controles de edición');
  const css = readFileSync('src/components/training/plannedSessionPrint.css', 'utf8');
  assert.match(css, /\.planned-print-batch-portal \.planned-print-pages:not\(:last-child\) > \.planned-print-sheet:last-child \{ break-after: page;/,
    'una sesión nueva empieza en otra página');
  assert.match(css, /\.planned-print-portal:not\(\.planned-print-batch-portal\) \{ display: none !important;/,
    'la impresión individual abierta no aparece duplicada en el lote');
  console.log('planned session batch print tests passed');
} finally {
  await vite.close();
}
