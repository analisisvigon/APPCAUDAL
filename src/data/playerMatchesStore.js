export const PLAYER_MATCHES_RPC = 'get_my_player_matches';

const ALLOWED_EVENT_TYPES = new Set(['Gol a favor', 'Gol en contra', 'Amarilla', 'Roja']);
const ALLOWED_VIDEO_HOSTS = new Set(['youtu.be', 'youtube.com', 'www.youtube.com', 'm.youtube.com']);

export class PlayerMatchesLoadError extends Error {
  constructor(kind = 'network') {
    super(kind === 'invalid_session'
      ? 'La sesión ya no es válida.'
      : kind === 'invalid_response'
        ? 'No se pudo validar la respuesta de Partidos.'
        : 'No se pudieron cargar tus partidos.');
    this.name = 'PlayerMatchesLoadError';
    this.kind = kind;
  }
}

const cleanText = (value) => String(value ?? '').trim();

const normalizeOptionalText = (value) => {
  const normalized = cleanText(value);
  return normalized || null;
};

const normalizeDate = (value) => {
  const normalized = cleanText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
};

const normalizeScore = (value) => {
  if (value === null || value === undefined || cleanText(value) === '') return null;
  const score = Number(value);
  return Number.isInteger(score) && score >= 0 ? String(score) : null;
};

const normalizeBoolean = (value) => {
  if (value === true || value === false) return value;
  if (cleanText(value).toLowerCase() === 'true') return true;
  if (cleanText(value).toLowerCase() === 'false') return false;
  return null;
};

const normalizeHttpsUrl = (value) => {
  const candidate = cleanText(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
};

export const isAllowedPlayerMatchVideo = (value) => {
  const candidate = cleanText(value);
  if (!candidate) return false;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' && ALLOWED_VIDEO_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
};

const normalizeMinute = (value) => {
  if (value === null || value === undefined || cleanText(value) === '') return null;
  const minute = Number(value);
  return Number.isInteger(minute) && minute >= 0 ? minute : null;
};

const normalizeCardCount = (value) => {
  if (value === null || value === undefined || cleanText(value) === '') return null;
  const count = Number(value);
  return Number.isInteger(count) && count > 0 ? count : null;
};

export const normalizePlayerMatchTimeline = (value) => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((event) => {
    if (!event || typeof event !== 'object') return [];
    const eventType = cleanText(event.event_type);
    if (!ALLOWED_EVENT_TYPES.has(eventType)) return [];
    const videoUrl = isAllowedPlayerMatchVideo(event.video_url) ? cleanText(event.video_url) : null;
    return [{
      eventType,
      minute: normalizeMinute(event.minute),
      playerName: normalizeOptionalText(event.player_name),
      assistantName: normalizeOptionalText(event.assistant_name),
      cardCount: normalizeCardCount(event.card_count),
      videoUrl,
    }];
  });
};

export const normalizePlayerMatch = (row = {}) => ({
  partidoId: normalizeOptionalText(row.partido_id),
  matchDate: normalizeDate(row.match_date),
  opponent: normalizeOptionalText(row.opponent),
  opponentCrest: normalizeHttpsUrl(row.opponent_crest),
  isHome: normalizeBoolean(row.is_home),
  homeTeam: normalizeOptionalText(row.home_team),
  awayTeam: normalizeOptionalText(row.away_team),
  homeScore: normalizeScore(row.home_score),
  awayScore: normalizeScore(row.away_score),
  stadium: normalizeOptionalText(row.stadium),
  competitionKey: normalizeOptionalText(row.competition_key),
  competitionName: normalizeOptionalText(row.competition_name),
  competitionLogoUrl: normalizeHttpsUrl(row.competition_logo_url),
  matchRound: normalizeOptionalText(row.match_round),
  timeline: normalizePlayerMatchTimeline(row.timeline),
});

const isInvalidSessionError = (error) => {
  const status = Number(error?.status || error?.statusCode);
  const code = cleanText(error?.code).toUpperCase();
  const message = cleanText(error?.message).toLowerCase();
  return status === 401
    || code === 'PGRST301'
    || message.includes('jwt expired')
    || message.includes('invalid jwt');
};

export async function loadMyPlayerMatches(client) {
  if (!client || typeof client.rpc !== 'function') {
    throw new PlayerMatchesLoadError('invalid_session');
  }

  let response;
  try {
    response = await client.rpc(PLAYER_MATCHES_RPC);
  } catch (error) {
    throw new PlayerMatchesLoadError(isInvalidSessionError(error) ? 'invalid_session' : 'network');
  }

  if (response?.error) {
    throw new PlayerMatchesLoadError(
      isInvalidSessionError(response.error) ? 'invalid_session' : 'network',
    );
  }

  if (response?.data === null || response?.data === undefined) return [];
  if (!Array.isArray(response.data)) throw new PlayerMatchesLoadError('invalid_response');
  return response.data.map(normalizePlayerMatch);
}
