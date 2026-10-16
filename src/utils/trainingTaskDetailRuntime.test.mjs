import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import react from '@vitejs/plugin-react';
import { createLogger, createServer } from 'vite';
import { selectTrainingTaskFeaturedMedia } from './trainingTaskMedia.js';

const logger = createLogger('error');
logger.info = () => {};
logger.warn = () => {};
logger.warnOnce = () => {};

const server = await createServer({
  appType: 'custom',
  configFile: false,
  customLogger: logger,
  optimizeDeps: { disabled: true },
  plugins: [react()],
  root: process.cwd(),
  server: { middlewareMode: true },
});

try {
  const { default: TrainingTaskDetail, TrainingTaskDetailAccordion } = await server.ssrLoadModule('/src/components/training/TrainingTaskDetail.jsx');
  const task = {
    id: 'task-runtime-test',
    author_user_id: 'owner-runtime-test',
    name: 'Rondo lateral representativo',
    taskCode: 'RON-01',
    taskType: 'rondos',
    stageKeys: ['senior'],
    objective: 'Atraer y encontrar al tercer hombre.',
    description: 'Dos grupos conservan el balón con apoyo exterior.',
    playersSpec: '4v4+3',
    playersMin: 10,
    playersMax: 11,
    durationMinutes: 16,
    spaceWidthM: 24,
    spaceLengthM: 30,
    material: 'Balones, conos y petos.',
    technicalContent: 'Perfil corporal y pase tenso.',
    tacticalContent: 'Fijar para liberar.',
    gamePhase: 'offensive',
    gameMoment: 'creation',
    observations: 'Cambiar comodines cada serie.',
    variants: 'Limitar a dos contactos.',
    feedbackCount: 2,
    ratingAverage: 4.5,
    attachmentPath: 'club/task/documento.pdf',
    attachmentName: 'normas.pdf',
    attachmentMime: 'application/pdf',
    attachmentSize: 2048,
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-15T18:30:00Z',
    media: [
      { id: 'image-later', kind: 'image', source: 'upload', storage_path: 'club/task/image.png', title: 'Imagen posterior', sort_order: 2, is_primary: true },
      { id: 'video-first', kind: 'video', source: 'url', original_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Vídeo destacado', sort_order: 1 },
    ],
    editorPayload: {
      schemaVersion: 1,
      board: {
        pitchType: 'full',
        elements: [{ id: 'ball-1', type: 'ball', x: 50, y: 50 }],
      },
      assignments: { players: [], teamColors: {} },
    },
  };
  const feedback = React.createElement('div', null, 'POST pesado que permanece desmontado');
  const html = renderToStaticMarkup(React.createElement(TrainingTaskDetail, {
    task,
    currentUserId: task.author_user_id,
    players: [],
    client: {},
    feedbackContent: feedback,
  }));

  assert.match(html, /Rondo lateral representativo/, 'el detalle renderiza una tarea representativa');
  assert.match(html, /Atraer y encontrar al tercer hombre/, 'objetivo principal visible');
  assert.match(html, /Dos grupos conservan el balón/, 'desarrollo visible');
  assert.match(html, /Organización de la tarea/, 'la organización se muestra junto a la pizarra');
  assert.match(html, /Formato de jugadores/, 'el formato de jugadores está en el panel principal');
  assert.match(html, /Contenido técnico y táctico de la tarea/, 'el contenido técnico y táctico está en el panel principal');
  assert.match(html, /Perfil corporal y pase tenso/, 'se ve el contenido técnico sin desplegar');
  assert.match(html, /Fijar para liberar/, 'se ve el contenido táctico sin desplegar');
  assert.match(html, /Vídeo destacado/, 'el recurso apto con menor orden se muestra como acceso rápido');
  assert.doesNotMatch(html, /Imagen posterior/, 'los recursos adicionales permanecen en la colección cerrada');
  assert.doesNotMatch(html, /<iframe|<video/, 'el acceso rápido no monta ni reproduce el vídeo');
  assert.match(html, /Ampliar pizarra/, 'la pizarra real se renderiza y conserva ampliación');
  assert.match(html, /aria-expanded="false"/, 'los acordeones comienzan cerrados');
  assert.doesNotMatch(html, /Organización detallada/, 'no aparece un acordeón de organización sin datos complementarios');
  assert.doesNotMatch(html, /POST pesado que permanece desmontado/, 'POST no se monta mientras su acordeón está cerrado');

  assert.equal(selectTrainingTaskFeaturedMedia(task.media)?.id, 'video-first', 'la selección respeta el orden persistido incluso si otra imagen es primaria');
  assert.equal(selectTrainingTaskFeaturedMedia([{ id: 'pdf', kind: 'document', source: 'upload', storage_path: 'club/task/file.pdf', sort_order: 1 }, ...task.media])?.id, 'video-first', 'se omiten recursos sin vista previa sin cambiar el orden de los aptos');
  assert.equal(selectTrainingTaskFeaturedMedia([{ id: 'link', kind: 'link', source: 'url', original_url: 'https://example.com', sort_order: 1 }]), null, 'un enlace genérico no inventa miniatura');
  assert.equal(selectTrainingTaskFeaturedMedia([]), null, 'sin multimedia no se reserva acceso rápido');

  const sparseHtml = renderToStaticMarkup(React.createElement(TrainingTaskDetail, {
    task: { id: 'sparse-task', author_user_id: 'other-user', name: 'Tarea incompleta', editorPayload: null },
    currentUserId: 'owner-runtime-test',
    players: [],
    client: {},
  }));
  assert.match(sparseHtml, /Tarea incompleta/, 'los campos opcionales ausentes no impiden renderizar');
  assert.match(sparseHtml, /Solo lectura/, 'una tarea compartida conserva el estado readonly');
  assert.match(sparseHtml, /Sin diseño guardado/, 'la pizarra vacía tiene un estado compacto');
  assert.doesNotMatch(sparseHtml, />Editar tarea</, 'una tarea ajena no expone edición');
  assert.doesNotMatch(sparseHtml, /Recurso multimedia destacado/, 'una tarea sin multimedia no reserva espacio vacío');
  assert.doesNotMatch(sparseHtml, /aria-label="Organización de la tarea"/, 'una tarea sin datos de organización no muestra un bloque vacío');
  assert.doesNotMatch(sparseHtml, /aria-label="Contenido técnico y táctico de la tarea"/, 'una tarea sin contenido técnico no muestra un bloque vacío');
  assert.doesNotMatch(sparseHtml, /Organización detallada|Contenido técnico y táctico<\/span>/, 'los acordeones sin complemento se omiten');

  const assignmentsHtml = renderToStaticMarkup(React.createElement(TrainingTaskDetail, {
    task: { ...task, editorPayload: { ...task.editorPayload, assignments: { players: [{ teamKey: 'team-1', playerRef: { kind: 'snapshot', snapshot: { name: 'Jugador conservado' } } }], teamColors: {} } } },
    currentUserId: task.author_user_id,
    players: [],
    client: {},
  }));
  assert.match(assignmentsHtml, /Organización detallada/, 'las asignaciones reales activan la organización complementaria');
  assert.doesNotMatch(assignmentsHtml, /Jugador conservado/, 'las fichas detalladas no se montan mientras el acordeón está cerrado');

  const closedAccordion = renderToStaticMarkup(React.createElement(TrainingTaskDetailAccordion, {
    sectionKey: 'runtime-closed', title: 'Cerrado', summary: 'Resumen', isOpen: false, onToggle: () => {},
  }, React.createElement('span', null, 'contenido pesado')));
  const openAccordion = renderToStaticMarkup(React.createElement(TrainingTaskDetailAccordion, {
    sectionKey: 'runtime-open', title: 'Abierto', summary: 'Resumen', isOpen: true, onToggle: () => {},
  }, React.createElement('span', null, 'contenido visible')));
  assert.doesNotMatch(closedAccordion, /contenido pesado/, 'un acordeón cerrado no monta sus hijos');
  assert.match(openAccordion, /aria-expanded="true"/, 'un acordeón abierto comunica su estado');
  assert.match(openAccordion, /role="region"[^>]+aria-label="Abierto"/, 'el panel abierto es una región accesible');
  assert.match(openAccordion, /contenido visible/, 'un acordeón abierto renderiza sus hijos');
} finally {
  await server.close();
}

console.log('training task detail runtime tests passed');
