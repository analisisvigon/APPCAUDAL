import { getTacticalPositionAbbreviation } from './playerPositionUsage.js';

const rows = (value) => Array.isArray(value) ? value : [];
const clean = (value) => String(value ?? '').trim();

export const UNKNOWN_POSITION_KEY = '__unknown_position__';

export const buildPositionTimelineEntries = (usage = {}) => {
  const officialMinutes = Math.max(0, Number(usage.totalMinutes || 0));
  const known = rows(usage.positions).map((position) => ({
    key: clean(position.position),
    position: clean(position.position),
    abbreviation: getTacticalPositionAbbreviation(position.position),
    minutes: Math.max(0, Number(position.minutes || 0)),
    percentage: officialMinutes ? Math.round((Number(position.minutes || 0) / officialMinutes) * 100) : 0,
    identified: true,
  }));
  const unknownMinutes = Math.max(0, Number(usage.unidentifiedMinutes ?? usage.unknownMinutes ?? 0));
  return unknownMinutes > 0 ? [...known, {
    key: UNKNOWN_POSITION_KEY,
    position: 'Sin posición registrada',
    abbreviation: '—',
    minutes: unknownMinutes,
    percentage: officialMinutes ? Math.round((unknownMinutes / officialMinutes) * 100) : 0,
    identified: false,
  }] : known;
};

export const getPositionTimelineMatches = (usage = {}, positionKey = '') => rows(usage.matches).flatMap((match) => {
  const segments = rows(match.segments).filter((segment) => (
    positionKey === UNKNOWN_POSITION_KEY ? !segment.identified : segment.identified && clean(segment.position) === clean(positionKey)
  ));
  if (!segments.length) return [];
  return [{
    matchId: match.matchId,
    opponent: match.opponent,
    date: match.date,
    competition: match.competition,
    venue: match.venue,
    result: match.result,
    minutes: segments.reduce((sum, segment) => sum + Number(segment.minutes || 0), 0),
    segments,
  }];
});

export const buildMatchPositionSummary = (matchUsage = {}) => {
  const segments = rows(matchUsage?.segments);
  if (!segments.length) return { label: '—', systemLabel: 'Sin datos tácticos', segments: [], hasDetails: false };
  if (segments.length === 1) {
    const segment = segments[0];
    return {
      label: segment.identified ? getTacticalPositionAbbreviation(segment.position) : '—',
      systemLabel: clean(segment.system) || 'Sistema —',
      segments,
      hasDetails: true,
    };
  }
  const systems = [...new Set(segments.map((segment) => clean(segment.system)).filter(Boolean))];
  return {
    label: `${segments.length} tramos`,
    systemLabel: systems.length === 1 ? systems[0] : systems.length > 1 ? `${systems.length} sistemas` : 'Sistema —',
    segments,
    hasDetails: true,
  };
};

export const formatPositionSegmentRange = (segment = {}) => `${Number(segment.fromMinute || 0)}'–${Number(segment.toMinute || 0)}'`;
