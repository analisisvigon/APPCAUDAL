import { readTrainingTaskEditorPayload } from './trainingTaskEditorPayload.js';
import { TRAINING_BOARD_PALETTE, TRAINING_BOARD_TEAM_OPTIONS } from './trainingTaskBoardElements.js';
import {
  getTrainingTaskPlayerRefKey, normalizeTrainingTaskAssignments,
  resolveTrainingTaskPlayerRef, TRAINING_TASK_TEAM_KEYS,
} from './trainingTaskRoster.js';

const TEAM_NAMES = Object.fromEntries([
  ...TRAINING_BOARD_TEAM_OPTIONS.map(({ key, label }) => [key, label]),
  ['neutral', 'Comodines'],
]);

// Proyección visual del mismo editor_payload de Biblioteca. Sin consultas a la
// plantilla actual: los nombres son únicamente los snapshots de cada playerRef.
export const getPlannedSessionBoardTeams = (payload) => {
  const parsed = readTrainingTaskEditorPayload(payload);
  if (parsed.kind !== 'v1') return [];
  const assignments = normalizeTrainingTaskAssignments(parsed.scene.assignments || {});
  const seen = new Set();
  const grouped = new Map();
  for (const assignment of assignments.players) {
    if (!TRAINING_TASK_TEAM_KEYS.includes(assignment.teamKey)) continue;
    const ref = assignment.playerRef;
    const snapshotName = String(ref?.snapshot?.name ?? '').trim();
    if (!snapshotName) continue;
    const identity = getTrainingTaskPlayerRefKey(ref) ||
      `snapshot:${snapshotName.toLocaleLowerCase('es')}:${String(ref?.snapshot?.number ?? '').trim()}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const name = resolveTrainingTaskPlayerRef(ref, []).display.name;
    const names = grouped.get(assignment.teamKey) || [];
    names.push(name);
    grouped.set(assignment.teamKey, names);
  }
  return TRAINING_TASK_TEAM_KEYS.filter((key) => grouped.has(key)).map((key) => {
    const colorKey = assignments.teamColors[key];
    const color = TRAINING_BOARD_PALETTE[colorKey];
    return {
      key, teamName: TEAM_NAMES[key], colorName: color?.label || TEAM_NAMES[key],
      colorValue: color?.value || null, players: grouped.get(key),
    };
  });
};
