import assert from 'node:assert/strict';
import fs from 'node:fs';

const appSource = fs.readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const rivalSource = fs.readFileSync(new URL('../components/tactical/RivalCollectiveAssistant.jsx', import.meta.url), 'utf8');

const boardEditorStart = appSource.indexOf("{facingSystemsView === 'PIZARRA' ? (\n          <div className=\"grid gap-4 xl:contents\">");
assert.notEqual(boardEditorStart, -1, 'el editor completo se monta únicamente en Pizarra');
const boardEditorEnd = appSource.indexOf('\n          ) : null}\n        </div>', boardEditorStart);
assert.notEqual(boardEditorEnd, -1, 'el bloque condicional de Pizarra está cerrado');
const boardEditorSource = appSource.slice(boardEditorStart, boardEditorEnd);

assert.match(boardEditorSource, /Pizarra de partido/, 'Pizarra conserva el campo táctico');
assert.match(boardEditorSource, /Modo captura/, 'Pizarra conserva el modo captura');
assert.match(boardEditorSource, /Conexiones tácticas/, 'Pizarra conserva el editor de conexiones');
assert.match(boardEditorSource, /addTacticalConnection/, 'Pizarra conserva la creación de conexiones');
assert.match(boardEditorSource, /removeTacticalConnection/, 'Pizarra conserva la eliminación de conexiones');
assert.doesNotMatch(
  boardEditorSource.slice(0, 120),
  /hidden/,
  'la visibilidad de Pizarra no depende de una colisión hidden/xl:contents'
);

assert.doesNotMatch(rivalSource, /Pizarra de partido|Modo captura|Conexiones tácticas|addTacticalConnection|removeTacticalConnection/);
assert.match(rivalSource, /Resumen del rival/, 'Rival comienza por su resumen');
assert.match(rivalSource, /<RivalTacticalAssistant/, 'el asistente sigue inmediatamente después del resumen');

const rivalRender = appSource.match(/facingSystemsView === 'RIVAL' \? \([\s\S]*?<RivalCollectiveAssistant[\s\S]*?\) : null}/)?.[0] || '';
assert.ok(rivalRender, 'Rival tiene un render exclusivo');
assert.doesNotMatch(rivalRender, /renderFacingSystemsOverview|tacticalConnectionDraft|Pizarra de partido/);

const modelBuild = appSource.match(/const rivalCollectiveModel = buildRivalCollectiveAssistant\(\{[\s\S]*?\n    \}\);/)?.[0] || '';
assert.match(modelBuild, /connections: confirmedTacticalConnections/, 'Rival recibe únicamente conexiones validadas como fuente de lectura');
assert.match(modelBuild, /plays: confirmedCollectiveAssistantPlays/, 'Rival recibe únicamente jugadas respaldadas por evidencias confirmadas');
assert.match(modelBuild, /evidences: \[\.\.\.evidences, \.\.\.individualRivalSignals\]/, 'Rival conserva las evidencias confirmadas y las señales del perfil individual');
assert.match(modelBuild, /tacticalEvidenceReport: confirmedTacticalEvidenceReport/, 'el informe automático también queda limitado a evidencias confirmadas');
assert.match(modelBuild, /videos: relatedRivalVideos/, 'Rival sigue recibiendo vídeo');
assert.match(modelBuild, /reports: String\(selectedMatch\.preRivalReportText/, 'Rival sigue recibiendo informes');

assert.match(
  appSource,
  /onClick=\{\(\) => requestFacingSystemsView\(view\)}/,
  'cambiar de pestaña solo cambia la vista y conserva el estado táctico'
);
assert.doesNotMatch(
  appSource,
  /onClick=\{\(\) => \{\s*(?:setFacingSystemsView|requestFacingSystemsView)\(view\);\s*(?:setTactical|resetDefensive|setSelectedTactical)/,
  'la navegación principal no reinicia jugada, fase, posiciones o conexiones'
);

assert.match(appSource, /destination === 'board:set_piece'[\s\S]*setTacticalGamePhase\('set_piece'\)[\s\S]*setFacingSystemsView\('PIZARRA'\)/);
assert.match(appSource, /destination === 'board:transition'[\s\S]*setTacticalGamePhase\('transition'\)[\s\S]*setFacingSystemsView\('PIZARRA'\)/);
assert.match(appSource, /destination === 'board:connections'[\s\S]*setTacticalConnectionFilter\('Todas'\)[\s\S]*setFacingSystemsView\('PIZARRA'\)/);
assert.match(appSource, /destination === 'evidences'[\s\S]*setFacingSystemsView\('EVIDENCIAS'\)/);
assert.match(appSource, /\['PIZARRA', 'RIVAL', 'JUGADORES', 'PLAN DE PARTIDO', 'EVIDENCIAS'\]/);

assert.doesNotMatch(
  appSource,
  /xl:contents \$\{facingSystemsView !== 'PIZARRA' \? 'hidden'/,
  'no queda la combinación responsive que reactivaba los editores en escritorio'
);

console.log('facingSystemsView tests: ok');
