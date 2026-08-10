import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  MATCH_PLAN_PHASES,
  MATCH_PLAN_TYPES,
  buildMatchPlanPages,
  buildMatchPlanPersistencePayload,
  createMatchPlanSituation,
  duplicateMatchPlanSituation,
  getMatchPlanInstructions,
  getMatchPlanPageCount,
  normalizeMatchPlanSituations,
  reorderMatchPlanSituations,
  updateMatchPlanSituationMeta,
} from './matchPlanPrint.js';
import { getSetPieceGeometrySnapshot, getSetPieceTacticalMeta } from './setPieceProfessional.js';

const own = Array.from({ length: 11 }, (_, index) => ({ id: `own-${index}`, type: 'player', x: 8 + (index % 6) * 14, y: 48 + Math.floor(index / 6) * 12, label: ['POR', 'LD', 'DFC', 'DFC', 'LI', 'MC', 'MC', 'ED', 'MP', 'EI', 'DC'][index], name: ['POR', 'LD', 'DFC', 'DFC', 'LI', 'MC', 'MC', 'ED', 'MP', 'EI', 'DC'][index], roles: [] }));
const rivals = Array.from({ length: 11 }, (_, index) => ({ id: `rival-${index}`, type: 'opponent', x: 8 + (index % 6) * 14, y: 12 + Math.floor(index / 6) * 12, label: index === 0 ? 'POR' : 'DFC', name: index === 0 ? 'POR' : 'DFC', roles: [] }));
const geometry = [
  ...own,
  ...rivals,
  { id: 'element-ball', type: 'ball', x: 50, y: 36 },
  { id: 'element-arrow', type: 'arrow', x1: 50, y1: 55, x2: 50, y2: 38 },
  { id: 'element-curve', type: 'curved_arrow', x1: 70, y1: 52, x2: 82, y2: 30, controlX: 91, controlY: 46 },
  { id: 'element-curve-dashed', type: 'curved_arrow', dashed: true, x1: 44, y1: 54, x2: 62, y2: 28, controlX: 68, controlY: 48 },
  { id: 'element-double', type: 'double_arrow', x1: 24, y1: 48, x2: 38, y2: 29 },
  { id: 'element-dashed', type: 'dashed_arrow', x1: 30, y1: 52, x2: 18, y2: 30 },
  { id: 'element-block', type: 'block', x: 61, y: 31, width: 6, label: 'BLOQUEO' },
  { id: 'element-zone', type: 'zone', x: 72, y: 18, width: 20, height: 18, label: 'SUPERIORIDAD' },
  { id: 'element-text', type: 'text', x: 50, y: 8, label: 'ACTIVAR PRESIÓN' },
];

let withoutBall = createMatchPlanSituation({ phase: MATCH_PLAN_PHASES.WITHOUT_BALL, order: 1, title: 'PRESIÓN ALTA' });
withoutBall = { ...withoutBall, elements: [...geometry, ...withoutBall.elements.filter((element) => element.type === 'tactical_meta')] };
withoutBall = updateMatchPlanSituationMeta(withoutBall, {
  objective: 'Orientar hacia su lateral izquierdo.',
  collectiveInstructions: [
    { id: 'key-1', text: 'DC orienta hacia fuera.', order: 1 },
    { id: 'key-2', text: 'ED salta al lateral.', order: 2 },
    { id: 'key-3', text: 'MP tapa al pivote.', order: 3 },
  ],
});
const withBallBase = createMatchPlanSituation({ phase: MATCH_PLAN_PHASES.WITH_BALL, order: 2, title: 'ATACAR SU BLOQUE MEDIO' });
const secondGeometry = geometry.map((element, index) => {
  const next = { ...element, id: `second-${index}` };
  if (['arrow', 'dashed_arrow', 'curved_arrow', 'double_arrow'].includes(element.type)) {
    return { ...next, x1: 100 - element.x1, x2: 100 - element.x2, ...(element.controlX == null ? {} : { controlX: 100 - element.controlX, controlY: Math.max(5, element.controlY - 8) }) };
  }
  if (element.x == null) return next;
  const width = ['zone', 'block'].includes(element.type) ? Number(element.width || 0) : 0;
  return { ...next, x: 100 - element.x - width, y: ['player', 'opponent'].includes(element.type) ? Math.max(5, Math.min(67, element.y + (element.type === 'player' ? -9 : 9))) : element.y };
});
const withBall = updateMatchPlanSituationMeta(
  { ...withBallBase, elements: [...secondGeometry, ...withBallBase.elements.filter((element) => element.type === 'tactical_meta')] },
  { collectiveInstructions: [{ id: 'key-4', text: 'Generar superioridad por dentro.', order: 1 }] },
);

