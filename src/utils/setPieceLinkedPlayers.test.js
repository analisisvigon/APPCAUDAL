import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildSetPieceLinkedPlayerOptions,
  formatSetPieceLinkedPlayerLabel,
} from './setPieceLinkedPlayers.js';

const uuid = (index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const createPlayer = (index, number = index, fields = {}) => ({
  id: uuid(index),
  name: `Jugador ${index}`,
  shortName: `J${index}`,
  number,
  ...fields,
});
const buildMatch = (starters, substitutes = []) => ({
  statsLineup: starters.map((player) => player.name),
  statsCalledPlayers: [...starters, ...substitutes].map((player) => player.name),
  statsCalledPlayerIds: Object.fromEntries([...starters, ...substitutes].map((player) => [player.name, player.id])),
  statsPlayerData: Object.fromEntries([
    ...starters.map((player) => [player.name, { role: 'Titular', jugadorId: player.id }]),
    ...substitutes.map((player) => [player.name, { role: 'Suplente', jugadorId: player.id }]),
  ]),
});

const starters = [1, 2, 4, 5, 6, 8, 9, 10, 11, 14, 21].map((number, index) => createPlayer(index + 1, number));
const substitutes = [22, 23, 24, 25, 26].map((number, index) => createPlayer(index + 12, number));
const fullSquad = [...starters, ...substitutes, ...[27, 28, 29, 30, 31].map((number, index) => createPlayer(index + 17, number))];

let result = buildSetPieceLinkedPlayerOptions({ match: buildMatch(starters), players: fullSquad });
assert.equal(result.starterOptions.length, 11, 'A: un partido con once titulares ofrece exactamente once opciones');
assert.deepEqual(result.starterOptions.map((option) => option.id), starters.map((player) => player.id), 'A: aparecen exactamente los titulares del partido');

result = buildSetPieceLinkedPlayerOptions({ match: buildMatch(starters, substitutes), players: fullSquad });
assert.equal(result.starterOptions.some((option) => substitutes.some((player) => player.id === option.id)), false, 'B: los suplentes no aparecen');
assert.equal(result.starterOptions.length, 11, 'C: una plantilla de 21 jugadores sigue mostrando solo once');

const shuffledNumbers = [21, 1, 14, 10, 2, 11, 9, 5].map((number, index) => createPlayer(index + 30, String(number)));
result = buildSetPieceLinkedPlayerOptions({ match: buildMatch(shuffledNumbers), players: shuffledNumbers });
assert.deepEqual(result.starterOptions.map((option) => option.numericNumber), [1, 2, 5, 9, 10, 11, 14, 21], 'D: los dorsales string se ordenan numéricamente');

const withoutNumber = createPlayer(50, '', { shortName: 'SIN DORSAL' });
const withNumber = createPlayer(51, 9, { shortName: 'NUEVE' });
result = buildSetPieceLinkedPlayerOptions({ match: buildMatch([withoutNumber, withNumber]), players: [withoutNumber, withNumber] });
assert.deepEqual(result.starterOptions.map((option) => option.id), [withNumber.id, withoutNumber.id], 'E: el titular sin dorsal aparece al final');
assert.equal(result.starterOptions[1].label, 'Sin dorsal · SIN DORSAL', 'E: no se inventa un dorsal');

const formerStarter = substitutes[0];
result = buildSetPieceLinkedPlayerOptions({
  match: buildMatch(starters, substitutes),
  players: fullSquad,
  currentPlayerId: formerStarter.id,
});
assert.equal(result.exceptionalOption?.id, formerStarter.id, 'F: se conserva la vinculación histórica de un suplente');
assert.equal(result.exceptionalOption?.label.endsWith('— No titular'), true, 'F: la excepción se identifica como no titular');
assert.equal(result.starterOptions.some((option) => option.id === formerStarter.id), false, 'F: la excepción no se convierte en opción titular normal');
const afterSelectingStarter = buildSetPieceLinkedPlayerOptions({
  match: buildMatch(starters, substitutes),
  players: fullSquad,
  currentPlayerId: starters[0].id,
});
assert.equal(afterSelectingStarter.exceptionalOption, null, 'F: al seleccionar un titular desaparece la opción histórica excepcional');

const replacementStarters = [...starters.slice(1), formerStarter];
const refreshed = buildSetPieceLinkedPlayerOptions({ match: buildMatch(replacementStarters), players: fullSquad });
assert.equal(refreshed.starterOptions.some((option) => option.id === starters[0].id), false, 'G: al cambiar el XI desaparece el antiguo titular');
assert.equal(refreshed.starterOptions.some((option) => option.id === formerStarter.id), true, 'G: al reabrir se resuelve el XI actual del partido');

result = buildSetPieceLinkedPlayerOptions({
  match: { ...buildMatch([], fullSquad), preCaudalLineup: starters.map((player) => player.name) },
  players: fullSquad,
});
assert.equal(result.hasDefinedStarters, false, 'H: se detecta que no hay XI definido');
assert.deepEqual(result.starterOptions, [], 'H: no existe fallback silencioso a toda la plantilla ni al XI previo');

const historicalWithoutLineup = buildSetPieceLinkedPlayerOptions({
  match: buildMatch([], fullSquad),
  players: fullSquad,
  currentPlayerId: formerStarter.id,
});
assert.equal(historicalWithoutLineup.exceptionalOption?.id, formerStarter.id, 'H: sin XI tampoco se borra una vinculación histórica');

assert.equal(formatSetPieceLinkedPlayerLabel({ number: 5, shortName: 'J. RODRÍGUEZ' }), '#5 · J. RODRÍGUEZ');

const editorSource = fs.readFileSync(new URL('../components/print/SetPieceDiagramEditor.jsx', import.meta.url), 'utf8');
assert.ok(editorSource.includes('No hay titulares definidos'), 'H: el selector comunica explícitamente que falta el XI');
assert.ok(editorSource.includes('disabled={!linkedPlayerOptions.hasDefinedStarters}'), 'H: sin titulares la selección queda deshabilitada');
assert.ok(editorSource.includes('linkedPlayerOptions.exceptionalOption'), 'F: el editor renderiza la opción histórica excepcional');
assert.equal(editorSource.includes('{players.map((player) => <option'), false, 'B/C: el selector ya no renderiza toda la plantilla');

console.log('setPieceLinkedPlayers tests passed');
