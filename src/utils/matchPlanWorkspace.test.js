import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  MATCH_PLAN_PRIORITIES,
  buildMatchPlanImportCandidates,
  createMatchPlanWorkspace,
  duplicateMatchPlanCard,
  moveMatchPlanCard,
  moveMatchPlanCardByOffset,
  moveMatchPlanChecklistItem,
  persistMatchPlanWorkspace,
  resolveMatchPlanPendingNavigation,
  serializeMatchPlanLegacyFields,
} from './matchPlanWorkspace.js';

const seeded = createMatchPlanWorkspace({
  seed: {
    executive: { objective: 'Competir juntos', mainRisk: 'Pérdida interior' },
    phases: {
      with_ball: ['Atacar espalda lateral', 'Finalizar ataques'],
      without_ball: ['Cerrar pase interior'],
      transition: ['Replegar juntos'],
      set_piece: ['Proteger segundo palo'],
    },
    insights: {
      'Con balón': { proposedAction: 'Generar ventaja exterior', conclusion: 'Patrón respaldado.', sources: [{ type: 'play', id: 'p1' }] },
    },
  },
});

assert.equal(seeded.version, 1);
assert.equal(seeded.phases.with_ball.length, 2);
assert.equal(seeded.phases.with_ball[0].action, 'Atacar espalda lateral');
assert.equal(seeded.executive.objective, 'Competir juntos');
assert.ok(seeded.checklist.length >= 1);
assert.deepEqual(MATCH_PLAN_PRIORITIES, ['Crítica', 'Alta', 'Media', 'Baja']);
assert.equal(seeded.phases.with_ball[0].priority, 'Media');
assert.equal(seeded.executiveStates.objective, 'pending');

const persistedEmpty = createMatchPlanWorkspace({
  stored: { ...seeded, phases: { ...seeded.phases, with_ball: [] } },
  seed: { phases: { with_ball: ['No debe reaparecer'] } },
});
assert.equal(persistedEmpty.phases.with_ball.length, 0, 'una eliminación guardada no se repuebla desde el legado');

const sevenPerPhase = Object.fromEntries(['with_ball', 'without_ball', 'transition', 'set_piece'].map((phase) => [
  phase,
  Array.from({ length: 7 }, (_, index) => `${phase} · consigna ${index + 1}`),
]));
const migratedSeven = createMatchPlanWorkspace({ seed: { phases: sevenPerPhase } });
Object.keys(sevenPerPhase).forEach((phase) => assert.equal(migratedSeven.phases[phase].length, 7, `${phase} conserva siete consignas legacy`));
const persistedSeven = createMatchPlanWorkspace({
  stored: JSON.parse(JSON.stringify(migratedSeven)),
  seed: { phases: Object.fromEntries(Object.keys(sevenPerPhase).map((phase) => [phase, ['El legacy no debe sobrescribir V1']])) },
});
Object.keys(sevenPerPhase).forEach((phase) => assert.deepEqual(persistedSeven.phases[phase].map((card) => card.action), migratedSeven.phases[phase].map((card) => card.action), `Workspace V1 prevalece en ${phase}`));
const serializedSeven = serializeMatchPlanLegacyFields(persistedSeven);
['planConBalon', 'planSinBalon', 'planTransiciones'].forEach((field) => assert.equal(serializedSeven[field].split('\n').length, 7, `${field} guarda las siete consignas`));

const firstId = seeded.phases.with_ball[0].id;
const secondId = seeded.phases.with_ball[1].id;
const reordered = moveMatchPlanCard(seeded, 'with_ball', secondId, 'with_ball', firstId);
assert.deepEqual(reordered.phases.with_ball.map((card) => card.id), [secondId, firstId]);

const moved = moveMatchPlanCard(seeded, 'with_ball', firstId, 'transition');
assert.equal(moved.phases.with_ball.length, 1);
assert.equal(moved.phases.transition.at(-1).id, firstId);

const linkedSeed = { ...seeded, phases: { ...seeded.phases, with_ball: seeded.phases.with_ball.map((card, index) => index ? card : { ...card, playId: 'offensive-play' }) } };
const movedLinked = moveMatchPlanCard(linkedSeed, 'with_ball', firstId, 'transition');
assert.equal(movedLinked.phases.transition.at(-1).playId, '', 'un cambio de fase limpia un enlace incompatible de Pizarra');

