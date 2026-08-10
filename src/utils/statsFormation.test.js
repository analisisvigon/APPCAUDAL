import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DEFAULT_OWN_FORMATION,
  createNewMatchFormationState,
  normalizeOwnDefaultFormation,
  resolveMatchStatsFormation,
} from './statsFormation.js';

assert.equal(resolveMatchStatsFormation({}, DEFAULT_OWN_FORMATION), '4-2-3-1', 'A: partido nuevo sin sistema usa el habitual');
assert.equal(resolveMatchStatsFormation({ statsSystemRaw: '4-4-2' }, DEFAULT_OWN_FORMATION), '4-4-2', 'B: un 4-4-2 persistido se respeta');

const habitual = normalizeOwnDefaultFormation('4-2-3-1');
const editedMatch = { statsSystemRaw: '4-3-3' };
assert.equal(resolveMatchStatsFormation(editedMatch, habitual), '4-3-3', 'C: el cambio pertenece solo al partido');
assert.equal(createNewMatchFormationState(habitual).statsSystem, '4-2-3-1', 'D: otro partido nuevo vuelve al habitual');
assert.equal(normalizeOwnDefaultFormation('sistema-desconocido'), '4-2-3-1', 'un valor inválido usa el fallback solicitado');
assert.equal(resolveMatchStatsFormation({ statsSystemRaw: '', preCaudalSystemRaw: '3-5-2' }, habitual), '3-5-2', 'un sistema PRE real existente precede al habitual');

const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
assert.ok(appSource.includes('.eq("key", OWN_DEFAULT_FORMATION_CONFIG_KEY)'), 'el sistema habitual se lee de app_config existente');
assert.ok(appSource.includes('stats_system: matchFormState.statsSystem || DEFAULT_OWN_FORMATION'), 'un partido nuevo persiste su sistema inicial');
assert.ok(appSource.includes('resolveMatchStatsFormation(match, ownDefaultFormation)'), 'la resolución distingue sistema guardado y habitual');
assert.ok(!appSource.includes("statsSystem: match.stats_system || '4-4-2'"), 'la normalización ya no inventa 4-4-2 para datos ausentes');

console.log('statsFormation tests passed');
