import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const migrationPath = path.join(
  process.cwd(),
  'supabase_club_core_14_player_perimeter_lockdown.sql',
)
const sql = readFileSync(migrationPath, 'utf8').replaceAll('\r', '')

function stripSqlCommentsAndQuotedText(source) {
  let result = ''
  let index = 0

  while (index < source.length) {
    if (source.startsWith('--', index)) {
      const end = source.indexOf('\n', index + 2)
      if (end === -1) return result
      result += '\n'
      index = end + 1
      continue
    }

    if (source.startsWith('/*', index)) {
      let depth = 1
      index += 2
      while (index < source.length && depth > 0) {
        if (source.startsWith('/*', index)) {
          depth += 1
          index += 2
        } else if (source.startsWith('*/', index)) {
          depth -= 1
          index += 2
        } else {
          index += 1
        }
      }
      result += ' '
      continue
    }

    if (source[index] === "'") {
      index += 1
      while (index < source.length) {
        if (source[index] === "'" && source[index + 1] === "'") {
          index += 2
        } else if (source[index] === "'") {
          index += 1
          break
        } else {
          index += 1
        }
      }
      result += ' '
      continue
    }

    const dollarTag = source.slice(index).match(/^\$[A-Za-z_][A-Za-z_0-9]*\$|^\$\$/)?.[0]
    if (dollarTag) {
      const end = source.indexOf(dollarTag, index + dollarTag.length)
      assert.notEqual(end, -1, `Delimitador ${dollarTag} sin cierre`)
      result += ' '
      index = end + dollarTag.length
      continue
    }

    result += source[index]
    index += 1
  }

  return result
}

function extractDoBody(tag) {
  const opening = `do ${tag}`
  const start = sql.toLowerCase().indexOf(opening.toLowerCase())
  assert.notEqual(start, -1, `Falta ${opening}`)
  const bodyStart = start + opening.length
  const end = sql.indexOf(tag, bodyStart)
  assert.notEqual(end, -1, `Falta cierre ${tag}`)
  return sql.slice(bodyStart, end)
}

const migrationBody = stripSqlCommentsAndQuotedText(extractDoBody('$migration$'))
const postconditionsBody = stripSqlCommentsAndQuotedText(extractDoBody('$postconditions$'))
const topLevel = stripSqlCommentsAndQuotedText(sql)

for (const [scope, executableSql] of [
  ['nivel superior', topLevel],
  ['DO migration', migrationBody],
  ['DO postconditions', postconditionsBody],
]) {
  assert.doesNotMatch(
    executableSql,
    /\brollback\b/i,
    `${scope}: ROLLBACK ejecutable no permitido`,
  )
}

const transactionTerminators = [
  ...topLevel.matchAll(/\b(begin|start\s+transaction|commit|rollback)\s*;/gi),
].map((match) => match[1].toLowerCase().replace(/\s+/g, ' '))

assert.deepEqual(
  transactionTerminators,
  ['begin', 'commit'],
  'La migracion debe tener una sola transaccion superior BEGIN/COMMIT',
)
assert.match(topLevel, /\bcommit\s*;\s*$/i, 'COMMIT debe ser el ultimo SQL ejecutable')

const applicationStart = sql.indexOf('-- APLICACION: PUBLIC.JUGADORES.')
const rpcApplicationStart = sql.indexOf('-- APLICACION: GUARD STAFF + ACL DE RPC MUTADORAS.')
const postconditionsStart = sql.indexOf('-- POSTCONDICIONES.')

assert.ok(applicationStart > 0, 'Falta la seccion de aplicacion de policies')
assert.ok(rpcApplicationStart > applicationStart, 'La aplicacion RPC esta fuera de orden')
assert.ok(postconditionsStart > rpcApplicationStart, 'Las postcondiciones deben ir despues del DDL')

const applicationSql = sql.slice(applicationStart, postconditionsStart)
const postconditionsSql = sql.slice(postconditionsStart)

for (const pattern of [
  /execute\s+pg_catalog\.format\(\s*'drop policy/gi,
  /execute\s+\$policy\$\s*create policy/gi,
  /execute\s+guarded_definition\s*;/gi,
  /'revoke all on function %s from public, anon'/gi,
  /'grant execute on function %s to authenticated, service_role'/gi,
]) {
  assert.match(applicationSql, pattern, `Falta DDL real esperado: ${pattern}`)
}

for (const catalog of [
  'pg_catalog.pg_policies',
  'storage.buckets',
  'pg_catalog.pg_proc',
  'pg_catalog.aclexplode',
]) {
  assert.ok(
    postconditionsSql.includes(catalog),
    `Las postcondiciones no consultan el catalogo real ${catalog}`,
  )
}

assert.match(postconditionsSql, /guard_occurrence_count\s*<>\s*1/i)
assert.match(postconditionsSql, /has_function_privilege\(\s*'anon'/i)
assert.match(postconditionsSql, /has_function_privilege\(\s*'authenticated'/i)
assert.match(postconditionsSql, /has_function_privilege\(\s*'service_role'/i)
assert.doesNotMatch(sql, /exception\s+when/i, 'No se permiten excepciones absorbidas')

console.log('Bloque 2.1b transaction audit: BEGIN -> DDL real -> catalogo real -> COMMIT; OK')
