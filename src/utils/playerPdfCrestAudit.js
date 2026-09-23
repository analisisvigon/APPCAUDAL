import { normalizeOpponentTeamName, resolveOpponentTeamIdentity } from './opponentTeamIdentity.js';
import { getFormationSlotsForSavedLineup } from './formationSlotCoordinates.js';
import { getGoalAssistant, getGoalScorer } from './goalEvents.js';
import {
  buildMatchPlayerIdentityRecordsFromStats,
  createMatchPlayerIdentityIndex,
  normalizeMatchPlayerName,
  resolveMatchPlayerCandidate,
} from './matchPlayerIdentity.js';
import { getPlayerAvatarSource } from './playerAvatarPresentation.js';
import { getTacticalPositionAbbreviation } from './playerPositionUsage.js';
import { buildPlayerOffensiveConnections } from './playerProfilePrintReport.js';

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
    [...parsed.searchParams.keys()].forEach((key) => {
      if (/token|authorization|signature|api[_-]?key|credential|jwt|session/i.test(key)) parsed.searchParams.delete(key);
    });
    parsed.hash = '';
    if (parsed.origin === 'https://appcaudal.invalid') return `${parsed.pathname}${parsed.search}`;
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
  if (error.startsWith('blob_failed:')) return 'blob_failed';
  if (error.startsWith('conversion_failed:')) return 'conversion_failed';
  if (error === 'jspdf_render_failed') return error;
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

const nullable = (value) => clean(value) || null;
const finiteNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

const getRawPlayerImageCandidates = (player = {}) => [
  ['originalImage', player.originalImage],
  ['original_image', player.original_image],
  ['image', player.image],
  ['imageUrl', player.imageUrl],
  ['image_url', player.image_url],
  ['photoUrl', player.photoUrl],
  ['photo_url', player.photo_url],
  ['avatarUrl', player.avatarUrl],
  ['avatar_url', player.avatar_url],
].filter(([, value]) => clean(value)).map(([field, value]) => ({ field, url: sanitizeCrestUrl(value) }));

const summarizePlayerCandidate = (player = {}) => ({
  playerId: nullable(player.id || player.playerId || player.player_id || player.jugadorId || player.jugador_id),
  globalPlayerId: nullable(player.globalPlayerId || player.global_player_id),
  membershipId: nullable(player.membershipId || player.membership_id),
  legacyId: nullable(player.legacyId || player.legacy_id),
  name: nullable(player.name || player.playerName || player.player_name),
  shirtName: nullable(player.shirtName || player.shirt_name),
  imageCandidates: getRawPlayerImageCandidates(player),
});

const findPositionSourceSlot = ({ segment, sourceRow, player, players }) => {
  const interval = clean(segment.intervalId)
    ? rows(sourceRow?.intervals).find((candidate) => clean(candidate?.id) === clean(segment.intervalId)) || null
    : rows(sourceRow?.intervals).find((candidate) => (
      Number(candidate?.fromMinute) === Number(segment.fromMinute)
      && Number(candidate?.toMinute) === Number(segment.toMinute)
      && (!clean(segment.system) || clean(candidate?.system) === clean(segment.system))
    )) || null;
  const usesInitialSlot = segment.source === 'initialSlot' && !interval;
  const slots = usesInitialSlot ? rows(sourceRow?.initialSlots) : rows(interval?.slots);
  const identityIndex = createMatchPlayerIdentityIndex([
    ...rows(players),
    ...rows(sourceRow?.playerIdentities),
    ...buildMatchPlayerIdentityRecordsFromStats(sourceRow?.playerStats || {}),
    player,
  ]);
  const resolution = resolveMatchPlayerCandidate({ reference: player, candidates: slots, identityIndex });
  return { interval, slot: resolution.candidate, playerResolution: resolution.status };
};

