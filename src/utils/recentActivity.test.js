import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildRecentActivity,
  formatRecentActivityTime,
  groupRecentActivity,
} from './recentActivity.js';

const timestamp = (day, hour, minute = 0) => (
  `2026-07-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`
);
const NOW = timestamp(31, 12);
const recentOptions = { nowValue: NOW };

const referencePlayers = [
  { id: 'player-1', name: 'Alejandro González', shirt_name: 'Alex Glez' },
  { id: 'player-2', name: 'Vicente Antuña' },
  { id: 'player-3', name: 'Agustín Porto', shirt_name: 'Agus Porto' },
];

const performanceInput = {
  players: referencePlayers,
  wellnessEntries: [{
    id: 'wellness-latest',
    jugador_id: 'player-2',
    created_at: timestamp(31, 11, 48),
  }],
  rpeEntries: [{
    id: 'rpe-before-wellness',
    jugador_id: 'player-3',
    created_at: timestamp(31, 11, 40),
  }],
  trainingSessions: [{
    id: 'session-before-rpe',
    title: 'MD-3',
    created_at: timestamp(31, 10, 30),
  }],
};
const latestWellness = buildRecentActivity(performanceInput, recentOptions);
assert.equal(latestWellness.length, 1, 'Rendimiento mantiene una tarjeta por módulo');
assert.equal(latestWellness[0].moduleKey, 'performance');
assert.equal(latestWellness[0].moduleLabel, 'Rendimiento');
assert.equal(latestWellness[0].latestEventType, 'Último Wellness');
assert.equal(latestWellness[0].latestEntityLabel, 'Vicente Antuña');
assert.equal(latestWellness[0].latestTimestamp, timestamp(31, 11, 48));
assert.equal(
  latestWellness[0].summary,
  '1 Wellness · 1 RPE · 1 sesión',
  'el resumen secundario conserva todos los tipos registrados'
);
assert.equal(latestWellness[0].summaryPeriodLabel, 'Últimos 7 días');

const latestRpe = buildRecentActivity({
  ...performanceInput,
  rpeEntries: [{
    id: 'rpe-latest',
    jugador_id: 'player-3',
    created_at: timestamp(31, 11, 55),
  }],
}, recentOptions);
assert.equal(latestRpe[0].latestEventType, 'Último RPE');
assert.equal(latestRpe[0].latestEntityLabel, 'Agus Porto', 'RPE utiliza el nombre visible del jugador');

const latestSession = buildRecentActivity({
  ...performanceInput,
  trainingSessions: [{
    id: 'session-latest',
    title: 'MD-3',
    created_at: timestamp(31, 11, 58),
  }],
}, recentOptions);
assert.equal(latestSession[0].latestEventType, 'Última sesión creada');
assert.equal(latestSession[0].latestEntityLabel, 'MD-3');

const unresolvedPerformancePlayer = buildRecentActivity({
  wellnessEntries: [{
    id: 'wellness-unresolved',
    jugador_id: 'missing-id',
    created_at: timestamp(31, 11),
  }],
}, recentOptions);
assert.equal(unresolvedPerformancePlayer[0].latestEntityLabel, 'Jugador no disponible');
assert.ok(!JSON.stringify(unresolvedPerformancePlayer).includes('missing-id'), 'la tarjeta no muestra IDs sin resolver');

const squadActivity = buildRecentActivity({
  players: [
    {
      id: 'updated-player',
      name: 'Jugador anterior',
      created_at: timestamp(29, 9),
      updated_at: timestamp(31, 11, 50),
    },
    {
      id: 'latest-created-player',
      name: 'Vicente Antuña',
      created_at: timestamp(31, 10),
    },
  ],
}, recentOptions);
assert.equal(squadActivity[0].moduleKey, 'squad');
assert.equal(squadActivity[0].latestEventType, 'Último jugador añadido');
assert.equal(squadActivity[0].latestEntityLabel, 'Vicente Antuña');
assert.equal(
  squadActivity[0].summary,
  '2 jugadores añadidos · 1 jugador actualizado',
  'Plantilla cuenta creaciones y actualizaciones fiables sin confundirlas'
);

const rivalTeams = [
  { id: 'own-team', name: 'C.D. Caudal', team_kind: 'own', created_at: timestamp(25, 8) },
  { id: 'rival-team', name: 'CD Praviano', team_kind: 'rival', created_at: timestamp(26, 8) },
];
const rivalPlayerActivity = buildRecentActivity({
  teams: rivalTeams,
  globalPlayers: [{ id: 'global-rival', name: 'Juan Pérez' }],
  rivalMemberships: [{
    id: 'membership-rival',
    player_id: 'global-rival',
    team_id: 'rival-team',
    created_at: timestamp(31, 9),
  }],
}, recentOptions);
assert.equal(rivalPlayerActivity.length, 1);
assert.equal(rivalPlayerActivity[0].moduleKey, 'teams');
assert.equal(rivalPlayerActivity[0].latestEventType, 'Último jugador añadido');
assert.equal(rivalPlayerActivity[0].latestEntityLabel, 'Juan Pérez');
assert.equal(rivalPlayerActivity[0].latestContextLabel, 'CD Praviano');
assert.equal(rivalPlayerActivity[0].summary, '1 jugador rival añadido · 1 equipo creado');

