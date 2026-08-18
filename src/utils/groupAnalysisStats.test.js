import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildGroupGoalCoverage,
  buildGroupGoalMapModel,
  buildGroupGoalTypeRows,
  buildGroupSetPieceSummary,
  buildScoringEfficiencyRows,
  countGroupGoalZones,
  getGroupGoalInvariantReport,
  getTiedTopGoalBuckets,
  splitGroupGoals,
} from './groupAnalysisStats.js';

const qaGoals = [
  {
    id: 'for-1',
    teamSide: 'for',
    goalContext: 'ABP',
    subphase: 'Penalti',
    finishZone: 'derecha',
    goalMouthZone: 'medio-derecha',
    assistantId: null,
    assistantName: null,
    minute: 12,
  },
  {
    id: 'against-1',
    teamSide: 'against',
    goalContext: 'Transición',
    finishZone: 'centro',
    goalMouthZone: 'bajo-izquierda',
    minute: 48,
  },
  {
    id: 'against-2',
    teamSide: 'against',
    goalContext: 'ABP',
    subphase: 'Penalti',
    finishZone: 'centro',
    goalMouthZone: 'bajo-derecha',
    minute: 76,
  },
];

const { goalsFor, goalsAgainst, allGoals } = splitGroupGoals(qaGoals);
assert.equal(goalsFor.length, 1, 'GF solo contiene goles a favor');
assert.equal(goalsAgainst.length, 2, 'GC solo contiene goles en contra');
assert.equal(allGoals.length, goalsFor.length + goalsAgainst.length, 'allGoals = GF + GC');

const typeRows = buildGroupGoalTypeRows(allGoals);
const type = (name) => typeRows.find((row) => row.context === name);
assert.deepEqual(type('ABP'), { context: 'ABP', forCount: 1, againstCount: 1 });
assert.deepEqual(type('Transición'), { context: 'Transición', forCount: 0, againstCount: 1 });
assert.equal(typeRows.reduce((sum, row) => sum + row.forCount, 0), 1);
assert.equal(typeRows.reduce((sum, row) => sum + row.againstCount, 0), 2);

assert.deepEqual(countGroupGoalZones(goalsFor, 'finishZone'), { derecha: 1 }, 'zonas a favor no incluyen GC');
assert.deepEqual(countGroupGoalZones(goalsAgainst, 'finishZone'), { centro: 2 }, 'zonas en contra no incluyen GF');
assert.deepEqual(countGroupGoalZones(goalsFor, 'goalMouthZone'), { 'medio-derecha': 1 }, 'portería marcada solo usa GF');
assert.deepEqual(countGroupGoalZones(goalsAgainst, 'goalMouthZone'), { 'bajo-izquierda': 1, 'bajo-derecha': 1 }, 'portería encajada solo usa GC');

const pravianoGoal = {
  teamSide: 'against',
  assistantName: null,
  creationZone: 'izquierda',
  finishZone: 'centro',
  goalMouthZone: null,
};
assert.deepEqual(buildGroupGoalMapModel({ goals: [pravianoGoal], side: 'against', field: 'creationZone' }), {
  side: 'against', field: 'creationZone', goals: [pravianoGoal], counts: { izquierda: 1 }, total: 1, withZone: 1, missing: 0,
}, 'gol rival: el origen no depende de tener asistente identificado');
assert.equal(buildGroupGoalMapModel({ goals: [pravianoGoal], side: 'against', field: 'finishZone' }).counts.centro, 1, 'gol rival: finalización centro');
assert.equal(buildGroupGoalMapModel({ goals: [pravianoGoal], side: 'against', field: 'goalMouthZone' }).missing, 1, 'gol rival: portería sin información no se convierte en cero');

const coverage = buildGroupGoalCoverage(allGoals);
assert.deepEqual(coverage, {
  total: 3,
  withContext: 3,
  withFinishZone: 3,
  withGoalZone: 3,
  withAssist: 0,
  forGoals: 1,
  againstGoals: 2,
});
assert.equal(coverage.withAssist, 0, 'sin asistencia explícita no inventa asistente');
assert.equal(coverage.forGoals, 1, 'el denominador de asistencia es GF');

const abpFor = buildGroupSetPieceSummary(goalsFor);
const abpAgainst = buildGroupSetPieceSummary(goalsAgainst);
assert.equal(abpFor.total, 1);
assert.equal(abpFor.subtypeTotal, abpFor.total, 'ABP ofensiva cuadra con todos sus subtipos');
assert.equal(abpAgainst.total, 1);
assert.equal(abpAgainst.subtypeTotal, abpAgainst.total, 'ABP defensiva cuadra con todos sus subtipos');

const extraAbp = buildGroupSetPieceSummary([
  { teamSide: 'for', goalContext: 'ABP', subphase: 'Falta con remate' },
  { teamSide: 'for', goalContext: 'ABP', subphase: 'Segunda jugada' },
  { teamSide: 'for', goalContext: 'ABP', subphase: null },
]);
assert.equal(extraAbp.total, 3);
assert.equal(extraAbp.subtypeTotal, 3);
assert.equal(extraAbp.subtypeRows.find((row) => row.label === 'Falta con remate').count, 1);
assert.equal(extraAbp.subtypeRows.find((row) => row.label === 'Segunda jugada').count, 1);
assert.equal(extraAbp.subtypeRows.find((row) => row.label === 'Sin subtipo').count, 1);

