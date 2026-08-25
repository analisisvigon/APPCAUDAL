const clean = (value) => String(value ?? '').trim();
const OPENABLE_VIDEO_KINDS = new Set(['iframe', 'video', 'external']);

export const formatMatchCalendarRound = (value) => {
  const round = clean(value);
  if (!round) return '';
  return /^\d+$/.test(round) ? `Jornada ${round}` : round;
};

export const getMatchCalendarEventPriority = (event = {}) => ({
  goal_for: 1,
  goal_against: 1,
  system_change: 2,
  red_card: 3,
  yellow_card: 4,
  injury: 5,
}[event.key] || Number(event.priority || 9));

export const getMatchCalendarGoalVideoUrl = (event = {}, detectVideoProvider) => {
  const rawUrl = clean(event.videoUrl ?? event.video_url);
  if (!rawUrl || typeof detectVideoProvider !== 'function') return '';
  try {
    const analysis = detectVideoProvider(rawUrl);
    if (!analysis || !OPENABLE_VIDEO_KINDS.has(analysis.kind)) return '';
    return clean(analysis.originalUrl || analysis.directVideoUrl || rawUrl);
  } catch {
    return '';
  }
};
