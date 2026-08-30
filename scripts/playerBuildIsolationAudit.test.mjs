import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(projectRoot, 'dist', 'assets');
const serviceWorkerPath = path.join(projectRoot, 'dist', 'sw.js');

assert.equal(fs.existsSync(serviceWorkerPath), true, 'Ejecuta npm run build antes de esta auditoría.');
const assetNames = fs.readdirSync(assetsDir);
const entryName = assetNames.find((name) => /^index-[\w-]+\.js$/.test(name));
const staffChunkName = assetNames.find((name) => /^App-[\w-]+\.js$/.test(name));
assert.ok(entryName, 'Debe existir el entry principal.');
assert.ok(staffChunkName, 'Debe existir un chunk STAFF separado.');

const entry = fs.readFileSync(path.join(assetsDir, entryName), 'utf8');
const serviceWorker = fs.readFileSync(serviceWorkerPath, 'utf8');
assert.match(
  entry,
  new RegExp(`import\\(["']\\./${staffChunkName.replaceAll('.', '\\.')}`),
  'El entry debe cargar App STAFF mediante import() dinámico.',
);
assert.doesNotMatch(
  serviceWorker,
  /\{url:"assets\/App-/,
  'El precache PLAYER no debe descargar el chunk ni el CSS de App STAFF.',
);
assert.match(serviceWorker, /appcaudal-staff-on-demand/);

console.log(`Player build isolation: ${staffChunkName} es dinámico y no está en precache.`);
