const clean = (value) => String(value ?? '').trim();
const rows = (value) => Array.isArray(value) ? value : [];
const CLUB_DESIGNATOR_TOKENS = new Set(['cd', 'cf', 'fc', 'sd', 'ud', 'club']);

export const normalizeOpponentTeamName = (value) => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase();

export const normalizeOpponentTeamMatchKey = (value) => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .split(/\s+/)
  .filter((token) => token && !CLUB_DESIGNATOR_TOKENS.has(token))
  .join('');

const findUniqueTeamByName = (teams, opponent) => {
  const exactKey = normalizeOpponentTeamName(opponent);
  const exactMatches = exactKey
    ? teams.filter((team) => normalizeOpponentTeamName(team?.name) === exactKey)
    : [];
  if (exactMatches.length === 1) return { team: exactMatches[0], source: 'team_name' };
  if (exactMatches.length > 1) return { team: null, source: '' };
  const normalizedKey = normalizeOpponentTeamMatchKey(opponent);
  const normalizedMatches = normalizedKey
    ? teams.filter((team) => normalizeOpponentTeamMatchKey(team?.name) === normalizedKey)
    : [];
  return normalizedMatches.length === 1
    ? { team: normalizedMatches[0], source: 'team_name_normalized' }
    : { team: null, source: '' };
};

export const resolveOpponentTeamIdentity = ({ match = {}, teams = [] } = {}) => {
  const linkedTeamId = clean(
    match.equipoRivalId
    || match.equipo_rival_id
    || match.opponentTeamId
    || match.opponent_team_id,
  );
  const opponent = clean(match.opponent || match.rival || match.opponentName);
  const matchCrest = clean(match.opponentCrest || match.opponent_crest);
  const rivalTeams = rows(teams).filter((team) => !team?.isOwnClub && clean(team?.teamKind || team?.team_kind || 'rival') !== 'own');
  const linkedTeam = linkedTeamId
    ? rivalTeams.find((team) => clean(team.id) === linkedTeamId) || null
    : null;
  const namedResolution = !linkedTeam && opponent
    ? findUniqueTeamByName(rivalTeams, opponent)
    : { team: null, source: '' };
  const namedTeam = namedResolution.team;
  const team = linkedTeam || namedTeam;
  const crest = clean(team?.crest || team?.logo || team?.logoUrl || team?.logo_url) || matchCrest;
  return {
    team,
    teamId: clean(team?.id) || linkedTeamId,
    opponent: opponent || clean(team?.name),
    crest,
    source: linkedTeam ? 'team_id' : namedTeam ? namedResolution.source : matchCrest ? 'match_snapshot' : 'missing',
  };
};
