import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const section = (start, end) => {
  const startIndex = app.indexOf(start);
  const endIndex = app.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `No se pudo localizar el bloque ${start}`);
  return app.slice(startIndex, endIndex);
};

const defaultDraft = section('const defaultGoalAnalysisDraft', 'const emptyMatchForm');
const payload = section('const goalEventDbColumns', 'const goalEventOptionalDbColumns');
const presets = section('const applyGoalPreset', 'const updateGoalAnalysisDraft');
const updateDraft = section('const updateGoalAnalysisDraft', 'const updateGoalParticipantDraft');
const saveFlow = section('const saveGoalAnalysisEvent', 'const deleteGoalAnalysisEvent');
const tacticalContext = section('>Contexto táctico</p>', '>Mapas</p>');
const maps = section('>Mapas</p>', '>Finalización</p>');

assert.equal(defaultDraft.includes('attackType'), false, 'el alta de goles no mantiene estado para tipo de ataque legacy');
assert.equal(defaultDraft.includes('situation'), false, 'el alta de goles no mantiene estado para situación legacy');
assert.equal(presets.includes('attackType'), false, 'los accesos superiores no inventan un tipo de ataque');
assert.equal(presets.includes('situation'), false, 'los accesos superiores no inventan una situación');
assert.equal(updateDraft.includes('inferredAttackType'), false, 'cambiar la fase no autogenera el campo retirado');

assert.equal((tacticalContext.match(/<select/g) || []).length, 2, 'Contexto táctico muestra exactamente dos desplegables');
assert.ok(tacticalContext.includes('goalAnalysisDraft.phase'), 'permanece el desplegable de fase');
assert.ok(tacticalContext.includes('goalAnalysisDraft.subphase'), 'permanece el desplegable de subfase');
assert.equal(tacticalContext.includes('goalAnalysisDraft.attackType'), false, 'no se renderiza el select Combinativo legacy');
assert.equal(tacticalContext.includes('goalAnalysisDraft.situation'), false, 'no se renderiza el select Organizado legacy');
assert.ok(tacticalContext.includes('sm:grid-cols-2'), 'los dos selects ocupan dos columnas iguales desde tablet');
['Combinativo', 'Transición', 'ABP', 'Directo'].forEach((label) => {
  assert.ok(tacticalContext.includes(`'${label}'`), `se conserva el acceso superior ${label}`);
});

assert.ok(payload.includes("'phase'") && payload.includes("'subphase'"), 'el payload conserva los dos campos tácticos oficiales');
assert.equal(payload.includes("'attack_type'"), false, 'el payload no envía tipo de ataque legacy');
assert.equal(payload.includes("'situation'"), false, 'el payload no envía situación legacy');
assert.equal(saveFlow.includes('attackType: payloadDraft.attackType'), false, 'los nuevos goles no escriben tipo de ataque en metadatos');
assert.equal(saveFlow.includes('situation: payloadDraft.situation'), false, 'los nuevos goles no escriben situación en metadatos');
assert.ok(saveFlow.includes('? safeArray(postAnalysis.goalAnalysisMeta)'), 'editar conserva intacto el metadato histórico existente');

['assistZone', 'shotZone', 'goalZone'].forEach((field) => {
  assert.ok(maps.includes(`goalAnalysisDraft.${field}`), `el mapa ${field} permanece conectado`);
  assert.ok(payload.includes(field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)), `el payload conserva ${field}`);
});

console.log('goalTacticalContext tests passed');
