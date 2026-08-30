import assert from 'node:assert/strict';
import fs from 'node:fs';

const playerSource = fs.readFileSync(new URL('../src/PlayerApp.jsx', import.meta.url), 'utf8');
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

for (const forbiddenImport of forbiddenPlayerImports) {
  assert.equal(playerSource.includes(forbiddenImport), false, `PlayerApp no debe importar ${forbiddenImport}`);
}

assert.equal(
  /from\s+['"][^'"]*lib\/supabase['"]/.test(playerSource),
  false,
  'PlayerApp no debe importar un cliente global; recibe el cliente autenticado del shell'
);
assert.equal(/\.from\s*\(/.test(playerSource), false, 'PlayerApp no debe consultar tablas directamente');
assert.deepEqual(
  [...playerSource.matchAll(/\.rpc\(\s*['"]([^'"]+)['"]/g)].map((match) => match[1]),
  ['get_my_player_profile'],
  'PlayerApp solo puede cargar el perfil mediante get_my_player_profile'
);
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

const frontendIdentitySources = `${playerSource}\n${shellSource}\n${resolverSource}`;
for (const forbiddenIdentity of ['Borja', '350615a9-b068-450a-b867-da30a59b9082', '9f715ffc-4d19-47cd-a17f-49b425ee92e0', '2e0146e9-e9fc-45ad-b055-edc138a85f7e']) {
  assert.equal(frontendIdentitySources.includes(forbiddenIdentity), false, `no debe hardcodearse ${forbiddenIdentity}`);
}

console.log('PlayerApp isolation audit: OK');
