export function getDailyQuestionnaireRequirement({
  type,
  entries = [],
} = {}) {
  if (type === 'rpe') {
    return entries.length > 0 ? 'required' : 'unknown';
  }
  if (type === 'wellness') {
    return entries.length > 0 ? 'required' : 'unknown';
  }
  return 'unknown';
}

export function getMissingDailyPlayers(players = [], entries = [], requirement = 'unknown') {
  if (requirement !== 'required') return [];
  const presentIds = new Set(entries.map((entry) => String(entry?.jugador_id || '')).filter(Boolean));
  return players.filter((player) => !presentIds.has(String(player?.id || '')));
}
