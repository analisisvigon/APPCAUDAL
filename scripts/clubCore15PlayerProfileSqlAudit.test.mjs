import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const readUtf8 = (file) => readFileSync(path.join(process.cwd(), file), 'utf8').replaceAll('\r', '')
const migration = readUtf8('supabase_club_core_15_my_player_profile.sql')
const verifier = readUtf8('supabase_club_core_15_my_player_profile_verify.sql')

assert.match(migration, /^\s*--[\s\S]*?\nbegin\s*;/i)
assert.match(migration, /commit\s*;\s*$/i)
assert.doesNotMatch(migration, /^\s*rollback\s*;/im)
assert.match(migration, /do \$preconditions\$[\s\S]*do \$postconditions\$/i)

assert.match(
  migration,
  /create function public\.get_my_player_profile\(\)\s*returns table\s*\(\s*jugador_id uuid,\s*name text,\s*shirt_name text,\s*number integer,\s*position text,\s*image text\s*\)/i,
)
assert.match(migration, /language plpgsql\s+stable\s+security definer\s+set search_path = pg_catalog/i)
assert.match(migration, /alter function public\.get_my_player_profile\(\) owner to postgres/i)
assert.match(
  migration,
  /revoke all on function public\.get_my_player_profile\(\)\s*from public, anon, authenticated, service_role/i,
)
assert.match(
  migration,
  /grant execute on function public\.get_my_player_profile\(\)\s*to authenticated, service_role/i,
)

const bodyMatch = migration.match(/as \$function\$\n([\s\S]*?)\n\$function\$;/i)
assert.ok(bodyMatch, 'No se pudo extraer el cuerpo de get_my_player_profile()')
const body = bodyMatch[1]

assert.match(body, /actor_id uuid := auth\.uid\(\)/i)
assert.match(body, /from public\.current_membership\(\)/i)
assert.match(body, /membership_role is distinct from 'player'/i)
assert.match(body, /linked_jugador_id is null/i)
assert.match(body, /from public\.jugadores player\s+where player\.id = linked_jugador_id/i)
assert.doesNotMatch(body, /\bexecute\b/i)
assert.doesNotMatch(body, /\b(insert|update|delete|merge|truncate)\b/i)
assert.doesNotMatch(
  body,
  /\b(global_player_id|google_forms_name|membership_id|legacy_id|dob|foot|availability_status|suspension_[a-z_]*)\b/i,
)
assert.doesNotMatch(body, /\b(p_|arg_|input_)(jugador|user|membership)_?id\b/i)

assert.doesNotMatch(migration, /alter table|create policy|drop policy/i)
assert.doesNotMatch(migration, /grant\s+(select|insert|update|delete|all)\s+on\s+(table\s+)?public\.jugadores/i)
assert.doesNotMatch(migration, /create or replace function public\.get_my_player_profile/i)

assert.match(verifier, /^\s*--[\s\S]*?\nbegin\s*;/i)
assert.match(verifier, /set transaction read only\s*;/i)
assert.match(verifier, /rollback\s*;\s*$/i)
assert.doesNotMatch(verifier, /^\s*(insert|update|delete|create|alter|drop|grant|revoke)\b/im)
for (const scenario of ['BORJA_PLAYER', 'UID_WITHOUT_MEMBERSHIP', 'STAFF', 'ANON']) {
  assert.ok(verifier.includes(`'${scenario}'`), `Falta escenario ${scenario}`)
}
assert.match(verifier, /from public\.get_my_player_profile\(\)/i)
assert.match(verifier, /from public\.jugadores\s*;/i)
assert.match(verifier, /function_arg_count = 0/i)
assert.match(verifier, /public_execute[\s\S]*anon_execute[\s\S]*authenticated_execute[\s\S]*service_role_execute/i)

console.log('Bloque 2.2 get_my_player_profile SQL audit: OK')
