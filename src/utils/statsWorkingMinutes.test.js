import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildCompletedStatsMinutesUpdates,
  getStatsMatchDurationMinutes,
  isStatsMatchCompleted,
  resolveStatsWorkingMinutes,
} from './statsWorkingMinutes.js';

const starterWithoutMinutes = resolveStatsWorkingMinutes({ role: 'Titular', minutes: '' });
assert.deepEqual(
  starterWithoutMinutes,
  { value: 90, isUnconfirmedStarterValue: true },
  'A: STAFF propone 90 para un titular sin minutos registrados',
);

assert.equal(getStatsMatchDurationMinutes({}), 90, 'la duración canónica de un partido normal es 90');
assert.equal(getStatsMatchDurationMinutes({ officialDuration: 120 }), 120, 'una duración oficial explícita prevalece');
assert.equal(getStatsMatchDurationMinutes({ statsPlayerData: { A: { minutes: '105' } } }), 105, 'la evidencia real superior amplía la duración');

const matchDayNoon = new Date(2026, 8, 9, 12, 0, 0);
assert.equal(isStatsMatchCompleted({ date: '2026-09-09', statsGoalEvents: [{ type: 'Gol a favor' }] }, matchDayNoon), false, 'un gol en directo no cierra el partido el mismo día');
assert.equal(isStatsMatchCompleted({ date: '2026-09-09', status: 'Finalizado' }, matchDayNoon), true, 'un estado final explícito sí confirma el cierre');
assert.equal(isStatsMatchCompleted({ date: '2026-09-08', homeScore: 1, awayScore: 0 }, matchDayNoon), true, 'un partido histórico con marcador consta como completado');
assert.equal(isStatsMatchCompleted({ date: '2026-09-10', status: 'Finalizado' }, matchDayNoon), false, 'una fecha futura nunca confirma minutos reales');

const completedUpdates = (lineup, statsPlayerData, matchCompleted = true, match = {}) => (
  buildCompletedStatsMinutesUpdates({ lineup, statsPlayerData, matchCompleted, match })
);

assert.deepEqual(
  completedUpdates(['Titular completo'], { 'Titular completo': { role: 'Titular', minutes: null, replacementName: '' } }),
  [{ playerName: 'Titular completo', minutes: 90, reason: 'starter_completed_match' }],
  'A: titular sin cambio y con partido terminado recibe la duración completa',
);
assert.deepEqual(
  completedUpdates(['Titular 77'], { 'Titular 77': { role: 'Titular', minutes: '77', replacementName: 'Suplente 77' }, 'Suplente 77': { role: 'Suplente', minutes: '13' } }),
  [],
  'B: titular que sale en 77 y su sustituto conservan 77/13',
);
assert.deepEqual(
  completedUpdates(['Titular 45'], { 'Titular 45': { role: 'Titular', minutes: '45', replacementName: 'Suplente 45' }, 'Suplente 45': { role: 'Suplente', minutes: '45' } }),
  [],
  'C/E: el cambio al descanso conserva 45 minutos para ambos',
);
assert.deepEqual(
  completedUpdates(['Titular 70'], { 'Titular 70': { role: 'Titular', minutes: '70', replacementName: 'Suplente 70' }, 'Suplente 70': { role: 'Suplente', minutes: null } }),
  [{ playerName: 'Suplente 70', minutes: 20, reason: 'substitute_completed_match' }],
  'D: suplente que entra en 70 y termina recibe 20 si faltaba su persistencia',
);
assert.deepEqual(
  completedUpdates(['Titular'], { Titular: { role: 'Titular', minutes: '90' }, 'No entra': { role: 'Suplente', minutes: null } }),
  [],
  'F: suplente que no entra no recibe 90',
);
assert.deepEqual(
  completedUpdates(['Titular'], { Titular: { role: 'Titular', minutes: '90' }, Fuera: { role: 'Fuera', minutes: null } }),
  [],
  'G: jugador fuera no recibe minutos',
);
assert.deepEqual(
  completedUpdates(['Titular planificado'], { 'Titular planificado': { role: 'Titular', minutes: null } }, false),
  [],
  'H: un XI planificado antes de terminar el partido no confirma participación',
);
assert.deepEqual(
  completedUpdates(['Titular confirmado'], { 'Titular confirmado': { role: 'Titular', minutes: '90' } }),
  [],
  'I: un full-match que ya tiene 90 permanece intacto',
);
assert.deepEqual(
  completedUpdates(['Borja Rodríguez'], { 'Borja Rodríguez': { role: 'Titular', minutes: null, replacement_name: null } }, true, { opponent: 'Salamanca CF UDS', date: '2026-09-09' }),
  [{ playerName: 'Borja Rodríguez', minutes: 90, reason: 'starter_completed_match' }],
  'J: Borja-Salamanca terminado se reconstruye como titular de 90 minutos',
);

