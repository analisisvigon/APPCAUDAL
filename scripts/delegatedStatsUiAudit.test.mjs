import assert from 'node:assert/strict';
import fs from 'node:fs';

const component = fs.readFileSync(new URL('../src/components/delegated/DelegatedStatsDashboard.jsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

assert.match(component, /\['Resumen', 'Jugadores', 'Equipo', 'Evolución'\]/, 'expone las cuatro vistas solicitadas');
assert.match(component, /buildDelegatedStatsDataset/, 'todas las vistas parten del dataset central');
assert.match(component, /aggregateDelegatedSides|aggregateDelegatedStats/, 'la UI reutiliza el agregador central');
assert.match(component, /buildDelegatedPlayerRows/, 'la tabla individual usa la capa estadística');
assert.match(component, /buildDelegatedTemporalDistribution/, 'Equipo usa la distribución temporal central');
assert.match(component, /buildDelegatedEvolution/, 'Evolución usa la serie central');
assert.match(component, /Totales[\s\S]*Por 90/, 'incluye selector de totales y por90');
assert.match(component, /Sin datos suficientes del rival/, 'no representa ausencia rival como ceros confirmados');
assert.match(component, /hasUnprocessedValidatedMatch[\s\S]*sus eventos siguen pendientes/, 'explica el estado Validado heredado sin reviewed');
assert.doesNotMatch(component, /MVP|rating|nota automática|posesión|xG|xA/i, 'no inventa valoraciones ni métricas sin fuente');
assert.match(app, /<DelegatedStatsDashboard/, 'Registro Delegado monta el nuevo dashboard');
assert.match(app, /matchesWithDelegatedEvents = matches\.filter[\s\S]*visibleMatches = matchesWithDelegatedEvents[\s\S]*<DelegatedStatsDashboard[\s\S]*matches=\{visibleMatches\}/, 'el dashboard recibe los partidos con quickEvents cargados desde el estado principal');
assert.doesNotMatch(app, /renderDelegatedRegistrySectionLegacy/, 'no conserva dos implementaciones del panel');

console.log('delegated stats UI audit: ok');
