import { normalizeOpponentTeamName, resolveOpponentTeamIdentity } from './opponentTeamIdentity.js';

const clean = (value) => String(value ?? '').trim();
const rows = (value) => (Array.isArray(value) ? value : []);

const TARGETS = [
  { key: 'salamanca', label: 'Salamanca CF UDS', anchor: 'salamanca' },
  { key: 'ceares', label: 'Unión Club Ceares', anchor: 'ceares' },
];

const getMatchTeamId = (match = {}) => clean(
  match.equipoRivalId
  || match.equipo_rival_id
  || match.opponentTeamId
  || match.opponent_team_id,
);

const getMatchOpponent = (match = {}) => clean(match.opponent || match.rival || match.opponentName);
const getMatchCrest = (match = {}) => clean(match.opponentCrest || match.opponent_crest);
const getTeamCrest = (team = {}) => clean(team.crest || team.logo || team.logoUrl || team.logo_url);

const sanitizeCrestUrl = (value) => {
  const source = clean(value);
  if (!source) return '';
  if (/^data:/i.test(source)) {
    const mime = source.match(/^data:([^;,]+)/i)?.[1] || 'image';
    return `[data:${mime}]`;
  }
  try {
    const parsed = new URL(source, 'https://appcaudal.invalid');
    parsed.username = '';
    parsed.password = '';
    parsed.search = '';
    parsed.hash = '';
    if (parsed.origin === 'https://appcaudal.invalid') return parsed.pathname;
    return parsed.href;
  } catch {
    return source.split(/[?#]/, 1)[0];
  }
};

const sanitizeLoadError = (value) => {
  const error = clean(value);
  if (!error) return '';
  if (/^http_\d{3}$/i.test(error)) return error.toLowerCase();
  if (/^unsupported_mime:[a-z0-9.+/-]+$/i.test(error)) return error.toLowerCase();
  if (['missing_source', 'missing_mime', 'fetch_unavailable'].includes(error)) return error;
  if (error.startsWith('fetch_failed:')) return 'fetch_failed';
  return 'image_load_error';
};

const summarizeTeam = (team) => team ? {
  id: clean(team.id),
  name: clean(team.name),
  crest: sanitizeCrestUrl(getTeamCrest(team)),
} : null;

const isRivalTeam = (team) => (
  !team?.isOwnClub
  && clean(team?.teamKind || team?.team_kind || 'rival') !== 'own'
);

export const isPlayerPdfCrestAuditEnabled = (locationLike = globalThis.location) => {
  try {
    return new URLSearchParams(clean(locationLike?.search)).get('qaCrestAudit') === '1';
  } catch {
    return false;
  }
};

export const buildPlayerPdfCrestAudit = ({ matches = [], teams = [] } = {}) => {
  const rivalTeams = rows(teams).filter(isRivalTeam);
  return {
    audit: 'PLAYER_PDF_CREST_RESOLUTION',
    rivals: TARGETS.map((target) => {
      const match = rows(matches).find((candidate) => (
        normalizeOpponentTeamName(getMatchOpponent(candidate)).includes(target.anchor)
      )) || null;
      const opponent = getMatchOpponent(match || {});
      const opponentNormalized = normalizeOpponentTeamName(opponent);
      const matchTeamId = getMatchTeamId(match || {});
      const matchCrest = getMatchCrest(match || {});
      const catalogById = matchTeamId
        ? rivalTeams.find((team) => clean(team.id) === matchTeamId) || null
        : null;
      const normalizedCandidates = opponentNormalized
        ? rivalTeams.filter((team) => normalizeOpponentTeamName(team.name) === opponentNormalized)
        : [];
      const relatedEntries = rivalTeams.filter((team) => (
        normalizeOpponentTeamName(team.name).includes(target.anchor)
      ));
      const identity = match ? resolveOpponentTeamIdentity({ match, teams }) : null;
      const resolvedTeamCrest = getTeamCrest(identity?.team || {});

      return {
        target: target.label,
        matchFound: Boolean(match),
        match: match ? {
          id: clean(match.id || match.matchId || match.match_id),
          opponent,
          teamId: matchTeamId,
          opponentCrest: sanitizeCrestUrl(matchCrest),
          competitionKey: clean(match.competitionKey || match.competition_key),
        } : null,
        catalog: {
          matchById: summarizeTeam(catalogById),
          normalizedNameCandidateCount: normalizedCandidates.length,
          normalizedNameCandidates: normalizedCandidates.map(summarizeTeam),
          relatedEntryCount: relatedEntries.length,
          relatedEntries: relatedEntries.map(summarizeTeam),
        },
        resolution: identity ? {
          teamFound: Boolean(identity.team),
          method: clean(identity.source),
          team: summarizeTeam(identity.team),
          resolvedTeamId: clean(identity.teamId),
          resolvedTeamName: clean(identity.team?.name),
          teamCrestCandidate: sanitizeCrestUrl(resolvedTeamCrest),
          matchCrestCandidate: sanitizeCrestUrl(matchCrest),
          crestCandidate: sanitizeCrestUrl(resolvedTeamCrest || matchCrest),
          finalCrest: sanitizeCrestUrl(identity.crest),
          fallbackUsed: identity.source === 'match_snapshot' ? 'match_snapshot' : '',
        } : null,
        load: null,
      };
    }),
  };
};

export const completePlayerPdfCrestAudit = (audit, opponentCrestLoads = []) => ({
  ...audit,
  rivals: rows(audit?.rivals).map((rival) => {
    const load = rows(opponentCrestLoads).find((candidate) => (
      clean(candidate.matchId) === clean(rival.match?.id)
    )) || null;
    const finalUrl = sanitizeCrestUrl(load?.source || rival.resolution?.finalCrest);
    const attempted = Boolean(load?.source);
    return {
      ...rival,
      load: {
        finalUrl,
        urlPresent: Boolean(finalUrl),
        attempted,
        result: load?.loaded ? 'success' : attempted ? 'error' : 'not_attempted',
        imageType: clean(load?.imageFormat),
        error: load?.loaded ? '' : sanitizeLoadError(load?.error || (attempted ? 'image_load_error' : 'missing_source')),
      },
    };
  }),
});

