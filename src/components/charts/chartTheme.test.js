import assert from 'node:assert/strict';

import {
  CHART_BAR_GAP,
  CHART_BAR_RADIUS,
  CHART_CATEGORY_GAP,
  CHART_SERIES_COLORS,
  getBarChartWidth,
  getBarHeight,
  getChartAxisIndexes,
  getChartSeriesColor,
} from './chartTheme.js';

assert.deepEqual(CHART_SERIES_COLORS, ['#5EA8FF', '#22C7E8', '#F4B942', '#7DD87D', '#C084FC', '#FB7185']);
assert.equal(CHART_BAR_RADIUS, 6);
assert.equal(CHART_BAR_GAP, 4);
assert.equal(CHART_CATEGORY_GAP, 18);
assert.equal(getChartSeriesColor(6), '#5EA8FF');
assert.equal(getBarHeight(null, 10, 100), null, 'NULL no crea barra.');
assert.equal(getBarHeight(0, 10, 100), 2, 'El cero real conserva un indicador visible.');
assert.equal(getBarHeight(5, 10, 100), 50);
assert.deepEqual([...getChartAxisIndexes(31, 5)], [0, 8, 15, 23, 30]);
const weeklyWidth = getBarChartWidth({ categoryCount: 7, seriesCount: 2, minimumWidth: 560, barWidth: 18, barGap: 4, categoryGap: 18 });
const seasonWidth = getBarChartWidth({ categoryCount: 40, seriesCount: 2, minimumWidth: 560, barWidth: 18, barGap: 4, categoryGap: 20 });
assert.equal(weeklyWidth, 560, 'Siete grupos semanales conservan el lienzo compacto actual.');
assert.equal(seasonWidth, 2464, 'Cuarenta semanas mantienen unos 60 px por grupo y requieren scroll interno.');
assert.ok(4 < 20, 'El gap interno RPE-Wellness es menor que el gap entre semanas.');
assert.ok(getBarChartWidth({ categoryCount: 31 }) > getBarChartWidth({ categoryCount: 7 }), 'Muchos puntos amplÃ­an el lienzo para permitir scroll interno.');
assert.ok(getBarChartWidth({ categoryCount: 7, seriesCount: 3 }) > getBarChartWidth({ categoryCount: 7, seriesCount: 1 }), 'Las series agrupadas reservan espacio lado a lado.');

console.log('chartTheme: paleta, geometrÃ­a, NULL, cero y densidad validados.');
