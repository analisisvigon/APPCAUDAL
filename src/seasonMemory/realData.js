import { resolveSeasonMemoryContexts } from './realModel.js';
import { loadRealIndividualSnapshot } from './realIndividualData.js';

const unwrap = (response, label) => {
  if (response?.error) throw new Error(`No se pudieron leer ${label}.`);
  if (!Array.isArray(response?.data)) throw new Error(`Respuesta inválida al leer ${label}.`);
  return response.data;
};

async function readAll(queryFactory, label) {
  const rows = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const page = unwrap(await queryFactory().range(from, from + pageSize - 1), label);
    rows.push(...page);
    if (page.length < pageSize) return rows;
    if (from > 20000) throw new Error(`Demasiados registros en ${label}; revisar paginación.`);
  }
}

export async function loadRealSeasonMemoryContexts(client, membership) {
  if (!membership?.club_id || !['owner', 'admin', 'staff'].includes(membership.role)
    || membership.is_active !== true) throw new Error('Acceso no autorizado.');
  const clubId = membership.club_id;
  const [links, seasons, teams, ownTeams] = await Promise.all([
    readAll(() => client.from('club_team_seasons').select('id,club_id,team_id,season_id')
      .eq('club_id', clubId), 'vínculos de temporada'),
    readAll(() => client.from('club_seasons')
      .select('id,club_id,label,starts_on,ends_on,is_active,status')
      .eq('club_id', clubId), 'temporadas'),
    readAll(() => client.from('club_teams').select('id,club_id,code')
      .eq('club_id', clubId), 'equipos canónicos'),
    readAll(() => client.from('equipos_rivales').select('id,name,crest,team_kind')
      .eq('team_kind', 'own'), 'equipo propio'),
  ]);
  return resolveSeasonMemoryContexts({ membership, links, seasons, teams, ownTeams });
}

const MATCH_COLUMNS = 'id,club_team_season_id,date,time,type,round,opponent,opponent_crest,is_home,home_team,away_team,status,home_score,away_score,goals_for,goals_against,competition_id,competition_key,possession,shots,shots_on_target,corners,yellow_cards,red_cards,stats_system,post_video_link,post_notes,post_reality,post_fulfilled,post_not_fulfilled,post_why,post_next_adjustment,post_repeat,post_improve,post_train_week';

export async function loadRealSeasonMemorySnapshot(client, context, { includeIndividual = false } = {}) {
  if (!context?.id || !context?.clubId) throw new Error('CTS no acreditado.');
  const [matches, catalog, unlinked] = await Promise.all([
    readAll(() => client.from('partidos').select(MATCH_COLUMNS)
      .eq('club_team_season_id', context.id).order('date', { ascending: true })
      .order('id', { ascending: true }), 'partidos'),
    readAll(() => client.from('competitions')
      .select('id,club_id,key,name,competition_type,season')
      .or(`club_id.eq.${context.clubId},club_id.is.null`), 'competiciones'),
    client.from('partidos').select('id', { count: 'exact', head: true })
      .is('club_team_season_id', null),
  ]);
  if (unlinked.error || !Number.isInteger(unlinked.count)) {
    throw new Error('No se pudo verificar el número de partidos sin vínculo CTS.');
  }
  let individual;
  let individualError = null;
  if (includeIndividual) {
    try {
      individual = await loadRealIndividualSnapshot(client, context, matches);
    } catch {
      individualError = 'No se pudieron verificar los datos individuales.';
    }
  }
  return { matches, catalog, unlinkedCount: unlinked.count, individual, individualError };
}
