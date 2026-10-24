import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const original = readFileSync(new URL('../supabase_almadina_delete_own_player_MANUAL.sql', import.meta.url), 'utf8');
const update = readFileSync(new URL('../supabase_almadina_delete_own_player_fk_update_MANUAL.sql', import.meta.url), 'utf8');
const body = (sql) => {
  const match = sql.match(/(?:create|create or replace) function public\.delete_own_player_atomic_v1\(p_jugador_id uuid\)[\s\S]*?as \$function\$([\s\S]*?)\$function\$;/i);
  assert.ok(match, 'La RPC debe conservar su firma y cuerpo');
  return match[1].replace(/\r\n/g, '\n');
};
const oldTuple = "('public','club_memberships','jugador_id','r'),";
const newTuple = "('public','partido_convocados','jugador_id','c'),\n      " + oldTuple;
assert.equal(body(update), body(original).replace(oldTuple, newTuple), 'Solo debe añadirse la FK de convocados');
assert.equal(body(original).split(oldTuple).length, 2, 'El ancla debe ser única');

for (const tuple of [
  "('public','partido_convocados','jugador_id','c')",
  "('public','fine_subjects','jugador_id','r')",
  "('public','physio_treatments','player_id','r')",
  "('public','partido_eventos_sustitucion','outgoing_jugador_id','r')",
  "('public','partido_eventos_sustitucion','incoming_jugador_id','r')",
  "('public','club_memberships','jugador_id','r')",
  "('public','training_session_load_metrics','jugador_id','a')",
]) assert.ok(body(update).includes(tuple), `Falta la relación conocida ${tuple}`);
assert.match(update, /installed\.prosrc is distinct from replace\(previous\.prosrc/);
assert.match(update, /installed\.proacl is distinct from previous\.proacl/);
assert.match(update, /convalidated\) <> 1/);
assert.match(update, /t\.tgrelid = 'public\.partido_convocados'::regclass/);
assert.match(update, /c\.confrelid = 'public\.partido_convocados'::regclass/);
assert.doesNotMatch(update, /alter table|drop constraint|disable trigger|revoke /i);
console.log('Inventario FK de borrado: cambio único y relaciones conocidas verificados.');
