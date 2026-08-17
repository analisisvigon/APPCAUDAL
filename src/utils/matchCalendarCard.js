const clean = (value) => String(value ?? '').trim();

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

