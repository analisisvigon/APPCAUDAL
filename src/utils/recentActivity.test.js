import assert from 'node:assert/strict';

import {
  buildRecentActivity,
  formatRecentActivityTime,
  groupRecentActivity,
} from './recentActivity.js';

const timestamp = (hour, minute = 0) => (
  `2026-07-30T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`
);

const referencePlayers = [
  { id: 'player-1', name: 'Alejandro González', shirt_name: 'Alex Glez' },
  { id: 'player-2', name: 'David Fernández', shirt_name: 'Davo' },
];

const fiveWellness = buildRecentActivity({
  players: referencePlayers,
  wellnessEntries: Array.from({ length: 5 }, (_, index) => ({
    id: `wellness-${index + 1}`,
    jugador_id: index % 2 ? 'player-2' : 'player-1',
    entry_date: '2026-07-30',
    created_at: timestamp(8, index),
  })),
});
assert.equal(fiveWellness.length, 1, 'cinco respuestas Wellness producen una sola tarjeta');
assert.equal(fiveWellness[0].moduleKey, 'performance');
assert.equal(fiveWellness[0].moduleName, 'Rendimiento');
assert.equal(fiveWellness[0].summary, '5 respuestas Wellness');
assert.equal(fiveWellness[0].eventCount, 5);
assert.ok(
  fiveWellness[0].events.every((event) => event.moduleKey === 'performance'),
  'cada evento conserva el moduleKey canónico'
);

const combinedPerformance = buildRecentActivity({
  players: referencePlayers,
  wellnessEntries: [{
    id: 'wellness-combined',
    jugador_id: 'player-1',
    created_at: timestamp(9),
  }],
  rpeEntries: [
    { id: 'rpe-combined-1', jugador_id: 'player-1', created_at: timestamp(10) },
    { id: 'rpe-combined-2', jugador_id: 'player-2', created_at: timestamp(11) },
  ],
  trainingSessions: [{
    id: 'session-combined',
    title: 'Activación',
    created_at: timestamp(12),
  }],
});
assert.equal(combinedPerformance.length, 1);
assert.equal(
  combinedPerformance[0].summary,
  '1 respuesta Wellness · 2 respuestas RPE · 1 sesión creada',
  'Wellness, RPE y sesiones mantienen el orden estable del módulo'
);
assert.equal(
  combinedPerformance[0].timestamp,
  timestamp(12),
  'la tarjeta utiliza la fecha más reciente del grupo'
);

const allCanonicalModules = buildRecentActivity({
  matches: [{
    id: 'match-1',
    opponent: 'Praviano',
    is_home: true,
    created_at: timestamp(13),
  }],
  players: [{
    id: 'player-created',
    name: 'Nuevo jugador',
    created_at: timestamp(12),
  }],
  teams: [{
    id: 'team-1',
    name: 'Praviano',
    created_at: timestamp(11),
    updated_at: timestamp(14),
  }],
  wellnessEntries: [{
    id: 'wellness-module',
    jugador_id: 'player-created',
    created_at: timestamp(15),
  }],
});
assert.deepEqual(
  allCanonicalModules.map((group) => group.moduleKey),
  ['performance', 'teams', 'matches', 'squad'],
  'los grupos se ordenan por su actividad más reciente'
);
assert.equal(allCanonicalModules.find((group) => group.moduleKey === 'matches')?.summary, '1 partido creado');
assert.equal(allCanonicalModules.find((group) => group.moduleKey === 'squad')?.summary, '1 jugador añadido');
assert.equal(allCanonicalModules.find((group) => group.moduleKey === 'teams')?.summary, '1 rival actualizado');

const eventIds = allCanonicalModules.flatMap((group) => group.events.map((event) => event.id));
assert.equal(new Set(eventIds).size, eventIds.length, 'ningún evento aparece en dos módulos');
allCanonicalModules.forEach((group) => {
  assert.ok(
    group.events.every((event) => event.moduleKey === group.moduleKey),
    `todos los eventos pertenecen únicamente a ${group.moduleKey}`
  );
});

