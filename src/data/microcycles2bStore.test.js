import assert from 'node:assert/strict';
import { blankMicrocycleDraft, hydrateMicrocycleDraft, loadMicrocycle2b,
  MICROCYCLES_2B_BACKEND_VERIFIED, saveMicrocycle2b, serializeMicrocycleDraft } from './microcycles2bStore.js';

const days = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29',
  '2026-10-30', '2026-10-31', '2026-11-01'];
const draft = blankMicrocycleDraft(days);
assert.equal(Object.keys(draft.days).length, 7);
draft.objective = 'Organización defensiva';
draft.priorities = ['Táctica'];
draft.days[days[0]].durationMinutes = '75';
draft.days[days[0]].intensity = 'Alta';
const encoded = serializeMicrocycleDraft(draft, days);
assert.equal(encoded.days[days[0]].durationMinutes, 75);
assert.equal(encoded.days[days[1]].durationMinutes, null);
assert.deepEqual(hydrateMicrocycleDraft(null, days), blankMicrocycleDraft(days));
const record = { id: 'plan-id', club_team_season_id: 'cts-id', week_starts_on: days[0],
  revision: 2, weekly: encoded.weekly, days: encoded.days };
assert.deepEqual(hydrateMicrocycleDraft(record, days), draft);
assert.throws(() => serializeMicrocycleDraft(draft, days.slice(1)), /siete fechas/);
assert.throws(() => serializeMicrocycleDraft(draft, ['2026-10-27', ...days.slice(1)]), /siete fechas/);
draft.days[days[0]].durationMinutes = '-1';
assert.throws(() => serializeMicrocycleDraft(draft, days), /Duración prevista inválida/);
draft.days[days[0]].durationMinutes = '75';

const calls = [];
let returned = record;
const client = {
  from(table) {
    assert.equal(table, 'planned_microcycles');
    const query = {
      select(columns) { calls.push(['select', columns]); return this; },
      eq(column, value) { calls.push(['eq', column, value]); return this; },
      async maybeSingle() { return { data: returned, error: null }; },
    };
    return query;
  },
  async rpc() { throw new Error('No debe llamarse una RPC antes de verificar el backend'); },
};
assert.equal((await loadMicrocycle2b(client, 'cts-id', days[0])).revision, 2);
assert.deepEqual(calls.slice(-2), [['eq', 'club_team_season_id', 'cts-id'], ['eq', 'week_starts_on', days[0]]]);
returned = null;
assert.equal(await loadMicrocycle2b(client, 'cts-id', days[0]), null);
returned = { ...record, club_team_season_id: 'otro-cts' };
await assert.rejects(loadMicrocycle2b(client, 'cts-id', days[0]), /no corresponde al contexto/);
assert.equal(MICROCYCLES_2B_BACKEND_VERIFIED, false);
await assert.rejects(saveMicrocycle2b(client, 'cts-id', days[0], 0, draft, days), /pendiente de verificación/);
console.log('microcycles 2B store: OK (fixtures locales; sin Supabase)');
