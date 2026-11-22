import { parsePlannedSessionValue } from '../utils/plannedSessionValue.js';
import { summarizePlayerRealizedTraining } from '../utils/playerRealizedTrainingStats.js';
import { summarizePlayerSessionAvailability } from '../utils/playerSessionAvailability.js';
import { normalizeOwnClubName } from '../constants/clubIdentity.js';
import {
  getTaskMediaSignedUrl,
  normalizeTrainingTaskMedia,
  selectTrainingTaskPreviewMedia,
  TRAINING_TASK_MEDIA_BUCKET,
} from '../utils/trainingTaskMedia.js';

// Activar solo después de instalar y verificar el backend de ciclo de vida con identidades reales.
export const SESSION_RETIREMENT_BACKEND_VERIFIED = false;

const unwrap = (response) => {
  if (response?.error) throw response.error;
  return response?.data;
};

export const loadPlannedContexts = async (client, clubId) => {
  if (!clubId) return [];
  const links = unwrap(await client.from('club_team_seasons')
    .select('id,club_id,team_id,season_id')
    .eq('club_id', clubId));
  if (!links?.length) return [];
  const seasonIds = [...new Set(links.map((row) => row.season_id))];
  const teamIds = [...new Set(links.map((row) => row.team_id))];
  const [seasonsResponse, teamsResponse] = await Promise.all([
    client.from('club_seasons')
      .select('id,club_id,label,starts_on,ends_on,is_active,status')
      .eq('club_id', clubId).in('id', seasonIds),
    client.from('club_teams').select('id,club_id,code')
      .eq('club_id', clubId).in('id', teamIds),
  ]);
  const seasons = unwrap(seasonsResponse) || [];
  const teams = unwrap(teamsResponse) || [];
  const seasonById = new Map(seasons.map((row) => [row.id, row]));
  const teamById = new Map(teams.map((row) => [row.id, row]));
  if (links.some((link) => !seasonById.has(link.season_id) ||
      !teamById.has(link.team_id) ||
      seasonById.get(link.season_id)?.club_id !== clubId ||
      teamById.get(link.team_id)?.club_id !== clubId)) {
    throw new Error('No se pudieron verificar las relaciones canónicas de equipo y temporada.');
  }
  // El nombre deportivo continúa en el registro legacy, unido por la FK
  // club_teams.id -> equipos_rivales.id. Si no es legible, mostrar el código canónico.
  const legacyResponse = await client.from('equipos_rivales').select('id,name').in('id', teamIds);
  const nameById = new Map((legacyResponse.error ? [] : legacyResponse.data || [])
    .map((row) => [row.id, row.name]));
  return links.flatMap((link) => {
    const season = seasonById.get(link.season_id);
    const team = teamById.get(link.team_id);
    return [{
      ...season,
      id: link.id,
      club_id: clubId,
      team_id: link.team_id,
      season_id: link.season_id,
      team_name: normalizeOwnClubName(nameById.get(link.team_id) || team.code),
      team_code: team.code,
    }];
  }).sort((a, b) => b.starts_on.localeCompare(a.starts_on) || a.team_name.localeCompare(b.team_name));
};

export const checkPlannedMicrocycleV4 = async (client) => {
  const result = await client.from('planned_training_sessions').select('mc_number').limit(0);
  if (!result.error) return true;
  if (['42703', 'PGRST204', 'PGRST205'].includes(result.error.code)) return false;
  throw result.error;
};

export const savePlannedSessionMcV4 = async (client, sessionId, revision, number) => {
  if (number !== null && (!Number.isInteger(number) || number < 1 || number > 9999))
    throw new Error('El número MC debe estar entre 1 y 9999.');
  return unwrap(await client.rpc('save_planned_session_mc_v4', {
    p_session_id: sessionId, p_expected_revision: revision, p_mc_number: number,
  }));
};

export const checkPlannedMaterialAutofill = async (client) => {
  const result = await client.from('planned_training_sessions').select('material_state').limit(0);
  if (!result.error) return true;
  if (['42703', 'PGRST204', 'PGRST205'].includes(result.error.code)) return false;
  throw result.error;
};

