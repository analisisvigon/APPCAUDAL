import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const panel = fs.readFileSync(new URL('../src/components/players/CaptainPriorityPanel.jsx', import.meta.url), 'utf8');
const matchPrint = fs.readFileSync(new URL('../src/components/print/MatchPrintTab.jsx', import.meta.url), 'utf8');
const shirt = fs.readFileSync(new URL('../src/components/print/PlayerShirt.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles/print.css', import.meta.url), 'utf8');
const captainStore = fs.readFileSync(new URL('../src/utils/captainPriorityStore.js', import.meta.url), 'utf8');

assert.match(app, /onClick=\{\(\) => setCaptainPanelOpen\(true\)\}[^]*CAPITANES/);
assert.match(panel, /role="dialog"[^]*Capitanes del equipo/);
assert.match(panel, /No hay capitanes configurados[^]*\+ Añadir capitán/);
assert.match(panel, /moveCaptainOrderId[^]*removeCaptainOrderId[^]*replaceCaptainOrderId/);
assert.match(panel, /player\.activeInSquad !== false/);
assert.match(panel, /player\?\.id && player\?\.membershipId/);
assert.match(panel, /sortRosterPlayers/);
assert.match(panel, /CaptainAvatar[^]*candidate\.number[^]*getPlayerDisplayName\(candidate\)/);
assert.equal((panel.match(/onSave\?\.\(/g) || []).length, 1, 'solo Guardar invoca la persistencia remota');
assert.match(panel, /if \(!result\?\.ok\) return/);
assert.match(panel, /error \? 'Reintentar' : 'Guardar'/);

const saveIndex = app.indexOf('await saveOwnCaptainPriorities(supabase, orderedPlayers)');
const reloadIndex = app.indexOf('await loadOwnCaptainPriorities(supabase, players)', saveIndex);
const successIndex = app.indexOf("setCaptainPriorityStatus('Orden de capitanes guardado en Supabase.')", reloadIndex);
assert.ok(saveIndex >= 0 && reloadIndex > saveIndex && successIndex > reloadIndex, 'Guardar usa RPC, recarga y solo entonces confirma éxito');
assert.match(app, /starterPlayerIds\.map[^]*Override ·/);
assert.match(app, /automatic_invalid_override[^]*none_invalid_override[^]*Volver a Automático/);
assert.match(matchPrint, /resolveMatchCaptain\(\{ match, players, captainPriorities \}\)/);
assert.equal((matchPrint.match(/captainPlayerId=\{printData\.captainPlayerId\}/g) || []).length, 2, 'preview/hoja y dossier usan el mismo capitán');
assert.match(shirt, /print-captain-badge[^]*>C</);
assert.match(css, /\.print-captain-badge\s*\{[^}]*border[^}]*background:\s*#fff[^}]*color:\s*#000/is);
assert.doesNotMatch(`${panel}\n${captainStore}`, /localStorage/i, 'el flujo de capitanes no crea fallback local');

console.log('captain UI audit passed');
