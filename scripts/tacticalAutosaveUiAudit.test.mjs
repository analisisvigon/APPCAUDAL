import assert from 'node:assert/strict';
import fs from 'node:fs';

const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const coordinatorSource = fs.readFileSync(new URL('../src/utils/flushableSaveCoordinator.js', import.meta.url), 'utf8');

assert.match(coordinatorSource, /TACTICAL_AUTOSAVE_DELAY_MS = 900/, 'mantiene debounce de 900 ms');
assert.match(coordinatorSource, /if \(inFlight\) return inFlight/, 'no duplica un save en curso');
assert.match(coordinatorSource, /while \(inFlight \|\| savedVersion < version\)/, 'flush espera y repite si hubo ediciones durante save');
assert.match(coordinatorSource, /generation !== saveGeneration/, 'descarta respuestas de un ciclo obsoleto');
assert.match(coordinatorSource, /setStatus\('Error al guardar'\)/, 'el error mantiene un estado reintentable');

assert.match(appSource, /tacticalSaveQueueRef/, 'serializa las escrituras de las cuatro fases del JSON compartido');
assert.match(appSource, /matchId: selectedMatch\?\.id[\s\S]*phaseField: 'defensivePhaseV1'/, 'snapshot defensivo queda ligado al partido');
assert.match(appSource, /phaseField: 'offensivePhaseV1'/);
assert.match(appSource, /phaseField: 'transitionPhaseV1'/);
assert.match(appSource, /phaseField: 'setPiecePhaseV1'/);
assert.match(appSource, /const requestMatchPlanNavigation[\s\S]*tacticalNavigationGuardRef\.current\?\.hasPending/, 'el guard central detecta pizarras pendientes');
assert.match(appSource, /executeNavigationAfterFlush[\s\S]*await flushDeferredNavigationSaves\(\)[\s\S]*await navigation\.execute\(\)/, 'navega sólo después de un flush correcto');
assert.match(appSource, /if \(!matchPlanDirty && !printMatchPlanDirty && !tacticalSavePending\) return undefined;[\s\S]*beforeunload/, 'beforeunload cubre dirty táctico e impresión');
assert.match(appSource, /const openMatchPage = \(match, section\) => requestMatchPlanNavigation/, 'cambio de partido protegido');
assert.match(appSource, /const closeMatchPage = \(\) => requestMatchPlanNavigation/, 'cierre de ficha protegido');
assert.match(appSource, /const goToTab = \(tab\)[\s\S]*requestMatchPlanNavigation/, 'cambio de pestaña protegido');

console.log('tactical autosave UI audit: ok');