const mixedPlans = {
  ...seeded,
  phases: {
    ...seeded.phases,
    with_ball: [
      { ...seeded.phases.with_ball[0], id: 'a-1', plan: 'A' },
      { ...seeded.phases.with_ball[0], id: 'b-1', plan: 'B' },
      { ...seeded.phases.with_ball[1], id: 'a-2', plan: 'A' },
    ],
  },
};
const accessibleMove = moveMatchPlanCardByOffset(mixedPlans, 'with_ball', 'a-2', -1);
assert.deepEqual(accessibleMove.phases.with_ball.map((card) => card.id), ['a-2', 'b-1', 'a-1'], 'los controles accesibles reordenan dentro del plan visible');
assert.equal(moveMatchPlanCardByOffset(accessibleMove, 'with_ball', 'a-2', -1), accessibleMove, 'no mueve una consigna fuera del primer puesto de su plan');

const safelyDuplicated = duplicateMatchPlanCard(linkedSeed, 'with_ball', firstId, 'copy-id');
const duplicate = safelyDuplicated.phases.with_ball.find((card) => card.id === 'copy-id');
assert.ok(duplicate, 'crea una copia con identidad propia');
assert.equal(duplicate.playId, '', 'la copia no hereda accidentalmente la jugada vinculada');
assert.equal(duplicate.status, 'draft');
assert.equal(duplicate.executed, false);
assert.notEqual(duplicate.sources, linkedSeed.phases.with_ball[0].sources, 'la copia no comparte arrays mutables con la original');
assert.deepEqual(duplicate.sources, linkedSeed.phases.with_ball[0].sources);
const crossPhaseIdCollision = duplicateMatchPlanCard(linkedSeed, 'with_ball', firstId, linkedSeed.phases.transition[0].id);
assert.equal(crossPhaseIdCollision, linkedSeed, 'rechaza IDs ya utilizados en otra fase o plan');

const clearedFields = createMatchPlanWorkspace({
  stored: {
    ...seeded,
    phases: {
      ...seeded.phases,
      with_ball: [{ ...seeded.phases.with_ball[0], impact: '', explanation: '', sources: [] }],
    },
  },
  seed: {
    phases: { with_ball: ['No debe sustituir la consigna guardada'] },
    insights: { 'Con balón': { proposedAction: 'Impacto por defecto', conclusion: 'Explicación por defecto', sources: ['Perfil'] } },
  },
});
assert.equal(clearedFields.phases.with_ball[0].impact, '', 'un impacto vaciado permanece vacío al recargar');
assert.equal(clearedFields.phases.with_ball[0].explanation, '', 'una explicación vaciada permanece vacía al recargar');
assert.deepEqual(clearedFields.phases.with_ball[0].sources, [], 'las fuentes vaciadas permanecen vacías al recargar');
const clearedRoundTrip = createMatchPlanWorkspace({
  stored: JSON.parse(JSON.stringify(clearedFields)),
  seed: { insights: { 'Con balón': { proposedAction: 'No debe reaparecer', conclusion: 'No debe reaparecer', sources: ['Perfil'] } } },
});
assert.equal(clearedRoundTrip.phases.with_ball[0].impact, '', 'ida y vuelta: impacto vacío permanece vacío');
assert.equal(clearedRoundTrip.phases.with_ball[0].explanation, '', 'ida y vuelta: explicación vacía permanece vacía');
assert.deepEqual(clearedRoundTrip.phases.with_ball[0].sources, [], 'ida y vuelta: fuentes vacías permanecen []');

const normalizedLegacyPriority = createMatchPlanWorkspace({
  stored: {
    ...seeded,
    phases: { ...seeded.phases, with_ball: [{ ...seeded.phases.with_ball[0], priority: 'Importante' }] },
    executiveStates: { objective: 'validated', attackPriority: 'discarded' },
    live: { planBActive: false, cardExecution: { [firstId]: { executed: true, priority: 'Opcional', observation: 'Cerrar antes', updatedAt: '2026-08-02T12:00:00.000Z' } } },
  },
});
assert.equal(normalizedLegacyPriority.phases.with_ball[0].priority, 'Alta', 'migra la prioridad Importante a Alta');
assert.equal(normalizedLegacyPriority.executiveStates.objective, 'validated');
assert.equal(normalizedLegacyPriority.live.cardExecution[firstId].priority, 'Baja', 'normaliza la prioridad de ejecución sin tocar el diseño');
assert.equal(normalizedLegacyPriority.live.cardExecution[firstId].observation, 'Cerrar antes');
assert.equal(normalizedLegacyPriority.phases.with_ball[0].priority, 'Alta', 'salir de En directo conserva la prioridad diseñada');

