import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Synthetic contract for a future canonical-play migration. No Supabase client,
// network calls, production fixture, or application imports are used here.
const phases = Object.freeze({
  defensivePhaseV1: 'defensive',
  offensivePhaseV1: 'offensive',
  transitionPhaseV1: 'transition',
  setPiecePhaseV1: 'set_piece',
});
const planPhase = Object.freeze({
  with_ball: 'offensive',
  without_ball: 'defensive',
  transition: 'transition',
  set_piece: 'set_piece',
});
const clone = (value) => JSON.parse(JSON.stringify(value));

function extractWithoutNormalizing(match) {
  const analysis = match.pre_ai_analysis;
  assert.ok(analysis && typeof analysis === 'object' && !Array.isArray(analysis));
  const rows = [];
  for (const [workspaceKey, phase] of Object.entries(phases)) {
    const workspace = analysis[workspaceKey];
    if (workspace === undefined) continue;
    if (!workspace || !Array.isArray(workspace.plays)) throw new Error(`${workspaceKey}: plays inválido`);
    workspace.plays.forEach((play, order) => rows.push({
      matchId: match.id,
      ctsId: match.club_team_season_id,
      workspaceKey,
      phase,
      order,
      legacyId: play?.id,
      rawPlay: clone(play),
    }));
  }
  return rows;
}

function audit(match, rows) {
  const findings = [];
  const keys = new Map();
  for (const row of rows) {
    const id = typeof row.legacyId === 'string' ? row.legacyId.trim() : '';
    if (!id) findings.push(`empty-id:${row.phase}:${row.order}`);
    const key = `${row.matchId}:${id}`;
    if (id && keys.has(key)) findings.push(`duplicate-id:${row.phase}:${row.order}`);
    if (id) keys.set(key, true);
    if (JSON.stringify(row.rawPlay) !== JSON.stringify(match.pre_ai_analysis[row.workspaceKey].plays[row.order])) {
      findings.push(`changed-payload:${row.phase}:${row.order}`);
    }
  }
  const byPhaseAndId = (phase, id) => rows.filter((row) => row.phase === phase && row.legacyId === id);
  const byId = (id) => rows.filter((row) => row.legacyId === id);
  for (const [key, cards] of Object.entries(match.pre_ai_analysis.matchPlanWorkspaceV1?.phases ?? {})) {
    for (const card of Array.isArray(cards) ? cards : []) {
      if (card?.playId && byPhaseAndId(planPhase[key], card.playId).length !== 1) {
        findings.push(`orphan-or-ambiguous-plan:${key}:${card.playId}`);
      }
    }
  }
  for (const id of match.pre_ai_analysis.tacticalQuestion?.tacticalPlayIds ?? []) {
    if (byId(id).length !== 1) findings.push(`orphan-or-ambiguous-question:${id}`);
  }
  // Evidence validation keys are derived from evidence items, not play IDs.
  // They are retained in the original JSON and must be checked with the real
  // evidence engine at migration time; guessing their target would be unsafe.
  return findings;
}

const match = {
  id: 'synthetic-match',
  club_team_season_id: 'synthetic-cts',
  pre_ai_analysis: {
    defensivePhaseV1: {
      version: 1,
      activePlayIdBySituation: { mid_block: 'legacy-defensive-1' },
      plays: [{
        id: 'legacy-defensive-1', name: 'Bloque medio', defensiveSituation: 'mid_block',
        caudalSystem: '4-3-3', rivalSystem: '4-4-2', description: 'Cerrar línea interior.\nSaltar al pase.',
        playerPositions: { 'rival:1': { x: 44.5, y: 31.25 } },
        arrows: [{ id: 'a1', type: 'pass', points: [{ x: 2, y: 7 }, { x: 6, y: 8 }] }],
        sourceTemplateId: 'synthetic-template', futureExtension: { nested: ['conservar', null, 0] },
      }],
    },
    offensivePhaseV1: { version: 1, plays: [{
      id: '11111111-1111-4111-8111-111111111111', name: 'Salida',
      offensiveSituation: 'build_up', playStyle: 'combinative',
      description: 'Tercer hombre', playerPositions: {}, arrows: [],
    }] },
    transitionPhaseV1: { version: 1, plays: [{
      id: 'legacy-transition', transitionType: 'offensive_transition', fieldZone: 'defensive_half',
      behaviour: 'fast_attack', description: 'Vertical', playerPositions: {}, arrows: [],
    }] },
    setPiecePhaseV1: { version: 1, plays: [{
      id: 'legacy-set-piece', setPieceType: 'offensive_set_piece', setPieceAction: 'corner',
      description: 'Segundo palo', responsibilities: { 'rival:1': 'marcar' },
      ballStartPosition: { x: 2, y: 98 }, playerPositions: {}, arrows: [],
    }] },
    matchPlanWorkspaceV1: { version: 1, phases: {
      without_ball: [{ id: 'card-1', playId: 'legacy-defensive-1', explanation: 'Consigna propia' }],
      with_ball: [{ id: 'card-2', playId: '11111111-1111-4111-8111-111111111111' }],
    } },
    tacticalQuestion: { tacticalPlayIds: ['legacy-defensive-1', 'legacy-transition'] },
    tacticalEvidenceValidationsV1: { 'connection:synthetic': { status: 'confirmed', notes: 'No perder' } },
    unrelatedHistoricalField: { untouched: true },
  },
};

