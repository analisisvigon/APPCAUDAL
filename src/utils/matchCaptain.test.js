import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getStatsStarterPlayerIds, resolveMatchCaptain } from './matchCaptain.js';

const ids = {
  a: '00000000-0000-4000-8000-000000000001',
  b: '00000000-0000-4000-8000-000000000002',
  c: '00000000-0000-4000-8000-000000000003',
  d: '00000000-0000-4000-8000-000000000004',
};
const players = [
  { id: ids.a, name: 'Jugador Uno' },
  { id: ids.b, name: 'Jugador Dos' },
  { id: ids.c, name: 'Nombre Repetido' },
  { id: ids.d, name: 'Nombre Repetido' },
];
const priorities = [
  { jugadorId: ids.a, captainPriority: 1 },
  { jugadorId: ids.b, captainPriority: 2 },
  { jugadorId: ids.c, captainPriority: 3 },
];
const scheduledMatch = {
  date: '2099-08-20',
  statsLineup: ['Jugador Dos', 'Nombre Repetido'],
  lineupSlots: { stats: [
    { slot: 0, jugadorId: ids.b, playerName: 'Jugador Dos' },
    { slot: 1, jugadorId: ids.c, playerName: 'Nombre Repetido' },
  ] },
};

assert.deepEqual(getStatsStarterPlayerIds(scheduledMatch, players), [ids.b, ids.c], 'el XI real se extrae por UUID y respeta el orden de slots');
assert.equal(resolveMatchCaptain({ match: scheduledMatch, players, captainPriorities: priorities, status: 'scheduled' }).playerId, ids.b, 'elige el primer capitán prioritario que sí es titular');
assert.equal(resolveMatchCaptain({ match: { ...scheduledMatch, captainPlayerId: ids.c }, players, captainPriorities: priorities, status: 'scheduled' }).source, 'manual', 'un override titular prevalece sobre el orden');

const invalidOverride = resolveMatchCaptain({ match: { ...scheduledMatch, captainPlayerId: ids.a }, players, captainPriorities: priorities, status: 'scheduled' });
assert.equal(invalidOverride.playerId, ids.b, 'un override que sale del XI vuelve al automático');
assert.equal(invalidOverride.source, 'automatic_invalid_override');
assert.match(invalidOverride.warning, /no pertenece al XI inicial/i);

const historical = resolveMatchCaptain({ match: { ...scheduledMatch, captainPlayerId: ids.c }, players, captainPriorities: [{ jugadorId: ids.b, captainPriority: 1 }], status: 'played' });
assert.equal(historical.playerId, ids.c, 'el snapshot histórico no cambia aunque cambie el orden actual');
assert.equal(historical.source, 'historical');

const reordered = resolveMatchCaptain({ match: scheduledMatch, players, captainPriorities: [
  { jugadorId: ids.c, captainPriority: 1 },
  { jugadorId: ids.b, captainPriority: 2 },
], status: 'scheduled' });
assert.equal(reordered.playerId, ids.c, 'un partido no cerrado sí refleja el nuevo orden automático');

assert.deepEqual(getStatsStarterPlayerIds({ statsLineup: ['Nombre Repetido'] }, players), [], 'un nombre legacy ambiguo nunca inventa un UUID');
assert.deepEqual(getStatsStarterPlayerIds({ statsLineup: ['Jugador Uno'], statsCalledPlayerIds: { 'Jugador Uno': ids.a } }, players), [ids.a], 'el mapa UUID persistido permite recuperar slots legacy');
assert.equal(resolveMatchCaptain({ match: scheduledMatch, players, captainPriorities: [], status: 'scheduled' }).playerId, '', 'sin candidatos no se asigna un capitán incorrecto');

const printComponent = fs.readFileSync(new URL('../components/print/MatchPrintTab.jsx', import.meta.url), 'utf8');
const shirtComponent = fs.readFileSync(new URL('../components/print/PlayerShirt.jsx', import.meta.url), 'utf8');
const printCss = fs.readFileSync(new URL('../styles/print.css', import.meta.url), 'utf8');
assert.match(printComponent, /resolveMatchCaptain\(\{ match, players, captainPriorities \}\)/, 'impresión actual y dossier comparten la resolución central');
assert.match(printComponent, /captainPlayerId=\{printData\.captainPlayerId\}/, 'las dos hojas reciben el capitán imprimible');
assert.match(shirtComponent, /print-captain-badge[^]*>C</, 'la camiseta imprime una C explícita');
assert.match(printCss, /\.print-captain-badge\s*\{[^}]*border[^}]*background:\s*#fff[^}]*color:\s*#000/is, 'la insignia mantiene contraste blanco y negro');

console.log('matchCaptain tests passed');
