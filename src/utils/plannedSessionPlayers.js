export const PLAYER_GROUPS = [
  { key: 'goalkeeper', label: 'Porteros' },
  { key: 'defender', label: 'Defensas' },
  { key: 'midfielder', label: 'Centrocampistas' },
  { key: 'forward', label: 'Delanteros' },
  { key: null, label: 'Sin posición' },
];

export const PLAYER_STATUSES = [
  { key: 'available', label: 'Disponible', short: 'Disp.' },
  { key: 'absent', label: 'Ausente', short: 'Aus.' },
  { key: 'injured', label: 'Lesionado', short: 'Les.' },
  { key: 'adapted', label: 'Trabajo adaptado', short: 'Adap.' },
];

export const eligibleRosterCandidates = (candidates, date) => candidates.filter((row) =>
  Boolean(date) && (!row.joined_on || row.joined_on <= date) &&
  (!row.left_on || row.left_on > date));

export const hasUncertainRosterDate = (row) => !row.joined_on || (row.has_departed && !row.left_on);

export const groupSessionPlayers = (players, frozen) => PLAYER_GROUPS.map((group) => ({
  ...group,
  players: players.filter((row) => (frozen ? row.position_key_snapshot : row.position_key) === group.key ||
    (group.key === null && (frozen ? row.position_key_snapshot : row.position_key) == null))
    .sort((a, b) => (frozen ? a.player_name_snapshot : a.name)
      .localeCompare(frozen ? b.player_name_snapshot : b.name, 'es')),
})).filter((group) => group.key !== null || group.players.length);

export const sessionPlayerCounts = (roster, availability = {}) => {
  const counts = { total: roster.length, available: 0, absent: 0, injured: 0, adapted: 0, participants: 0 };
  for (const player of roster) {
    const status = availability[player.player_id]?.status || 'available';
    if (Object.hasOwn(counts, status)) counts[status] += 1;
  }
  counts.participants = counts.available + counts.adapted;
  return counts;
};

export const availabilityChanges = (current, baseline, roster) => roster.flatMap((player) => {
  const next = current[player.player_id] || { status: 'available', observation: '' };
  const previous = baseline[player.player_id] || { status: 'available', observation: '' };
  return next.status !== previous.status || next.observation !== previous.observation
    ? [{ player_id: player.player_id, status: next.status, observation: next.observation || null }] : [];
});
