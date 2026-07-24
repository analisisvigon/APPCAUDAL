import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildTacticalTemplatePayload,
  createTacticalTemplate,
  normalizeTacticalTemplate,
} from './tacticalTemplateStore.js';
import {
  adaptSemanticPlayerPositions,
  instantiateTemplateArrows,
  serializeSemanticPlayerPositions,
  serializeTemplateArrows,
} from './tacticalTemplates.js';
import { calculateTacticalTemplateUsages } from './tacticalTemplateUsage.js';

const layouts = {
  '4-4-2': [
    ['Portero', 50, 89],
    ['Lateral izquierdo', 18, 73],
    ['Central izquierdo', 39, 73],
    ['Central derecho', 61, 73],
    ['Lateral derecho', 82, 73],
    ['Extremo izquierdo', 18, 45],
    ['Mediocentro', 39, 45],
    ['Mediocentro', 61, 45],
    ['Extremo derecho', 82, 45],
    ['Delantero', 42, 16],
    ['Delantero', 58, 16],
  ],
  '4-3-3': [
    ['Portero', 50, 89],
    ['Lateral izquierdo', 18, 73],
    ['Central izquierdo', 39, 73],
    ['Central derecho', 61, 73],
    ['Lateral derecho', 82, 73],
    ['Pivote', 50, 56],
    ['Interior izquierdo', 38, 40],
    ['Interior derecho', 62, 40],
    ['Extremo izquierdo', 20, 18],
    ['Delantero', 50, 14],
    ['Extremo derecho', 80, 18],
  ],
  '5-3-2': [
    ['Portero', 50, 89],
    ['Carrilero izquierdo', 12, 73],
    ['Central izquierdo', 32, 75],
    ['Central', 50, 76],
    ['Central derecho', 68, 75],
    ['Carrilero derecho', 88, 73],
    ['Interior izquierdo', 34, 45],
    ['Pivote', 50, 49],
    ['Interior derecho', 66, 45],
    ['Delantero', 42, 16],
    ['Delantero', 58, 16],
  ],
  '4-2-3-1': [
    ['Portero', 50, 89],
    ['Lateral izquierdo', 18, 73],
    ['Central izquierdo', 39, 73],
    ['Central derecho', 61, 73],
    ['Lateral derecho', 82, 73],
    ['Mediocentro', 39, 52],
    ['Mediocentro', 61, 52],
    ['Extremo izquierdo', 18, 32],
    ['Mediapunta', 50, 32],
    ['Extremo derecho', 82, 32],
    ['Delantero', 50, 14],
  ],
};

const slots = (system) => layouts[system].map(([role, x, y], slot) => ({ role, x, y, slot }));
const positionsForSystems = (rivalSystem, caudalSystem) => Object.fromEntries([
  ...slots(rivalSystem).map((slot) => [`rival:${slot.slot}`, { x: slot.x * 0.8 + 10, y: slot.y * 0.45 }]),
  ...slots(caudalSystem).map((slot) => [`caudal:${slot.slot}`, { x: slot.x * 0.8 + 10, y: 55 + slot.y * 0.45 }]),
]);

const buildSemantic = (rivalSystem, caudalSystem) => serializeSemanticPlayerPositions({
  playerPositions: positionsForSystems(rivalSystem, caudalSystem),
  rivalSystem,
  caudalSystem,
  rivalFormationSlots: slots(rivalSystem),
  caudalFormationSlots: slots(caudalSystem),
});

const assertAdaptation = (sourceSystem, targetSystem) => {
  const semantic = buildSemantic(sourceSystem, sourceSystem);
  const result = adaptSemanticPlayerPositions({
    semanticPositions: semantic,
    rivalSystem: targetSystem,
    caudalSystem: targetSystem,
    rivalFormationSlots: slots(targetSystem),
    caudalFormationSlots: slots(targetSystem),
  });
  assert.equal(Object.keys(result.playerPositions).length, 22, `${sourceSystem} -> ${targetSystem} conserva 22 puestos`);
  assert.ok(Object.values(result.playerPositions).every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)));
  assert.ok(Array.isArray(result.warnings), 'los avisos nunca bloquean la adaptación');
};

assertAdaptation('4-4-2', '4-3-3');
assertAdaptation('4-3-3', '5-3-2');
assertAdaptation('5-3-2', '4-2-3-1');

