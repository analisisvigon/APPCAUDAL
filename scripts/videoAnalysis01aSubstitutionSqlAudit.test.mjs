import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(name, 'utf8').replaceAll('\r\n', '\n');
const md5 = (body) => createHash('md5').update(body).digest('hex');
const sourceBody = (sql, tag) => {
  const match = sql.match(new RegExp(`as \\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$`, 'i'));
  assert.ok(match, `Cuerpo ${tag} ausente`);
  return match[1];
};

const oldGuard = "  if not public.is_app_staff() then\n    raise exception 'SUBSTITUTION_STAFF_REQUIRED' using errcode = '42501';\n  end if;";
const deployedGuard = (access) =>
  `  if not public.can_${access}_match(p_partido_id) then\n` +
  "    raise exception 'SUBSTITUTION_STAFF_REQUIRED' using errcode = '42501';\n  end if;";

const cases = [
  {
    file: 'supabase_club_core_31_patch_materialize_operation.sql',
    access: 'write',
    hash: '97269e30607ddad0a54900f1b05f5f63',
  },
  {
    file: 'supabase_club_core_31_canonical_substitutions.sql',
    access: 'read',
    hash: 'f86960348fed755eecee4315b75858b8',
  },
];

for (const { file, access, hash } of cases) {
  const original = sourceBody(read(file), 'function');
  assert.equal(original.split(oldGuard).length, 2, `${file}: guard original inesperado`);
  const reconstructed = original.replace(oldGuard, deployedGuard(access));
  assert.equal(md5(reconstructed), hash,
    `${access}: el cuerpo desplegado no coincide con un unico cambio de guard`);
}

const migration = read('supabase_video_analysis_01a_substitution_rpc_cts.sql');
const verifier = read('supabase_video_analysis_01a_substitution_rpc_cts_verify.sql');
const cutover = read('supabase_video_analysis_01_match_rls_cutover.sql');
const cutoverVerifier = read('supabase_video_analysis_01_match_rls_verify.sql');
assert.doesNotMatch(migration, /create\s+(or\s+replace\s+)?function\s+public\./i,
  '01A no debe sustituir funciones ya seguras');
for (const { hash } of cases) {
  for (const [name, sql] of [['01A', migration], ['verificador 01A', verifier],
    ['corte 01', cutover], ['verificador 01', cutoverVerifier]]) {
    assert.ok(sql.includes(hash), `${name}: falta la huella verificada ${hash}`);
  }
}
for (const command of ['select', 'insert', 'update', 'delete']) {
  assert.match(migration,
    new RegExp(`alter policy player_sports_staff_${command} on public\\.partido_estadisticas_jugador`, 'i'));
}
assert.match(migration,
  /alter policy substitution_staff_select on public\.partido_eventos_sustitucion/i);
assert.match(cutover, /policies directas de estadisticas no protegidas por 01A/i);
console.log('Videoanalisis 01A: cuerpos desplegados reconstruidos y conservados; policies hijas y corte verificados.');
