import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const positionComponent = fs.readFileSync(new URL('../src/components/player/PlayerPositionUsageSummary.jsx', import.meta.url), 'utf8');
const positionSelector = fs.readFileSync(new URL('../src/utils/playerPositionUsage.js', import.meta.url), 'utf8');
const positionMap = fs.readFileSync(new URL('../src/utils/playerPositionMap.js', import.meta.url), 'utf8');
const pdfReport = fs.readFileSync(new URL('../src/utils/playerProfilePrintReport.js', import.meta.url), 'utf8');
const pdfExporter = fs.readFileSync(new URL('../src/utils/playerProfilePdfExport.js', import.meta.url), 'utf8');
const start = source.indexOf('{selectedPlayerProfile ? (() => {');
const end = source.indexOf('})() : (', start);

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
assert.match(profile, /const playerPositionUsage = getPlayerPositionUsage\(\{/);
assert.match(profile, /<PlayerPositionUsageSummary usage=\{playerPositionUsage\}/);
assert.ok(profile.indexOf('<PlayerPositionUsageSummary usage={playerPositionUsage}') < profile.indexOf('Zonas de producción'), 'Posiciones utilizadas debe aparecer antes que zonas y conexiones');
assert.match(profile, /positionUsage: playerPositionUsage/);
assert.match(profile, /matchRows: aggregate\.rows\.map/, 'el mapa debe consumir exclusivamente los partidos ya filtrados de la ficha');
assert.match(source, /filterMatchesByCompetitionCatalog\(\[row\.match\], getCompetitionFilterKey\(playerCompetitionFilter\)\)/, 'competición filtra antes del cálculo posicional');
assert.match(source, /playerVenueFilter === 'Todos' \|\| \(playerVenueFilter === 'Local'/, 'local y visitante filtran antes del cálculo posicional');
assert.equal(profile.includes('profilePosition: selectedPlayerProfile.position'), false, 'La posición general no puede actuar como fallback táctico');
assert.match(positionComponent, /Posiciones utilizadas/);
assert.match(positionMap, /levelLabel: 'Principal'/);
assert.match(positionComponent, /data-player-position-map/);
assert.match(positionComponent, /buildPlayerPositionMapModel\(usage\)/);
assert.match(positionComponent, /Sin información posicional suficiente/);
assert.match(positionComponent, /Sin minutos registrados para este filtro/);
assert.match(positionComponent, /sin posición registrada/);
assert.match(positionComponent, /data-position=\{position\.position\}/);
assert.match(positionComponent, /break-words/);
assert.doesNotMatch(positionComponent, /\btruncate\b/, 'los nombres de posiciones no deben truncarse en la leyenda');
assert.match(positionSelector, /export const buildPlayerPositionUsage = getPlayerPositionUsage/);
assert.equal(positionSelector.includes("add(clean(profilePosition), remaining, 'profile')"), false, 'El selector no debe inventar minutos desde la ficha');
assert.match(positionMap, /export const getPositionMapCoordinates/);
assert.match(positionMap, /percentage: officialMinutes \? Math\.round/);
assert.match(pdfExporter, /buildPlayerPositionMapModel\(usage\)/, 'App y PDF deben consumir el mismo modelo visual normalizado');
assert.match(pdfReport, /positionUsage: source\.positionUsage \|\| \{\}/, 'El PDF debe recibir sin recalcular el resultado canónico de la APP');
assert.match(pdfExporter, /Sin información posicional suficiente/);
assert.match(pdfExporter, /sin posición registrada/);
assert.match(profile, /event\.action === 'Gol' \? event\.shotZone : event\.assistZone/);
assert.match(profile, /Object\.values\(shotZoneCounts\)\.some/);

for (const metric of ['Goles/90', 'Asist./90', 'G+A/90', 'G+A total']) {
  assert.ok(profile.includes(metric), `Falta la métrica oficial ${metric}`);
}
assert.match(profile, /aggregate\.minutes \? \(\(goalContributions \/ aggregate\.minutes\) \* 90\)\.toFixed\(2\) : '0\.00'/);

assert.match(profile, /playerInfluenceFilter === 'Goles' && hasGoalBodyPartData[^]*Cómo marca/);
assert.match(profile, /playerInfluenceFilter === 'Goles' && hasGoalPhaseData[^]*Tipo de gol/);
assert.match(profile, /playerInfluenceFilter === 'Goles' && hasGoalZoneData[^]*Diana de finalización/);
assert.match(profile, /visibleSocietyRows\.map\(\(row\) =>/);
assert.match(profile, /\{row\.given\} dadas · \{row\.received\} recibidas/);
assert.match(profile, /buildPlayerConnectionRows\(\{ goalActions: allGoalActions, assistActions: allAssistActions, filter: playerInfluenceFilter \}\)/);
assert.match(profile, /isGoalScoredByPlayer\(event, selectedPlayerProfile\) && visibleMatchIds\.has\(event\.partidoId\)/, 'los goles respetan los partidos filtrados por competición y sede');
assert.match(profile, /isGoalAssistedByPlayer\(event, selectedPlayerProfile\) && visibleMatchIds\.has\(event\.partidoId\)/, 'las asistencias respetan los partidos filtrados por competición y sede');
assert.equal(profile.includes('Sociedad ofensiva'), false);

assert.match(profile, /Videoteca de acciones/);
assert.match(profile, /\{event\.action\} · \{event\.minute\}'/);
assert.match(profile, /window\.open\(event\.videoUrl, '_blank'\)/);
assert.match(profile, /Detalle de \{influenceDetailLabel\}/);
assert.match(profile, /\['Finalización', event\.contact\]/);
assert.match(profile, /\['Zona de asistencia', event\.assistZoneLabel\]/);
assert.equal(profile.includes('aspect-video'), false);

assert.match(profile, /\['Fecha', 'Rival', 'Resultado', 'Competición', 'L\/V', 'Rol', 'Min', 'Goles', 'Asist\.', 'Tarjetas', 'Lesión'\]/);
assert.match(profile, /score\.hasScore \? `\$\{resultLabel\} · \$\{score\.caudalGoals\}-\$\{score\.rivalGoals\}` : 'Sin resultado'/);
assert.match(profile, /overflow-x-auto player-history-table/);

assert.match(profile, /hasUsefulQuickData = quick\.events\.length >= 2/);
assert.match(profile, /Últimos 3 partidos/);
assert.match(profile, /Solo validados/);

const liveStart = profile.indexOf('<AccordionSection title="Registro en vivo"');
const liveEnd = profile.indexOf('<AccordionSection title="Producción', liveStart);
assert.ok(liveStart >= 0 && liveEnd > liveStart, 'localiza exclusivamente el bloque Registro en vivo');
const liveSection = profile.slice(liveStart, liveEnd);
assert.match(source, /const scopedReviewedEvents = \(playerProfileData\?\.quickEvents \|\| \[\]\)/);
assert.match(source, /playerDelegatedScope === 'Todos los registros' \|\| isDelegatedDataValidated\(event\.match\)/);
assert.match(source, /const quickScopeLimit = playerQuickScope === 'Últimos 3 partidos' \? 3 : playerQuickScope === 'Últimos 5 partidos' \? 5 : null/);
assert.match(source, /const matchCount = new Set\(quickEvents\.map\(\(event\) => event\.partidoId\)\)\.size;/);
assert.match(source, /calculateDelegatedPerMatch\(summary, matchCount, PLAYER_LIVE_PER_MATCH_FIELDS\)/);
for (const metric of [
  'Partidos con eventos',
  'Goles / partido',
  'Tiros / partido',
  'Tiros a puerta / partido',
  '% tiros a puerta',
  'Centros / partido',
  'Pérdidas / partido',
  'Robos / partido',
  'Faltas realizadas / partido',
  'Faltas recibidas / partido',
]) {
  assert.ok(liveSection.includes(metric), `Registro en vivo debe mostrar ${metric}`);
}
for (const removedMetric of ['Regates', 'Recuperaciones', 'Balance rec/pérd', 'event.minute', 'quick.recent']) {
  assert.equal(liveSection.includes(removedMetric), false, `Registro en vivo no debe mostrar ${removedMetric}`);
}

console.log('playerProfileUxAudit.test.mjs: OK');
