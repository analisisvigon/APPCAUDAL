// Ensayo manual con usuarios ficticios. No importar en la aplicacion.
// Puede alterar filas ficticias si la proteccion falla; usar un proyecto
// Supabase de ENSAYO desechable y volver a sembrarlo tras cualquier fallo.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from 'vite';

const env = loadEnv('staging', process.cwd(), 'VITE_');
const stagingRef = env.VITE_STAGING_PROJECT_REF?.trim();
const productionRef = env.VITE_PRODUCTION_PROJECT_REF?.trim();
const url = env.VITE_SUPABASE_URL?.trim();
const localEnv = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '';
const localUrl = localEnv.split(/\r?\n/).find((line) => /^VITE_SUPABASE_URL\s*=/.test(line))
  ?.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
if (process.env.T02_STAGING_ACK !== 'SOLO_ENSAYO_FICTICIO'
  || !/^[a-z0-9]{20}$/.test(stagingRef || '')
  || !/^[a-z0-9]{20}$/.test(productionRef || '')
  || stagingRef === productionRef || url !== `https://${stagingRef}.supabase.co`
  || !env.VITE_SUPABASE_ANON_KEY || (localUrl && localUrl === url)) {
  throw new Error('Ensayo bloqueado: proyecto, referencia o confirmacion incompatibles.');
}

const required = ['T02_ACTIVE_CTS_ID','T02_ARCHIVE_CTS_ID',
  'T02_ARCHIVE_JUGADOR_ID','T02_ARCHIVE_PARTIDO_ID',
  'T02_ARCHIVE_CHILD_IDS_JSON',
  'T02_OWNER_EMAIL','T02_OWNER_PASSWORD',
  'T02_ARCHIVE_STAFF_EMAIL','T02_ARCHIVE_STAFF_PASSWORD',
  'T02_NO_ACCESS_EMAIL','T02_NO_ACCESS_PASSWORD',
  'T02_PLAYER_EMAIL','T02_PLAYER_PASSWORD'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`Falta variable ficticia ${name}.`);
}
const activeId = process.env.T02_ACTIVE_CTS_ID;
const archiveId = process.env.T02_ARCHIVE_CTS_ID;
assert.notEqual(activeId, archiveId);
const childTables = [
  'partido_estadisticas_jugador','partido_eventos_gol','match_quick_events',
  'partido_alineacion_slots','partido_eventos_sistema',
  'partido_snapshots_tacticos','partido_snapshot_tactico_slots',
  'partido_eventos_post','partido_convocados',
  'partido_notas_individuales_pre','partido_eventos_sustitucion',
  'match_set_piece_takers','match_set_piece_notes','match_set_piece_diagrams',
];
const childIds = JSON.parse(process.env.T02_ARCHIVE_CHILD_IDS_JSON);
for (const table of childTables) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    .test(childIds[table] || '')) {
    throw new Error(`Falta UUID ficticio de ${table} en T02_ARCHIVE_CHILD_IDS_JSON.`);
  }
}

const login = async (label, email, password) => {
  const client = createClient(url, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`${label}: inicio de sesion fallido.`);
  return client;
};
const owner = await login('owner', process.env.T02_OWNER_EMAIL, process.env.T02_OWNER_PASSWORD);
const archiveStaff = await login('archive staff', process.env.T02_ARCHIVE_STAFF_EMAIL,
  process.env.T02_ARCHIVE_STAFF_PASSWORD);
const noAccess = await login('sin acceso', process.env.T02_NO_ACCESS_EMAIL,
  process.env.T02_NO_ACCESS_PASSWORD);
const player = await login('PLAYER', process.env.T02_PLAYER_EMAIL, process.env.T02_PLAYER_PASSWORD);

const markerWrite = await owner.from('operational_guard_versions_v1')
  .insert({ version: 1 }).select('version');
assert.equal(markerWrite.data?.length || 0, 0,
  'El owner pudo instalar directamente el marcador de activacion');
assert.equal(markerWrite.error?.code, '42501',
  'El marcador fallo por otro motivo: revisar ACL/RLS');
const registryWrite = await owner.from('operational_cts_v1')
  .update({ writes_enabled: true }).eq('singleton', true).select('singleton');
assert.equal(registryWrite.data?.length || 0, 0,
  'El owner pudo activar directamente el CTS');
assert.equal(registryWrite.error?.code, '42501',
  'La activacion directa fallo por otro motivo: revisar ACL/RLS');

