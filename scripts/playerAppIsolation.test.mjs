import assert from 'node:assert/strict';
import fs from 'node:fs';

const playerSource = fs.readFileSync(new URL('../src/PlayerApp.jsx', import.meta.url), 'utf8');
const performancePanelSource = fs.readFileSync(
  new URL('../src/components/player/PlayerPerformancePanel.jsx', import.meta.url),
  'utf8',
);
const playerHeaderSource = fs.readFileSync(
  new URL('../src/components/player/PlayerHeader.jsx', import.meta.url),
  'utf8',
);
const playerNavigationSource = fs.readFileSync(
  new URL('../src/components/player/PlayerNavigation.jsx', import.meta.url),
  'utf8',
);
const playerChartSource = fs.readFileSync(
  new URL('../src/components/player/PlayerLineChart.jsx', import.meta.url),
  'utf8',
);
const performanceStoreSource = fs.readFileSync(
  new URL('../src/data/playerPerformanceStore.js', import.meta.url),
  'utf8',
);
const homeDashboardSource = fs.readFileSync(
  new URL('../src/components/player/PlayerHomeDashboard.jsx', import.meta.url),
  'utf8',
);
const homeStoreSource = fs.readFileSync(
  new URL('../src/data/playerHomeStore.js', import.meta.url),
  'utf8',
);
const homePresentationSource = fs.readFileSync(
  new URL('../src/utils/playerHomePresentation.js', import.meta.url),
  'utf8',
);
const analysisPanelSource = fs.readFileSync(
  new URL('../src/components/player/PlayerAnalysisPanel.jsx', import.meta.url),
  'utf8',
);
const analysisStoreSource = fs.readFileSync(
  new URL('../src/data/playerAnalysisStore.js', import.meta.url),
  'utf8',
);
const analysisPresentationSource = fs.readFileSync(
  new URL('../src/utils/playerAnalysisPresentation.js', import.meta.url),
  'utf8',
);
const analysisProductionSource = fs.readFileSync(
  new URL('../src/components/player/PlayerAnalysisProduction.jsx', import.meta.url),
  'utf8',
);
const analysisHistorySource = fs.readFileSync(
  new URL('../src/components/player/PlayerAnalysisHistory.jsx', import.meta.url),
  'utf8',
);
const analysisZoneMapSource = fs.readFileSync(
  new URL('../src/components/player/PlayerAnalysisZoneMap.jsx', import.meta.url),
  'utf8',
);
const matchesPanelSource = fs.readFileSync(
  new URL('../src/components/player/PlayerMatchesPanel.jsx', import.meta.url),
  'utf8',
);
const matchesStoreSource = fs.readFileSync(
  new URL('../src/data/playerMatchesStore.js', import.meta.url),
  'utf8',
);
const matchesPresentationSource = fs.readFileSync(
  new URL('../src/utils/playerMatchesPresentation.js', import.meta.url),
  'utf8',
);
const shellSource = fs.readFileSync(new URL('../src/AppAuthShell.jsx', import.meta.url), 'utf8');
const resolverSource = fs.readFileSync(new URL('../src/auth/resolveAppIdentity.js', import.meta.url), 'utf8');

const forbiddenPlayerImports = [
  './App',
  'globalPlayerStore',
  'rivalScoutingStore',
  'captainPriorityStore',
  'playerAvailability',
  'performanceLoadStore',
  'authenticatedDataLoad',
];

const playerBranchSource = [
  playerSource,
  performancePanelSource,
  playerHeaderSource,
  playerNavigationSource,
  playerChartSource,
  performanceStoreSource,
  homeDashboardSource,
  homeStoreSource,
  homePresentationSource,
  analysisPanelSource,
  analysisStoreSource,
  analysisPresentationSource,
  analysisProductionSource,
  analysisHistorySource,
  analysisZoneMapSource,
  matchesPanelSource,
  matchesStoreSource,
  matchesPresentationSource,
].join('\n');
for (const forbiddenImport of forbiddenPlayerImports) {
  assert.equal(playerBranchSource.includes(forbiddenImport), false, `El branch PLAYER no debe importar ${forbiddenImport}`);
}