const legacyRivalActivity = buildRecentActivity({
  teams: rivalTeams,
  rivalPlayers: [{
    id: 'legacy-rival',
    name: 'Mario García',
    equipo_rival_id: 'rival-team',
    created_at: timestamp(30, 9),
  }],
}, recentOptions);
assert.equal(legacyRivalActivity[0].latestEntityLabel, 'Mario García', 'mantiene compatibilidad con jugadores rivales legacy');
assert.equal(legacyRivalActivity[0].latestContextLabel, 'CD Praviano');

const noDuplicatedLinkedRival = buildRecentActivity({
  teams: rivalTeams,
  globalPlayers: [{ id: 'global-linked', name: 'Jugador vinculado' }],
  rivalMemberships: [{
    id: 'membership-linked',
    player_id: 'global-linked',
    team_id: 'rival-team',
    created_at: timestamp(31, 9),
  }],
  rivalPlayers: [{
    id: 'legacy-linked',
    name: 'Jugador vinculado',
    global_player_id: 'global-linked',
    membership_id: 'membership-linked',
    equipo_rival_id: 'rival-team',
    created_at: timestamp(31, 9),
  }],
}, recentOptions);
assert.equal(
  noDuplicatedLinkedRival[0].counts['Jugador rival añadido'],
  1,
  'la fila legacy vinculada no duplica la incorporación global'
);

const teamFallback = buildRecentActivity({
  teams: [{
    id: 'fallback-team',
    name: 'CD Llanes',
    team_kind: 'rival',
    created_at: timestamp(30, 8),
    updated_at: timestamp(31, 8),
  }],
}, recentOptions);
assert.equal(teamFallback[0].latestEventType, 'Último equipo rival actualizado');
assert.equal(teamFallback[0].latestEntityLabel, 'CD Llanes');
assert.equal(teamFallback[0].summary, '1 equipo creado · 1 equipo actualizado');

const matchActivity = buildRecentActivity({
  matches: [{
    id: 'match-created',
    opponent: 'CD Praviano',
    is_home: true,
    date: '2026-08-02',
    created_at: timestamp(31, 10, 20),
  }],
}, recentOptions);
assert.equal(matchActivity[0].moduleKey, 'matches');
assert.equal(matchActivity[0].latestEventType, 'Último partido creado');
assert.equal(matchActivity[0].latestEntityLabel, 'Caudal vs CD Praviano');
assert.equal(matchActivity[0].latestContextLabel, '02/08/2026');
assert.equal(matchActivity[0].summary, '1 partido creado');

const sortedModules = buildRecentActivity({
  matches: [{ id: 'sort-match', opponent: 'A', created_at: timestamp(31, 9) }],
  players: [{ id: 'sort-player', name: 'A', created_at: timestamp(31, 10) }],
  teams: [{ id: 'sort-team', name: 'A', team_kind: 'rival', created_at: timestamp(31, 8) }],
  wellnessEntries: [{ id: 'sort-wellness', created_at: timestamp(31, 11) }],
}, recentOptions);
assert.deepEqual(
  sortedModules.map((group) => group.moduleKey),
  ['performance', 'squad', 'matches', 'teams'],
  'las tarjetas se ordenan por la fecha de su acción concreta'
);
assert.equal(new Set(sortedModules.map((group) => group.moduleKey)).size, sortedModules.length);
assert.ok(sortedModules.length <= 6, 'se mantiene el límite global de tarjetas');

const duplicated = buildRecentActivity({
  wellnessEntries: [
    { id: 'same-wellness', created_at: timestamp(31, 10) },
    { id: 'same-wellness', created_at: timestamp(31, 10) },
  ],
}, recentOptions);
assert.equal(duplicated[0].eventCount, 1, 'la deduplicación exacta se conserva');
assert.equal(duplicated[0].summary, '1 Wellness');

const outsideWindow = buildRecentActivity({
  wellnessEntries: [{ id: 'old-wellness', created_at: timestamp(20, 10) }],
}, recentOptions);
assert.deepEqual(outsideWindow, [], 'los contadores y tarjetas representan únicamente los últimos siete días');

assert.deepEqual(buildRecentActivity({}, recentOptions), [], 'sin actividad real se devuelve el estado vacío');
assert.deepEqual(
  groupRecentActivity([{
    id: 'unreliable',
    moduleKey: 'library',
    type: 'Documento modificado',
    timestamp: timestamp(31, 10),
  }], recentOptions),
  [],
  'no aparecen módulos sin una fuente fiable'
);

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
assert.ok(!appSource.includes('>Actividad en</p>'), 'desaparece el texto visual “Actividad en”');
assert.ok(appSource.includes('role="tooltip"'), 'el resumen completo utiliza un tooltip accesible');
assert.ok(appSource.includes('{item.summaryPeriodLabel}: {item.summary}'), 'el tooltip contiene el resumen agregado completo');
assert.ok(appSource.includes('onClick={() => goToTab(item.tab)}'), 'se conserva la navegación compartida por pestañas');
assert.ok(appSource.includes('min-h-[10.5rem]'), 'las tarjetas mantienen una altura uniforme');

assert.equal(formatRecentActivityTime(timestamp(31, 11, 50), NOW), 'Hace 10 min');
assert.equal(formatRecentActivityTime(timestamp(31, 10), NOW), 'Hace 2 h');
assert.equal(formatRecentActivityTime(timestamp(30, 12), NOW), 'Hace 1 día');

console.log('recentActivity hybrid-card tests passed');