export const buildPlayerPdfPositionUsageAudit = ({ usage = {}, matchRows = [], player = {}, players = [] } = {}) => {
  const rowsByMatchId = new Map(rows(matchRows).map((row) => [clean(row.matchId), row]));
  const segments = rows(usage.matches).flatMap((match) => rows(match.segments).map((segment) => {
    const sourceRow = rowsByMatchId.get(clean(match.matchId)) || {};
    const { interval, slot, playerResolution } = findPositionSourceSlot({ segment, sourceRow, player, players });
    const system = clean(segment.system || interval?.system || sourceRow.initialSystem);
    const slotIndex = finiteNumber(slot?.slot);
    const formationSlot = slotIndex === null ? null : getFormationSlotsForSavedLineup(system)[slotIndex] || null;
    const rawExplicitPosition = clean(slot?.position || slot?.role || slot?.tacticalPosition || slot?.tactical_position);
    const rawPositionCode = clean(
      slot?.positionCode
      || slot?.position_code
      || slot?.code
      || slot?.position
      || formationSlot?.id,
    );
    const slotRole = clean(slot?.slotRole || slot?.slot_role || slot?.role || formationSlot?.role || formationSlot?.label);
    const resolvedPosition = clean(segment.position);
    return {
      matchId: nullable(match.matchId),
      date: nullable(match.date),
      opponent: nullable(match.opponent),
      competition: nullable(match.competition),
      fromMinute: finiteNumber(segment.fromMinute),
      toMinute: finiteNumber(segment.toMinute),
      minutes: finiteNumber(segment.minutes),
      system: nullable(system),
      rawPositionCode: nullable(rawPositionCode),
      rawExplicitPosition: nullable(rawExplicitPosition),
      slotIndex,
      slotRole: nullable(slotRole),
      resolvedPosition: nullable(resolvedPosition),
      resolvedAbbreviation: resolvedPosition ? getTacticalPositionAbbreviation(resolvedPosition) : null,
      resolutionSource: nullable(segment.source || playerResolution),
    };
  }));
  const totals = new Map();
  segments.filter((segment) => segment.resolvedPosition).forEach((segment) => {
    const current = totals.get(segment.resolvedPosition) || {
      resolvedPosition: segment.resolvedPosition,
      minutes: 0,
      segmentCount: 0,
    };
    current.minutes += Number(segment.minutes || 0);
    current.segmentCount += 1;
    totals.set(segment.resolvedPosition, current);
  });
  return {
    segments,
    positionTotals: [...totals.values()].sort((left, right) => right.minutes - left.minutes
      || left.resolvedPosition.localeCompare(right.resolvedPosition, 'es')),
  };
};

export const buildPlayerPdfOpponentCrestAudit = ({ matches = [], teams = [] } = {}) => ({
  rivals: TARGETS.map((target) => {
    const match = rows(matches).find((candidate) => normalizeOpponentTeamName(getMatchOpponent(candidate)).includes(target.anchor)) || null;
    const identity = match ? resolveOpponentTeamIdentity({ match, teams }) : null;
    const appCandidateUrl = getMatchCrest(match || {});
    const pdfCandidateUrl = clean(identity?.crest);
    return {
      target: target.label,
      matchId: nullable(match?.id || match?.matchId || match?.match_id),
      opponentName: nullable(getMatchOpponent(match || {})),
      opponentTeamId: nullable(getMatchTeamId(match || {})),
      matchOpponentCrest: nullable(sanitizeCrestUrl(appCandidateUrl)),
      resolvedTeamId: nullable(identity?.team?.id),
      resolvedTeamName: nullable(identity?.team?.name),
      resolvedTeamCrest: nullable(sanitizeCrestUrl(getTeamCrest(identity?.team || {}))),
      appCandidateUrl: nullable(sanitizeCrestUrl(appCandidateUrl)),
      pdfCandidateUrl: nullable(sanitizeCrestUrl(pdfCandidateUrl)),
      resolverSource: nullable(identity?.source),
      sameUrl: Boolean(appCandidateUrl || pdfCandidateUrl) && appCandidateUrl === pdfCandidateUrl,
      loadAttempted: false,
      loadSuccess: false,
      httpStatus: null,
      mimeType: null,
      loadError: null,
      fallbackUsed: null,
      diagnosis: match ? null : 'MATCH_NOT_FOUND',
    };
  }),
});

