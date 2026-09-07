import assert from 'node:assert/strict';
import { resolveStatsWorkingMinutes } from './statsWorkingMinutes.js';

const starterWithoutMinutes = resolveStatsWorkingMinutes({ role: 'Titular', minutes: '' });
assert.deepEqual(
  starterWithoutMinutes,
  { value: 90, isUnconfirmedStarterValue: true },
  'A: STAFF propone 90 para un titular sin minutos registrados',
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

console.log('statsWorkingMinutes tests passed');
