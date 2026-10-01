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
assert.ok(getBarChartWidth({ categoryCount: 31 }) > getBarChartWidth({ categoryCount: 7 }), 'Muchos puntos amplÃ­an el lienzo para permitir scroll interno.');
assert.ok(getBarChartWidth({ categoryCount: 7, seriesCount: 3 }) > getBarChartWidth({ categoryCount: 7, seriesCount: 1 }), 'Las series agrupadas reservan espacio lado a lado.');

console.log('chartTheme: paleta, geometrÃ­a, NULL, cero y densidad validados.');
