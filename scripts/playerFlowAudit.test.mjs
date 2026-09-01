import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(projectRoot, 'src');
const entryFile = path.join(sourceRoot, 'main.jsx');
const visited = new Set();

const resolveLocalImport = (importer, specifier) => {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(importer), specifier);
  const candidates = [
    base,
    `${base}.js`,
    `${base}.jsx`,
    path.join(base, 'index.js'),
    path.join(base, 'index.jsx'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
};

const visitStaticImports = (filePath) => {
  const normalizedPath = path.normalize(filePath);
  if (visited.has(normalizedPath)) return;
  visited.add(normalizedPath);
  const source = fs.readFileSync(normalizedPath, 'utf8');
  const specifiers = [
    ...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g),
    ...source.matchAll(/\bimport\s+['"]([^'"]+)['"]/g),
  ].map((match) => match[1]);
  specifiers.forEach((specifier) => {
    const resolved = resolveLocalImport(normalizedPath, specifier);
    if (resolved) visitStaticImports(resolved);
  });
};

visitStaticImports(entryFile);
const relativeFiles = [...visited]
  .map((filePath) => path.relative(projectRoot, filePath).replaceAll('\\', '/'))
  .sort();

assert.equal(relativeFiles.includes('src/App.jsx'), false, 'App.jsx STAFF no pertenece al grafo estático del entry.');
for (const forbiddenPath of [
  'globalPlayerStore',
  'rivalScoutingStore',
  'performanceLoadStore',
  'authenticatedDataLoad',
  'captainPriorityStore',
]) {
  assert.equal(
    relativeFiles.some((filePath) => filePath.includes(forbiddenPath)),
    false,
    `${forbiddenPath} no debe llegar al entry PLAYER mediante imports indirectos.`,
  );
}

for (const requiredPath of [
  'src/AppAuthShell.jsx',
  'src/PlayerApp.jsx',
  'src/auth/resolveAppIdentity.js',
  'src/components/player/PlayerPerformancePanel.jsx',
  'src/data/playerPerformanceStore.js',
  'src/components/player/PlayerAnalysisPanel.jsx',
  'src/components/player/PlayerAnalysisProduction.jsx',
  'src/components/player/PlayerAnalysisHistory.jsx',
  'src/components/player/PlayerAnalysisZoneMap.jsx',
  'src/data/playerAnalysisStore.js',
  'src/utils/playerAnalysisPresentation.js',
  'src/components/player/PlayerMatchesPanel.jsx',
  'src/data/playerMatchesStore.js',
  'src/utils/playerMatchesPresentation.js',
]) {
  assert.equal(relativeFiles.includes(requiredPath), true, `${requiredPath} debe formar parte del flujo PLAYER.`);
}

const shell = fs.readFileSync(path.join(sourceRoot, 'AppAuthShell.jsx'), 'utf8');
const resolver = fs.readFileSync(path.join(sourceRoot, 'auth', 'resolveAppIdentity.js'), 'utf8');
const playerApp = fs.readFileSync(path.join(sourceRoot, 'PlayerApp.jsx'), 'utf8');
const performanceStore = fs.readFileSync(path.join(sourceRoot, 'data', 'playerPerformanceStore.js'), 'utf8');
const analysisStore = fs.readFileSync(path.join(sourceRoot, 'data', 'playerAnalysisStore.js'), 'utf8');
const matchesStore = fs.readFileSync(path.join(sourceRoot, 'data', 'playerMatchesStore.js'), 'utf8');
assert.match(shell, /const StaffApp = lazy\(\(\) => import\('\.\/App'\)\);/);
assert.match(shell, /auth\.signInWithPassword\(/, 'El flujo empieza en Supabase Auth con email/password.');
assert.match(resolver, /client\.rpc\('current_membership'\)/, 'La identidad se resuelve con current_membership().');
assert.match(shell, /authState\.status === 'player'[\s\S]*?<PlayerApp/);
assert.match(shell, /authState\.status === 'staff'[\s\S]*?<StaffApp/);
assert.match(playerApp, /client\.rpc\('get_my_player_profile'\)/, 'PlayerApp resuelve únicamente el perfil propio.');
assert.match(analysisStore, /client\.rpc\(rpcName, payload\)/, 'Mi análisis usa exclusivamente su ejecutor RPC seguro.');
for (const rpc of [
  'get_my_player_analysis_overview',
  'get_my_player_analysis_live_stats',
  'get_my_player_production_actions',
  'get_my_player_match_history',
]) assert.match(analysisStore, new RegExp(rpc));
assert.doesNotMatch(analysisStore, /get_my_player_analysis_summary/);
assert.doesNotMatch(analysisStore, /\.from\s*\(/);
assert.match(matchesStore, /client\.rpc\(PLAYER_MATCHES_RPC\)/, 'Partidos termina en get_my_player_matches() sin payload.');
assert.match(matchesStore, /PLAYER_MATCHES_RPC = 'get_my_player_matches'/);
assert.doesNotMatch(matchesStore, /\.from\s*\(/);
assert.deepEqual(
  [...performanceStore.matchAll(/^\s*['"](wellness_entries|rpe_entries)['"],$/gm)].map((match) => match[1]),
  ['wellness_entries', 'rpe_entries'],
  'El final del flujo consulta exclusivamente Wellness/RPE.',
);
assert.match(shell, /auth\.signOut\(\)/, 'Logout vuelve a Supabase Auth.');
assert.ok(
  shell.indexOf("authState.status === 'player'") < shell.indexOf("authState.status === 'staff'"),
  'Las ramas son mutuamente excluyentes y PLAYER retorna antes de montar STAFF.',
);

console.log(`Player flow audit: ${relativeFiles.length} módulos estáticos seguros; App.jsx permanece dinámico.`);