assert.equal(withoutBall.tipo, MATCH_PLAN_TYPES.sin_balon);
assert.equal(withBall.tipo, MATCH_PLAN_TYPES.con_balon);
assert.equal(getMatchPlanInstructions(withoutBall).length, 3);
assert.equal(getSetPieceTacticalMeta(withoutBall.elements).objective, 'Orientar hacia su lateral izquierdo.');
assert.equal(withBall.elements.filter((element) => element.type === 'player').length, 11);
assert.equal(withBall.elements.filter((element) => element.type === 'opponent').length, 11);
assert.notDeepEqual(getSetPieceGeometrySnapshot(withBall.elements), getSetPieceGeometrySnapshot(withoutBall.elements), 'la segunda situación usa una estructura táctica diferente');

const snapshotBefore = getSetPieceGeometrySnapshot(withoutBall.elements);
const payload = buildMatchPlanPersistencePayload(withoutBall, 'match-1', 1);
const reloaded = normalizeMatchPlanSituations([{ ...payload, id: 'stored-1', persisted: true }], 'match-1')[0];
assert.deepEqual(getSetPieceGeometrySnapshot(reloaded.elements), snapshotBefore, 'guardado y recarga conservan toda la geometría');
const reloadedDashedCurve = reloaded.elements.find((element) => element.id === 'element-curve-dashed');
assert.deepEqual({ type: reloadedDashedCurve.type, dashed: reloadedDashedCurve.dashed, controlX: reloadedDashedCurve.controlX, controlY: reloadedDashedCurve.controlY }, { type: 'curved_arrow', dashed: true, controlX: 68, controlY: 48 }, 'Plan recibe del motor compartido la curva discontinua sin perder estilo ni control');
assert.equal(getSetPieceTacticalMeta(reloaded.elements).collectiveInstructions.length, 3);

const duplicate = duplicateMatchPlanSituation(withoutBall, 3);
assert.notEqual(duplicate.id, withoutBall.id);
assert.notDeepEqual(duplicate.elements.map((element) => element.id), withoutBall.elements.map((element) => element.id));
assert.deepEqual(getSetPieceGeometrySnapshot(duplicate.elements).map(({ id: _id, ...row }) => row), snapshotBefore.map(({ id: _id, ...row }) => row), 'duplicar conserva geometría y curva');

const reordered = reorderMatchPlanSituations([withoutBall, withBall, duplicate], duplicate.id, -1);
assert.deepEqual(reordered.map((row) => row.id), [withoutBall.id, duplicate.id, withBall.id]);
assert.deepEqual(reordered.map((row) => row.orden), [1, 2, 3]);
assert.equal(reordered.filter((row) => row.id !== duplicate.id).length, 2, 'eliminación no duplica ni altera las demás situaciones');
assert.equal(getMatchPlanPageCount([]), 0, 'un plan vacío no genera ni contabiliza páginas');

for (let count = 1; count <= 5; count += 1) {
  const situations = Array.from({ length: count }, (_, index) => createMatchPlanSituation({ order: index + 1, title: `Situación ${index + 1}` }));
  assert.equal(getMatchPlanPageCount(situations), Math.ceil(count / 2), `${count} situaciones generan ${Math.ceil(count / 2)} páginas`);
  assert.equal(buildMatchPlanPages(situations).flatMap((page) => page.situations).length, count, 'no duplica la última situación impar');
  assert.equal(buildMatchPlanPages(situations).every((page) => page.situations.length >= 1 && page.situations.length <= 2), true, 'cada página contiene una o dos situaciones');
}

