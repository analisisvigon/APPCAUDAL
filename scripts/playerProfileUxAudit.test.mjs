import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const start = source.indexOf('{selectedPlayerProfile ? (() => {');
const end = source.indexOf('{playerPdfReport &&', start);

assert.ok(start >= 0 && end > start, 'No se pudo aislar la ficha web individual');

const profile = source.slice(start, end);

for (const removedCopy of [
  'Focos de trabajo',
  'Evolución temporada',
  'Inicio temporada',
  'Mitad temporada',
  'Final temporada',
  'Objetivos de partido',
  'Informe automático',
  '>Nota<',
]) {
  assert.equal(profile.includes(removedCopy), false, `La ficha todavía contiene: ${removedCopy}`);
}

assert.match(profile, /Zonas de producción/);
assert.match(profile, /event\.action === 'Gol' \? event\.shotZone : event\.assistZone/);
assert.match(profile, /Object\.values\(shotZoneCounts\)\.some/);

for (const metric of ['Goles/90', 'Asist./90', 'G+A/90', 'G+A total']) {
  assert.ok(profile.includes(metric), `Falta la métrica oficial ${metric}`);
}
assert.match(profile, /aggregate\.minutes \? \(\(goalContributions \/ aggregate\.minutes\) \* 90\)\.toFixed\(2\) : '0\.00'/);

assert.match(profile, /\{hasGoalPhaseData \? <div[^]*Tipo de gol[^]*<\/div> : null\}/);
assert.match(profile, /\{hasGoalZoneData \? <div[^]*Diana de finalización[^]*<\/div> : null\}/);
assert.match(profile, /societyRows\.map\(\(row\) =>/);
assert.match(profile, /\{row\.given\} dadas · \{row\.received\} recibidas/);
assert.equal(profile.includes('Sociedad ofensiva'), false);

assert.match(profile, /Videoteca de acciones/);
assert.match(profile, /\{event\.action\} · \{event\.minute\}'/);
assert.match(profile, /window\.open\(event\.videoUrl, '_blank'\)/);
assert.equal(profile.includes('aspect-video'), false);

assert.match(profile, /\['Fecha', 'Rival', 'Resultado', 'Competición', 'L\/V', 'Rol', 'Min', 'Goles', 'Asist\.', 'Tarjetas', 'Lesión'\]/);
assert.match(profile, /score\.hasScore \? `\$\{resultLabel\} · \$\{score\.caudalGoals\}-\$\{score\.rivalGoals\}` : 'Sin resultado'/);
assert.match(profile, /overflow-x-auto player-history-table/);

assert.match(profile, /hasUsefulQuickData = quick\.events\.length >= 2/);
assert.match(profile, /Últimos 3 partidos/);
assert.match(profile, /Solo validados/);

console.log('playerProfileUxAudit.test.mjs: OK');
