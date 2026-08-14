import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildLineupPrintBenchRows } from './lineupPrintBench.js';

const goalkeeperWithNumber = {
  id: 'goalkeeper-26',
  name: 'Samuel Portero',
  shirt_name: 'SAMU',
  number: 26,
  position: 'Portero',
};
const goalkeeperWithoutNumber = {
  id: 'goalkeeper-no-number',
  name: 'Nel Portero',
  specificPosition: 'GK',
};
const secondGoalkeeper = {
  id: 'goalkeeper-13',
  name: 'Portero B',
  dorsal: 13,
  primaryNaturalPosition: 'goalkeeper',
};
const fieldPlayerWithTypicalGoalkeeperNumber = {
  id: 'field-player-1',
  name: 'Defensa con dorsal uno',
  number: 1,
  position: 'Defensa',
};

const rows = buildLineupPrintBenchRows([
  goalkeeperWithNumber,
  goalkeeperWithoutNumber,
  secondGoalkeeper,
  fieldPlayerWithTypicalGoalkeeperNumber,
]);
assert.equal(rows.find((row) => row.player.id === goalkeeperWithNumber.id)?.isGoalkeeper, true, 'A: el portero suplente con dorsal recibe la semántica POR.');
assert.deepEqual(
  {
    goalkeeper: rows.find((row) => row.player.id === goalkeeperWithoutNumber.id)?.isGoalkeeper,
    number: rows.find((row) => row.player.id === goalkeeperWithoutNumber.id)?.number,
  },
  { goalkeeper: true, number: '-' },
  'B: un portero sin dorsal conserva el guion y sigue identificado.',
);
assert.equal(rows.filter((row) => row.isGoalkeeper).length, 3, 'C: todos los porteros suplentes reciben el indicador, sin limitarse al primero.');
assert.equal(rows.find((row) => row.player.id === fieldPlayerWithTypicalGoalkeeperNumber.id)?.isGoalkeeper, false, 'E: el dorsal no se usa para inferir la posición.');

const longName = 'NOMBRE MUY LARGO DE PORTERO SUPLENTE';
assert.equal(
  buildLineupPrintBenchRows([{ name: longName, position: 'Goalkeeper' }])[0].name,
  longName,
  'G: el modelo conserva completo un nombre largo.',
);
['PORTERO', 'portero', 'Goalkeeper', 'GK', 'POR'].forEach((position) => {
  assert.equal(
    buildLineupPrintBenchRows([{ name: position, position }])[0].isGoalkeeper,
    true,
    `${position} debe reutilizar la normalización canónica de posiciones.`,
  );
});

const lineupSource = fs.readFileSync(new URL('../components/print/LineupPrintSheet.jsx', import.meta.url), 'utf8');
const pitchSource = fs.readFileSync(new URL('../components/print/FootballPitchPrint.jsx', import.meta.url), 'utf8');
const matchPrintSource = fs.readFileSync(new URL('../components/print/MatchPrintTab.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../styles/print.css', import.meta.url), 'utf8');
const benchCss = css.slice(css.indexOf('.print-bench {'), css.indexOf('.print-empty {'));

assert.match(lineupSource, /buildLineupPrintBenchRows\(bench\)/, 'La insignia se deriva exclusivamente del array de banquillo.');
assert.match(lineupSource, /row\.isGoalkeeper \? <span className="print-bench-goalkeeper-badge"[^>]*>POR<\/span> : null/, 'A: cada fila de portero suplente renderiza POR.');
assert.equal(pitchSource.includes('print-bench-goalkeeper-badge'), false, 'D: el portero titular del campo no recibe la insignia del banquillo.');
assert.match(benchCss, /grid-template-columns: 5mm 6\.5mm minmax\(0, 1fr\)/, 'La columna fija del indicador mantiene alineados dorsal y nombre.');
assert.match(benchCss, /\.print-bench-goalkeeper-badge \{[\s\S]*border: 0\.7pt solid #000;[\s\S]*background: #fff;[\s\S]*color: #000;/, 'F: POR mantiene contraste por borde y texto en blanco y negro.');
assert.match(benchCss, /\.print-bench-row \{[\s\S]*min-height: 9\.2mm;/, 'La mejora no aumenta la altura mínima existente de las filas.');
assert.match(benchCss, /\.print-bench-name \{[\s\S]*min-width: 0;[\s\S]*white-space: normal;/, 'G: los nombres largos pueden envolver sin solaparse con POR.');
assert.equal((matchPrintSource.match(/<LineupPrintSheet/g) || []).length, 2, 'H: preview y dossier reutilizan exactamente la misma hoja de alineación.');
assert.match(matchPrintSource, /calledPlayerIdsByName[\s\S]*playersById\.get\(String\(storedPlayerId\)\)/, 'La posición del suplente se recupera por UUID antes del fallback por nombre.');
assert.match(lineupSource, /row\.player\?\.id === captainPlayerId \|\| row\.player\?\.isCaptain/, 'La lógica de capitán permanece independiente.');

console.log('lineupPrintBench tests passed');