assert.deepEqual(
  completedUpdates(['Titular ambiguo'], { 'Titular ambiguo': { role: 'Titular', minutes: null, replacementName: 'Entrante' } }),
  [],
  'fail-closed: una salida con minuto ausente no se inventa como full-match',
);

assert.deepEqual(
  resolveStatsWorkingMinutes({ role: 'Titular', minutes: '', matchDuration: 120 }),
  { value: 120, isUnconfirmedStarterValue: true },
  'la propuesta visual reutiliza la duración canónica recibida',
);

[null, undefined, '   '].forEach((minutes) => {
  assert.deepEqual(
    resolveStatsWorkingMinutes({ role: 'Titular', minutes }),
    { value: 90, isUnconfirmedStarterValue: true },
    'A: null, undefined y texto vacio reciben la misma propuesta',
  );
});

assert.deepEqual(
  resolveStatsWorkingMinutes({ role: 'Titular', minutes: '73' }),
  { value: '73', isUnconfirmedStarterValue: false },
  'B: un titular conserva sus minutos reales',
);
assert.deepEqual(
  resolveStatsWorkingMinutes({ role: 'Titular', minutes: '90' }),
  { value: '90', isUnconfirmedStarterValue: false },
  'B: un 90 ya confirmado se distingue del 90 de trabajo',
);

assert.deepEqual(
  resolveStatsWorkingMinutes({ role: 'Suplente', minutes: '' }),
  { value: '', isUnconfirmedStarterValue: false },
  'C: un suplente sin minutos no recibe 90',
);

assert.deepEqual(
  resolveStatsWorkingMinutes({ role: 'Suplente', minutes: '', substituteMinutes: 20 }),
  { value: 20, isUnconfirmedStarterValue: false },
  'los minutos calculados de una sustitucion siguen prevaleciendo',
);

assert.deepEqual(
  resolveStatsWorkingMinutes({ role: 'Suplente', minutes: '90' }),
  { value: '90', isUnconfirmedStarterValue: false },
  'G: Todos suplentes conserva un 90 real ya registrado',
);
assert.deepEqual(
  resolveStatsWorkingMinutes({ role: 'Suplente', minutes: starterWithoutMinutes.isUnconfirmedStarterValue ? '' : starterWithoutMinutes.value }),
  { value: '', isUnconfirmedStarterValue: false },
  'G: Todos suplentes elimina la propuesta no confirmada al dejar de ser titular',
);

const app = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
assert.match(app, /const persistCompletedMatchMinutes = async/);
assert.match(app, /matchCompleted:\s*forceCompleted,/);
assert.match(app, /\.update\(\{ minutes: String\(update\.minutes\) \}\)/);
assert.match(app, /await persistCompletedMatchMinutes\(completedMatch, \{/);
assert.match(app, /await persistCompletedMatchMinutes\(selectedMatch, \{ forceCompleted: true \}\)/);
assert.match(app, /onFocus=\{\(\) => isStatsMatchCompleted\(selectedMatch\) && minutesInput\.isUnconfirmedStarterValue/);

console.log('statsWorkingMinutes tests passed');
