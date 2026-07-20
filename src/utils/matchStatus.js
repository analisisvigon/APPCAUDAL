export const MATCH_STATUS_COLORS = Object.freeze({
  win: '#35D39A',
  draw: '#F4C84A',
  loss: '#F06474',
  scheduled: '#4F8CFF',
  pending_result: '#F59E5B',
  postponed: '#7C879C',
  suspended: '#7C879C',
  cancelled: '#596274',
  played: '#7C879C',
});

export const MATCH_STATUS_LABELS = Object.freeze({
  scheduled: 'Programado',
  played: 'Jugado',
  pending_result: 'Pendiente de resultado',
  postponed: 'Aplazado',
  suspended: 'Suspendido',
  cancelled: 'Cancelado',
});

const normalizeText = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

export const hasMatchScoreValue = (value) => {
  if (value === '' || value === null || value === undefined) return false;
  return Number.isFinite(Number(value));
};

export const parseLocalMatchDate = (value) => {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
};

const localDayNumber = (value) => {
  const date = value instanceof Date ? value : parseLocalMatchDate(value);
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
};

const getOfficialGoalEvents = (match = {}) => {
  const candidates = [match.statsGoalEvents, match.goalEvents, match.goals];
  return candidates.find((candidate) => Array.isArray(candidate) && candidate.length)
    || candidates.find(Array.isArray)
    || [];
};

const parseStoredResult = (match = {}) => {
  const raw = match.result ?? match.officialResult ?? match.official_result;
  if (raw && typeof raw === 'object') {
    const home = raw.home ?? raw.homeScore ?? raw.home_score;
    const away = raw.away ?? raw.awayScore ?? raw.away_score;
    if (hasMatchScoreValue(home) && hasMatchScoreValue(away)) return { home: Number(home), away: Number(away) };
  }
  const text = String(raw || '').trim();
  const parsed = text.match(/^(\d+)\s*[-:]\s*(\d+)$/);
  return parsed ? { home: Number(parsed[1]), away: Number(parsed[2]) } : null;
};

export const getMatchScore = (match = {}) => {
  let home;
  let away;
  let source;

  const homeScore = match.homeScore ?? match.home_score;
  const awayScore = match.awayScore ?? match.away_score;
  if (hasMatchScoreValue(homeScore) && hasMatchScoreValue(awayScore)) {
    home = Number(homeScore);
    away = Number(awayScore);
    source = 'home_away_score';
  } else {
    const goalsFor = match.goalsFor ?? match.goals_for;
    const goalsAgainst = match.goalsAgainst ?? match.goals_against;
    if (hasMatchScoreValue(goalsFor) && hasMatchScoreValue(goalsAgainst)) {
      const caudal = Number(goalsFor);
      const rival = Number(goalsAgainst);
      const caudalIsHome = Boolean(match.isHome ?? match.is_home);
      home = caudalIsHome ? caudal : rival;
      away = caudalIsHome ? rival : caudal;
      source = 'goals_for_against';
    } else {
      const storedResult = parseStoredResult(match);
      if (storedResult) {
        ({ home, away } = storedResult);
        source = 'stored_result';
      } else {
        const goalEvents = getOfficialGoalEvents(match).filter((event) => {
          const type = normalizeText(event?.type ?? event?.eventType ?? event?.event_type);
          return ['gol a favor', 'gol en contra', 'goal for', 'goal against'].includes(type);
        });
        if (!goalEvents.length) return null;
        const caudal = goalEvents.filter((event) => ['gol a favor', 'goal for'].includes(normalizeText(event?.type ?? event?.eventType ?? event?.event_type))).length;
        const rival = goalEvents.length - caudal;
        const caudalIsHome = Boolean(match.isHome ?? match.is_home);
        home = caudalIsHome ? caudal : rival;
        away = caudalIsHome ? rival : caudal;
        source = 'official_goal_events';
      }
    }
  }

  const isHome = Boolean(match.isHome ?? match.is_home);
  return {
    home,
    away,
    caudal: isHome ? home : away,
    rival: isHome ? away : home,
    source,
  };
};

const getSpecialStatus = (match = {}) => {
  const candidates = [match.specialStatus, match.special_status, match.exceptionStatus, match.exception_status, match.status];
  for (const value of candidates) {
    const status = normalizeText(value);
    if (['aplazado', 'postponed'].includes(status)) return 'postponed';
    if (['suspendido', 'suspended'].includes(status)) return 'suspended';
    if (['cancelado', 'cancelled', 'canceled'].includes(status)) return 'cancelled';
  }
  return null;
};

const hasFinalizationEvent = (match = {}) => {
  const events = [match.events, match.quickEvents, match.officialEvents, match.official_events]
    .filter(Array.isArray)
    .flat();
  return events.some((event) => {
    const type = normalizeText(event?.type ?? event?.eventType ?? event?.event_type ?? event?.tipoEvento ?? event?.tipo_evento);
    const state = normalizeText(event?.status ?? event?.state ?? event?.matchState ?? event?.match_state);
    return ['finalizado', 'fin de partido', 'final whistle', 'match finished'].includes(type)
      || ['finalizado', 'finished'].includes(state);
  });
};

export const getMatchStatus = (match = {}, now = new Date()) => {
  const specialStatus = getSpecialStatus(match);
  if (specialStatus) return specialStatus;

  const storedStatus = normalizeText(match.status);
  const explicitlyFinished = ['finalizado', 'jugado', 'played', 'finished', 'cerrado', 'closed', 'revisado', 'reviewed'].includes(storedStatus);
  const legacyPlayed = match.played === true || match.jugado === true || match.isPlayed === true || match.is_played === true;
  const matchDay = localDayNumber(match.date ?? match.matchDate ?? match.match_date);
  const today = localDayNumber(now);
  if (matchDay !== null && today !== null && matchDay > today) return 'scheduled';

  const hasOfficialGoals = getOfficialGoalEvents(match).some((event) => {
    const type = normalizeText(event?.type ?? event?.eventType ?? event?.event_type);
    return ['gol a favor', 'gol en contra', 'goal for', 'goal against'].includes(type);
  });
  if (getMatchScore(match) || hasOfficialGoals || hasFinalizationEvent(match) || explicitlyFinished || legacyPlayed) return 'played';

  if (matchDay !== null && today !== null && matchDay < today) return 'pending_result';
  return 'scheduled';
};

export const getMatchOutcome = (match = {}, now = new Date()) => {
  if (getMatchStatus(match, now) !== 'played') return null;
  const score = getMatchScore(match);
  if (!score) return null;
  if (score.caudal > score.rival) return 'win';
  if (score.caudal < score.rival) return 'loss';
  return 'draw';
};

export const getMatchStatusPresentation = (match = {}, now = new Date()) => {
  const status = getMatchStatus(match, now);
  const outcome = getMatchOutcome(match, now);
  const colorKey = outcome || status;
  return {
    status,
    outcome,
    label: MATCH_STATUS_LABELS[status],
    color: MATCH_STATUS_COLORS[colorKey] || MATCH_STATUS_COLORS.scheduled,
  };
};
