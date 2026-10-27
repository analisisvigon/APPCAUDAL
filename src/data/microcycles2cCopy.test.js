import assert from 'node:assert/strict';
import { blankMicrocycleDraft, serializeMicrocycleDraft } from './microcycles2bStore.js';
import { copyMicrocycleDraft, applyMicrocycleCopy } from './microcycles2cCopy.js';

const sourceDays = ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31',
  '2027-01-01', '2027-01-02', '2027-01-03'];
const targetDays = ['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07',
  '2027-01-08', '2027-01-09', '2027-01-10'];
const sourceDraft = blankMicrocycleDraft(sourceDays);
sourceDraft.objective = 'Salida de balón';
sourceDraft.priorities = ['Táctica'];
sourceDraft.responsible = 'Preparador';
sourceDraft.observations = 'Solo origen';
sourceDraft.days[sourceDays[0]] = { ...sourceDraft.days[sourceDays[0]],
  type: 'Entrenamiento', objective: 'Presión', focus: 'Táctico', intensity: 'Alta',
  durationMinutes: '75', observations: 'Nota diaria' };
const payload = serializeMicrocycleDraft(sourceDraft, sourceDays);
const source = { id: 'source-id', revision: 2, club_team_season_id: 'source-cts',
  week_starts_on: sourceDays[0], weekly: payload.weekly, days: payload.days };
const season = { status: 'open', starts_on: '2026-07-01', ends_on: '2027-06-30' };
const copied = copyMicrocycleDraft(source, sourceDays, targetDays, false, season);
assert.equal(copied.objective, 'Salida de balón');
assert.deepEqual(copied.priorities, ['Táctica']);
assert.equal(copied.responsible, 'Preparador');
assert.equal(copied.observations, '');
assert.equal(copied.days[targetDays[0]].objective, 'Presión');
assert.equal(copied.days[targetDays[0]].durationMinutes, '75');
assert.equal(copied.days[targetDays[0]].observations, '');
assert.deepEqual(Object.keys(copied.days), targetDays);
assert.equal(copied.days[sourceDays[0]], undefined);
assert.equal(copyMicrocycleDraft(source, sourceDays, targetDays, true, season)
  .days[targetDays[0]].observations, 'Nota diaria');
assert.equal(source.weekly.observations, 'Solo origen');
assert.equal(source.days[sourceDays[0]].observations, 'Nota diaria');

const boundary = copyMicrocycleDraft(source, sourceDays, sourceDays, true,
  { ...season, starts_on: '2027-01-01' });
assert.equal(boundary.days[sourceDays[0]].type, '');
assert.equal(boundary.days[sourceDays[4]].type, '');
assert.throws(() => copyMicrocycleDraft(source, sourceDays, targetDays, true,
  { ...season, ends_on: '2026-12-31' }), /no pertenece/);
assert.throws(() => copyMicrocycleDraft(source, sourceDays, targetDays.slice(1), true, season),
  /no pertenece/);

let destination = null;
let allowed = true;
let writeError = null;
let lastRpc = null;
const client = {
  rpc: async (name, args) => {
    if (name === 'can_write_club_team_season')
      return { data: allowed && args.target_club_team_season_id === 'target-cts', error: null };
    assert.equal(name, 'save_planned_microcycle_2b');
    lastRpc = args;
    if (writeError) return { data: null, error: writeError };
    const revision = (destination?.revision || 0) + 1;
    destination = { id: destination?.id || 'target-id', revision,
      club_team_season_id: args.p_club_team_season_id, week_starts_on: args.p_week_starts_on,
      weekly: args.p_weekly, days: args.p_days };
    return { data: { id: destination.id, revision }, error: null };
  },
  from: (table) => {
    assert.equal(table, 'planned_microcycles');
    const filters = {};
    return { select() { return this; }, eq(key, value) { filters[key] = value; return this; },
      async maybeSingle() {
        const row = filters.club_team_season_id === 'source-cts' &&
          filters.week_starts_on === sourceDays[0] ? source : destination;
        return { data: row && row.club_team_season_id === filters.club_team_season_id &&
          row.week_starts_on === filters.week_starts_on ? row : null, error: null };
      } };
  },
};
const args = { sourcePlan: source, sourceContextId: 'source-cts', sourceDays,
  targetPlan: null, targetContextId: 'target-cts', targetDays,
  includeObservations: false, season };
await assert.rejects(applyMicrocycleCopy(client, { ...args, sourcePlan: null }),
  /Origen o destino/);
await assert.rejects(applyMicrocycleCopy(client, { ...args, targetContextId: 'source-cts',
  targetDays: sourceDays }), /Origen o destino/);
const first = await applyMicrocycleCopy(client, args);
assert.equal(first.revision, 1);
assert.equal(lastRpc.p_expected_revision, 0);
assert.equal(lastRpc.p_days[targetDays[0]].objective, 'Presión');
assert.equal(Object.keys(lastRpc.p_days).length, 7);
assert.deepEqual(Object.keys(lastRpc.p_weekly), ['objective', 'priorities', 'responsible', 'observations']);
assert.equal(lastRpc.p_weekly.observations, '');
assert.equal(source.revision, 2);
assert.throws(() => copyMicrocycleDraft(source, sourceDays, targetDays, false,
  { ...season, status: 'closed', starts_on: '2027-08-01' }), /no pertenece/);
await assert.rejects(applyMicrocycleCopy(client, { ...args, targetPlan: first }), /confirmar la sustitución/);
const second = await applyMicrocycleCopy(client, { ...args, targetPlan: first,
  overwriteConfirmed: true, includeObservations: true });
assert.equal(second.revision, 2);
assert.equal(lastRpc.p_expected_revision, 1);
assert.equal(lastRpc.p_weekly.observations, 'Solo origen');
await assert.rejects(applyMicrocycleCopy(client, { ...args, targetPlan: first,
  overwriteConfirmed: true }), (error) => error.code === '40001');
allowed = false;
await assert.rejects(applyMicrocycleCopy(client, { ...args, targetPlan: second,
  overwriteConfirmed: true }), /No tienes permiso/);
allowed = true;
writeError = { code: '40001', message: 'Revisión semanal obsoleta' };
await assert.rejects(applyMicrocycleCopy(client, { ...args, targetPlan: second,
  overwriteConfirmed: true }), (error) => error.code === '40001');
assert.equal(destination.revision, 2);
await assert.rejects(applyMicrocycleCopy(client, { ...args, season: { ...season, status: 'closed' } }),
  /Origen o destino/);
console.log('microcycles 2C copy: OK (fixtures locales; sin Supabase)');