const semanticExample = buildSemantic('4-4-2', '4-3-3');
assert.equal(semanticExample.version, 1);
assert.equal(semanticExample.entries.length, 22);
assert.deepEqual(
  Object.keys(semanticExample.entries[0]).sort(),
  ['line', 'ordinal', 'role', 'roleFamily', 'side', 'team', 'x', 'y'].sort()
);
assert.ok(!JSON.stringify(semanticExample).match(/playerId|photo|fotograf|nombre/i));

const sourceArrows = [
  { id: 'editor-arrow', type: 'pass', start: { x: 10, y: 20 }, end: { x: 30, y: 40 } },
  { id: 'movement-arrow', type: 'movement', start: { x: 50, y: 60 }, end: { x: 70, y: 80 } },
];
const portableArrows = serializeTemplateArrows(sourceArrows);
assert.deepEqual(portableArrows[0], { type: 'pass', start: { x: 10, y: 20 }, end: { x: 30, y: 40 } });
let arrowSequence = 0;
const instantiatedArrows = instantiateTemplateArrows(portableArrows, () => `new-arrow-${++arrowSequence}`);
instantiatedArrows[0].start.x = 99;
assert.equal(portableArrows[0].start.x, 10, 'la jugada recibe una copia profunda de las flechas');
assert.notEqual(instantiatedArrows[0].id, sourceArrows[0].id, 'las flechas reciben IDs locales nuevos');

const payload = buildTacticalTemplatePayload({
  name: '  Salida de tres  ',
  phase: 'offensive',
  situation: 'creation',
  playStyle: 'direct',
  category: 'salida_de_balon',
  description: 'Atraer para progresar.',
  baseRivalSystem: '4-4-2',
  baseCaudalSystem: '4-3-3',
  tags: [' pivote ', 'pivote', '', { invalid: true }],
  playerPositions: semanticExample,
  arrows: portableArrows,
  ownerId: 'must-never-be-sent',
  isPublic: true,
});
assert.equal(payload.name, 'Salida de tres');
assert.equal(payload.play_style, 'direct');
assert.equal(payload.transition_type, null);
assert.equal(payload.field_zone, null);
assert.equal(payload.behaviour, null);
assert.equal(payload.set_piece_type, null);
assert.equal(payload.set_piece_action, null);
assert.equal(payload.ball_start_position, null);
assert.deepEqual(payload.tags, ['pivote']);
assert.equal(payload.is_public, false);
assert.ok(!Object.hasOwn(payload, 'owner_id'), 'el insert confía en default auth.uid() y no envía owner_id');

