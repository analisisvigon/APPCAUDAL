import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const root = 'src/videoLab';
const sources = readdirSync(root)
  .filter((name) => /\.(jsx?|css|html)$/.test(name) && !name.endsWith('.test.js'))
  .map((name) => [name, readFileSync(`${root}/${name}`, 'utf8')]);
for (const [name, source] of sources) {
  assert.doesNotMatch(source, /(?:from|import\s*\()\s*['"][^'"]*(?:App|supabase|auth|sports\/)/i,
    `${name}: import ajeno al laboratorio`);
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage)\b/,
    `${name}: acceso de red o persistencia inesperado`);
  assert.doesNotMatch(source, /https?:\/\//i, `${name}: URL remota inesperada`);
}
const config = readFileSync('scripts/localVideoLab.mjs', 'utf8');
assert.match(config, /src\/videoLab/);
assert.match(config, /envDir: root/);
assert.doesNotMatch(config, /VitePWA|supabase|App\.jsx/);
assert.match(readFileSync(`${root}/VideoAnalysisLab.jsx`, 'utf8'), /URL\.revokeObjectURL/);
assert.match(readFileSync(`${root}/VideoAnalysisLab.jsx`, 'utf8'), /ResizeObserver/);
console.log('Video lab isolation: OK (sin aplicación principal, red ni persistencia remota).');