const pluralSummaries = buildRecentActivity({
  matches: [
    { id: 'match-created-1', opponent: 'A', created_at: timestamp(7) },
    { id: 'match-created-2', opponent: 'B', created_at: timestamp(8) },
    { id: 'match-updated-1', opponent: 'C', created_at: timestamp(6), updated_at: timestamp(9) },
    { id: 'match-updated-2', opponent: 'D', created_at: timestamp(6), updated_at: timestamp(10) },
  ],
  players: [
    { id: 'player-added-1', name: 'A', created_at: timestamp(5) },
    { id: 'player-added-2', name: 'B', created_at: timestamp(6) },
  ],
  teams: [
    { id: 'team-updated-1', name: 'A', created_at: timestamp(4), updated_at: timestamp(7) },
    { id: 'team-updated-2', name: 'B', created_at: timestamp(4), updated_at: timestamp(8) },
    { id: 'team-updated-3', name: 'C', created_at: timestamp(4), updated_at: timestamp(9) },
  ],
});
assert.equal(
  pluralSummaries.find((group) => group.moduleKey === 'matches')?.summary,
  '2 partidos creados · 2 partidos actualizados'
);
assert.equal(
  pluralSummaries.find((group) => group.moduleKey === 'squad')?.summary,
  '2 jugadores añadidos'
);
assert.equal(
  pluralSummaries.find((group) => group.moduleKey === 'teams')?.summary,
  '3 rivales actualizados'
);
assert.ok(
  !pluralSummaries.some((group) => group.summary.includes('0 ')),
  'los tipos con contador cero no aparecen'
);

const duplicated = buildRecentActivity({
  players: referencePlayers,
  wellnessEntries: [
    { id: 'same', jugador_id: 'player-1', created_at: timestamp(13) },
    { id: 'same', jugador_id: 'player-1', created_at: timestamp(13) },
  ],
});
assert.equal(duplicated.length, 1);
assert.equal(duplicated[0].eventCount, 1, 'la deduplicación exacta se conserva antes de agrupar');
assert.equal(duplicated[0].summary, '1 respuesta Wellness');

const limited = buildRecentActivity({
  matches: [{ id: 'limit-match', opponent: 'A', created_at: timestamp(10) }],
  players: [{ id: 'limit-player', name: 'A', created_at: timestamp(11) }],
  teams: [{ id: 'limit-team', name: 'A', created_at: timestamp(12) }],
  wellnessEntries: [{ id: 'limit-wellness', created_at: timestamp(13) }],
}, { limit: 2 });
assert.equal(limited.length, 2, 'el límite se aplica después de formar los grupos');
assert.ok(allCanonicalModules.length <= 6, 'el límite global por defecto nunca supera seis tarjetas');

assert.deepEqual(buildRecentActivity(), [], 'sin eventos reales se devuelve el estado vacío');
assert.deepEqual(
  groupRecentActivity([{
    id: 'unreliable-source',
    source: 'biblioteca',
    moduleKey: 'library',
    type: 'Documento modificado',
    timestamp: timestamp(15),
  }]),
  [],
  'no se crean tarjetas para módulos sin una fuente fiable'
);

const expectedNavigation = {
  performance: 'Rendimiento',
  matches: 'Partidos',
  squad: 'Plantilla',
  teams: 'Equipos',
};
allCanonicalModules.forEach((group) => {
  assert.equal(group.tab, expectedNavigation[group.moduleKey], `destino correcto para ${group.moduleName}`);
  assert.ok(group.id.startsWith('recent-activity:'), 'la tarjeta utiliza una clave estable');
});

assert.equal(
  combinedPerformance[0].summary,
  combinedPerformance[0].events.length
    ? '1 respuesta Wellness · 2 respuestas RPE · 1 sesión creada'
    : '',
  'el resumen completo permanece disponible aunque la vista lo trunque'
);

const conservativeCreation = buildRecentActivity({
  matches: [{
    id: 'match-conservative',
    opponent: 'Langreo',
    created_at: timestamp(9),
    updated_at: timestamp(9, 0),
  }],
});
assert.equal(
  conservativeCreation[0].summary,
  '1 partido creado',
  'no se infiere una actualización cuando los timestamps son ambiguos'
);

const missingTimestamps = buildRecentActivity({
  matches: [{ id: 'without-date', opponent: 'Dato estático' }],
  players: [{ id: 'without-date', name: 'Ejemplo', updated_at: timestamp(10) }],
});
assert.deepEqual(missingTimestamps, [], 'filas sin fecha de creación no generan actividad');

assert.equal(formatRecentActivityTime(timestamp(13, 50), timestamp(14)), 'Hace 10 min');
assert.equal(formatRecentActivityTime(timestamp(12), timestamp(14)), 'Hace 2 h');
assert.equal(
  formatRecentActivityTime('2026-07-29T14:00:00.000Z', timestamp(14)),
  'Hace 1 día'
);

console.log('recentActivity tests passed');