let insertedPayload = null;
const fakeClient = {
  from(table) {
    assert.equal(table, 'tactical_play_templates');
    return {
      insert(nextPayload) {
        insertedPayload = nextPayload;
        return this;
      },
      select() {
        return this;
      },
      async single() {
        return {
          data: {
            id: 'template-1',
            ...insertedPayload,
            created_at: '2026-07-24T10:00:00.000Z',
            updated_at: '2026-07-24T10:00:00.000Z',
          },
          error: null,
        };
      },
    };
  },
};
const created = await createTacticalTemplate(fakeClient, {
  name: 'Plantilla persistente',
  phase: 'defensive',
  situation: 'mid_block',
  playerPositions: semanticExample,
  arrows: portableArrows,
});
assert.equal(created.id, 'template-1');
assert.ok(!Object.hasOwn(insertedPayload, 'owner_id'));
assert.equal(normalizeTacticalTemplate({ ...insertedPayload, id: 'reload-1' }).name, 'Plantilla persistente');
assert.equal(normalizeTacticalTemplate({ id: 'legacy-offensive', phase: 'offensive', situation: 'build_up' }).playStyle, 'combinative');
assert.equal(normalizeTacticalTemplate({ id: 'defensive', phase: 'defensive', situation: 'mid_block', play_style: 'direct' }).playStyle, null);
const transitionPayload = buildTacticalTemplatePayload({
  name: 'Ataque rápido tras robo',
  phase: 'transition',
  transitionType: 'offensive_transition',
  fieldZone: 'defensive_half',
  behaviour: 'fast_attack',
  playerPositions: semanticExample,
  arrows: portableArrows,
});
assert.equal(transitionPayload.situation, 'offensive_transition');
assert.equal(transitionPayload.play_style, null);
assert.equal(transitionPayload.transition_type, 'offensive_transition');
assert.equal(transitionPayload.field_zone, 'defensive_half');
assert.equal(transitionPayload.behaviour, 'fast_attack');
const normalizedTransition = normalizeTacticalTemplate({
  id: 'transition-template',
  name: 'Repliegue',
  phase: 'transition',
  situation: 'defensive_transition',
  transition_type: 'defensive_transition',
  field_zone: 'attacking_half',
  behaviour: 'retreat',
});
assert.equal(normalizedTransition.transitionType, 'defensive_transition');
assert.equal(normalizedTransition.fieldZone, 'attacking_half');
assert.equal(normalizedTransition.behaviour, 'retreat');
const legacyTransition = normalizeTacticalTemplate({
  id: 'legacy-transition',
  phase: 'transition',
  situation: 'defensive_transition',
});
assert.equal(legacyTransition.transitionType, 'defensive_transition');
assert.equal(legacyTransition.fieldZone, 'defensive_half');
assert.equal(legacyTransition.behaviour, 'counterpress');
const setPiecePayload = buildTacticalTemplatePayload({
  name: 'Córner primer palo',
  phase: 'set_piece',
  setPieceType: 'offensive_set_piece',
  setPieceAction: 'corner',
  ballStartPosition: { x: 5, y: 95 },
  playerPositions: semanticExample,
  arrows: portableArrows,
});
assert.equal(setPiecePayload.situation, 'offensive_set_piece');
assert.equal(setPiecePayload.set_piece_type, 'offensive_set_piece');
assert.equal(setPiecePayload.set_piece_action, 'corner');
assert.deepEqual(setPiecePayload.ball_start_position, { x: 5, y: 95 });
const normalizedSetPiece = normalizeTacticalTemplate({
  id: 'set-piece-template',
  name: 'Falta lateral',
  phase: 'set_piece',
  situation: 'defensive_set_piece',
  set_piece_type: 'defensive_set_piece',
  set_piece_action: 'wide_free_kick',
  ball_start_position: { x: 93, y: 34 },
});
assert.equal(normalizedSetPiece.setPieceType, 'defensive_set_piece');
assert.equal(normalizedSetPiece.setPieceAction, 'wide_free_kick');
assert.deepEqual(normalizedSetPiece.ballStartPosition, { x: 93, y: 34 });

assert.throws(() => buildTacticalTemplatePayload({ phase: 'defensive', situation: 'mid_block' }), /nombre/i);
assert.throws(() => buildTacticalTemplatePayload({ name: 'X', situation: 'mid_block' }), /fase/i);
assert.throws(() => buildTacticalTemplatePayload({ name: 'X', phase: 'defensive' }), /situación/i);
assert.throws(() => buildTacticalTemplatePayload({ name: 'X', phase: 'offensive', situation: 'build_up' }), /tipo de juego/i);
assert.throws(
  () => buildTacticalTemplatePayload({ name: 'X', phase: 'transition' }),
  /tipo válido/i
);
assert.throws(
  () => buildTacticalTemplatePayload({
    name: 'X',
    phase: 'transition',
    transitionType: 'offensive_transition',
    fieldZone: 'defensive_half',
    behaviour: 'retreat',
  }),
  /comportamiento válido/i
);
assert.throws(
  () => buildTacticalTemplatePayload({ name: 'X', phase: 'set_piece' }),
  /tipo válido/i
);
assert.throws(
  () => buildTacticalTemplatePayload({
    name: 'X',
    phase: 'set_piece',
    setPieceType: 'offensive_set_piece',
    setPieceAction: 'invalid',
  }),
  /tipo de acción válido/i
);

const usage = calculateTacticalTemplateUsages([
  {
    id: 'match-1',
    opponent: 'Rival A',
    equipo_rival_id: 'rival-a',
    date: '2026-08-01',
    pre_ai_analysis: {
      defensivePhaseV1: {
        plays: [
          { id: 'play-1', name: 'Bloque', defensiveSituation: 'mid_block', sourceTemplateId: 'template-1' },
          { id: 'legacy', name: 'Anterior', defensiveSituation: 'low_block' },
        ],
      },
      offensivePhaseV1: {
        plays: [{ id: 'play-2', name: 'Salida', offensiveSituation: 'build_up', sourceTemplateId: 'template-1' }],
      },
      transitionPhaseV1: {
        plays: [{
          id: 'play-transition-1',
          name: 'Ataque rápido',
          transitionType: 'offensive_transition',
          sourceTemplateId: 'template-1',
        }],
      },
      setPiecePhaseV1: {
        plays: [{
          id: 'play-set-piece-1',
          name: 'Córner',
          setPieceType: 'offensive_set_piece',
          sourceTemplateId: 'template-1',
        }],
      },
    },
  },
  {
    id: 'match-2',
    opponent: 'Rival B',
    equipo_rival_id: 'rival-b',
    pre_ai_analysis: {
      offensivePhaseV1: {
        plays: [{ id: 'play-3', name: 'Progresión', offensiveSituation: 'creation', sourceTemplateId: 'template-1' }],
      },
    },
  },
]);
assert.equal(usage['template-1'].playCount, 5);
assert.equal(usage['template-1'].matchCount, 2);
assert.equal(usage['template-1'].rivalCount, 2);

