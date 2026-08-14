import assert from 'node:assert/strict';
import fs from 'node:fs';

const component = fs.readFileSync(new URL('../src/components/delegated/DelegatedStatsDashboard.jsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

assert.match(component, /\['Resumen', 'Jugadores', 'Equipo', 'Evolución'\]/, 'expone las cuatro vistas solicitadas');
assert.match(component, /buildDelegatedStatsDataset/, 'todas las vistas parten del dataset central');
assert.match(component, /aggregateDelegatedSides|buildDelegatedTeamProfile/, 'la UI reutiliza los agregadores centrales');
assert.match(component, /buildDelegatedPlayerRows/, 'la tabla individual usa la capa estadística');
assert.match(component, /buildDelegatedTemporalDistribution/, 'Equipo usa la distribución temporal central');
assert.match(component, /buildDelegatedTemporalMatrix/, 'Equipo usa la matriz temporal central');
assert.match(component, /buildDelegatedHalfComparison/, 'Equipo compara primera y segunda parte');
assert.match(component, /buildDelegatedContextComparison/, 'Equipo compara contextos reales');
assert.match(component, /buildDelegatedEvolution/, 'Evolución usa la serie central');
assert.match(component, /"Total"[\s\S]*"Media\/partido"[\s\S]*"Por90"/, 'incluye Total, Media/partido y Por90');
assert.match(component, /useState\('average'\)/, 'Media/partido es la vista predeterminada de jugadores');
assert.match(component, /<EvolutionLineChart/, 'Evolución utiliza un gráfico de línea');
assert.match(component, /lineSegments/, 'el gráfico no une huecos sin muestra como si existieran datos');
assert.match(component, /Media móvil 5|media móvil de 5/i, 'muestra la media móvil de cinco partidos');
assert.match(component, /Lecturas de los datos/, 'incluye lecturas estadísticas deterministas');
assert.match(component, /Local \/ Visitante[\s\S]*Victoria \/ Empate \/ Derrota[\s\S]*Liga \/ Otras/, 'expone comparaciones contextuales');
assert.match(component, /disabled=\{Boolean\(filters\.playerId\)\}/, 'evita combinar un jugador propio con el filtro rival');
assert.match(component, /Sin datos suficientes del rival/, 'no representa ausencia rival como ceros confirmados');
assert.match(component, /hasUnprocessedValidatedMatch[\s\S]*sus eventos siguen pendientes/, 'explica el estado Validado heredado sin reviewed');
assert.doesNotMatch(component, /MVP|rating|nota automática|posesión|xG|xA/i, 'no inventa valoraciones ni métricas sin fuente');
assert.match(app, /<DelegatedStatsDashboard/, 'Registro Delegado monta el nuevo dashboard');
assert.match(app, /matchesWithDelegatedEvents = matches\.filter[\s\S]*visibleMatches = matchesWithDelegatedEvents[\s\S]*<DelegatedStatsDashboard[\s\S]*matches=\{visibleMatches\}/, 'el dashboard recibe los partidos con quickEvents cargados desde el estado principal');
assert.doesNotMatch(app, /renderDelegatedRegistrySectionLegacy/, 'no conserva dos implementaciones del panel');

console.log('delegated stats UI audit: ok');
