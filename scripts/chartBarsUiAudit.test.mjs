import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relativePath) => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const theme = read('src/components/charts/chartTheme.js');
const app = read('src/App.jsx');
const load = read('src/components/performance/LoadEvolutionSection.jsx');
const playerMini = read('src/components/player/PlayerLineChart.jsx');
const playerTrend = read('src/components/player/PlayerPerformanceTrendChart.jsx');
const delegated = read('src/components/delegated/DelegatedStatsDashboard.jsx');
const matchEvolution = read('src/components/player/PlayerAnalysisMatchEvolution.jsx');

for (const color of ['#5EA8FF', '#22C7E8', '#F4B942', '#7DD87D', '#C084FC', '#FB7185']) {
  assert.match(theme, new RegExp(color), `La paleta incluye ${color}.`);
}
assert.match(theme, /CHART_BAR_RADIUS = 6/);
assert.match(theme, /CHART_BAR_GAP = 4/);
assert.match(theme, /CHART_CATEGORY_GAP = 18/);
assert.match(theme, /value === null \|\| value === undefined[\s\S]*return null/, 'NULL no se convierte en cero.');
assert.match(theme, /Number\(value\) === 0[\s\S]*return zeroHeight/, 'El cero real conserva representación.');

for (const [name, source] of [
  ['carga', load],
  ['mini PLAYER', playerMini],
  ['evolución PLAYER', playerTrend],
  ['evolución delegada', delegated.slice(delegated.indexOf('function EvolutionBarChart'))],
]) {
  assert.match(source, /<rect/, `${name} renderiza barras SVG.`);
  assert.doesNotMatch(source, /<polyline|<polygon/, `${name} ya no renderiza líneas o áreas.`);
}

const performanceChart = app.slice(app.indexOf('const PerformanceEvolutionChart'), app.indexOf('const PlayerIdentity'));
assert.match(performanceChart, /CHART_SERIES_COLORS\[0\]/);
assert.match(performanceChart, /CHART_SERIES_COLORS\[1\]/);
assert.match(performanceChart, /CHART_BAR_GAP/);
assert.doesNotMatch(performanceChart, /<polyline|<polygon|<circle/);
assert.match(load, /overflow-x-auto/);
assert.match(load, /minWidth: `\$\{width\}px`/);
assert.match(delegated, /overflow-x-auto[\s\S]*minWidth: `\$\{width\}px`/);
assert.match(matchEvolution, /barHeight = value === null \? null : value === 0 \? 2/);
assert.match(matchEvolution, /numericA !== null/);
assert.match(matchEvolution, /numericB !== null/);
assert.match(matchEvolution, /bg-\[#5EA8FF\]/);
assert.match(matchEvolution, /bg-\[#22C7E8\]/);

console.log('chartBarsUiAudit: barras, agrupación, paleta, responsive, NULL y cero validados.');
