import { getFormationSlotsForSavedLineup } from './formationSlotCoordinates.js';

export const SESSION_SYSTEMS = ['4-4-2', '4-2-3-1', '4-3-3', '4-1-4-1', '3-5-2', '5-3-2', '3-4-3'];
export const ZONE_COLORS = ['blue', 'red', 'green', 'yellow', 'purple', 'orange', 'teal'];

// Índices de las demarcaciones existentes en formationSlotCoordinates. Un grupo
// se sitúa en el centro de sus puestos, nunca se reparte entre titulares.
const COMMON = {
  goalkeeper: [0], sweeper_keeper: [0],
  right_back: [1], right_centre_back: [2], centre_back: [2, 3],
  left_centre_back: [3], left_back: [4],
};
const CENTRE_FORWARD = ['centre_forward', 'mobile_forward', 'target_forward'];
const systems = {
  '4-4-2': { ...COMMON, right_midfield: [5], right_central_midfield: [6],
    central_midfield: [6, 7], left_central_midfield: [7], left_midfield: [8],
    holding_midfield: [6, 7], defensive_midfield: [6, 7],
    second_striker: [9, 10], ...Object.fromEntries(CENTRE_FORWARD.map((key) => [key, [9, 10]])) },
  '4-2-3-1': { ...COMMON, holding_midfield: [5, 6], defensive_midfield: [5, 6],
    central_midfield: [5, 6], right_central_midfield: [5], left_central_midfield: [6],
    right_midfield: [7], right_winger: [7], attacking_midfield: [8],
    left_midfield: [9], left_winger: [9], second_striker: [8],
    ...Object.fromEntries(CENTRE_FORWARD.map((key) => [key, [10]])) },
  '4-3-3': { ...COMMON, holding_midfield: [5], defensive_midfield: [5],
    central_midfield: [6, 7], right_central_midfield: [6], left_central_midfield: [7],
    right_winger: [8], left_winger: [10],
    ...Object.fromEntries(CENTRE_FORWARD.map((key) => [key, [9]])) },
  '4-1-4-1': { ...COMMON, holding_midfield: [5], defensive_midfield: [5],
    right_midfield: [6], right_central_midfield: [7], central_midfield: [7, 8],
    left_central_midfield: [8], left_midfield: [9],
    ...Object.fromEntries(CENTRE_FORWARD.map((key) => [key, [10]])) },
  '3-5-2': { goalkeeper: [0], sweeper_keeper: [0], right_centre_back: [1],
    centre_back: [2], libero: [2], left_centre_back: [3],
    holding_midfield: [4], defensive_midfield: [4], right_wing_back: [5],
    right_central_midfield: [6], central_midfield: [6, 7],
    left_central_midfield: [7], left_wing_back: [8],
    second_striker: [9, 10], ...Object.fromEntries(CENTRE_FORWARD.map((key) => [key, [9, 10]])) },
  '5-3-2': { goalkeeper: [0], sweeper_keeper: [0], right_wing_back: [1],
    right_centre_back: [2], centre_back: [3], libero: [3], left_centre_back: [4],
    left_wing_back: [5], right_central_midfield: [6], central_midfield: [7],
    holding_midfield: [7], defensive_midfield: [7], left_central_midfield: [8],
    second_striker: [9, 10], ...Object.fromEntries(CENTRE_FORWARD.map((key) => [key, [9, 10]])) },
  '3-4-3': { goalkeeper: [0], sweeper_keeper: [0], left_centre_back: [1],
    centre_back: [2], libero: [2], right_centre_back: [3],
    left_wing_back: [4], left_midfield: [4], holding_midfield: [5, 6],
    defensive_midfield: [5, 6], central_midfield: [5, 6],
    left_central_midfield: [5], right_central_midfield: [6],
    right_wing_back: [7], right_midfield: [7], left_winger: [8],
    right_winger: [10], ...Object.fromEntries(CENTRE_FORWARD.map((key) => [key, [9]])) },
};

export const emptyDistribution = () => ({ formation_key: null,
  specific_positions_snapshot: [], player_layout: [], space_zones: [] });

export const normalizeDistribution = (row) => row ? {
  formation_key: row.formation_key || null,
  specific_positions_snapshot: row.specific_positions_snapshot || [],
  player_layout: row.player_layout || [],
  space_zones: row.space_zones || [],
} : emptyDistribution();

