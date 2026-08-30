import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const readUtf8 = (relativePath) =>
  readFileSync(path.join(root, relativePath), { encoding: 'utf8' })

const migrationPath = 'supabase_club_core_14_player_perimeter_lockdown.sql'
const verifyPath = 'supabase_club_core_14_player_perimeter_lockdown_verify.sql'
const auditPath = 'supabase_club_core_14_mutating_rpcs_remote_audit.sql'
const manifestPath = 'supabase_club_core_14_mutating_rpcs_remote_baseline.md'

const migration = readUtf8(migrationPath)
const verifier = readUtf8(verifyPath)
const remoteAudit = readUtf8(auditPath)
const manifest = readUtf8(manifestPath)

const staffGuard = [
  "  if coalesce(auth.role(), '') <> 'service_role'",
  "     and session_user <> 'service_role'",
  '     and not public.is_app_staff() then',
  '    raise exception using',
  "      errcode = '42501',",
  "      message = 'STAFF_ONLY';",
  '  end if;',
  '',
  '',
].join('\n')

const targets = [
  ['set_player_availability', 'public.set_player_availability(uuid,text,integer)', 'supabase_player_availability.sql', '466c8d47470aaa5acee20cf44fa7d502'],
  ['consume_player_suspensions_for_match', 'public.consume_player_suspensions_for_match(uuid)', 'supabase_player_availability.sql', '3b02b9eb3bbe11a3a21bfe06cb783e1c'],
  ['apply_rival_tactical_placements', 'public.apply_rival_tactical_placements(uuid,jsonb)', 'supabase_rival_team_editing.sql', 'be25e6a1de65150ee8a911eb7a11ccd7'],
  ['assign_global_player_to_team', 'public.assign_global_player_to_team(uuid,uuid,text,text,date)', 'supabase_global_players.sql', 'fd794865119cc8d26ffe13d6b0b73862'],
  ['create_own_player_atomic', 'public.create_own_player_atomic(uuid,jsonb,jsonb,jsonb,jsonb)', 'supabase_own_player_create_atomic.sql', 'aad1e4eaf3cd1fa7e30e1d630f641076'],
  ['merge_global_player_profiles', 'public.merge_global_player_profiles(uuid,uuid)', 'supabase_global_players.sql', '5c5121dbebf1c75b2ec013693c2e5a2e'],
  ['remove_global_player_from_current_team', 'public.remove_global_player_from_current_team(uuid,date)', 'supabase_global_players.sql', '0cd47394f23797cdefa3578eb84e2be9'],
  ['remove_rival_player_from_team_atomic', 'public.remove_rival_player_from_team_atomic(uuid,uuid,uuid,text)', 'supabase_rival_lineup_atomic.sql', '128aa60b5ecf5c96f79a61f821e40bc9'],
  ['save_global_player_profile', 'public.save_global_player_profile(jsonb,jsonb,jsonb,jsonb,jsonb)', 'supabase_global_players.sql', 'a638f6ca4d202abbcb562b5261b4b6e4'],
  ['save_match_squad_lineup_atomic', 'public.save_match_squad_lineup_atomic(uuid,text,jsonb,jsonb)', 'supabase_match_squad_lineup_atomic.sql', '63bb815b9ea846b7ec90465ccfc06369'],
  ['save_own_captain_priorities', 'public.save_own_captain_priorities(uuid[])', 'supabase_own_captain_priority.sql', 'ea72384385e286c5df3f71666d3d2581'],
  ['save_rival_lineup_atomic', 'public.save_rival_lineup_atomic(uuid,text,jsonb,jsonb,jsonb,jsonb)', 'supabase_rival_lineup_atomic.sql', 'cb8a5da84addcf1f34934380a03a725c'],
].map(([name, signature, source, md5]) => ({ name, signature, source, md5 }))

function countOccurrences(text, fragment) {
  return text.split(fragment).length - 1
}

function extractBody(sourceText, functionName) {
  const marker = `create or replace function public.${functionName}(`
  const start = sourceText.toLowerCase().indexOf(marker)
  assert.notEqual(start, -1, `No se encontró ${marker}`)

  const tail = sourceText.slice(start)
  const opening = /\bas\s+(\$[A-Za-z_]*\$)/i.exec(tail)
  assert.ok(opening, `No se encontró delimitador de cuerpo para ${functionName}`)

  const tag = opening[1]
  const bodyStart = opening.index + opening[0].length
  const bodyEnd = tail.indexOf(`${tag};`, bodyStart)
  assert.notEqual(bodyEnd, -1, `No se encontró cierre de cuerpo para ${functionName}`)

  return tail.slice(bodyStart, bodyEnd).replaceAll('\r', '')
}

function md5(text) {
  return createHash('md5').update(text, 'utf8').digest('hex')
}

const rows = []

for (const target of targets) {
  const sourceText = readUtf8(target.source)
  const body = extractBody(sourceText, target.name)
  const bodyHash = md5(body)
  assert.equal(bodyHash, target.md5, `${target.name}: MD5 UTF-8 distinto del remoto`)

  const beginMatches = [...body.matchAll(/^[\t ]*begin[\t ]*$/gim)]
  assert.equal(beginMatches.length, 1, `${target.name}: BEGIN principal no unívoco`)

  const beginWithNewline = /^[\t ]*begin[\t ]*\n/im.exec(body)
  assert.ok(beginWithNewline, `${target.name}: BEGIN principal sin salto de línea`)

  const insertionPoint = beginWithNewline.index + beginWithNewline[0].length
  const guarded = body.slice(0, insertionPoint) + staffGuard + body.slice(insertionPoint)
  const guardCount = countOccurrences(guarded, staffGuard)
  const guardIsFirst = guarded.slice(insertionPoint).startsWith(staffGuard)
  const roundTrip = guarded.replace(staffGuard, '')

  assert.equal(guardCount, 1, `${target.name}: guard no unívoco`)
  assert.equal(guardIsFirst, true, `${target.name}: guard no es la primera lógica`)
  assert.equal(roundTrip, body, `${target.name}: round-trip no exacto`)
  assert.equal(md5(roundTrip), target.md5, `${target.name}: MD5 cambia tras round-trip`)

  assert.equal(countOccurrences(migration, target.md5), 3, `${target.name}: baseline incompleto en migración`)
  assert.equal(countOccurrences(verifier, target.md5), 1, `${target.name}: baseline incorrecto en verificador`)
  assert.equal(countOccurrences(remoteAudit, target.md5), 1, `${target.name}: baseline incorrecto en auditor`)
  assert.equal(countOccurrences(manifest, target.md5), 1, `${target.name}: baseline incorrecto en manifiesto`)

  rows.push({
    rpc: target.name,
    md5: bodyHash,
    begin: beginMatches.length,
    guard: guardCount,
    guardFirst: guardIsFirst,
    roundTrip: roundTrip === body,
    ok: true,
  })
}

assert.match(verifier, /set\s+transaction\s+read\s+only\s*;/i)
assert.match(verifier, /rollback\s*;\s*$/i)
assert.doesNotMatch(migration, /\b(?:create|alter|drop)\s+trigger\b/i)
assert.doesNotMatch(migration, /returns\s+trigger\b/i)

console.table(rows)
console.log(`Bloque 2.1b RPC baseline: ${rows.length}/${targets.length} OK`)