const realSaveError = new Error('Fallo real de Supabase');
const failedSave = await persistMatchPlanWorkspace({
  workspace: seeded,
  onSave: async () => ({ ok: false, error: realSaveError }),
  now: () => '2026-08-02T15:00:00.000Z',
});
assert.equal(failedSave.ok, false);
assert.equal(failedSave.error, realSaveError, 'propaga el objeto de error real');
assert.equal(failedSave.workspace, seeded, 'un fallo conserva exactamente el workspace local');
assert.equal(failedSave.savedAt, '', 'un fallo no registra una hora de guardado');

const pendingNavigationOrder = [];
let completePendingSave;
const pendingSave = new Promise((resolve) => { completePendingSave = resolve; });
const saveAndLeavePromise = resolveMatchPlanPendingNavigation({
  action: 'save',
  save: async () => {
    pendingNavigationOrder.push('guardar');
    const result = await pendingSave;
    pendingNavigationOrder.push('guardado');
    return result;
  },
  execute: async () => { pendingNavigationOrder.push('navegar'); },
});
await Promise.resolve();
assert.deepEqual(pendingNavigationOrder, ['guardar'], 'Guardar y salir espera el resultado real antes de navegar');
completePendingSave({ ok: true, savedAt: '2026-08-02T16:00:00.000Z' });
const saveAndLeaveResult = await saveAndLeavePromise;
assert.equal(saveAndLeaveResult.ok, true);
assert.deepEqual(pendingNavigationOrder, ['guardar', 'guardado', 'navegar']);

let failedNavigationExecuted = false;
const failedNavigation = await resolveMatchPlanPendingNavigation({
  action: 'save',
  save: async () => ({ ok: false, error: realSaveError }),
  execute: () => { failedNavigationExecuted = true; },
});
assert.equal(failedNavigation.ok, false);
assert.equal(failedNavigation.error, realSaveError);
assert.equal(failedNavigationExecuted, false, 'un fallo de guardado bloquea la navegación pendiente');

const discardOrder = [];
const discardedNavigation = await resolveMatchPlanPendingNavigation({
  action: 'discard',
  discard: () => discardOrder.push('descartar'),
  execute: () => discardOrder.push('navegar'),
});
assert.equal(discardedNavigation.ok, true);
assert.deepEqual(discardOrder, ['descartar', 'navegar'], 'Salir sin guardar descarta solo el estado local antes de navegar');

let cancelledNavigationExecuted = false;
const cancelledNavigation = await resolveMatchPlanPendingNavigation({
  action: 'cancel',
  execute: () => { cancelledNavigationExecuted = true; },
});
assert.equal(cancelledNavigation.cancelled, true);
assert.equal(cancelledNavigationExecuted, false, 'Cancelar conserva el plan y anula la navegación');

const checklistMoved = moveMatchPlanChecklistItem(seeded, seeded.checklist[1].id, seeded.checklist[0].id);
assert.equal(checklistMoved.checklist[0].id, seeded.checklist[1].id, 'el checklist mantiene drag and drop mediante una operación estable');

const importCandidates = buildMatchPlanImportCandidates({
  phase: 'with_ball',
  insight: {
    proposedAction: 'Atacar el espacio exterior',
    conclusion: 'Patrón observado',
    evidence: ['Tres progresiones por fuera'],
    sources: [{ type: 'collective_profile' }, { type: 'player_profile' }],
  },
  plays: [{ id: 'play-1', name: 'Salida tres', description: 'Fijar dentro y progresar fuera' }],
});
assert.equal(importCandidates.length, 2);
assert.deepEqual(importCandidates[0].origins, ['Rival', 'Jugadores']);
assert.equal(importCandidates[1].action, 'Fijar dentro y progresar fuera');
assert.equal(importCandidates[1].playId, 'play-1');

const legacy = serializeMatchPlanLegacyFields({
  ...seeded,
  phases: {
    ...seeded.phases,
    with_ball: [
      { action: 'Confirmada', status: 'confirmed' },
      { action: 'Descartada', status: 'discarded' },
    ],
  },
});
assert.equal(legacy.planConBalon, 'Confirmada');
assert.equal(legacy.planObjetivo, 'Competir juntos');
assert.equal(legacy.prePlanAvoid, 'Pérdida interior');

