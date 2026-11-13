import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import {
  createTrainingTaskPowerPoint,
  inspectTrainingTaskPowerPointLayout,
  trainingTaskPowerPointFileName,
} from './trainingTaskPowerPoint.js';
import {
  createTrainingTaskBoardElement,
  TRAINING_CONDITIONAL_MATERIALS,
} from './trainingTaskBoardElements.js';
import { createTrainingTaskEditorSceneV1 } from './trainingTaskEditorPayload.js';

const task = {
  id: 'task-123',
  taskCode: 'NEXO-15',
  name: 'Conservación y cambio de orientación',
  objective: 'Mejorar la conservación bajo presión.',
  description: '1. Mantener apoyos cercanos.\n2. Cambiar el juego al espacio libre.',
  taskType: 'positional_games',
  stageKeys: [],
  durationMinutes: 18,
  playersMin: 8,
  playersMax: 10,
  spaceWidthM: 30,
  spaceLengthM: 24,
  exerciseRules: 'Máximo dos toques.',
  technicalContent: 'Control y pase.',
  material: 'Petos y balones.',
  editorPayload: {
    schemaVersion: 1,
    board: {
      pitchType: 'half',
      elements: [
        { id: 'player-1', type: 'participant', x: 18, y: 30, role: 'player', colorKey: 'blue', label: '10' },
        { id: 'player-2', type: 'participant', x: 76, y: 42, role: 'goalkeeper', colorKey: 'orange', label: 'P' },
        { id: 'arrow-1', type: 'arrow', x1: 20, y1: 30, x2: 54, y2: 25, colorKey: 'blue' },
        { id: 'curve-1', type: 'curved_arrow', x1: 25, y1: 48, x2: 70, y2: 38, controlX: 45, controlY: 20, colorKey: 'red' },
        { id: 'line-1', type: 'dashed_line', x1: 12, y1: 12, x2: 80, y2: 12, colorKey: 'yellow' },
        { id: 'zone-1', type: 'zone', x: 32, y: 22, width: 18, height: 14, colorKey: 'green', label: 'Zona de presión' },
        { id: 'text-1', type: 'text', x: 50, y: 58, label: 'Salida', colorKey: 'white' },
      ],
    },
  },
};

test('exports a synthetic "Zona neutral a la espalda" task on one editable A4 landscape slide', async () => {
  const sampleTask = {
    ...task,
    name: 'Zona neutral a la espalda',
    objective: 'Mejorar la búsqueda de espacios a la espalda de la línea rival.',
    description: '1. Mantener la posesión y atraer al rival.\n2. Encontrar al compañero en zona neutral.\n3. Atacar el espacio a la espalda.',
    exerciseRules: 'Máximo dos toques antes de progresar.\nEl equipo defensor recupera y contraataca.',
    observations: 'Orientar el cuerpo antes de recibir.',
    tacticalContent: 'Fijar a la última línea y temporizar el desmarque.',
    tacticalOffensiveContent: 'Atraer, fijar y acelerar tras el pase.',
    variants: 'Añadir un comodín interior si baja la continuidad.',
    attachmentName: 'Ficha de apoyo',
    media: [{
      title: 'Vídeo',
      kind: 'video',
      caption: 'Ejemplo.',
    }],
    feedback: [{ usedOn: '2025-03-10', rating: 4, post: 'Buen ritmo.' }],
    gamePhase: 'offensive',
    gameMoment: 'creation',
  };
  const presentation = createTrainingTaskPowerPoint(sampleTask);
  assert.equal(presentation.layout, 'NEXO_A4_LANDSCAPE');

  const buffer = await presentation.write({ outputType: 'nodebuffer' });
  const archive = await JSZip.loadAsync(buffer);
  const slideXml = await archive.file('ppt/slides/slide1.xml').async('string');
  const presentationXml = await archive.file('ppt/presentation.xml').async('string');
  const slideFiles = Object.keys(archive.files).filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path));
  const shapeCount = (slideXml.match(/<p:sp>/g) || []).length;

  assert.equal(slideFiles.length, 1);
  assert.match(presentationXml, /cx="10692000" cy="7560000"/);
  assert.match(slideXml, /Zona neutral a la espalda/);
  assert.match(slideXml, /Mejorar la búsqueda de espacios/);
  assert.match(slideXml, /Mantener la posesión y atraer al rival/);
  assert.match(slideXml, /Máximo dos toques/);
  assert.match(slideXml, /Fijar a la última línea/);
  assert.match(slideXml, /Variantes y progresiones/);
  assert.match(slideXml, /Material/);
  assert.match(slideXml, /Vídeo/);
  assert.match(slideXml, /Ejemplo/);
  assert.match(slideXml, /Evaluación POST 1/);
  assert.match(slideXml, /Buen ritmo/);
  assert.match(slideXml, /Zona de presión/);
  assert.ok(shapeCount > 40, `expected editable slide shapes, got ${shapeCount}`);
  assert.doesNotMatch(slideXml, /<p:pic>/);
  const transforms = [...slideXml.matchAll(/<a:xfrm(?:\s[^>]*)?>([\s\S]*?)<\/a:xfrm>/g)];
  assert.ok(transforms.length > 40, 'expected geometry metadata for editable shapes');
  transforms.forEach(([, transform]) => {
    const offset = transform.match(/<a:off x="(\d+)" y="(\d+)"\/>/);
    const extent = transform.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/);
    if (!offset || !extent) return;
    const x = Number(offset[1]);
    const y = Number(offset[2]);
    const width = Number(extent[1]);
    const height = Number(extent[2]);
    assert.ok(x >= 0 && y >= 0, 'shape starts inside the slide');
    assert.ok(x + width <= 10692000 && y + height <= 7560000, 'shape fits inside the A4 slide');
  });

  const geometry = inspectTrainingTaskPowerPointLayout(sampleTask);
  assert.ok(geometry.board.x >= 0 && geometry.board.x + geometry.board.w <= geometry.page.width);
  assert.ok(geometry.board.y + geometry.board.h <= geometry.pageBottom);
  geometry.leftSections.forEach((section) => assert.ok(section.bottom <= geometry.pageBottom));
  geometry.rightFields.forEach((field) => assert.ok(field.bottom <= geometry.pageBottom));
});