assert.deepEqual(
  getTiedTopGoalBuckets([
    { range: '0-15', forCount: 1 },
    { range: '15-30', forCount: 1 },
    { range: '30-45', forCount: 0 },
  ], 'forCount').map((row) => row.range),
  ['0-15', '15-30'],
  'los tramos empatados se conservan',
);

const efficiency = buildScoringEfficiencyRows([
  { name: 'Titular', goals: 2, minutes: 180 },
  { name: 'Suplente sin muestra', goals: 1, minutes: 30 },
  { name: 'Delantero', goals: 2, minutes: 90 },
]);
assert.deepEqual(efficiency.map((row) => row.name), ['Delantero', 'Titular']);
assert.equal(efficiency[0].goalsPer90, 2);
assert.equal(efficiency.some((row) => row.name === 'Suplente sin muestra'), false, 'mínimo de 90 minutos');

assert.deepEqual(getGroupGoalInvariantReport(allGoals), {
  goalsFor: 1,
  goalsAgainst: 2,
  allGoals: 3,
  typesFor: 1,
  typesAgainst: 2,
  valid: true,
});

const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
assert.match(appSource, /Zonas de finalización/);
assert.match(appSource, /groupGoalMapSide === 'for'/, 'los tres mapas comparten el selector A favor / En contra');
assert.doesNotMatch(appSource, /getOfficialGoalZoneCounts\(allGoalRows, 'finishZone'\)/, 'el mapa no consume allGoals');
assert.match(appSource, /Goles con datos/);
assert.match(appSource, /goalCoverage\.withAssist.*goalCoverage\.forGoals/s, 'asistencia usa GF como denominador');
assert.match(appSource, /Rendimiento goleador/);
assert.match(appSource, /Tendencias detectadas/);
assert.match(appSource, /scopedMatches\.length < 3/);
assert.match(appSource, /Combinaciones utilizadas/);
assert.match(appSource, /playerSlotBreakdownRows\.length \?/);
assert.doesNotMatch(appSource, /Once más utilizado de la temporada/);
assert.match(appSource, /<details className=.*Alternativas por posición/s, 'las alternativas se mantienen disponibles sin alargar el bloque principal');
assert.match(appSource, /getMatchTacticalHistory\(match\)/, 'el once grupal usa el mismo historial táctico que Estadísticas');
assert.match(appSource, /buildGroupSystemSequence/, 'los sistemas del análisis usan la secuencia real de ESTADÍSTICAS');
assert.match(appSource, /absolute -bottom-1\.5/, 'los minutos están anclados a la foto y no compiten con el nombre');
assert.match(appSource, /max-w-\[min\(100%,29rem\)\]/, 'el once se compacta alrededor de un 24% sin cambiar sus datos');
assert.match(appSource, /w-16.*sm:w-20/, 'los marcadores conservan foto, nombre y dorsal en el campo compacto');
assert.match(appSource, /buildTacticalMatchHistory/, 'el once usa el historial compartido derivado de snapshots tácticos');
assert.match(appSource, /getMostUsedXiMetric/, 'el badge distingue minutos reales de apariciones sin minutos');
assert.match(appSource, /resolveStoredTacticalSlot/, 'la posición persistida se cruza por sus coordenadas reales antes que por etiquetas genéricas');
assert.doesNotMatch(appSource, /starterMinutes = hasRealValue\(stored\.minutes\) \? Number\(stored\.minutes \|\| 0\) : duration/, 'no inventa la duración completa cuando faltan minutos');
assert.doesNotMatch(appSource, /partidos en la muestra filtrada\./, 'se eliminan las frases que repiten PJ');
assert.doesNotMatch(appSource, /El equipo ha marcado .*muestra filtrada/, 'se eliminan las frases que repiten GF');
assert.doesNotMatch(appSource, /Goles analizados/);
assert.match(appSource, /buildGroupSetPieceSummary\(goalForRows\)/);
assert.match(appSource, /buildGroupSetPieceSummary\(goalAgainstRows\)/);
assert.match(appSource, /field: 'creationZone'/, 'el origen procede de assist_zone normalizado, no del nombre del asistente');
assert.match(appSource, /field: 'finishZone'/, 'la finalización procede de shot_zone normalizado');
assert.match(appSource, /field: 'goalMouthZone'/, 'la portería procede de goal_zone normalizado');
assert.match(appSource, /creationZone: emptyToNull\(event\.assistZone\)/, 'el modelo grupal conserva assist_zone como origen canónico');
assert.match(appSource, /finishZone: emptyToNull\(event\.shotZone\)/, 'el modelo grupal conserva shot_zone como finalización canónica');
assert.match(appSource, /goalMouthZone: emptyToNull\(event\.goalZone\)/, 'el modelo grupal conserva goal_zone como portería canónica');
assert.match(appSource, /Sin información · Sin zona registrada/, 'la ausencia de goal_zone se representa como dato faltante, nunca como cero');
assert.doesNotMatch(appSource, /assistedGoalRows = goalForRows\.filter\(hasGoalAssistant\)/, 'un origen registrado no depende de identificar asistente');
assert.match(appSource, /goalsFor: goalForRows\.length/);
assert.match(appSource, /goalsAgainst: goalAgainstRows\.length/);

console.log('Group analysis stats tests passed.');
