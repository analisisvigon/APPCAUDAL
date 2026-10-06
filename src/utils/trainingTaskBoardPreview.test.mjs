import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readTrainingTaskEditorPayload } from './trainingTaskEditorPayload.js';

const preview = await readFile(new URL('../components/training/TrainingTaskBoardPreview.jsx', import.meta.url), 'utf8');
const canvas = await readFile(new URL('../components/training/TrainingTaskDiagramCanvas.jsx', import.meta.url), 'utf8');
const section = await readFile(new URL('../components/training/TrainingTasksSection.jsx', import.meta.url), 'utf8');

assert.match(preview, /readTrainingTaskEditorPayload/);
assert.match(preview, /parsed\.kind === 'empty'/);
assert.match(preview, /parsed\.kind !== 'v1'/);
assert.match(preview, /Sin diseño de pizarra/);
assert.match(preview, /Diseño no disponible/);
assert.match(preview, /renderMode="preview"/);
assert.doesNotMatch(preview, /TrainingTaskBoardEditor|useState|useEffect|addEventListener|supabase|storage/i);
assert.match(canvas, /preview \? \{\} : \{ onPointerMove:/, 'preview no conecta listeners pointer del editor');
assert.match(canvas, /pointer-events-none/);
assert.match(section, /TrainingTaskBoardPreview/);
assert.doesNotMatch(section, /task\.previewUrl|task\.previewPath &&|createSignedUrl\(task\.previewPath/, 'la biblioteca no usa previews de Storage');

for (const pitchType of ['full', 'half', 'blank']) {
  assert.equal(readTrainingTaskEditorPayload({ schemaVersion: 1, board: { pitchType, elements: [] } }).kind, 'v1');
}
assert.equal(readTrainingTaskEditorPayload({}).kind, 'empty');
assert.equal(readTrainingTaskEditorPayload({ schemaVersion: 2 }).kind, 'unsupported');
assert.equal(readTrainingTaskEditorPayload({ schemaVersion: 1, board: {} }).kind, 'invalid');
const synthetic = Array.from({ length: 50 }, (_, index) => ({ schemaVersion: 1, board: { pitchType: index % 3 === 0 ? 'half' : index % 3 === 1 ? 'full' : 'blank', elements: [{ id: `p-${index}`, type: 'participant', x: 20, y: 30, label: String(index) }] } }));
assert.equal(synthetic.filter((payload) => readTrainingTaskEditorPayload(payload).kind === 'v1').length, 50);
console.log('training task board preview tests passed');
