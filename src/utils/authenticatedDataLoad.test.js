import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createAuthenticatedDataLoadCoordinator,
  runIndependentAuthenticatedLoaders,
} from './authenticatedDataLoad.js';

const coordinator = createAuthenticatedDataLoadCoordinator();
let loadCount = 0;
let releaseInitialLoad;
const initialLoad = () => new Promise((resolve) => {
  loadCount += 1;
  releaseInitialLoad = resolve;
});

const withoutSession = coordinator.start('', initialLoad);
await withoutSession.promise;
assert.equal(loadCount, 0, 'sin sesión no se inicia ninguna carga privada');

const first = coordinator.start('user-1:0', initialLoad);
const duplicate = coordinator.start('user-1:0', initialLoad);
assert.equal(first.started, true, 'la primera sesión inicia la carga');
assert.equal(duplicate.started, false, 'la misma sesión no duplica la carga');
assert.equal(first.promise, duplicate.promise, 'los consumidores comparten la misma operación');
await Promise.resolve();
releaseInitialLoad('ok');
await first.promise;
assert.equal(loadCount, 1, 'refresh autenticado carga una sola vez');

const repeatedAfterCompletion = coordinator.start('user-1:0', initialLoad);
assert.equal(repeatedAfterCompletion.started, false, 'un segundo evento inicial de Auth no recarga el mismo ciclo');
assert.equal(loadCount, 1);

const signedInReload = coordinator.start('user-1:1', async () => {
  loadCount += 1;
  return 'reloaded';
});
await signedInReload.promise;
assert.equal(loadCount, 2, 'SIGNED_IN explícito inicia un nuevo ciclo de carga');

let staleContext;
const staleLoad = coordinator.start('user-2:0', async (context) => {
  staleContext = context;
});
await staleLoad.promise;
assert.equal(staleContext.isCurrent(), true);
coordinator.invalidate();
assert.equal(staleContext.isCurrent(), false, 'SIGNED_OUT invalida resultados en curso');

const calls = [];
const independent = await runIndependentAuthenticatedLoaders({
  jugadores: async () => calls.push('jugadores'),
  partidos: async () => { throw new Error('partidos no disponible'); },
  equipos: async () => calls.push('equipos'),
});
assert.deepEqual(calls, ['jugadores', 'equipos'], 'el error de un dataset no bloquea los demás');
assert.deepEqual(independent.failures.map(({ dataset }) => dataset), ['partidos'], 'el error identifica su dataset');

const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
assert.ok(appSource.includes('if (authLoading) return;'), 'la carga espera a que Auth termine');
assert.ok(appSource.includes('if (!authenticatedDataLoadKey)'), 'sin sesión se ejecuta la rama de limpieza, no los loaders');
assert.ok(appSource.includes("event === 'SIGNED_IN'") && appSource.includes('nextSessionIdentity !== authSessionIdentityRef.current'), 'SIGNED_IN nuevo fuerza carga sin duplicar eventos repetidos');
assert.ok(appSource.includes("if (event === 'SIGNED_OUT')"), 'SIGNED_OUT invalida y limpia el estado');
assert.ok(appSource.includes('authenticatedDataCoordinatorRef.current.invalidate();'), 'logout invalida respuestas privadas tardías');
assert.ok(appSource.includes('runIndependentAuthenticatedLoaders({'), 'los datasets se cargan de forma coordinada e independiente');
assert.ok(appSource.includes('loadHomeDashboardData({ shouldApply: isCurrent, reusePrincipalData: true })'), 'Inicio reutiliza jugadores, partidos y equipos ya cargados en el ciclo autenticado');
assert.ok(appSource.includes("{authLoading ? 'Comprobando sesión…' : 'Cargando datos…'}"), 'Auth y datos tienen estados de carga diferenciados');
const initialDataLifecycleSource = appSource.slice(
  appSource.indexOf("const authenticatedUserId = session?.user?.id || '';"),
  appSource.indexOf('const suspendedPlayers = players.filter'),
);
assert.ok(!initialDataLifecycleSource.includes('loadPartidos().catch((loadError)'), 'partidos ya no conserva un efecto de montaje anónimo');
assert.ok(!initialDataLifecycleSource.includes('loadCompetitions().catch((loadError)'), 'competiciones ya no conserva un efecto de montaje anónimo');

console.log('authenticatedDataLoad tests passed');
