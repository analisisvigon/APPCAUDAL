import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const editor = await readFile(path.join(root, 'src/components/training/PlannedSessionsSection.jsx'), 'utf8');
const app = await readFile(path.join(root, 'src/App.jsx'), 'utf8');
const summary = await readFile(path.join(root, 'src/components/player/PlayerRealizedTrainingSummary.jsx'), 'utf8');

assert.match(editor, /Confirmar sesión realizada/);
assert.match(editor, /¿Confirmas que el entrenamiento se celebró y que revisaste la lista completa\?/);
assert.match(editor, /Disponible por defecto/);
assert.match(editor, /selected\.status !== 'open'/);
assert.match(editor, /editor\.session_date > localToday/);
assert.match(editor, /editor\.cancelled_at \|\| editor\.retired_at/);
assert.match(editor, /estructura de ciclo de vida/);
assert.match(editor, /savePlannedAvailability\(client, editor\.id, editor\.revision, changes\)/);
assert.match(editor, /planned-session-data-changed/);
assert.match(editor, /Reintentar lectura/);

assert.match(app, /PlayerSessionAvailabilitySummary/);
assert.match(app, /PlayerRealizedTrainingSummary/);
assert.match(app, /loadPlayerRealizedTrainingStats/);
assert.match(app, /rosterAccess\.context\?\.id/);
assert.match(summary, /Sin sesiones marcadas como realizadas/);
assert.match(summary, /estructura de ciclo de vida/);
assert.match(summary, /Trabajo adaptado/);
assert.match(summary, /Convocatorias|Primer equipo/);
assert.match(summary, /Participación/);

console.log('planned session realization UI audit passed');
