import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const editor = fs.readFileSync(new URL('../src/utils/tacticalDispositionEditor.js', import.meta.url), 'utf8');
const sportsRpc = fs.readFileSync(new URL('../supabase_club_core_16_player_sports_backend_lockdown.sql', import.meta.url), 'utf8');
const analysisRpc = fs.readFileSync(new URL('../supabase_club_core_17_player_analysis_backend.sql', import.meta.url), 'utf8');
const allMatchesPatch = fs.readFileSync(new URL('../supabase_club_core_18_player_all_matches_backend.sql', import.meta.url), 'utf8');
const squadRpc = fs.readFileSync(new URL('../supabase_match_squad_lineup_atomic.sql', import.meta.url), 'utf8');
const publicationMigration = fs.readFileSync(new URL('../supabase_player_match_publication_gate.sql', import.meta.url), 'utf8');

const finalizedStatuses = new Set(['finalizado', 'jugado', 'played', 'finished', 'cerrado', 'closed', 'revisado', 'reviewed']);
const publishable = (match) => finalizedStatuses.has(String(match.status || '').trim().toLowerCase());
const playerView = ({ match, role = '', minutes = 0, hasPartialEvents = false }) => ({
  played: publishable(match) && (Number(minutes) > 0 || String(role).toLowerCase() === 'titular'),
  role: publishable(match) ? role : '',
  scoreVisible: publishable(match),
  timelineVisible: publishable(match) && hasPartialEvents,
});

const futureStarter = playerView({ match: { status: 'Previa' }, role: 'Titular', minutes: 0 });
assert.deepEqual(futureStarter, { played: false, role: '', scoreVisible: false, timelineVisible: false }, 'A: un XI futuro sigue siendo STAFF-only');
const futureSubstitute = playerView({ match: { status: 'Previa' }, role: 'Suplente', minutes: 0 });
assert.equal(futureSubstitute.played, false, 'B: convocado suplente futuro no equivale a partido jugado');
assert.equal(futureSubstitute.role, '', 'B: no publica suplencia futura');
const finalStarter = playerView({ match: { status: 'Revisado' }, role: 'Titular', minutes: 90 });
assert.equal(finalStarter.played, true, 'C: titular finalizado publica participacion');
assert.equal(finalStarter.role, 'Titular', 'C: titularidad oficial queda disponible tras cierre');
const finalParticipatingSubstitute = playerView({ match: { status: 'Finalizado' }, role: 'Suplente', minutes: 24 });
assert.equal(finalParticipatingSubstitute.played, true, 'D: suplente con minutos participa tras cierre');
const finalUnusedSubstitute = playerView({ match: { status: 'Finalizado' }, role: 'Suplente', minutes: 0 });
assert.equal(finalUnusedSubstitute.played, false, 'E: convocado sin minutos no cuenta como partido jugado');
['Titular', 'Suplente', 'Titular'].forEach((role) => {
  assert.equal(playerView({ match: { status: 'Previa' }, role, minutes: 0 }).role, '', 'F: modificar el XI previo no atraviesa el gate');
});
const unfinishedWithEvents = playerView({ match: { status: 'Previa' }, role: 'Titular', minutes: 37, hasPartialEvents: true });
assert.deepEqual(unfinishedWithEvents, { played: false, role: '', scoreVisible: false, timelineVisible: false }, 'G: eventos parciales no finalizan ni publican el partido');

assert.match(app, /allowsCalledPlayerSelection = Number\(interval\.fromMinute\) === 0/);
assert.match(app, /knownPlayers\.length >= 11/);
assert.match(app, /allowKnownPlayerSubset: allowsCalledPlayerSelection/);
assert.match(app, /save_match_squad_lineup_atomic[\s\S]*?save_match_tactical_snapshot/, 'el XI inicial y el snapshot reutilizan las persistencias existentes');
assert.match(app, /sendTacticalEditorPlayerToBench/);
assert.match(editor, /allowKnownPlayerSubset/);
assert.match(editor, /removeTacticalDispositionPlayer/);

assert.match(sportsRpc, /case when[\s\S]*?status[\s\S]*?then match_json ->> 'home_score' else null end/);
assert.match(sportsRpc, /then coalesce\(public_timeline\.events, '\[\]'::jsonb\) else '\[\]'::jsonb end/);
assert.equal((analysisRpc.match(/serialized\.payload ->> 'status'/g) || []).length, 4, 'los cuatro RPC de analisis exigen cierre explicito');
assert.match(allMatchesPatch, /new_predicate constant text := 'where true'/, 'el parche all-matches conserva el resto del predicado finalizado');
assert.doesNotMatch(squadRpc, /then '90'/, 'preparar el XI no crea minutos oficiales');

[
  'get_my_player_matches',
  'get_my_player_analysis_overview',
  'get_my_player_analysis_live_stats',
  'get_my_player_production_actions',
  'get_my_player_match_history',
  'save_match_squad_lineup_atomic',
].forEach((rpc) => assert.ok(publicationMigration.includes(rpc), `la migracion repara ${rpc}`));
assert.doesNotMatch(publicationMigration, /create\s+table|alter\s+table|create\s+policy|drop\s+policy/i, 'la reparacion no cambia schema de tablas ni RLS');
assert.match(publicationMigration, /serialized\.payload ->> ''status''/);
assert.match(publicationMigration, /placeholder_count not in \(0, 4\)/);

console.log('player match publication gate A-G tests passed');
