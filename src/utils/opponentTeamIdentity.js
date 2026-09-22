const clean = (value) => String(value ?? '').trim();
const rows = (value) => Array.isArray(value) ? value : [];

export const normalizeOpponentTeamName = (value) => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase();

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
  const namedTeam = !linkedTeamId && opponent
    ? rivalTeams.find((team) => normalizeOpponentTeamName(team.name) === normalizeOpponentTeamName(opponent)) || null
    : null;
  const team = linkedTeam || namedTeam;
  const crest = clean(team?.crest || team?.logo || team?.logoUrl || team?.logo_url) || matchCrest;
  return {
    team,
    teamId: clean(team?.id) || linkedTeamId,
    opponent: opponent || clean(team?.name),
    crest,
    source: linkedTeam ? 'team_id' : namedTeam ? 'team_name' : matchCrest ? 'match_snapshot' : 'missing',
  };
};
