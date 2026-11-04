import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(name, 'utf8').replaceAll('\r\n', '\n');
const md5 = (body) => createHash('md5').update(body).digest('hex');
const body = (sql, tag) => {
  const match = sql.match(new RegExp(`as \\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$`, 'i'));
  assert.ok(match, `Cuerpo ${tag} ausente`);
  return match[1];
};

const oldMutator = body(read('supabase_club_core_31_patch_materialize_operation.sql'), 'function');
const oldReader = body(read('supabase_club_core_31_canonical_substitutions.sql'), 'function');
const migration = read('supabase_video_analysis_01a_substitution_rpc_cts.sql');
const newMutator = body(migration, 'function');
const newReader = body(migration, 'read_function');
const oldGuard = "  if not public.is_app_staff() then\n    raise exception 'SUBSTITUTION_STAFF_REQUIRED' using errcode = '42501';\n  end if;\n";
const newGuard = "  if auth.uid() is null then\n    raise exception 'SUBSTITUTION_STAFF_REQUIRED' using errcode = '42501';\n  end if;\n";
const newWriteCheck = "  if public.can_write_match(p_partido_id) is not true then\n    raise exception 'SUBSTITUTION_MATCH_WRITE_FORBIDDEN' using errcode = '42501';\n  end if;\n";
const newReadCheck = "  if public.can_read_match(p_partido_id) is not true then\n    raise exception 'SUBSTITUTION_MATCH_READ_FORBIDDEN' using errcode = '42501';\n  end if;\n";

assert.ok(newMutator.includes(newGuard) && newMutator.includes(newWriteCheck));
assert.ok(newReader.includes(newGuard) && newReader.includes(newReadCheck));
assert.equal(newMutator.replace(newGuard, oldGuard).replace(newWriteCheck, ''), oldMutator,
  'El mutador cambio fuera de la autorizacion');
assert.equal(newReader.replace(newGuard, oldGuard).replace(newReadCheck, ''), oldReader,
  'La consulta cambio fuera de la autorizacion');
assert.equal(md5(newMutator), '745bd5f2d80cef1815a33698d30b2f2b');
assert.equal(md5(newReader), '5abccd5fdb69b1476268d72a1a2b3180');

for (const command of ['select', 'insert', 'update', 'delete']) {
  assert.match(migration, new RegExp(`alter policy player_sports_staff_${command} on public\\.partido_estadisticas_jugador`, 'i'));
}
const cutover = read('supabase_video_analysis_01_match_rls_cutover.sql');
assert.match(cutover, /policies directas de estadisticas no protegidas por 01A/i);
assert.match(cutover, /745bd5f2d80cef1815a33698d30b2f2b/);
console.log('Videoanalisis 01A: cuerpos conservados salvo autorizacion y corte dependiente verificado.');
