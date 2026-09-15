const normalizeName = (value) => String(value || '').trim()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

// A slot's jugadorId is authoritative. Older rows without it can use a name
// only when that name identifies exactly one real roster player.
export const resolveSetPieceCaudalPlayersBySlot = (lineup, lineupSlots, players) => {
  const roster = Array.isArray(players) ? players : [];
  const slots = Array.isArray(lineupSlots) ? lineupSlots : [];
  const names = Array.isArray(lineup) ? lineup : [];
  return Array.from({ length: 11 }, (_, index) => {
    const snapshotName = names[index] || '';
    const slot = slots.find((item) => Number(item?.slot) === index);
    const slotMatchesLineup = !snapshotName || !slot?.playerName
      || normalizeName(snapshotName) === normalizeName(slot.playerName);
    const slotId = slotMatchesLineup ? String(slot?.jugadorId || slot?.jugador_id || '').trim() : '';
    if (slotId) {
      return roster.find((player) => String(player?.id || '') === slotId) || null;
    }
    const name = normalizeName(snapshotName || slot?.playerName || slot?.player_name);
    if (!name) return null;
    const matches = roster.filter((player) => player?.id && [
      player.name,
      player.shirtName,
      player.shirt_name,
      player.shortName,
      player.short_name,
    ].some((candidate) => normalizeName(candidate) === name));
    return matches.length === 1 ? matches[0] : null;
  });
};