const rpc = async (client, name, args) => {
  const { data, error } = await client.rpc(name, args);
  return { data, error };
};
const expectFalse = async (label, client, name, args) => {
  const response = await rpc(client, name, args);
  assert.equal(response.error, null, `${label}: ${name} fallo antes de comprobar el permiso`);
  assert.equal(response.data, false, `${label}: ${name} concedio escritura`);
};
const expectRpcDenied = async (label, client, name, args, requirePermissionError = true) => {
  const result = await rpc(client, name, args);
  assert.ok(result.error, `${label}: ${name} acepto una escritura prohibida`);
  assert.ok(!['PGRST202', '42883'].includes(result.error.code),
    `${label}: ${name} no existe en el ensayo; la prueba no acredita su proteccion`);
  if (requirePermissionError) {
    assert.equal(result.error.code, '42501',
      `${label}: ${name} fallo por otra causa; no acredita el bloqueo de escritura`);
  }
};

// Todas estas filas son ficticias y deben ser visibles por el owner de ensayo.
const readArchive = async (name, id) => {
  const { data, error } = await owner.from(name).select('*').eq('id', id).single();
  if (error || !data) throw new Error(`Falta fixture ficticio ${name}.`);
  return data;
};
const archivedPlayer = await readArchive('jugadores', process.env.T02_ARCHIVE_JUGADOR_ID);
const archivedMatch = await readArchive('partidos', process.env.T02_ARCHIVE_PARTIDO_ID);
assert.ok(archivedPlayer.global_player_id, 'La ficha historica ficticia no tiene identidad global.');
assert.equal(archivedMatch.club_team_season_id, archiveId,
  'El partido de prueba no pertenece al CTS historico ficticio.');
for (const table of childTables) {
  const row = await readArchive(table, childIds[table]);
  if (table === 'partido_snapshot_tactico_slots') {
    assert.equal(row.snapshot_id, childIds.partido_snapshots_tacticos,
      `${table}: fixture no enlazado al snapshot historico.`);
  } else {
    assert.equal(row.partido_id, archivedMatch.id,
      `${table}: fixture no enlazado al partido historico.`);
  }
}

const preference = await rpc(owner, 'my_operational_cts_v1');
assert.equal(preference.error, null);
assert.equal(preference.data, activeId);
for (const [label, client] of [['archivo',archiveStaff],['sin acceso',noAccess],['PLAYER',player]]) {
  const answer = await rpc(client, 'my_operational_cts_v1');
  assert.equal(answer.error, null);
  assert.equal(answer.data, null, `${label}: vio el CTS operativo personal`);
  await expectFalse(label, client, 'can_write_operational_cts_v1', { target_cts_id: activeId });
}
await expectFalse('owner', owner, 'can_write_club_team_season', {
  target_club_team_season_id: archiveId,
});
await expectFalse('owner', owner, 'can_write_operational_cts_v1', {
  target_cts_id: archiveId,
});

const deniedPlayer = { name: `ENSAYO DENEGADO ${randomUUID()}` };
for (const [label, client] of [['owner',owner],['archivo',archiveStaff]]) {
  await expectRpcDenied(label, client, 'create_own_player_atomic', {
    p_own_player_id: randomUUID(), p_player: deniedPlayer,
    p_positions: [], p_sources: [], p_traits: [],
  }, false); // La RPC legacy no versionada exige una prueba funcional propia.
  await expectRpcDenied(label, client, 'create_own_player_atomic_v2', {
    p_club_team_season_id: archiveId, p_own_player_id: randomUUID(),
    p_player: deniedPlayer, p_positions: [], p_sources: [], p_traits: [],
  });
  await expectRpcDenied(label, client, 'link_existing_global_player_to_cts_v1', {
    p_club_team_season_id: archiveId,
    p_global_player_id: archivedPlayer.global_player_id,
  });
  await expectRpcDenied(label, client, 'create_operational_player_v1', {
    p_cts_id: archiveId, p_jugador_id: randomUUID(),
    p_player: deniedPlayer, p_positions: [],
  });
  await expectRpcDenied(label, client, 'create_operational_match_v1', {
    p_cts_id: archiveId,
    p_match: { date: '2026-10-23', opponent: 'ENSAYO DENEGADO' },
  });
  await expectRpcDenied(label, client, 'edit_operational_player_v1', {
    p_cts_id: activeId, p_jugador_id: process.env.T02_ARCHIVE_JUGADOR_ID,
    p_patch: { number: 97 },
  });
  await expectRpcDenied(label, client, 'edit_operational_match_v1', {
    p_cts_id: activeId, p_partido_id: process.env.T02_ARCHIVE_PARTIDO_ID,
    p_patch: { round: 'ENSAYO DENEGADO' },
  });
  await expectRpcDenied(label, client, 'mutate_match_substitution_atomic', {
    p_operation: 'delete', p_partido_id: process.env.T02_ARCHIVE_PARTIDO_ID,
    p_event_id: randomUUID(), p_event: null, p_match_duration: null,
  });
}

