import { getPlayerPositionPresentation } from '../constants/playerPositions.js';

export const PLAYER_GROUPS = [
  { key: 'goalkeeper', label: 'Porteros' },
  { key: 'central', label: 'Centrales' },
  { key: 'lateral', label: 'Laterales' },
  { key: 'midfielder', label: 'Mediocentros' },
  { key: 'winger', label: 'Extremos' },
  { key: 'forward', label: 'Delanteros' },
  { key: null, label: 'Sin posición' },
];

const rosterGroupByPositionPresentation = {
  PORTEROS: 'goalkeeper',
  'CENTRALES': 'central',
  'LATERALES DERECHOS': 'lateral',
  'LATERALES IZQUIERDOS': 'lateral',
  CARRILEROS: 'lateral',
  PIVOTES: 'midfielder',
  MEDIOCENTROS: 'midfielder',
  INTERIORES: 'midfielder',
  MEDIAPUNTAS: 'midfielder',
  'EXTREMOS DERECHOS': 'winger',
  'EXTREMOS IZQUIERDOS': 'winger',
  'SEGUNDOS PUNTAS': 'forward',
  'DELANTEROS CENTRO': 'forward',
};

const sessionPlayerGroupKey = (row, frozen, positionById) => {
  const specificPosition = frozen ? positionById.get(row.player_id) : row.specific_position_key;
  if (specificPosition) {
    const presentation = getPlayerPositionPresentation({ primarySpecificPosition: specificPosition });
    return rosterGroupByPositionPresentation[presentation.group] || null;
  }
  const position = frozen ? row.position_key_snapshot : row.position_key;
  if (position === 'goalkeeper') return 'goalkeeper';
  if (position === 'forward') return 'forward';
  return null;
};

export const PLAYER_STATUSES = [
  { key: 'available', label: 'Disponible', short: 'Disp.' },
  { key: 'absent', label: 'Ausente', short: 'Aus.' },
  { key: 'injured', label: 'Lesionado', short: 'Les.' },
  { key: 'adapted', label: 'Trabajo adaptado', short: 'Adap.' },
  { key: 'first_team', label: 'Convocado con el primer equipo', short: 'Primer equipo' },
];

export const eligibleRosterCandidates = (candidates, date) => candidates.filter((row) =>
  Boolean(date) && !(row.has_departed && !row.left_on) &&
  (!row.joined_on || row.joined_on <= date) &&
  (!row.left_on || row.left_on > date));

export const hasUncertainRosterDate = (row) => !row.joined_on || (row.has_departed && !row.left_on);

export const groupSessionPlayers = (players, frozen, positionById = new Map()) => PLAYER_GROUPS.map((group) => ({
  ...group,
  players: players.filter((row) => sessionPlayerGroupKey(row, frozen, positionById) === group.key)
    .sort((a, b) => (frozen ? a.player_name_snapshot : a.name)
      .localeCompare(frozen ? b.player_name_snapshot : b.name, 'es')),
})).filter((group) => group.key !== null || group.players.length);

export const sessionPlayerCounts = (roster, availability = {}) => {
  const counts = { total: roster.length, available: 0, absent: 0, injured: 0, adapted: 0, first_team: 0, participants: 0 };
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
