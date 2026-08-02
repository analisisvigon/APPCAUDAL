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
assert.match(componentSource, /beforeunload/, 'los cambios pendientes quedan protegidos al recargar o cerrar');
assert.match(componentSource, /if \(!result\?\.ok\) throw/, 'el workspace solo confirma un guardado remoto explícito');
assert.match(componentSource, /onOpenPlay\(phase, linkedPlay\.id\)/, 'cada consigna puede abrir su jugada vinculada');
assert.doesNotMatch(componentSource, /supabase|localStorage|fetch\(/i, 'el workspace no crea persistencia paralela');
assert.match(appSource, /return \{ ok: false, error: updateError \}/, 'Supabase devuelve el fallo al consumidor');
assert.match(appSource, /return \{ ok: true, savedAt: new Date\(\)\.toISOString\(\) \}/, 'Supabase confirma el guardado con su hora de finalización');
assert.match(appSource, /\}, \{ optimistic: false \}\);/, 'el Plan no simula en memoria un guardado remoto pendiente');
['attackPlan', 'defensePlan', 'transitionPlan', 'abpPlan'].forEach((planName) => {
  assert.doesNotMatch(appSource, new RegExp(`const ${planName} = uniq\\(\\[[\\s\\S]*?\\n    \\]\\)\\.slice\\(0, 3\\);`), `${planName} no trunca el legado durante la migración`);
});

console.log('matchPlanWorkspace tests: ok');