const migration = fs.readFileSync('supabase_tactical_play_templates.sql', 'utf8');
const playStyleMigration = fs.readFileSync('supabase_tactical_play_templates_play_style.sql', 'utf8');
const transitionMigration = fs.readFileSync('supabase_tactical_play_templates_transitions.sql', 'utf8');
const setPieceMigration = fs.readFileSync('supabase_tactical_play_templates_set_piece.sql', 'utf8');
assert.match(migration, /owner_id uuid not null\s+default auth\.uid\(\)/);
assert.match(migration, /references auth\.users\(id\)\s+on delete cascade/);
assert.match(migration, /enable row level security/);
assert.match(migration, /for select[\s\S]*owner_id = auth\.uid\(\)/);
assert.match(migration, /for insert[\s\S]*owner_id = auth\.uid\(\)[\s\S]*is_public = false/);
assert.match(migration, /for update[\s\S]*owner_id = auth\.uid\(\)[\s\S]*is_public = false/);
assert.match(migration, /for delete[\s\S]*owner_id = auth\.uid\(\)/);
assert.match(migration, /execute function public\.set_updated_at\(\)/);
assert.doesNotMatch(migration, /create\s+(or replace\s+)?function/i);
assert.doesNotMatch(migration, /training_library/i);
assert.doesNotMatch(migration, /\bplay_style\b/i, 'la migración original no se modifica');
assert.match(playStyleMigration, /add column if not exists play_style text null/);
assert.match(playStyleMigration, /play_style in \('combinative', 'direct'\)/);
assert.doesNotMatch(playStyleMigration, /training_library/i);
assert.match(transitionMigration, /add column if not exists transition_type text null/);
assert.match(transitionMigration, /add column if not exists field_zone text null/);
assert.match(transitionMigration, /add column if not exists behaviour text null/);
assert.match(transitionMigration, /offensive_transition/);
assert.match(transitionMigration, /defensive_transition/);
assert.match(transitionMigration, /fast_attack/);
assert.match(transitionMigration, /counterpress/);
assert.match(transitionMigration, /owner_id,\s+phase,\s+transition_type,\s+field_zone,\s+behaviour/);
assert.doesNotMatch(transitionMigration, /create policy/i, 'la migración no cambia las RLS existentes');
assert.doesNotMatch(transitionMigration, /training_library/i);
assert.match(setPieceMigration, /add column if not exists set_piece_type text null/);
assert.match(setPieceMigration, /add column if not exists set_piece_action text null/);
assert.match(setPieceMigration, /add column if not exists ball_start_position jsonb null/);
assert.match(setPieceMigration, /jsonb_typeof\(ball_start_position -> 'x'\) = 'number'/);
assert.match(setPieceMigration, /owner_id,\s+phase,\s+set_piece_type,\s+set_piece_action/);
assert.doesNotMatch(setPieceMigration, /create policy/i, 'la migración ABP no cambia las RLS existentes');
assert.doesNotMatch(setPieceMigration, /training_library/i);

const appSource = fs.readFileSync('src/App.jsx', 'utf8');
assert.match(appSource, /defensivePhaseV1/);
assert.match(appSource, /offensivePhaseV1/);
assert.match(appSource, /transitionPhaseV1/);
assert.match(appSource, /setPiecePhaseV1/);
assert.match(appSource, /sourceTemplateId/);
assert.match(appSource, /instantiateTemplateArrows/);
assert.match(appSource, /tacticalTemplatePlayStyleFilter/);
assert.match(appSource, /tacticalTemplateTransitionTypeFilter/);
assert.match(appSource, /tacticalTemplateFieldZoneFilter/);
assert.match(appSource, /tacticalTemplateBehaviourFilter/);

console.log('Tactical template tests passed');
