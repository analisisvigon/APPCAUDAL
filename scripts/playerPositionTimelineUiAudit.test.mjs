import assert from 'node:assert/strict';
import fs from 'node:fs';

const component = fs.readFileSync(new URL('../src/components/player/PlayerPositionUsageSummary.jsx', import.meta.url), 'utf8');
const matchSummary = fs.readFileSync(new URL('../src/components/player/PlayerMatchPositionSummary.jsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

assert.match(component, /initialOpenPosition = ''/);
assert.match(component, /useState\(initialOpenPosition\)/, 'todas las posiciones comienzan cerradas salvo una vista QA explícita');
assert.match(component, /onToggle\(isOpen \? '' : entry\.key\)/, 'solo una posición puede permanecer abierta');
assert.match(component, /getPositionTimelineMatches\(usage, entry\.key\)/, 'el detalle consume los tramos canónicos');
assert.match(component, /data-position-timeline-entry/);
assert.match(component, /data-position-timeline-details/);
assert.match(component, /match\.segments\.map/, 'un partido admite varios tramos sin fusionarlos');
assert.match(component, /segment\.system \|\| 'Sistema —'/, 'el sistema desconocido se muestra sin inferencias');
assert.match(component, /'Posición —'/, 'la posición desconocida permanece visible');
assert.match(component, /min-h-11/, 'los controles mantienen un target táctil suficiente');
assert.match(component, /flex-wrap/, 'los metadatos y tramos pueden apilarse en móvil');
assert.doesNotMatch(component, /overflow-x-auto/, 'el detalle por posición no introduce scroll horizontal propio');

assert.match(app, /'Pos\.\/Sist\.'/i, 'el historial incorpora la columna compacta');
assert.match(app, /playerPositionUsageByMatchId/, 'historial y resumen reutilizan la misma salida canónica');
assert.match(app, /data-player-match-position-summary/);
assert.match(app, /<PlayerMatchPositionSummary matchUsage=\{matchPositionUsage\}/);
assert.match(matchSummary, /buildMatchPositionSummary\(matchUsage\)/);
assert.match(matchSummary, /data-player-match-position-details/);
assert.match(matchSummary, /summary\.segments\.map/, 'el detalle del partido admite de dos a cuatro o más tramos');
assert.match(matchSummary, /<details className=/, 'la tabla no muestra todos los tramos abiertos');

console.log('player position timeline UI audit passed');