const buildConnectionSourceEvents = ({ connection, goalActions, assistActions }) => {
  const teammateName = connection.direction === 'given' ? clean(connection.to) : clean(connection.from);
  const expectedName = normalizeMatchPlayerName(teammateName);
  const actions = connection.direction === 'given' ? rows(assistActions) : rows(goalActions);
  return actions.filter((action) => {
    const participant = connection.direction === 'given' ? getGoalScorer(action) : getGoalAssistant(action);
    return normalizeMatchPlayerName(participant.name) === expectedName;
  }).map((action) => {
    const scorer = getGoalScorer(action);
    const assistant = getGoalAssistant(action);
    return {
      eventId: nullable(action.id),
      sourceEventType: nullable(action.action || action.type),
      originalScorerId: nullable(scorer.id),
      originalAssistantId: nullable(assistant.id),
      scorerName: nullable(scorer.name),
      assistantName: nullable(assistant.name),
    };
  });
};

const uniqueValue = (values) => {
  const unique = [...new Set(rows(values).map(clean).filter(Boolean))];
  return unique.length === 1 ? unique[0] : null;
};

export const buildPlayerPdfConnectionAudit = ({
  player = {},
  players = [],
  goalActions = [],
  assistActions = [],
  flattenedConnections = [],
  pdfConnections = [],
} = {}) => {
  const renderedConnections = buildPlayerOffensiveConnections({
    society: pdfConnections,
    playerName: player.name,
    playerImage: getPlayerAvatarSource(player),
  }).slice(0, 5);
  return {
    connections: renderedConnections.map((connection) => {
      const teammateName = connection.direction === 'given' ? clean(connection.to) : clean(connection.from);
      const normalizedName = normalizeMatchPlayerName(teammateName);
      const flattened = rows(flattenedConnections).find((row) => normalizeMatchPlayerName(row.name) === normalizedName) || null;
      const pdfFlattened = rows(pdfConnections).find((row) => normalizeMatchPlayerName(row.name) === normalizedName) || null;
      const candidates = rows(players).filter((candidate) => [candidate?.name, candidate?.shirtName, candidate?.shirt_name]
        .filter(Boolean)
        .some((name) => normalizeMatchPlayerName(name) === normalizedName));
      const resolved = candidates.length === 1 ? candidates[0] : null;
      const sourceEvents = buildConnectionSourceEvents({ connection, goalActions, assistActions });
      const selectedImageUrl = clean(pdfFlattened?.image || (resolved ? getPlayerAvatarSource(resolved) : ''));
      return {
        connectionType: nullable(connection.direction),
        sourceEventType: uniqueValue(sourceEvents.map((event) => event.sourceEventType)),
        originalScorerId: uniqueValue(sourceEvents.map((event) => event.originalScorerId)),
        originalAssistantId: uniqueValue(sourceEvents.map((event) => event.originalAssistantId)),
        sourceEvents,
        flattenedConnectionName: nullable(flattened?.name || teammateName),
        flattenedConnectionId: nullable(flattened?.id),
        identityCandidates: candidates.map(summarizePlayerCandidate),
        resolvedPlayerId: nullable(resolved?.id || resolved?.playerId || resolved?.jugadorId),
        resolvedGlobalPlayerId: nullable(resolved?.globalPlayerId || resolved?.global_player_id),
        resolvedMembershipId: nullable(resolved?.membershipId || resolved?.membership_id),
        resolvedLegacyId: nullable(resolved?.legacyId || resolved?.legacy_id),
        resolvedPlayerName: nullable(resolved?.name),
        identityResolutionMode: candidates.length === 1 ? 'unique_normalized_name' : candidates.length > 1 ? 'ambiguous_normalized_name' : 'missing_normalized_name',
        identityAmbiguous: candidates.length > 1,
        imageCandidates: resolved ? getRawPlayerImageCandidates(resolved) : [],
        selectedImageUrl: nullable(sanitizeCrestUrl(selectedImageUrl)),
        loadAttempted: false,
        loadSuccess: false,
        httpStatus: null,
        mimeType: null,
        loadError: null,
        fallbackInitials: null,
      };
    }),
  };
};

