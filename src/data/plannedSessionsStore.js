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
    .select('id,club_team_season_id,session_date,starts_at,planning_state,session_number,revision')
    .eq('club_team_season_id', clubTeamSeasonId)
    .order('session_date', { ascending: false })) || [];
  if (!sessions.length) return [];
  const slots = unwrap(await client.from('planned_session_slots')
    .select('session_id,duration_minutes').in('session_id', sessions.map((row) => row.id))) || [];
  const durationBySession = new Map();
  for (const slot of slots) {
    durationBySession.set(slot.session_id,
      (durationBySession.get(slot.session_id) || 0) + Number(slot.duration_minutes || 0));
  }
  return sessions.map((row) => ({ ...row, total_minutes: durationBySession.get(row.id) || 0 }));
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

export const createPlannedDraft = async (client, clubTeamSeasonId, sessionDate) =>
  unwrap(await client.rpc('create_planned_session_draft', {
    p_club_team_season_id: clubTeamSeasonId,
    p_session_date: sessionDate,
  }));

export const savePlannedSession = async (client, payload) =>
  unwrap(await client.rpc('save_planned_session', payload));

export const confirmPlannedSession = async (client, sessionId, revision) =>
  unwrap(await client.rpc('confirm_planned_session', {
    p_session_id: sessionId,
    p_expected_revision: revision,
  }));
