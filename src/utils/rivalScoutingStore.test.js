import assert from 'node:assert/strict';
import {
  createManualRivalEvidence,
  deleteManualRivalEvidence,
  migrateLegacyRivalScouting,
  updateManualRivalEvidenceStatus,
} from './rivalScoutingStore.js';

const teamId = '11111111-1111-4111-8111-111111111111';
const evidenceId = '22222222-2222-4222-8222-222222222222';

const createCrudSupabase = () => {
  const rows = [{ id: evidenceId, equipo_rival_id: teamId, interpretation: 'Inicial', status: 'pending' }];
  return {
    rows,
    from: () => ({
      insert: (payload) => ({ select: () => ({ single: async () => ({ data: { id: evidenceId, ...payload }, error: null }) }) }),
      update: (payload) => {
        const chain = { eq: () => chain, select: () => ({ single: async () => ({ data: { ...rows[0], ...payload }, error: null }) }) };
        return chain;
      },
      delete: () => {
        const chain = { eq: () => chain, select: () => ({ single: async () => ({ data: { id: evidenceId }, error: null }) }) };
        return chain;
      },
    }),
  };
};

const crud = createCrudSupabase();
const created = await createManualRivalEvidence(crud, { equipo_rival_id: teamId, interpretation: 'Nueva', status: 'pending' });
assert.equal(created.id, evidenceId);
const confirmed = await updateManualRivalEvidenceStatus(crud, { id: evidenceId, teamId, status: 'confirmed', notes: 'Validada' });
assert.equal(confirmed.status, 'confirmed');
assert.equal(confirmed.notes, 'Validada');
assert.equal(await deleteManualRivalEvidence(crud, { id: evidenceId, teamId }), evidenceId);

const createMigrationSupabase = () => {
  const tables = {
    rival_scouting_legacy_imports: [],
    rival_scouting_profiles: [],
    rival_scouting_evidence: [],
    rival_scouting_connections: [],
    rival_scouting_player_profiles: [],
  };
  return {
    tables,
    from: (table) => ({
      select: async () => ({ data: [...tables[table]], error: null }),
      insert: async (payload) => {
        const rows = Array.isArray(payload) ? payload : [payload];
        for (const row of rows) {
          const duplicate = row.legacy_id && tables[table].some((item) => item.equipo_rival_id === row.equipo_rival_id && item.legacy_id === row.legacy_id);
          if (duplicate) return { data: null, error: { code: '23505' } };
          tables[table].push(row);
        }
        return { data: rows, error: null };
      },
      upsert: async (payload) => {
        if (table === 'rival_scouting_legacy_imports') {
          const index = tables[table].findIndex((row) => row.equipo_rival_id === payload.equipo_rival_id && row.storage_key === payload.storage_key && row.legacy_item_id === payload.legacy_item_id);
          if (index >= 0) tables[table][index] = payload;
          else tables[table].push(payload);
        } else {
          const index = tables[table].findIndex((row) => row.equipo_rival_id === payload.equipo_rival_id);
          if (index >= 0) tables[table][index] = { ...tables[table][index], ...payload };
          else tables[table].push(payload);
        }
        return { data: payload, error: null };
      },
    }),
  };
};

const migrationDb = createMigrationSupabase();
const input = {
  legacy: {
    tacticalIdentity: { [teamId]: { pressureType: 'media', strongSide: 'derecha' } },
    observedScouting: { [teamId]: { evidences: [{ id: 'evidence-legacy', observation: 'Ataca espalda', importance: 'Alta' }] } },
    scoutingDrafts: {},
    playerFlags: {},
  },
  teams: [{ id: teamId, name: 'Rival A', squad: [] }],
  matches: [],
  remoteByTeam: { [teamId]: { tacticalIdentity: { pressureType: 'alta' } } },
};
const first = await migrateLegacyRivalScouting(migrationDb, input);
assert.equal(first.imported, 1);
assert.equal(first.conflicts, 1);
assert.equal(migrationDb.tables.rival_scouting_profiles[0].tactical_identity.pressureType, 'alta');
assert.equal(migrationDb.tables.rival_scouting_profiles[0].tactical_identity.strongSide, 'derecha');
assert.equal(migrationDb.tables.rival_scouting_evidence.length, 1);
const second = await migrateLegacyRivalScouting(migrationDb, input);
assert.equal(second.imported, 0);
assert.equal(second.failed, 0);
assert.equal(migrationDb.tables.rival_scouting_evidence.length, 1);

console.log('rivalScoutingStore tests: OK');