const componentSource = fs.readFileSync(new URL('../components/tactical/MatchPlanWorkspace.jsx', import.meta.url), 'utf8');
const utilitySource = fs.readFileSync(new URL('./matchPlanWorkspace.js', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const workspaceSource = `${componentSource}\n${utilitySource}`;
[
  'Plan ejecutivo',
  'Con balón',
  'Sin balón',
  'Transición',
  'ABP',
  'Presentar al equipo',
  'En directo',
  'Activar Plan B',
  'Checklist del cuerpo técnico',
  'Aceptar propuesta',
  'Rechazar',
  'Duplicar',
  'Confirmar',
  'Descartar',
].forEach((label) => assert.match(workspaceSource, new RegExp(label), `incluye ${label}`));
['Generar propuesta', 'Añadir tareas sugeridas', 'Importar recomendaciones', 'Añadir observación rápida'].forEach((label) => assert.match(componentSource, new RegExp(label), `incluye ${label}`));
assert.match(componentSource, /draggable=\{mode === 'workspace'/, 'las consignas permiten drag and drop');
assert.match(componentSource, /moveMatchPlanChecklistItem/, 'el checklist conserva drag and drop sin controles administrativos visibles');
assert.match(componentSource, /cardExecution/, 'En directo guarda la ejecución separada del plan diseñado');
assert.doesNotMatch(componentSource, /onLiveChange=\{\(patch\) => updateCard/, 'En directo no sobrescribe la tarjeta diseñada');
assert.match(componentSource, /moveMatchPlanCardByOffset/, 'existe una alternativa accesible para reordenar');
assert.match(componentSource, /Plan en edición/, 'Plan A y Plan B se seleccionan de forma explícita');
assert.match(appSource, /if \(!matchPlanDirty && !printMatchPlanDirty && !tacticalSavePending\) return undefined;[\s\S]*beforeunload/, 'la protección central cubre recarga y cierre solo cuando algún editor tiene cambios pendientes');
assert.match(componentSource, /if \(!result\.ok\)[\s\S]*setDirty\(true\)[\s\S]*setSaveStatus\('Error al guardar'\)/, 'un fallo mantiene dirty y muestra Error al guardar');
assert.match(componentSource, /saveStatus === 'Error al guardar' \? 'Reintentar'/, 'un fallo ofrece reintentar');
assert.match(componentSource, /onNavigationGuardReady\?\.\(\{ save: saveWorkspace, discard: discardPendingWorkspace \}\)/, 'el editor expone el mismo guardado real y el descarte local al guard central');
assert.match(appSource, /Cambios sin guardar[\s\S]*Tienes cambios sin guardar en el Plan de partido\.[\s\S]*Guardar y salir[\s\S]*Salir sin guardar[\s\S]*Cancelar/, 'el diálogo central ofrece las tres decisiones requeridas');
assert.match(appSource, /const openMatchPage = \(match, section\) => requestMatchPlanNavigation/, 'cambiar de partido o sección pasa por el guard central');
assert.match(appSource, /const closeMatchPage = \(\) => requestMatchPlanNavigation/, 'cerrar la ficha pasa por el guard central');
assert.match(appSource, /const requestPreSubTab = \(nextTab\)[\s\S]*requestMatchPlanNavigation/, 'cambiar de subpestaña pasa por el guard central');
assert.match(appSource, /const goToTab = \(tab\)[\s\S]*requestMatchPlanNavigation/, 'cambiar de módulo pasa por el guard central');
assert.match(appSource, /type: 'change-rival-player'[\s\S]*requestMatchPlanNavigation|requestMatchPlanNavigation\(\{[\s\S]*type: 'change-rival-player'/, 'abrir el contexto de otro rival pasa por el guard central');
assert.match(componentSource, /onOpenPlay\(phase, linkedPlay\.id\)/, 'cada consigna puede abrir su jugada vinculada');
assert.doesNotMatch(componentSource, /supabase|localStorage|fetch\(/i, 'el workspace no crea persistencia paralela');
assert.match(appSource, /return \{ ok: false, error: updateError \}/, 'Supabase devuelve el fallo al consumidor');
assert.match(appSource, /return \{ ok: true, savedAt: new Date\(\)\.toISOString\(\) \}/, 'Supabase confirma el guardado con su hora de finalización');
assert.match(appSource, /\}, \{ optimistic: false \}\);/, 'el Plan no simula en memoria un guardado remoto pendiente');
['attackPlan', 'defensePlan', 'transitionPlan', 'abpPlan'].forEach((planName) => {
  assert.doesNotMatch(appSource, new RegExp(`const ${planName} = uniq\\(\\[[\\s\\S]*?\\n    \\]\\)\\.slice\\(0, 3\\);`), `${planName} no trunca el legado durante la migración`);
});

console.log('matchPlanWorkspace tests: ok');