export const buildPlayerPdfDiagnostic = ({
  matches = [],
  teams = [],
  positionUsage = {},
  positionMatchRows = [],
  player = {},
  players = [],
  goalActions = [],
  assistActions = [],
  flattenedConnections = [],
  pdfConnections = [],
} = {}) => ({
  audit: 'PLAYER_PDF_DIAGNOSTIC',
  player: { id: nullable(player.id), name: nullable(player.name) },
  POSITION_USAGE_AUDIT: buildPlayerPdfPositionUsageAudit({ usage: positionUsage, matchRows: positionMatchRows, player, players }),
  OPPONENT_CREST_AUDIT: buildPlayerPdfOpponentCrestAudit({ matches, teams }),
  CONNECTION_PLAYER_AUDIT: buildPlayerPdfConnectionAudit({ player, players, goalActions, assistActions, flattenedConnections, pdfConnections }),
});

const completeLoadFields = (load = {}, candidateUrl = '') => {
  const renderKnown = Object.hasOwn(load || {}, 'renderSuccess');
  const loadSuccess = Boolean(load?.loaded) && (!renderKnown || Boolean(load.renderSuccess));
  const loadError = loadSuccess ? null : sanitizeLoadError(load?.error || load?.renderError || load?.loadError || (candidateUrl ? 'image_load_error' : 'missing_source'));
  return {
    loadAttempted: Boolean(load?.loadAttempted ?? load?.source),
    loadSuccess,
    httpStatus: finiteNumber(load?.httpStatus),
    mimeType: nullable(load?.mimeType),
    loadError,
  };
};

export const completePlayerPdfDiagnostic = (diagnostic, presentationAudit = {}) => ({
  ...diagnostic,
  OPPONENT_CREST_AUDIT: {
    rivals: rows(diagnostic?.OPPONENT_CREST_AUDIT?.rivals).map((rival) => {
      const load = rows(presentationAudit?.opponentCrests).find((candidate) => clean(candidate.matchId) === clean(rival.matchId)) || {};
      const loadFields = completeLoadFields(load, rival.pdfCandidateUrl);
      return {
        ...rival,
        ...loadFields,
        fallbackUsed: loadFields.loadSuccess ? null : rival.pdfCandidateUrl ? 'INITIALS_IMAGE_UNAVAILABLE' : 'INITIALS_NO_SOURCE',
        diagnosis: loadFields.loadSuccess ? 'OK' : rival.pdfCandidateUrl ? 'IMAGE_LOAD_FAILURE' : 'RESOLUTION_FAILURE',
      };
    }),
  },
  CONNECTION_PLAYER_AUDIT: {
    connections: rows(diagnostic?.CONNECTION_PLAYER_AUDIT?.connections).map((connection) => {
      const load = rows(presentationAudit?.connectionImages).find((candidate) => (
        normalizeMatchPlayerName(candidate.name) === normalizeMatchPlayerName(connection.flattenedConnectionName)
        && clean(candidate.direction) === clean(connection.connectionType)
      )) || {};
      const loadFields = completeLoadFields(load, connection.selectedImageUrl);
      return {
        ...connection,
        ...loadFields,
        fallbackInitials: !loadFields.loadSuccess,
      };
    }),
  },
});
