import { getTacticalPositionAbbreviation } from './playerPositionUsage.js';

const rows = (value) => Array.isArray(value) ? value : [];
const clean = (value) => String(value ?? '').trim();

export const UNKNOWN_POSITION_KEY = '__unknown_position__';

const segmentPlayerKey = (segment = {}) => clean(segment.playerId)
  ? `id:${clean(segment.playerId)}`
  : `name:${clean(segment.playerName).toLocaleLowerCase('es')}`;

const canMergePositionSegments = (previous, current) => Boolean(
  previous
  && current
  && clean(previous.matchId) === clean(current.matchId)
  && segmentPlayerKey(previous) === segmentPlayerKey(current)
  && clean(previous.system) === clean(current.system)
  && clean(previous.position) === clean(current.position)
  && Boolean(previous.identified) === Boolean(current.identified)
  && Number(previous.toMinute) === Number(current.fromMinute)
);

export const mergeContiguousPositionSegments = (segments = []) => rows(segments).reduce((merged, source) => {
  const segment = { ...source };
  const previous = merged[merged.length - 1];
  if (!canMergePositionSegments(previous, segment)) {
    merged.push({
      ...segment,
      minutes: Math.max(0, Number(segment.toMinute) - Number(segment.fromMinute)),
      canonicalSegments: [source],
    });
    return merged;
  }
  previous.toMinute = Number(segment.toMinute);
  previous.endMinute = Number(segment.toMinute);
  previous.minutes = Math.max(0, Number(previous.toMinute) - Number(previous.fromMinute));
  previous.canonicalSegments.push(source);
  return merged;
}, []);

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
  const canonicalSegments = rows(match.segments).filter((segment) => (
    positionKey === UNKNOWN_POSITION_KEY ? !segment.identified : segment.identified && clean(segment.position) === clean(positionKey)
  ));
  if (!canonicalSegments.length) return [];
  const segments = mergeContiguousPositionSegments(canonicalSegments);
  return [{
    matchId: match.matchId,
    opponent: match.opponent,
    date: match.date,
    competition: match.competition,
    venue: match.venue,
    result: match.result,
    minutes: canonicalSegments.reduce((sum, segment) => sum + Number(segment.minutes || 0), 0),
    segments,
    canonicalSegments,
  }];
});

export const buildMatchPositionSummary = (matchUsage = {}) => {
  const canonicalSegments = rows(matchUsage?.segments);
  const segments = mergeContiguousPositionSegments(canonicalSegments);
  if (!segments.length) return { label: '—', systemLabel: 'Sin datos tácticos', segments: [], canonicalSegments: [], hasDetails: false, positionCount: 0, systemCount: 0, visualSegmentCount: 0 };
  const positions = [...new Set(segments.filter((segment) => segment.identified && clean(segment.position)).map((segment) => clean(segment.position)))];
  const systems = [...new Set(segments.map((segment) => clean(segment.system)).filter(Boolean))];
  const hasUnknownPosition = segments.some((segment) => !segment.identified);
  if (segments.length === 1) {
    const segment = segments[0];
    return {
      label: segment.identified ? getTacticalPositionAbbreviation(segment.position) : '—',
      systemLabel: clean(segment.system) || 'Sistema —',
      segments,
      canonicalSegments,
      hasDetails: false,
      positionCount: positions.length,
      systemCount: systems.length,
      visualSegmentCount: 1,
    };
  }
  const positionLabel = positions.length > 1
    ? `${positions.length} posiciones${hasUnknownPosition ? ' + sin posición' : ''}`
    : positions.length === 1
      ? `${getTacticalPositionAbbreviation(positions[0])}${hasUnknownPosition ? ' + sin posición' : ''}`
      : 'Sin posición';
  return {
    label: positionLabel,
    systemLabel: systems.length === 1 ? systems[0] : systems.length > 1 ? `${systems.length} sistemas` : 'Sistema —',
    segments,
    canonicalSegments,
    hasDetails: true,
    positionCount: positions.length,
    systemCount: systems.length,
    visualSegmentCount: segments.length,
  };
};

export const formatPositionSegmentRange = (segment = {}) => `${Number(segment.fromMinute || 0)}'–${Number(segment.toMinute || 0)}'`;