export const distributionPayloadKey = (distribution) => JSON.stringify({
  formation_key: distribution?.formation_key || null,
  players: [...(distribution?.player_layout || [])].map((item) => [item.player_id,
    item.placement, item.x, item.y]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  zones: [...(distribution?.space_zones || [])].map((item) => [item.slot_id,
    item.x, item.y, item.w, item.h, item.color, item.provisional])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
});

export const specificPositionMap = (rows = []) => {
  const grouped = new Map();
  for (const row of rows) {
    const list = grouped.get(row.player_id) || [];
    list.push(row.position_key || null);
    grouped.set(row.player_id, list);
  }
  return new Map([...grouped].map(([id, keys]) => [id, keys.length === 1 ? keys[0] : null]));
};

export const autoPlayerLayout = (roster, positionById, formationKey) => {
  if (!SESSION_SYSTEMS.includes(formationKey)) return [];
  const slots = getFormationSlotsForSavedLineup(formationKey);
  return roster.map((player) => {
    const key = positionById.get(player.player_id);
    const indexes = systems[formationKey][key];
    const points = indexes?.map((index) => slots[index]).filter(Boolean) || [];
    if (!points.length || points.length !== indexes.length)
      return { player_id: player.player_id, placement: 'unplaced', x: null, y: null };
    return { player_id: player.player_id, placement: 'auto',
      x: Math.round(points.reduce((sum, point) => sum + point.x, 0) / points.length),
      y: Math.round(points.reduce((sum, point) => sum + point.y, 0) / points.length) };
  });
};

export const reconcileSpaceZones = (zones = [], slots = []) => {
  const byId = new Map(zones.map((zone) => [zone.slot_id, zone]));
  return slots.map((slot, index) => byId.get(slot.id) || {
    slot_id: slot.id,
    x: 8 + (index % 3) * 30,
    y: 10 + (Math.floor(index / 3) % 3) * 26,
    w: 24, h: 18,
    color: ZONE_COLORS[index % ZONE_COLORS.length], provisional: true,
  });
};

export const overlappingZonePairs = (zones = []) => zones.flatMap((left, index) =>
  zones.slice(index + 1).filter((right) => left.x < right.x + right.w &&
    left.x + left.w > right.x && left.y < right.y + right.h &&
    left.y + left.h > right.y).map((right) => [left.slot_id, right.slot_id]));

export const playerCompactLabels = (roster = []) => {
  const short = (name) => {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0] || '—';
  };
  const counts = new Map();
  roster.forEach((row) => counts.set(short(row.player_name_snapshot),
    (counts.get(short(row.player_name_snapshot)) || 0) + 1));
  return new Map(roster.map((row) => [row.player_id,
    counts.get(short(row.player_name_snapshot)) > 1
      ? row.player_name_snapshot : short(row.player_name_snapshot)]));
};

export const validateDistribution = (distribution, roster, slots) => {
  if (!distribution) return 'No se ha cargado la distribución.';
  if (distribution.formation_key && !SESSION_SYSTEMS.includes(distribution.formation_key))
    return 'El sistema táctico no está admitido.';
  if (distribution.formation_key) {
    const expected = new Set(roster.map((row) => row.player_id));
    const actual = distribution.player_layout.map((row) => row.player_id);
    if (!expected.size || actual.length !== expected.size || new Set(actual).size !== expected.size ||
      actual.some((id) => !expected.has(id))) return 'La pizarra debe incluir todos los jugadores congelados.';
    if (distribution.player_layout.some((item) => !['auto', 'manual', 'unplaced'].includes(item.placement) ||
      (item.placement === 'unplaced' ? item.x !== null || item.y !== null :
        !Number.isFinite(item.x) || !Number.isFinite(item.y) ||
        item.x < 0 || item.x > 100 || item.y < 0 || item.y > 100)))
      return 'Hay jugadores con ubicaciones inválidas.';
  } else if (distribution.player_layout.length) return 'La pizarra de jugadores necesita un sistema.';
  const expectedSlots = new Set(slots.map((row) => row.id));
  const actualSlots = distribution.space_zones.map((row) => row.slot_id);
  if (actualSlots.length !== expectedSlots.size || new Set(actualSlots).size !== expectedSlots.size ||
    actualSlots.some((id) => !expectedSlots.has(id))) return 'Debe haber una zona por cada ejercicio actual.';
  if (distribution.space_zones.some((zone) => !ZONE_COLORS.includes(zone.color) ||
    typeof zone.provisional !== 'boolean' ||
    ![zone.x, zone.y, zone.w, zone.h].every(Number.isFinite) ||
    zone.x < 0 || zone.y < 0 || zone.w <= 0 || zone.h <= 0 ||
    zone.x + zone.w > 100 || zone.y + zone.h > 100))
    return 'Hay zonas fuera del campo o con formato inválido.';
  return '';
};
