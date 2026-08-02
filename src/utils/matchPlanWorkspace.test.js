import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  createMatchPlanWorkspace,
  moveMatchPlanCard,
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
assert.match(componentSource, /draggable=\{mode === 'workspace'/, 'las consignas permiten drag and drop');
assert.match(componentSource, /onOpenPlay\(phase, linkedPlay\.id\)/, 'cada consigna puede abrir su jugada vinculada');
assert.doesNotMatch(componentSource, /supabase|localStorage|fetch\(/i, 'el workspace no crea persistencia paralela');

console.log('matchPlanWorkspace tests: ok');
