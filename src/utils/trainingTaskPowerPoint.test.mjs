import assert from 'node:assert/strict';
import test from 'node:test';
import JSZip from 'jszip';
import {
  createTrainingTaskPowerPoint,
  trainingTaskPowerPointFileName,
} from './trainingTaskPowerPoint.js';

const task = {
  id: 'task-123',
  taskCode: 'NEXO-15',
  name: 'Conservación y cambio de orientación',
  objective: 'Mejorar la conservación bajo presión.',
  description: '1. Mantener apoyos cercanos.\n2. Cambiar el juego al espacio libre.',
  taskType: 'possession',
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

test('creates an offline wide PPTX with editable task text and board shapes', async () => {
  const presentation = createTrainingTaskPowerPoint(task);
  assert.equal(presentation.layout, 'LAYOUT_WIDE');

  const buffer = await presentation.write({ outputType: 'nodebuffer' });
  const archive = await JSZip.loadAsync(buffer);
  const slideXml = await archive.file('ppt/slides/slide1.xml').async('string');
  const presentationXml = await archive.file('ppt/presentation.xml').async('string');
  const shapeCount = (slideXml.match(/<p:sp>/g) || []).length;

  assert.match(presentationXml, /cx="12192000" cy="6858000"/);
  assert.match(slideXml, /Conservación y cambio de orientación/);
  assert.match(slideXml, /Mejorar la conservación bajo presión/);
  assert.match(slideXml, /Mantener apoyos cercanos/);
  assert.match(slideXml, /Zona de presión/);
  assert.ok(shapeCount > 40, `expected editable slide shapes, got ${shapeCount}`);
  assert.doesNotMatch(slideXml, /<p:pic>/);
});

test('keeps task text exportable when the board schema is unsupported', async () => {
  const presentation = createTrainingTaskPowerPoint({
    name: 'Tarea sin pizarra compatible',
    objective: 'Objetivo editable',
    editorPayload: { schemaVersion: 2 },
  });
  const archive = await JSZip.loadAsync(await presentation.write({ outputType: 'nodebuffer' }));
  const slideXml = await archive.file('ppt/slides/slide1.xml').async('string');

  assert.match(slideXml, /Tarea sin pizarra compatible/);
  assert.match(slideXml, /formato no es compatible/);
});

test('continues long descriptions on editable slides without omitting the end', async () => {
  const description = Array.from({ length: 180 }, (_, index) => `Instrucción ${index + 1} del ejercicio.`).join('\n');
  const presentation = createTrainingTaskPowerPoint({ name: 'Tarea extensa', description });
  const archive = await JSZip.loadAsync(await presentation.write({ outputType: 'nodebuffer' }));
  const slideFiles = Object.keys(archive.files).filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path));
  const slideXml = await Promise.all(slideFiles.map((path) => archive.file(path).async('string')));

  assert.ok(slideFiles.length > 2, 'expected continuation slides for long content');
  assert.ok(slideXml.some((xml) => xml.includes('Instrucción 180 del ejercicio.')));
  slideXml.forEach((xml) => {
    const visibleInstructions = (xml.match(/Instrucción \d+ del ejercicio\./g) || []).length;
    assert.ok(visibleInstructions <= 22, `expected readable continuation pages, got ${visibleInstructions} lines`);
  });
});

test('creates a safe PowerPoint filename', () => {
  assert.equal(trainingTaskPowerPointFileName({ name: 'Tarea: 3 vs. 2 / transición' }), 'Tarea_Tarea-_3_vs._2_-_transición.pptx');
});
