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
assert.match(editor, /Disponibles? por defecto/);
assert.match(editor, /selected\.status !== 'open'/);
assert.match(editor, /editor\.session_date > localToday/);
assert.match(editor, /editor\.cancelled_at \|\| editor\.retired_at/);
assert.match(editor, /estructura de ciclo de vida/);
assert.match(editor, /savePlannedAvailability\(client, editor\.id, editor\.revision, changes\)/);
assert.match(editor, /planned-session-data-changed/);
assert.match(editor, /Reintentar lectura/);
assert.match(editor, /confirmAndLoadPlannedSessionRealization/);
assert.match(editor, /summarizeSessionRealizedPlayers\(currentRealization\.players\)/);
assert.doesNotMatch(editor, /summarizePlayerRealizedTraining\(currentRealization\.players/);
assert.match(app, /PlannedSessionsErrorBoundary/);
assert.match(app, /Volver a cargar Sesiones/);

assert.match(app, /PlayerSessionAvailabilitySummary/);
assert.match(app, /PlayerRealizedTrainingSummary/);
assert.match(app, /loadPlayerRealizedTrainingStats/);
assert.match(app, /rosterAccess\.context\?\.id/);
assert.match(app, /resolvePlannedSessionPlayerId\(selectedPlayerProfile\)/);
assert.match(app, /loadPlayerRealizedTrainingStats\([\s\S]*selectedPlannedSessionPlayerId/);
assert.doesNotMatch(app, /loadPlayerRealizedTrainingStats\([\s\S]{0,120}selectedPlayerProfile\.id/);
assert.match(app, /no tiene una identidad global válida para consultar sus entrenamientos realizados/);
assert.match(summary, /Sin sesiones marcadas como realizadas/);
assert.match(summary, /estructura de ciclo de vida/);
assert.match(summary, /Trabajo adaptado/);
assert.match(summary, /Convocatorias|Primer equipo/);
assert.match(summary, /Participación/);
assert.match(summary, /summary\.completed/);

console.log('planned session realization UI audit passed');
