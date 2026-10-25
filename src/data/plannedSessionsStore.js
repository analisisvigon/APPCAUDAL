import { parsePlannedSessionValue } from '../utils/plannedSessionValue.js';

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
      team_name: nameById.get(link.team_id) || team.code,
      team_code: team.code,
    }];
  }).sort((a, b) => b.starts_on.localeCompare(a.starts_on) || a.team_name.localeCompare(b.team_name));
};

export const listPlannedSessions = async (client, clubTeamSeasonId) => {
  const sessions = unwrap(await client.from('planned_training_sessions')
    .select('id,club_team_season_id,session_date,starts_at,planning_state,session_number,revision,morphology_pattern,objectives')
    .eq('club_team_season_id', clubTeamSeasonId)
    .order('session_date', { ascending: false })) || [];
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
export const listPlannedLibraryTasks = async (client, clubId) => {
  if (!clubId) return [];
  return unwrap(await client.from('training_tasks')
    .select('id,club_id,name,description,objective,material,technical_content,tactical_content,observations,editor_payload,duration_minutes,space_width_m,space_length_m,task_type,game_phase,game_moment')
    .eq('club_id', clubId).order('name', { ascending: true }))?.filter((row) => row.club_id === clubId) || [];
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

export const loadPlannedRosterCandidates = async (client, clubTeamSeasonId) => {
  const memberships = unwrap(await client.from('club_team_season_players')
    .select('id,club_team_season_id,player_id,joined_on,left_on,has_departed')
    .eq('club_team_season_id', clubTeamSeasonId).is('voided_at', null)) || [];
  if (!memberships.length) return [];
  const ids = [...new Set(memberships.map((row) => row.player_id))];
  const [namesResponse, positionsResponse] = await Promise.all([
    client.from('players_database').select('id,name').in('id', ids),
    client.from('player_positions').select('player_id,position_key,position_type,is_primary')
      .in('player_id', ids).eq('position_type', 'natural').eq('is_primary', true),
  ]);
  const names = new Map((unwrap(namesResponse) || []).map((row) => [row.id, row.name]));
  const positions = unwrap(positionsResponse) || [];
  const keys = new Map(ids.map((id) => [id, positions.filter((row) => row.player_id === id).map((row) => row.position_key)]));
  if (memberships.some((row) => !names.get(row.player_id) || keys.get(row.player_id).length > 1)) {
    throw new Error('Identidad o posición principal ambigua en la plantilla canónica. Revisa las pertenencias antes de congelar.');
  }
  return memberships.map((row) => ({ ...row, name: names.get(row.player_id),
    position_key: keys.get(row.player_id)[0] || null }));
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
