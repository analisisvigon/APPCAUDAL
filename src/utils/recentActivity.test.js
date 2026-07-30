import assert from 'node:assert/strict';

import { buildRecentActivity, formatRecentActivityTime } from './recentActivity.js';

const players = [
  {
    id: 'player-1',
    name: 'Alejandro González',
    shirt_name: 'Alex Glez',
    created_at: '2026-07-30T08:00:00.000Z',
    updated_at: '2026-07-30T08:00:00.000Z',
  },
  {
    id: 'player-2',
    name: 'Davo Fernández',
    created_at: '2026-07-29T08:00:00.000Z',
    updated_at: '2026-07-30T10:00:00.000Z',
  },
];

const activity = buildRecentActivity({
  matches: [
    {
      id: 'match-1',
      opponent: 'Praviano',
      is_home: true,
      date: '2026-08-02',
      created_at: '2026-07-30T09:00:00.000Z',
      updated_at: '2026-07-30T09:00:01.000Z',
    },
  ],
  teams: [
    {
      id: 'team-1',
      name: 'Praviano',
      created_at: '2026-07-28T08:00:00.000Z',
      updated_at: '2026-07-30T11:00:00.000Z',
    },
  ],
  players,
  trainingSessions: [
    {
      id: 'session-1',
      title: 'Activación',
      session_date: '2026-07-30',
      created_at: '2026-07-30T12:00:00.000Z',
    },
  ],
  wellnessEntries: [
    {
      id: 'wellness-1',
      jugador_id: 'player-1',
      entry_date: '2026-07-30',
      created_at: '2026-07-30T13:00:00.000Z',
    },
  ],
  rpeEntries: [
    {
      id: 'rpe-1',
      jugador_id: 'player-2',
      entry_date: '2026-07-30',
      created_at: '2026-07-30T14:00:00.000Z',
    },
  ],
});

assert.equal(activity.length, 5, 'la lista respeta el límite de cinco');
assert.deepEqual(
  activity.map((item) => item.type),
  [
    'Registro de RPE recibido',
    'Registro de Wellness recibido',
    'Sesión de entrenamiento creada',
    'Rival actualizado',
    'Jugador actualizado',
  ],
  'ordena de más reciente a más antigua y clasifica acciones reales'
);
assert.equal(activity[0].entity, 'Davo Fernández', 'asocia la respuesta con el jugador real');
assert.equal(activity[1].entity, 'Alex Glez', 'prioriza el nombre visible del jugador');

const completeActivity = buildRecentActivity({
  matches: [{
    id: 'match-created',
    opponent: 'Praviano',
    is_home: true,
    created_at: '2026-07-30T09:00:00.000Z',
  }],
  players,
}, { limit: 10 });
assert.ok(completeActivity.some((item) => item.type === 'Partido creado'), 'incluye partidos creados con timestamp real');
assert.ok(completeActivity.some((item) => item.type === 'Jugador añadido'), 'incluye jugadores añadidos con timestamp real');

const conservativeCreation = buildRecentActivity({
  matches: [{
    id: 'match-2',
    opponent: 'Langreo',
    created_at: '2026-07-30T09:00:00.000Z',
    updated_at: '2026-07-30T09:00:04.000Z',
  }],
});
assert.equal(conservativeCreation[0].type, 'Partido creado', 'no infiere actualización cuando los timestamps son ambiguos');

const missingTimestamps = buildRecentActivity({
  matches: [{ id: 'without-date', opponent: 'Dato estático' }],
  players: [{ id: 'without-date', name: 'Ejemplo', updated_at: '2026-07-30T10:00:00.000Z' }],
});
assert.deepEqual(missingTimestamps, [], 'no convierte filas sin timestamp en actividad');

const duplicated = buildRecentActivity({
  wellnessEntries: [
    { id: 'same', jugador_id: 'player-1', created_at: '2026-07-30T13:00:00.000Z' },
    { id: 'same', jugador_id: 'player-1', created_at: '2026-07-30T13:00:00.000Z' },
  ],
  players,
});
assert.equal(duplicated.filter((item) => item.source === 'wellness_entries').length, 1, 'elimina duplicados exactos');

assert.equal(formatRecentActivityTime('2026-07-30T13:50:00.000Z', '2026-07-30T14:00:00.000Z'), 'Hace 10 min');
assert.equal(formatRecentActivityTime('2026-07-30T12:00:00.000Z', '2026-07-30T14:00:00.000Z'), 'Hace 2 h');
assert.equal(formatRecentActivityTime('2026-07-29T14:00:00.000Z', '2026-07-30T14:00:00.000Z'), 'Hace 1 día');

console.log('recentActivity tests passed');
