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
const matchesPlaceholderSource = fs.readFileSync(
  new URL('../src/components/player/PlayerMatchesPlaceholder.jsx', import.meta.url),
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
  analysisPanelSource,
  analysisStoreSource,
  analysisPresentationSource,
  matchesPlaceholderSource,
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
assert.equal(/\.from\s*\(/.test(analysisStoreSource), false, 'Mi análisis no consulta tablas deportivas');
assert.match(analysisStoreSource, /client\.rpc\(ANALYSIS_RPC\)/, 'Mi análisis usa su RPC propia sin identidad externa');
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