test('keeps task text exportable when the board schema is unsupported', async () => {
  const presentation = createTrainingTaskPowerPoint({
    name: 'Tarea sin pizarra compatible',
    objective: 'Objetivo editable',
    editorPayload: { schemaVersion: 2 },
  });
  const archive = await JSZip.loadAsync(await presentation.write({ outputType: 'nodebuffer' }));
  const slideXml = await archive.file('ppt/slides/slide1.xml').async('string');
  const slideFiles = Object.keys(archive.files).filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path));

  assert.equal(slideFiles.length, 1);
  assert.match(slideXml, /Tarea sin pizarra compatible/);
  assert.match(slideXml, /formato no es compatible/);
});

test('exports every conditional catalog material as native editable PowerPoint shapes', async () => {
  const elements = TRAINING_CONDITIONAL_MATERIALS.map((material, index) => ({
    ...createTrainingTaskBoardElement(`conditional:${material.id}`, () => `conditional-${index}`),
    x: 10 + (index % 8) * 11,
    y: 12 + Math.floor(index / 8) * 20,
  }));
  const editorPayload = createTrainingTaskEditorSceneV1({ pitchType: 'full', elements });
  const presentation = createTrainingTaskPowerPoint({ name: 'Catálogo condicional', editorPayload });
  const archive = await JSZip.loadAsync(await presentation.write({ outputType: 'nodebuffer' }));
  const slideFiles = Object.keys(archive.files).filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path));
  const slideXml = await archive.file('ppt/slides/slide1.xml').async('string');
  const presentationXml = await archive.file('ppt/presentation.xml').async('string');
  const shapeCount = (slideXml.match(/<p:sp>/g) || []).length;

  assert.equal(slideFiles.length, 1);
  assert.match(presentationXml, /cx="10692000" cy="7560000"/);
  assert.ok(shapeCount > TRAINING_CONDITIONAL_MATERIALS.length * 2);
  assert.doesNotMatch(slideXml, /<p:pic>/);
  TRAINING_CONDITIONAL_MATERIALS.forEach((material) => assert.ok(
    slideXml.includes(`Pizarra - ${material.name}`),
    `expected editable shapes for ${material.name}`,
  ));
  [...slideXml.matchAll(/<a:xfrm(?:\s[^>]*)?>([\s\S]*?)<\/a:xfrm>/g)].forEach(([, transform]) => {
    const offset = transform.match(/<a:off x="(\d+)" y="(\d+)"\/>/);
    const extent = transform.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/);
    if (!offset || !extent) return;
    assert.ok(Number(offset[1]) + Number(extent[1]) <= 10692000);
    assert.ok(Number(offset[2]) + Number(extent[2]) <= 7560000);
  });
});

test('rejects content that cannot fit legibly instead of creating continuation slides', () => {
  const description = Array.from({ length: 180 }, (_, index) => `Instrucción ${index + 1} del ejercicio.`).join('\n');
  assert.throws(
    () => createTrainingTaskPowerPoint({ name: 'Tarea extensa', description }),
    /no cabe completa y legiblemente en una diapositiva A4 horizontal/,
  );
});

test('creates a safe PowerPoint filename', () => {
  assert.equal(trainingTaskPowerPointFileName({ name: 'Tarea: 3 vs. 2 / transición' }), 'Tarea_Tarea-_3_vs._2_-_transición.pptx');
});
