import assert from 'node:assert/strict';
import { STAFF_NAV_GROUPS, STAFF_NAV_TABS } from './appNavigation.js';

assert.deepEqual(STAFF_NAV_GROUPS.map((group) => [group.title, group.items.map((item) => item.name)]), [
  ['PRINCIPAL', ['Inicio']],
  ['EQUIPO', ['Plantilla']],
  ['PLANIFICACIÓN', ['Calendario', 'Microciclos', 'Sesiones', 'Tareas', 'Biblioteca']],
  ['COMPETICIÓN', ['Equipos', 'Perfiles', 'Partidos']],
  ['ANÁLISIS', ['Rendimiento', 'Análisis Grupal', 'Registro Delegado']],
  ['GESTIÓN', ['Fisio', 'Multas']],
]);
assert.equal(STAFF_NAV_TABS.length, 15);
assert.equal(new Set(STAFF_NAV_TABS).size, 15);
assert.ok(STAFF_NAV_GROUPS.every((group) => group.items.every((item) => item.icon)));
console.log('appNavigation: OK');
