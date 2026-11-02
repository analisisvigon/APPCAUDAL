import {
  loadPlannedSession,
  loadPlannedSessionPlayers,
  loadPlannedDistribution,
  loadPlannedBoardSeedV11,
  loadPlannedExerciseDimensionsV12,
  loadPlannedSpecificPositions,
} from '../data/plannedSessionsStore.js';
import { hydratePlannedEditor } from './plannedSessions.js';
import { BOARD_V11_ENABLED, normalizeExerciseDimensions } from './plannedSessionFieldScale.js';
import { emptyDistribution, normalizeDistribution, specificPositionMap } from './plannedSessionDistributions.js';
import { readPlannedSessionValue } from './plannedSessionValue.js';

export const plannedSessionExportFileName = (fromDate, toDate) =>
  `Sesiones_${fromDate}_a_${toDate}.pdf`;

export const loadPlannedSessionPrintData = async (client, row, clubTeamSeasonId, v12Supported) => {
  const [data, players, distributionRow, seed, dimensionRows] = await Promise.all([
    loadPlannedSession(client, row.id, clubTeamSeasonId),
    loadPlannedSessionPlayers(client, row.id),
    loadPlannedDistribution(client, row.id),
    BOARD_V11_ENABLED ? loadPlannedBoardSeedV11(client, row.id) : Promise.resolve(null),
    v12Supported ? loadPlannedExerciseDimensionsV12(client, row.id) : Promise.resolve([]),
  ]);
  if (data.session?.club_team_season_id !== clubTeamSeasonId ||
      data.session?.session_date !== row.session_date ||
      data.slots.some((slot) => slot.session_id !== row.id) ||
      data.items.some((item) => item.session_id !== row.id))
    throw new Error('Los datos de la sesión no coinciden con el equipo, temporada o fecha consultados.');
  const editor = hydratePlannedEditor(data.session, data.slots, data.items);
  const distribution = distributionRow ? normalizeDistribution(distributionRow) : emptyDistribution();
  const positions = distribution.specific_positions_snapshot.length
    ? distribution.specific_positions_snapshot
    : await loadPlannedSpecificPositions(client, players.roster.map((player) => player.player_id));
  return {
    id: row.id,
    editor,
    roster: players.roster,
    availability: Object.fromEntries(players.availability.map((player) => [player.player_id,
      { status: player.status, observation: player.observation || '' }])),
    distribution,
    positionById: specificPositionMap(positions),
    fieldDimensions: seed ? { length_m: seed.field_length_m ?? '', width_m: seed.field_width_m ?? '' } : null,
    exerciseDimensions: normalizeExerciseDimensions(dimensionRows),
    sessionValue: readPlannedSessionValue(data.session).value,
    mcNumber: data.session.mc_number == null ? '' : String(data.session.mc_number),
  };
};
