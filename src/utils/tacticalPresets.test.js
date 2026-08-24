import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getTacticalPreset } from './tacticalPresets.js';

const formationSlots = (system) => {
  const lines = String(system).split('-').map(Number);
  const slots = [{ slot: 0, role: 'Portero', x: 50, y: 89 }];
  lines.forEach((size, lineIndex) => {
    const margin = size >= 5 ? 12 : size === 4 ? 17 : size === 3 ? 25 : size === 2 ? 39 : 50;
    Array.from({ length: size }, (_, index) => (
      size === 1 ? 50 : margin + ((100 - margin * 2) * index) / (size - 1)
    )).forEach((x) => slots.push({ slot: slots.length, role: `L${lineIndex}-${slots.length}`, x, y: 75 - lineIndex * 25 }));
  });
  return slots;
};

const build = (options = {}) => getTacticalPreset({
  phase: 'defensive',
  situation: 'mid_block',
  rivalSystem: '4-4-2',
  caudalSystem: '4-3-3',
  rivalFormationSlots: formationSlots('4-4-2'),
  caudalFormationSlots: formationSlots('4-3-3'),
  ...options,
});

const defensiveMid = build();
const defensiveLow = build({ situation: 'low_block' });
const offensive = build({ phase: 'offensive', situation: 'build_up', playStyle: 'combinative' });
const transition = build({ phase: 'transition', transitionType: 'defensive_transition', fieldZone: 'defensive_half' });
const setPiece = build({
  phase: 'set_piece',
  setPieceType: 'offensive_set_piece',
  setPieceAction: 'corner',
  ballStartPosition: { x: 7, y: 7 },
});

[defensiveMid, defensiveLow, offensive, transition, setPiece].forEach((preset) => {
  assert.equal(Object.keys(preset).length, 22, 'cada contexto genera automáticamente los 22 jugadores');
  Object.values(preset).forEach((position) => {
    assert.ok(position.x >= 0 && position.x <= 100);
    assert.ok(position.y >= 0 && position.y <= 100);
  });
});
assert.notDeepEqual(defensiveMid, defensiveLow, 'la situación defensiva cambia el preset');
assert.notDeepEqual(defensiveMid, offensive, 'la fase cambia el preset');
assert.notDeepEqual(offensive, transition, 'la transición tiene su propio preset');
assert.deepEqual(build({ phase: 'unknown' }), {}, 'una fase desconocida no inventa posiciones');

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
assert.match(appSource, /import \{ getTacticalPreset \} from '\.\/utils\/tacticalPresets'/);
assert.match(appSource, /previewPositions: previewPlayerPositions/, 'el rival también consume el preset sin jugada');
assert.match(appSource, /savedPositions: selectedTacticalPlay\?\.playerPositions[\s\S]*previewPositions: previewPlayerPositions/);
assert.match(appSource, /createTacticalPlayForEditing\(\)/, 'Mover puede materializar el preset como Jugada 1');
assert.match(appSource, /flushSync\(\(\) => \{[\s\S]*createTacticalPlayForEditing\(\)/, 'Guardar crea y persiste la primera jugada si aún no existe');
assert.match(appSource, /tacticalPreAiAnalysisByMatchRef\.current\.get\(snapshot\.matchId\)/, 'la persistencia permanece aislada por partido');
assert.match(appSource, /\}, \[selectedMatch\?\.id\]\);/, 'el cambio de partido reinicia e hidrata el contexto táctico');

console.log('tacticalPresets tests passed');