export const checkPlannedTaskSeries = async (client) => {
  const result = await client.rpc('planned_task_series_ready_v1');
  if (!result.error) return result.data === true;
  if (['42883', 'PGRST202', 'PGRST205'].includes(result.error.code)) return false;
  throw result.error;
};

export const checkPlannedTaskContent = async (client) => {
  const result = await client.rpc('planned_task_content_ready_v1');
  if (!result.error) return result.data === true;
  if (['42883', 'PGRST202', 'PGRST205'].includes(result.error.code)) return false;
  throw result.error;
};

export const checkPlannedSessionRealizationReady = async (client) => {
  const result = await client.rpc('planned_session_realization_ready_v1');
  if (!result.error) return result.data === true;
  if (['42883', 'PGRST202', 'PGRST205'].includes(result.error.code)) return false;
  throw result.error;
};

export const checkPlannedSessionGuestsReady = async (client) => {
  const result = await client.rpc('planned_session_guests_ready_v1');
  if (!result.error) return result.data === true;
  if (['42883', 'PGRST202', 'PGRST205'].includes(result.error.code)) return false;
  throw result.error;
};

export const loadPlannedSessionRealization = async (client, sessionId, includeGuestSnapshots = false) => {
  if (!sessionId) throw new Error('Falta el identificador de sesión para cargar su realización.');
  const realization = unwrap(await client.from('planned_session_realizations')
    .select('session_id,realized_at,realized_by_membership_id,roster_count,default_available_count')
    .eq('session_id', sessionId).maybeSingle());
  if (!realization) return null;
  const [players, guests] = await Promise.all([
    client.from('planned_session_realized_player_statuses')
      .select('session_id,player_id,status,status_source')
      .eq('session_id', sessionId),
    includeGuestSnapshots
      ? client.from('planned_session_realized_guest_snapshots_v1')
        .select('session_id,guest_id,player_name,origin_team,position_group,status')
        .eq('session_id', sessionId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const playerRows = unwrap(players) || [];
  const guestRows = unwrap(guests) || [];
  if (playerRows.length !== realization.roster_count) {
    throw new Error('La lista de estados realizados no coincide con la plantilla confirmada.');
  }
  return { ...realization, players: playerRows, guests: guestRows };
};

export const confirmPlannedSessionRealization = async (client, sessionId, revision, reviewAcknowledged) => {
  if (!sessionId || !Number.isInteger(revision) || revision < 1 || reviewAcknowledged !== true) {
    throw new Error('Confirma que revisaste toda la lista antes de marcar la sesión como realizada.');
  }
  return unwrap(await client.rpc('confirm_planned_training_session_realized_v1', {
    p_session_id: sessionId,
    p_expected_revision: revision,
    p_review_acknowledged: reviewAcknowledged,
  }));
};

export const loadPlayerRealizedTrainingStats = async (client, playerId, clubTeamSeasonId, throughDate) => {
  const ready = await checkPlannedSessionRealizationReady(client);
  if (!ready) return { ready: false, summary: null };
  if (!playerId || !clubTeamSeasonId) {
    return { ready: true, summary: summarizePlayerRealizedTraining() };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(throughDate || '')) {
    throw new Error('La fecha de corte de entrenamientos realizados no es válida.');
  }

  const sessions = unwrap(await client.from('planned_training_sessions')
    .select('id')
    .eq('club_team_season_id', clubTeamSeasonId)
    .eq('planning_state', 'confirmed')
    .lte('session_date', throughDate)
    .is('cancelled_at', null)
    .is('retired_at', null)) || [];
  const sessionIds = [...new Set(sessions.map((row) => row.id).filter(Boolean))];
  if (!sessionIds.length) return { ready: true, summary: summarizePlayerRealizedTraining() };

  const rows = unwrap(await client.from('planned_session_realized_player_statuses')
    .select('session_id,status')
    .eq('player_id', playerId)
    .in('session_id', sessionIds)) || [];
  return { ready: true, summary: summarizePlayerRealizedTraining(rows) };
};

export const loadPlayerSessionAvailability = async (client, playerId, clubTeamSeasonId, beforeDate) => {
  if (!playerId || !clubTeamSeasonId) return summarizePlayerSessionAvailability();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(beforeDate || '')) {
    throw new Error('La fecha de corte del resumen de entrenamientos no es válida.');
  }

  let sessionsQuery = client.from('planned_training_sessions')
    .select(`id,session_date,planning_state${SESSION_RETIREMENT_BACKEND_VERIFIED ? ',cancelled_at,retired_at' : ''}`)
    .eq('club_team_season_id', clubTeamSeasonId)
    .eq('planning_state', 'confirmed')
    .lt('session_date', beforeDate);
  if (SESSION_RETIREMENT_BACKEND_VERIFIED) {
    sessionsQuery = sessionsQuery.is('cancelled_at', null).is('retired_at', null);
  }
  const sessions = unwrap(await sessionsQuery) || [];
  const eligibleSessions = sessions.filter((row) => row.id && row.planning_state === 'confirmed' &&
    row.session_date < beforeDate &&
    (!SESSION_RETIREMENT_BACKEND_VERIFIED || (!row.cancelled_at && !row.retired_at)));
  if (!eligibleSessions.length) return summarizePlayerSessionAvailability();

  const sessionIds = eligibleSessions.map((row) => row.id);
  const rosterRows = unwrap(await client.from('planned_session_player_roster')
    .select('session_id').eq('player_id', playerId).in('session_id', sessionIds)) || [];
  const countedSessionIds = [...new Set(rosterRows
    .map((row) => row.session_id)
    .filter((sessionId) => sessionIds.includes(sessionId)))];
  if (!countedSessionIds.length) return summarizePlayerSessionAvailability();

  const availabilityRows = unwrap(await client.from('planned_session_player_availability')
    .select('session_id,status').eq('player_id', playerId).in('session_id', countedSessionIds)) || [];
  return summarizePlayerSessionAvailability(
    countedSessionIds.map((session_id) => ({ session_id })),
    availabilityRows,
  );
};

export const savePlannedSessionMaterial = async (client, sessionId, revision, state) =>
  unwrap(await client.rpc('save_planned_session_material', {
    p_session_id: sessionId, p_expected_revision: revision, p_state: state,
  }));

export const listPlannedSessions = async (client, clubTeamSeasonId, withMcV4 = false) => {
  await reconcilePlannedSessionNumbering(client, clubTeamSeasonId);
  let query = client.from('planned_training_sessions')
    .select(`id,club_team_season_id,session_date,starts_at,planning_state,session_number,revision,morphology_pattern,objectives${withMcV4 ? ',mc_number' : ''}${SESSION_RETIREMENT_BACKEND_VERIFIED ? ',cancelled_at' : ''}`)
    .eq('club_team_season_id', clubTeamSeasonId);
  if (SESSION_RETIREMENT_BACKEND_VERIFIED) query = query.is('retired_at', null);
  const sessions = unwrap(await query.order('session_date', { ascending: false })) || [];
  if (!sessions.length) return [];
  const slots = unwrap(await client.from('planned_session_slots')
    .select('session_id,duration_minutes').in('session_id', sessions.map((row) => row.id))) || [];
  const durationBySession = new Map();
  const slotsBySession = new Map();
  for (const slot of slots) {
    slotsBySession.set(slot.session_id, [...(slotsBySession.get(slot.session_id) || []), slot]);
    durationBySession.set(slot.session_id,
      (durationBySession.get(slot.session_id) || 0) + Number(slot.duration_minutes || 0));
  }
  return sessions.map((row) => ({ ...row, total_minutes: durationBySession.get(row.id) || 0,
    durationKnown: Boolean(slotsBySession.get(row.id)?.length) &&
      slotsBySession.get(row.id).every((slot) => Number.isInteger(Number(slot.duration_minutes)) &&
        Number(slot.duration_minutes) > 0) }));
};

// Paginación explícita: PostgREST puede limitar el número de filas por respuesta.
// La consulta sigue pasando por RLS y nunca busca fuera del CTS seleccionado.
export const listPlannedSessionsForExport = async (client, clubTeamSeasonId, fromDate, toDate) => {
  if (!clubTeamSeasonId || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(toDate) || fromDate > toDate)
    throw new Error('Selecciona un intervalo de fechas válido.');
  await reconcilePlannedSessionNumbering(client, clubTeamSeasonId);
  const pageSize = 500;
  const rows = [];
  for (let offset = 0; ;) {
    let query = client.from('planned_training_sessions')
      .select('id,club_team_season_id,session_date,starts_at,session_number', { count: 'exact' })
      .eq('club_team_season_id', clubTeamSeasonId)
      .gte('session_date', fromDate).lte('session_date', toDate)
      .order('session_date', { ascending: true })
      .order('starts_at', { ascending: true })
      .order('session_number', { ascending: true })
      .order('id', { ascending: true });
    if (SESSION_RETIREMENT_BACKEND_VERIFIED) query = query.is('retired_at', null);
    const response = await query.range(offset, offset + pageSize - 1);
    const batch = unwrap(response) || [];
    rows.push(...batch);
    if (!batch.length || (Number.isInteger(response.count) && rows.length >= response.count)) break;
    offset += batch.length;
  }
  return rows;
};

export const reconcilePlannedSessionNumbering = async (client, clubTeamSeasonId) => {
  if (!clubTeamSeasonId || typeof client?.rpc !== 'function') return false;
  const result = await client.rpc('reconcile_planned_session_numbering_v1', {
    p_club_team_season_id: clubTeamSeasonId,
  });
  if (!result.error) return result.data === true;
  if (['42883', 'PGRST202'].includes(result.error.code)) return false;
  throw result.error;
};

// Los valores sugeridos proceden solo de registros visibles del CTS actual.
export const listPlannedLocations = async (client, clubTeamSeasonId) => {
  if (!clubTeamSeasonId) return [];
  const rows = unwrap(await client.from('planned_training_sessions').select('location')
    .eq('club_team_season_id', clubTeamSeasonId)) || [];
  const names = new Map();
  for (const row of rows) {
    const label = String(row.location || '').trim().replace(/\s+/g, ' ');
    if (label && !names.has(label.toLocaleLowerCase('es'))) names.set(label.toLocaleLowerCase('es'), label);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b, 'es'));
};

export const listPlannedOpponents = async (client, clubTeamSeasonId) => {
  if (!clubTeamSeasonId) return [];
  const matches = unwrap(await client.from('partidos').select('equipo_rival_id')
    .eq('club_team_season_id', clubTeamSeasonId)) || [];
  const ids = [...new Set(matches.map((row) => row.equipo_rival_id).filter(Boolean))];
  if (!ids.length) return [];
  const rivals = unwrap(await client.from('equipos_rivales').select('id,name').in('id', ids)) || [];
  return rivals.filter((row) => ids.includes(row.id) && row.name?.trim())
    .map((row) => ({ id: row.id, name: row.name.trim() }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
};

export const loadPlannedSession = async (client, sessionId, clubTeamSeasonId) => {
  const session = unwrap(await client.from('planned_training_sessions').select('*')
    .eq('id', sessionId).eq('club_team_season_id', clubTeamSeasonId).single());
  const [slotsResponse, itemsResponse] = await Promise.all([
    client.from('planned_session_slots').select('*').eq('session_id', sessionId),
    client.from('planned_session_items').select('*').eq('session_id', sessionId),
  ]);
  return { session, slots: unwrap(slotsResponse) || [], items: unwrap(itemsResponse) || [] };
};

// La consulta del cliente respeta RLS de training_tasks; el filtro de club
// impide ofrecer tareas ajenas al contexto aunque sean legibles por otra vía.
const hydratePlannedLibraryImages = async (client, tasks) => {
  if (!tasks.length) return {};
  const ids = tasks.map((task) => task.id);
  const media = unwrap(await client.from('training_task_media').select('*')
    .in('task_id', ids).eq('kind', 'image')) || [];
  const byTask = media.reduce((groups, row) => {
    groups[row.task_id] = [...(groups[row.task_id] || []), normalizeTrainingTaskMedia(row)];
    return groups;
  }, {});
  const entries = await Promise.all(tasks.map(async (task) => {
    const featured = selectTrainingTaskPreviewMedia(byTask[task.id] || []);
    const legacyPath = task.preview_path ||
      (String(task.attachment_mime || '').startsWith('image/') ? task.attachment_path : '');
    try {
      if (featured?.source === 'url' && featured.originalUrl) {
        return [task.id, { id: featured.id, signedUrl: featured.originalUrl,
          originalName: featured.title || featured.originalName || task.name }];
      }
      if (featured?.storagePath) {
        return [task.id, { id: featured.id, signedUrl: await getTaskMediaSignedUrl(client, featured),
          originalName: featured.title || featured.originalName || task.name }];
      }
      if (legacyPath) {
        const { data, error } = await client.storage.from(TRAINING_TASK_MEDIA_BUCKET)
          .createSignedUrl(legacyPath, 3600);
        if (error) throw error;
        return [task.id, { id: `legacy-${task.id}`, signedUrl: data.signedUrl,
          originalName: task.attachment_name || task.name }];
      }
    } catch {
      // Una imagen inaccesible no debe impedir abrir ni imprimir la sesión.
    }
    return [task.id, null];
  }));
  return Object.fromEntries(entries.filter(([, image]) => image));
};

export const loadPlannedLibraryTaskImages = async (client, taskIds) => {
  const ids = [...new Set((taskIds || []).filter(Boolean))];
  if (!ids.length) return {};
  const tasks = unwrap(await client.from('training_tasks')
    .select('id,name,preview_path,attachment_path,attachment_name,attachment_mime')
    .in('id', ids)) || [];
  return hydratePlannedLibraryImages(client, tasks);
};

export const listPlannedLibraryTasks = async (client, clubId, seriesEnabled = false, contentEnabled = false) => {
  if (!clubId) return [];
  const tasks = unwrap(await client.from('training_tasks')
    .select(`id,club_id,name,description,objective,material,technical_content,tactical_content,observations,editor_payload,duration_minutes,space_width_m,space_length_m,task_type,game_phase,game_moment,preview_path,attachment_path,attachment_name,attachment_mime${seriesEnabled ? ',series_count,minutes_per_series' : ''}${contentEnabled ? ',exercise_rules,tactical_content_offensive,tactical_content_defensive' : ''}`)
    .eq('club_id', clubId).order('name', { ascending: true }))?.filter((row) => row.club_id === clubId) || [];
  const images = await hydratePlannedLibraryImages(client, tasks);
  return tasks.map((task) => ({ ...task, representationImage: images[task.id] || null }));
};

export const createPlannedDraft = async (client, clubTeamSeasonId, sessionDate) =>
  unwrap(await client.rpc('create_planned_session_draft', {
    p_club_team_season_id: clubTeamSeasonId,
    p_session_date: sessionDate,
  }));

export const savePlannedSession = async (client, payload, use03c = false) =>
  unwrap(await client.rpc(use03c ? 'save_planned_session_03c' : 'save_planned_session', payload));

export const confirmPlannedSession = async (client, sessionId, revision, use03c = false) =>
  unwrap(await client.rpc(use03c ? 'confirm_planned_session_03c' : 'confirm_planned_session', {
    p_session_id: sessionId,
    p_expected_revision: revision,
  }));

export const changePlannedSessionLifecycle = async (client, sessionId, revision, action, reason = null) => {
  if (!SESSION_RETIREMENT_BACKEND_VERIFIED) throw new Error('El backend de eliminación y anulación aún no está verificado.');
  if (!['retire', 'cancel', 'reactivate'].includes(action)) throw new Error('Acción de sesión no admitida.');
  return unwrap(await client.rpc('change_planned_session_lifecycle_2c', {
    p_session_id: sessionId,
    p_expected_revision: revision,
    p_action: action,
    p_reason: action === 'reactivate' ? null : reason?.trim() || null,
  }));
};

export const loadPlannedRosterCandidates = async (client, clubTeamSeasonId) => {
  const memberships = unwrap(await client.from('club_team_season_players')
    .select('id,club_team_season_id,player_id,joined_on,left_on,has_departed')
    .eq('club_team_season_id', clubTeamSeasonId).is('voided_at', null)) || [];
  if (!memberships.length) return [];
  const ids = [...new Set(memberships.map((row) => row.player_id))];
  const [namesResponse, positionsResponse, specificPositionsResponse] = await Promise.all([
    client.from('players_database').select('id,name').in('id', ids),
    client.from('player_positions').select('player_id,position_key,position_type,is_primary')
      .in('player_id', ids).eq('position_type', 'natural').eq('is_primary', true),
    client.from('player_positions').select('player_id,position_key,position_type,is_primary')
      .in('player_id', ids).eq('position_type', 'specific').eq('is_primary', true),
  ]);
  const names = new Map((unwrap(namesResponse) || []).map((row) => [row.id, row.name]));
  const positions = unwrap(positionsResponse) || [];
  const specificPositions = unwrap(specificPositionsResponse) || [];
  const keys = new Map(ids.map((id) => [id, positions.filter((row) => row.player_id === id).map((row) => row.position_key)]));
  const specificKeys = new Map(ids.map((id) => [id,
    specificPositions.filter((row) => row.player_id === id).map((row) => row.position_key)]));
  if (memberships.some((row) => !names.get(row.player_id) || keys.get(row.player_id).length > 1)) {
    throw new Error('Identidad o posición principal ambigua en la plantilla canónica. Revisa las pertenencias antes de congelar.');
  }
  return memberships.map((row) => ({ ...row, name: names.get(row.player_id),
    position_key: keys.get(row.player_id)[0] || null,
    specific_position_key: specificKeys.get(row.player_id).length === 1 ? specificKeys.get(row.player_id)[0] : null }));
};

export const loadPlannedSessionPlayers = async (client, sessionId) => {
  const [rosterResponse, availabilityResponse] = await Promise.all([
    client.from('planned_session_player_roster')
      .select('session_id,player_id,source_membership_id,player_name_snapshot,position_key_snapshot')
      .eq('session_id', sessionId),
    client.from('planned_session_player_availability')
      .select('session_id,player_id,status,observation').eq('session_id', sessionId),
  ]);
  const roster = unwrap(rosterResponse) || [];
  const availability = unwrap(availabilityResponse) || [];
  if (availability.some((row) => !roster.some((player) => player.player_id === row.player_id)))
    throw new Error('La disponibilidad no coincide con la plantilla histórica de la sesión.');
  return { roster, availability };
};

export const loadPlannedSessionGuests = async (client, sessionId) => {
  if (!sessionId) throw new Error('Falta el identificador de sesión para cargar sus invitados.');
  return (unwrap(await client.from('planned_session_guests_v1')
    .select('id,session_id,player_name,origin_team,position_group,status')
    .eq('session_id', sessionId)) || []).map((row) => ({
    ...row, name: row.player_name, origin_team: row.origin_team || '', is_guest: true,
  }));
};

export const savePlannedSessionGuests = async (client, sessionId, revision, guests) =>
  unwrap(await client.rpc('save_planned_session_guests_v1', {
    p_session_id: sessionId,
    p_expected_revision: revision,
    p_guests: guests.map(({ id, name, origin_team, position_group, status }) => ({
      id,
      player_name: name,
      origin_team: origin_team || null,
      position_group,
      status,
    })),
  }));

export const loadPlannedDistribution = async (client, sessionId) => unwrap(await client
  .from('planned_session_distributions')
  .select('session_id,formation_key,specific_positions_snapshot,player_layout,space_zones')
  .eq('session_id', sessionId).maybeSingle());

export const loadPlannedSpecificPositions = async (client, playerIds) => {
  if (!playerIds.length) return [];
  return unwrap(await client.from('player_positions')
    .select('player_id,position_key,position_type,is_primary')
    .in('player_id', [...new Set(playerIds)])
    .eq('position_type', 'specific').eq('is_primary', true)) || [];
};

export const savePlannedDistribution = async (client, sessionId, revision, distribution) =>
  unwrap(await client.rpc('save_planned_session_distributions_05', {
    p_session_id: sessionId,
    p_expected_revision: revision,
    p_formation_key: distribution.formation_key,
    p_player_layout: distribution.player_layout,
    p_space_zones: distribution.space_zones,
  }));

export const checkPlannedExerciseDimensionsV12 = async (client) => {
  const response = await client.from('planned_session_exercise_dimensions_v12')
    .select('session_id').limit(0);
  if (!response?.error) return true;
  if (['PGRST205', '42P01'].includes(response.error.code)) return false;
  throw response.error;
};

export const loadPlannedExerciseDimensionsV12 = async (client, sessionId) =>
  unwrap(await client.from('planned_session_exercise_dimensions_v12')
    .select('slot_id,length_m,width_m').eq('session_id', sessionId));

export const savePlannedDistributionV12 = async (client, sessionId, revision, distribution, dimensions) =>
  unwrap(await client.rpc('save_planned_session_exercise_dimensions_v12', {
    p_session_id: sessionId, p_expected_revision: revision,
    p_formation_key: distribution.formation_key,
    p_player_layout: distribution.player_layout,
    p_space_zones: distribution.space_zones,
    p_dimensions: dimensions,
  }));

export const loadPlannedBoardDefaultsV11 = async (client, ctsId) => unwrap(await client
  .from('planned_cts_board_defaults_v11').select('formation_key,player_layout,field_length_m,field_width_m')
  .eq('club_team_season_id', ctsId).maybeSingle());

export const loadPlannedBoardSeedV11 = async (client, sessionId) => unwrap(await client
  .from('planned_session_board_seed_v11').select('formation_key,player_layout,field_length_m,field_width_m')
  .eq('session_id', sessionId).maybeSingle());

export const savePlannedFieldDimensionsV11 = async (client, sessionId, revision, field) =>
  unwrap(await client.rpc('save_planned_field_dimensions_v11', {
    p_session_id: sessionId, p_expected_revision: revision,
    p_length_m: field.length_m === '' ? null : Number(field.length_m),
    p_width_m: field.width_m === '' ? null : Number(field.width_m),
  }));

export const fixPlannedBoardDefaultV11 = async (client, sessionId, kind) =>
  unwrap(await client.rpc('fix_planned_board_default_v11', { p_session_id: sessionId, p_kind: kind }));

export const savePlannedSessionValue = async (client, sessionId, revision, value) =>
  unwrap(await client.rpc('save_planned_session_value_06', {
    p_session_id: sessionId,
    p_expected_revision: revision,
    p_value: parsePlannedSessionValue(value),
  }));

export const freezePlannedRoster = async (client, sessionId, revision, membershipIds,
  confirmUncertain, confirmExisting) => unwrap(await client.rpc('freeze_planned_session_roster_04b', {
  p_session_id: sessionId,
  p_expected_revision: revision,
  p_source_membership_ids: membershipIds,
  p_confirm_uncertain_dates: confirmUncertain,
  p_confirm_existing_session: confirmExisting,
}));

export const savePlannedAvailability = async (client, sessionId, revision, changes) =>
  unwrap(await client.rpc('save_planned_session_availability_04b', {
    p_session_id: sessionId, p_expected_revision: revision, p_changes: changes,
  }));

export const reconcilePlannedDate = async (client, sessionId, revision, newDate, membershipIds,
  confirmUncertain) => unwrap(await client.rpc('reconcile_planned_session_date_04b', {
  p_session_id: sessionId,
  p_expected_revision: revision,
  p_new_date: newDate,
  p_confirmed_source_membership_ids: membershipIds,
  p_confirm_uncertain_dates: confirmUncertain,
}));