const before = clone(match);
const rows = extractWithoutNormalizing(match);
assert.equal(rows.length, 4);
assert.deepEqual(rows.map((row) => row.phase), ['defensive', 'offensive', 'transition', 'set_piece']);
assert.deepEqual(audit(match, rows), []);
assert.equal(rows[0].legacyId, 'legacy-defensive-1');
assert.equal(rows[0].rawPlay.sourceTemplateId, 'synthetic-template');
assert.equal(rows[0].rawPlay.description, 'Cerrar línea interior.\nSaltar al pase.');
assert.equal(rows[0].rawPlay.defensiveSituation, 'mid_block');
assert.equal(rows[0].rawPlay.caudalSystem, '4-3-3');
assert.equal(rows[0].rawPlay.rivalSystem, '4-4-2');
assert.deepEqual(rows[0].rawPlay.futureExtension, { nested: ['conservar', null, 0] });
assert.deepEqual(rows[0].rawPlay.playerPositions, before.pre_ai_analysis.defensivePhaseV1.plays[0].playerPositions);
assert.deepEqual(rows[0].rawPlay.arrows, before.pre_ai_analysis.defensivePhaseV1.plays[0].arrows);
assert.deepEqual(rows[3].rawPlay.responsibilities, before.pre_ai_analysis.setPiecePhaseV1.plays[0].responsibilities);
assert.deepEqual(match, before, 'la extracción no modifica el original');

const duplicate = clone(match);
duplicate.pre_ai_analysis.offensivePhaseV1.plays[0].id = 'legacy-defensive-1';
assert.ok(audit(duplicate, extractWithoutNormalizing(duplicate)).some((issue) => issue.startsWith('duplicate-id:')));
const missing = clone(match);
missing.pre_ai_analysis.defensivePhaseV1.plays[0].id = '';
assert.ok(audit(missing, extractWithoutNormalizing(missing)).some((issue) => issue.startsWith('empty-id:')));
assert.ok(audit(missing, extractWithoutNormalizing(missing)).some((issue) => issue.startsWith('orphan-or-ambiguous-plan:')));
const orphan = clone(match);
orphan.pre_ai_analysis.tacticalQuestion.tacticalPlayIds.push('missing-play');
assert.ok(audit(orphan, extractWithoutNormalizing(orphan)).includes('orphan-or-ambiguous-question:missing-play'));
const malformed = clone(match);
malformed.pre_ai_analysis.setPiecePhaseV1.plays = {};
assert.throws(() => extractWithoutNormalizing(malformed), /plays inválido/);

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
assert.match(app, /\.update\(\{ pre_ai_analysis: nextPreAiAnalysis \}\)/);
assert.match(app, /preAiAnalysis: \{ \.\.\.analysis, prompt, inputSummary \}/);
assert.match(app, /preAiAnalysis: null/);
assert.match(app, /matchPlanWorkspaceV1: workspace/);
assert.match(app, /tacticalEvidenceValidationsV1: nextValidations/);
console.log('Videoanálisis Fase 0: contrato sintético y rutas de escritura conocidas PASS.');
