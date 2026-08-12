import {
  buildConnectionPayload,
  buildLegacyRivalScoutingPlan,
  hydrateRivalScoutingBundle,
} from './rivalScoutingPersistence.js';

const assertRows = (result, label) => {
  if (result.error) throw result.error;
  if (!Array.isArray(result.data)) throw new Error(`Supabase no devolvió ${label}.`);
  return result.data;
};

export const loadRivalScoutingBundle = async (supabase) => {
  const responses = await Promise.all([
    supabase.from('rival_scouting_profiles').select('*'),
    supabase.from('rival_scouting_player_profiles').select('*'),
    supabase.from('rival_scouting_evidence').select('*').order('created_at', { ascending: false }),
    supabase.from('rival_scouting_connections').select('*').order('created_at', { ascending: false }),
  ]);
  return hydrateRivalScoutingBundle({
    profiles: assertRows(responses[0], 'los perfiles de scouting rival'),
    playerProfiles: assertRows(responses[1], 'los perfiles observados'),
    evidences: assertRows(responses[2], 'las evidencias manuales'),
    connections: assertRows(responses[3], 'las conexiones observadas'),
  });
};

export const saveRivalScoutingSnapshot = async (supabase, snapshot) => {
  const { data, error } = await supabase.rpc('save_rival_scouting_snapshot', {
    p_team_id: snapshot.teamId,
    p_tactical_identity: snapshot.tacticalIdentity || {},
    p_collective_profile: snapshot.collective || {},
    p_match_plan_notes: snapshot.matchPlanNotes || {},
    p_player_profiles: snapshot.playerProfiles || [],
  });
  if (error) return { ok: false, error };
  if (!data?.equipo_rival_id) return { ok: false, error: new Error('Supabase no confirmó el perfil de scouting rival.') };
  return { ok: true, data };
};

export const createManualRivalEvidence = async (supabase, values) => {
  const { data, error } = await supabase.from('rival_scouting_evidence').insert(values).select('*').single();
  if (error) throw error;
  if (!data?.id) throw new Error('Supabase no devolvió la evidencia creada.');
  return data;
};

export const updateManualRivalEvidenceStatus = async (supabase, { id, teamId, status, interpretation, notes }) => {
  const payload = { status };
  if (interpretation !== undefined) payload.interpretation = interpretation;
  if (notes !== undefined) payload.notes = notes;
  const { data, error } = await supabase.from('rival_scouting_evidence').update(payload).eq('id', id).eq('equipo_rival_id', teamId).select('*').single();
  if (error) throw error;
  if (!data?.id) throw new Error('Supabase no confirmó la actualización de la evidencia.');
  return data;
};

export const deleteManualRivalEvidence = async (supabase, { id, teamId }) => {
  const { data, error } = await supabase.from('rival_scouting_evidence').delete().eq('id', id).eq('equipo_rival_id', teamId).select('id').single();
  if (error) throw error;
  if (!data?.id) throw new Error('Supabase no confirmó el borrado de la evidencia.');
  return data.id;
};

export const createRivalScoutingConnection = async (supabase, { teamId, matchId, draft, players }) => {
  const payload = buildConnectionPayload({ teamId, matchId, draft, players });
  const { data, error } = await supabase.from('rival_scouting_connections').insert(payload).select('*').single();
  if (error) throw error;
  if (!data?.id) throw new Error('Supabase no devolvió la conexión creada.');
  return data;
};

export const deleteRivalScoutingConnection = async (supabase, { id, teamId }) => {
  const { data, error } = await supabase.from('rival_scouting_connections').delete().eq('id', id).eq('equipo_rival_id', teamId).select('id').single();
  if (error) throw error;
  if (!data?.id) throw new Error('Supabase no confirmó el borrado de la conexión.');
  return data.id;
};

const loadLegacyImportMarkers = async (supabase) => {
  const { data, error } = await supabase.from('rival_scouting_legacy_imports').select('*');
  if (error) throw error;
  return Array.isArray(data) ? data : [];
};

const markerKey = (value) => `${value.equipo_rival_id || value.teamId}::${value.storage_key || value.storageKey}::${value.legacy_item_id || value.legacyItemId}`;