// DML directo real sobre filas ficticias del archivo. Si una prueba falla,
// detenerse y restaurar el seed ficticio: nunca apuntar a produccion.
const expectNoDirectDml = async (table, id, patch) => {
  const update = await owner.from(table).update(patch).eq('id', id).select('id');
  assert.equal(update.data?.length || 0, 0, `${table}: UPDATE historico permitido`);
  const afterUpdate = await readArchive(table, id);
  for (const [key, value] of Object.entries(patch)) {
    assert.notEqual(afterUpdate[key], value, `${table}: UPDATE historico aplicado`);
  }
  const removal = await owner.from(table).delete().eq('id', id).select('id');
  assert.equal(removal.data?.length || 0, 0, `${table}: DELETE historico permitido`);
  await readArchive(table, id);
};
await expectNoDirectDml('jugadores', archivedPlayer.id,
  { number: archivedPlayer.number === 97 ? 96 : 97 });
await expectNoDirectDml('partidos', archivedMatch.id,
  { opponent: archivedMatch.opponent === 'ENSAYO DENEGADO' ? 'ENSAYO BLOQUEADO' : 'ENSAYO DENEGADO' });
const rejectedOpponent = `ENSAYO DENEGADO ${randomUUID()}`;
const directInsert = await owner.from('partidos').insert({
  club_team_season_id: archiveId, date: archivedMatch.date,
  time: '', type: 'Liga', round: '', stadium: '', is_home: true,
  home_team: 'ENSAYO ARCHIVO', away_team: 'ENSAYO RIVAL',
  opponent: rejectedOpponent, status: 'Previa',
}).select('id');
assert.equal(directInsert.data?.length || 0, 0, 'INSERT directo en el archivo permitido');
assert.equal(directInsert.error?.code, '42501',
  'INSERT historico en partidos fallo por datos invalidos, no por autorizacion');
const rejectedMatches = await owner.from('partidos').select('id')
  .eq('club_team_season_id', archiveId).eq('opponent', rejectedOpponent);
assert.equal(rejectedMatches.error, null);
assert.equal(rejectedMatches.data?.length, 0,
  'El INSERT historico dejo una fila parcial');
const directForeignRoster = await owner.from('club_team_season_players').insert({
  club_team_season_id: activeId, player_id: archivedPlayer.global_player_id,
}).select('id');
assert.equal(directForeignRoster.data?.length || 0, 0,
  'INSERT directo de UUID global historico en el CTS activo permitido');
assert.equal(directForeignRoster.error?.code, '42501',
  'INSERT directo CTSP fallo por datos invalidos, no por autorizacion');

for (const table of childTables) {
  const id = childIds[table];
  const insertPayload = table === 'partido_snapshot_tactico_slots'
    ? { snapshot_id: childIds.partido_snapshots_tacticos }
    : { partido_id: archivedMatch.id };
  const insertion = await owner.from(table).insert(insertPayload).select('id');
  assert.equal(insertion.data?.length || 0, 0, `${table}: INSERT historico permitido`);
  assert.equal(insertion.error?.code, '42501',
    `${table}: INSERT fallo por un contrato de fila, no por autorizacion`);
  const update = await owner.from(table).update({ id }).eq('id', id).select('id');
  assert.equal(update.data?.length || 0, 0, `${table}: UPDATE historico permitido`);
  const removal = await owner.from(table).delete().eq('id', id).select('id');
  assert.equal(removal.data?.length || 0, 0, `${table}: DELETE historico permitido`);
  await readArchive(table, id);
}

console.log('Transicion 02: RPC directas y DML historico denegados en ENSAYO.');
for (const client of [owner,archiveStaff,noAccess,player]) await client.auth.signOut();
