import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const preview = read('../src/components/calendar/MicrocyclePlanningPreview.jsx');
const sessions = read('../src/components/training/PlannedSessionsSection.jsx');
const store = read('../src/data/plannedSessionsStore.js');
const migration = read('../supabase_microcycles_2b.sql');
const verification = read('../supabase_microcycles_2b_verify.sql');

assert.match(preview, /Guardar \(pendiente de backend\)/);
assert.match(preview, /button type="button" disabled/);
assert.doesNotMatch(preview, /\.rpc\(|\.from\(|localStorage/);
assert.match(sessions, /Eliminar sesión/);
assert.match(sessions, /role="dialog" aria-modal="true"/);
assert.match(sessions, /Eliminación pendiente: el backend actual la prohíbe/);
assert.match(sessions, /button type="button" disabled className=\{`\$\{button\} bg-red-700/);
assert.doesNotMatch(store, /\.delete\(\)/);
assert.match(migration, /unique \(club_team_season_id,week_starts_on\)/);
assert.match(migration, /can_write_club_team_season/);
assert.match(migration, /for update of se/);
assert.match(migration, /revoke all on table public\.planned_microcycles/);
assert.match(migration, /grant execute on function public\.save_planned_microcycle_2b/);
assert.match(verification, /Solo estructura; faltan pruebas con identidades/);
console.log('microcycles 2B: comprobaciones estáticas de seguridad OK');