const editorSource = fs.readFileSync(new URL('../components/print/MatchPlanEditor.jsx', import.meta.url), 'utf8');
const sheetSource = fs.readFileSync(new URL('../components/print/MatchPlanPrintSheet.jsx', import.meta.url), 'utf8');
const sharedEditorSource = fs.readFileSync(new URL('../components/print/SetPieceDiagramEditor.jsx', import.meta.url), 'utf8');
const sharedToolbarSource = fs.readFileSync(new URL('../components/print/SetPieceDiagramToolbar.jsx', import.meta.url), 'utf8');
const tabSource = fs.readFileSync(new URL('../components/print/MatchPrintTab.jsx', import.meta.url), 'utf8');
const canvasSource = fs.readFileSync(new URL('../components/print/SetPieceDiagramCanvas.jsx', import.meta.url), 'utf8');
const legendSource = fs.readFileSync(new URL('../components/print/MatchPlanIdentityLegend.jsx', import.meta.url), 'utf8');
const cssSource = fs.readFileSync(new URL('../styles/print.css', import.meta.url), 'utf8');

assert.match(tabSource, /label: 'Plan de partido', icon: 'PP'/);
assert.match(tabSource, /getDossierTotalPages/);
assert.match(tabSource, /MatchPlanPrintSheet/);
assert.match(tabSource, /match_set_piece_diagrams/);
assert.match(editorSource, /Galería Plan de partido/);
assert.match(editorSource, /participantRoleMode="single"/);
assert.match(editorSource, /Sin balón/);
assert.match(editorSource, /Con balón/);
assert.match(sharedEditorSource, /curved_arrow/);
assert.match(sharedToolbarSource, /curved_dashed_arrow/);
assert.match(sharedEditorSource, /controlX/);
assert.match(sharedEditorSource, /Deshacer/);
assert.match(sharedEditorSource, /Rehacer/);
assert.match(sheetSource, /getDrawableSetPieceElements/);
assert.doesNotMatch(sheetSource, /optimizeSetPieceElementsForPrint/, 'PDF no recoloca elementos');
assert.match(sheetSource, /data-render-model="match-plan-print"/);
assert.match(sheetSource, /identityConvention="match-plan"/);
assert.match(editorSource, /identityConvention="match-plan"/);
assert.match(sharedEditorSource, /identityConvention=\{editorContext === 'match-plan'/);
assert.match(canvasSource, /participantFill = usesMatchPlanIdentity \? \(isOpponent \? '#111827' : '#ffffff'\)/, 'Plan usa blanco para Caudal y negro para rival');
assert.match(canvasSource, /participantText = usesMatchPlanIdentity \? \(isOpponent \? '#ffffff' : '#111827'\)/, 'el texto interior mantiene contraste');
assert.match(legendSource, /Nuestro equipo/);
assert.match(legendSource, /Rival/);
assert.match(legendSource, /Balón/);
assert.match(tabSource, /createPortal/);
assert.match(tabSource, /print-dossier-portal/);
assert.match(cssSource, /\.match-plan-print-sheet[\s\S]*width: 297mm;[\s\S]*height: 210mm;/);
assert.match(cssSource, /grid-template-rows: repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(cssSource, /page: landscape/);
assert.match(cssSource, /background: #fff/);
assert.match(cssSource, /color: #111827/);
assert.match(cssSource, /body:has\(> \.print-dossier-portal\) > :not\(\.print-dossier-portal\)/, 'el árbol normal sale del flujo físico durante el dossier');
assert.doesNotMatch(cssSource, /html:has\(\.printing-dossier \.print-dossier > \.match-plan-print-sheet\)/, 'no queda el ajuste sintomático exclusivo para Plan');

console.log('Match plan print tests passed.');