const saveLegacyMarker = async (supabase, operation, importStatus) => {
  const { error } = await supabase.from('rival_scouting_legacy_imports').upsert({
    equipo_rival_id: operation.teamId,
    storage_key: operation.storageKey,
    legacy_item_id: operation.legacyItemId,
    payload_fingerprint: operation.fingerprint,
    import_status: importStatus,
    conflict_payload: operation.conflicts || [],
    imported_at: importStatus === 'imported' ? new Date().toISOString() : null,
  }, { onConflict: 'equipo_rival_id,storage_key,legacy_item_id' });
  if (error) throw error;
};

const applyLegacyOperation = async (supabase, operation) => {
  if (operation.kind === 'profile_section') {
    const columnBySection = {
      tacticalIdentity: 'tactical_identity',
      collective: 'collective_profile',
      matchPlanNotes: 'match_plan_notes',
    };
    const column = columnBySection[operation.section];
    if (!column) throw new Error(`Sección legacy no reconocida: ${operation.section}`);
    const { error } = await supabase.from('rival_scouting_profiles').upsert({
      equipo_rival_id: operation.teamId,
      [column]: operation.payload || {},
    }, { onConflict: 'equipo_rival_id' });
    if (error) throw error;
    return;
  }
  if (operation.kind === 'player_profile') {
    if (operation.conflicts?.length) return;
    const { error } = await supabase.from('rival_scouting_player_profiles').insert({
      equipo_rival_id: operation.teamId,
      ...operation.payload,
    });
    if (error && error.code !== '23505') throw error;
    return;
  }
  if (operation.kind === 'evidence') {
    const { error } = await supabase.from('rival_scouting_evidence').insert({
      equipo_rival_id: operation.teamId,
      ...operation.payload,
    });
    if (error && error.code !== '23505') throw error;
    return;
  }
  if (operation.kind === 'connection') {
    const endpoint = (prefix, value) => ({
      [`${prefix}_entity_type`]: value.entity_type,
      [`${prefix}_global_player_id`]: value.global_player_id,
      [`${prefix}_membership_id`]: value.membership_id,
      [`${prefix}_jugador_rival_id`]: value.jugador_rival_id,
      [`${prefix}_jugador_id`]: value.jugador_id,
      [`${prefix}_role`]: value.role,
      [`${prefix}_label`]: value.label,
    });
    const { source_endpoint: source, target_endpoint: target, ...payload } = operation.payload;
    const { error } = await supabase.from('rival_scouting_connections').insert({
      equipo_rival_id: operation.teamId,
      ...payload,
      ...endpoint('source', source),
      ...endpoint('target', target),
    });
    if (error && error.code !== '23505') throw error;
  }
};

export const migrateLegacyRivalScouting = async (supabase, { legacy, teams, matches, ownPlayers, remoteByTeam }) => {
  const operations = buildLegacyRivalScoutingPlan({ legacy, teams, matches, ownPlayers, remoteByTeam });
  const markers = await loadLegacyImportMarkers(supabase);
  const markerMap = new Map(markers.map((marker) => [markerKey(marker), marker]));
  const result = { imported: 0, conflicts: 0, skipped: 0, failed: 0, changed: false };

  for (const operation of operations) {
    const previous = markerMap.get(markerKey(operation));
    if (previous?.payload_fingerprint === operation.fingerprint && ['imported', 'conflict', 'skipped'].includes(previous.import_status)) {
      result.skipped += 1;
      continue;
    }
    try {
      const unresolvedPlayerProfile = operation.kind === 'player_profile' && operation.conflicts?.length > 0;
      const cacheCandidate = operation.kind === 'player_flags_candidate';
      if (!unresolvedPlayerProfile && !cacheCandidate) await applyLegacyOperation(supabase, operation);
      const importStatus = operation.conflicts?.length ? 'conflict' : cacheCandidate ? 'skipped' : 'imported';
      await saveLegacyMarker(supabase, operation, importStatus);
      if (importStatus === 'conflict') result.conflicts += 1;
      else if (importStatus === 'skipped') result.skipped += 1;
      else {
        result.imported += 1;
        result.changed = true;
      }
    } catch (error) {
      result.failed += 1;
      result.error = error;
    }
  }
  return result;
};
