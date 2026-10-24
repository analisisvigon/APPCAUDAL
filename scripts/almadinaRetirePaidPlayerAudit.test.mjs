import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const previous = read('supabase_almadina_delete_own_player_fk_update_MANUAL.sql');
const update = read('supabase_almadina_retire_paid_player_MANUAL.sql');
const app = read('src/App.jsx');
const finesSql = read('supabase_club_core_23_fines_rpc.sql');
const functionBody = (sql) => {
  const match = sql.match(/create or replace function public\.delete_own_player_atomic_v1\(p_jugador_id uuid\)[\s\S]*?as \$function\$([\s\S]*?)\$function\$;/);
  assert.ok(match, 'RPC instalada conservada');
  return match[1].replaceAll('\r', '');
};
const oldBody = functionBody(previous);
const newBody = functionBody(update);
const md5 = (value) => createHash('md5').update(value, 'utf8').digest('hex');
assert.ok(update.includes(md5(oldBody)), 'El preflight exige el cuerpo previo exacto');
assert.ok(update.includes(md5(newBody)), 'El postflight exige el cuerpo nuevo exacto');
assert.ok(update.includes("('public','partido_convocados','jugador_id','c')"));

const substitution = `  if exists (select 1 from public.partido_eventos_sustitucion e
             where e.outgoing_jugador_id = p_jugador_id
                or e.incoming_jugador_id = p_jugador_id) then`;
const paymentGuard = `  if exists (
    select 1 from public.fine_payments payment
    join public.fines fine on fine.id = payment.fine_id
    join public.fine_subjects subject on subject.id = fine.subject_id
    where subject.jugador_id = p_jugador_id
  ) then
    raise exception 'PLAYER_IMMUTABLE_FINE_PAYMENTS_REVIEW_REQUIRED'
      using errcode = '23514';
  end if;
`;
const paymentQuery = `  select exists (
    select 1 from public.fine_payments payment
    join public.fines fine on fine.id = payment.fine_id
    join public.fine_subjects subject on subject.id = fine.subject_id
    where subject.jugador_id = p_jugador_id
  ) into has_fine_payments;
`;
const retirement = `  -- Los pagos son inmutables: conservar sujeto, multas y ledger. La ficha
  -- deja de formar parte de la plantilla y el sujeto deja de ser sancionable.
  if has_fine_payments then
    update public.fine_subjects set active = false
    where jugador_id = p_jugador_id and club_id = actor_club_id and active;
    update public.jugadores set active_in_squad = false
    where id = p_jugador_id and active_in_squad;
    update public.player_team_memberships set is_current = false
    where id = stage_id and is_current;
    if ctsp_id is not null and season_status = 'open' then
      update public.club_team_season_players set has_departed = true
      where id = ctsp_id and not has_departed;
    end if;
    return jsonb_build_object('status','retired','jugador_id',p_jugador_id,
      'fine_payments_preserved',true);
  end if;

`;
const expected = oldBody
  .replace('  removed_stats integer;\nbegin', '  removed_stats integer;\n  has_fine_payments boolean;\nbegin')
  .replace(substitution, paymentQuery + substitution.replace('  if exists', '  if not has_fine_payments and exists'))
  .replace(paymentGuard, '')
  .replace('  -- Hijos exclusivos identificados por UUID.', retirement + '  -- Hijos exclusivos identificados por UUID.');
assert.equal(newBody, expected, 'Autorización, borrado sin pagos y demás lógica deben permanecer idénticos');
assert.ok(newBody.indexOf("return jsonb_build_object('status','retired'") < newBody.indexOf('  delete from public.fines fine'), 'La baja sale antes de cualquier DELETE');
assert.doesNotMatch(newBody, /delete from public\.fine_payments/i, 'El ledger no se borra');
assert.match(newBody, /return jsonb_build_object\('status','deleted'/, 'Sin pagos se mantiene el borrado físico');
assert.match(app, /\.map\(normalizeSupabaseJugador\)\.filter\(\(player\) => player\.activeInSquad !== false\)/);
assert.match(app, /result\.status === 'retired'/);
assert.match(app, /Si tiene pagos de multas, su ficha quedará de baja/);
assert.match(finesSql, /get_fine_subjects_for_management\(\)[\s\S]*?and subject\.active[\s\S]*?\$function\$;/);
const managementList = finesSql.match(/create function public\.get_fines_management_list\([\s\S]*?\$function\$;/)?.[0];
assert.ok(managementList && !managementList.includes('subject.active'), 'Los listados históricos de Multas conservan sujetos inactivos');
console.log('Baja con pagos: ledger conservado, plantilla inactiva y borrado sin pagos sin cambios.');