assert.equal(
  /from\s+['"][^'"]*lib\/supabase['"]/.test(playerSource),
  false,
  'PlayerApp no debe importar un cliente global; recibe el cliente autenticado del shell'
);
assert.equal(/\.from\s*\(/.test(playerSource), false, 'PlayerApp no debe consultar tablas directamente');
assert.equal(/\.from\s*\(/.test(performancePanelSource), false, 'la UI de rendimiento delega sus consultas en el loader PLAYER');
assert.equal(/\.from\s*\(/.test(homeDashboardSource), false, 'Inicio delega todas sus consultas en stores PLAYER');
assert.doesNotMatch(homeStoreSource, /p_(?:jugador|user|membership|player)_id/i, 'Inicio no recibe identidad externa');
assert.doesNotMatch(homeDashboardSource, /PlayerLineChart|PlayerPerformanceTrendChart|getJugadores|loadPlayerProfileData/);
assert.equal(/\.from\s*\(/.test(analysisStoreSource), false, 'Mi análisis no consulta tablas deportivas');
assert.equal(/\.from\s*\(/.test(matchesStoreSource), false, 'Partidos PLAYER no consulta tablas deportivas');
assert.match(matchesStoreSource, /client\.rpc\(PLAYER_MATCHES_RPC\)/, 'Partidos usa exclusivamente su RPC sin identidad externa');
assert.match(matchesStoreSource, /PLAYER_MATCHES_RPC = 'get_my_player_matches'/);
assert.doesNotMatch(matchesStoreSource, /p_(?:jugador|user|club|partido)_id/i);
assert.match(analysisStoreSource, /client\.rpc\(rpcName, payload\)/, 'Mi análisis usa un ejecutor RPC PLAYER sin identidad externa');
assert.deepEqual(
  [...analysisStoreSource.matchAll(/^\s*(?:overview|live|production|history): '([^']+)'/gm)].map((match) => match[1]),
  ['get_my_player_analysis_overview', 'get_my_player_analysis_live_stats', 'get_my_player_production_actions', 'get_my_player_match_history'],
  'Mi análisis solo usa las cuatro RPC PLAYER ricas.',
);
assert.doesNotMatch(analysisStoreSource, /p_(?:jugador|user|membership|player)_id/i);
assert.deepEqual(
  [...playerSource.matchAll(/\.rpc\(\s*['"]([^'"]+)['"]/g)].map((match) => match[1]),
  ['get_my_player_profile'],
  'PlayerApp solo puede cargar el perfil mediante get_my_player_profile'
);
assert.match(playerHeaderSource, /profile\?\.player_position/, 'La cabecera consume player_position del RPC');
assert.doesNotMatch(playerBranchSource, /profile\?\.position/, 'PLAYER no depende del nombre conflictivo position');
assert.equal(/\.from\s*\(/.test(shellSource), false, 'el shell no debe consultar tablas antes del branch');
assert.equal(/\.rpc\s*\(/.test(shellSource), false, 'el shell delega la única RPC al resolver de identidad');
assert.equal(/\.from\s*\(/.test(resolverSource), false, 'el resolver no debe consultar tablas');
assert.deepEqual(
  [...resolverSource.matchAll(/\.rpc\(\s*['"]([^'"]+)['"]/g)].map((match) => match[1]),
  ['current_membership'],
  'current_membership debe ser la única RPC previa al branch'
);
assert.match(shellSource, /lazy\(\(\) => import\('\.\/App'\)\)/, 'StaffApp debe cargarse de forma diferida');
assert.match(
  shellSource,
  /<PlayerApp\s+client=\{supabase\}/,
  'el shell entrega al branch PLAYER el cliente autenticado ya existente'
);

const frontendIdentitySources = `${playerBranchSource}\n${shellSource}\n${resolverSource}`;
for (const forbiddenIdentity of [
  'Borja',
  '350615a9-b068-450a-b867-da30a59b9082',
  '9f715ffc-4d19-47cd-a17f-49b425ee92e0',
  '2e0146e9-e9fc-45ad-b055-edc138a85f7e',
  'Jairo',
  'f7f5aaeb-e82b-4e6b-8920-694bc32cb6c7',
]) {
  assert.equal(frontendIdentitySources.includes(forbiddenIdentity), false, `no debe hardcodearse ${forbiddenIdentity}`);
}

console.log('PlayerApp isolation audit: OK');
