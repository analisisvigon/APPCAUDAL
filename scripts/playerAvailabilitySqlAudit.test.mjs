import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../supabase_player_availability.sql', import.meta.url), 'utf8');

for (const column of ['availability_status', 'suspension_matches_remaining', 'suspension_cycle_id', 'suspension_started_at']) {
  assert.ok(sql.includes(column), `migración incluye ${column}`);
}
assert.match(sql, /availability_status in \('available', 'injured', 'suspended', 'unavailable'\)/);
assert.match(sql, /suspension_matches_remaining >= 0/);
assert.match(sql, /unique \(jugador_id, partido_id, suspension_cycle_id\)/i, 'D/N/O: idempotencia por jugador, partido y ciclo');
assert.match(sql, /on conflict on constraint jugador_suspension_consumptions_unique_cycle_match do nothing/i, 'N/O: la carrera concurrente solo inserta una vez');
assert.match(sql, /for update/i, 'O: serializa las filas que modifica');
assert.match(sql, /gen_random_uuid\(\)/, 'L: cada sanción nueva genera ciclo');
assert.match(sql, /v_match_start > j\.suspension_started_at/, 'K: un partido anterior al inicio no descuenta');
assert.match(sql, /not in \('league', 'copa_rfef', 'playoff'\)/, 'E: whitelist oficial excluye friendly');
assert.match(sql, /'aplazado'.*'postponed'.*'suspendido'.*'suspended'/s, 'M: aplazado/suspendido excluido');
assert.match(sql, /'cancelado'.*'cancelled'.*'canceled'/s, 'M: cancelado excluido');
assert.match(sql, /when v_player\.suspension_matches_remaining - 1 = 0 then 'available'/, 'D: último partido da alta');
assert.match(sql, /revoke insert, update, delete.*authenticated, anon/i, 'auditoría no admite escritura directa');
assert.match(sql, /to authenticated\s+using \(true\)/i, 'RLS mantiene lectura staff autenticado');
assert.ok(!/alter table public\.jugadores\s+drop column/i.test(sql), 'migración no elimina columnas');
assert.ok(!/active_in_squad|partido_estadisticas_jugador\.injured/.test(sql), 'no reinterpreta pertenencia ni lesiones históricas');

console.log('playerAvailability SQL audit passed');
