import { getFormationSlotsForSavedLineup } from './formationSlotCoordinates.js';

export const SESSION_SYSTEMS = ['4-4-2', '4-2-3-1', '4-3-3', '4-1-4-1', '3-5-2', '5-3-2', '3-4-3'];
export const ZONE_COLORS = ['blue', 'red', 'green', 'yellow', 'purple', 'orange', 'teal'];

// Índices de los once puestos tácticos existentes en formationSlotCoordinates.
// Cada futbolista se asigna a un puesto real, nunca a un punto intermedio.
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
  const occupancy = new Map();
  const assigned = new Map();
  const ordered = [...roster].sort((a, b) => {
    const aCount = systems[formationKey][positionById.get(a.player_id)]?.length ?? Infinity;
    const bCount = systems[formationKey][positionById.get(b.player_id)]?.length ?? Infinity;
    return aCount - bCount || String(a.player_id).localeCompare(String(b.player_id));
  });
  for (const player of ordered) {
    const key = positionById.get(player.player_id);
    const indexes = systems[formationKey][key];
    const valid = indexes?.filter((index) => slots[index]) || [];
    if (!valid.length || valid.length !== indexes.length) {
      assigned.set(player.player_id, { player_id: player.player_id, placement: 'unplaced', x: null, y: null });
      continue;
    }
    const index = [...valid].sort((a, b) => (occupancy.get(a) || 0) - (occupancy.get(b) || 0) || a - b)[0];
    occupancy.set(index, (occupancy.get(index) || 0) + 1);
    assigned.set(player.player_id, { player_id: player.player_id, placement: 'auto',
      x: slots[index].x, y: slots[index].y });
  }
  return roster.map((player) => assigned.get(player.player_id));
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
  const short = (name, fullSurname = false) => {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    return parts.length > 1 ? `${parts[0]} ${fullSurname ? parts[1] : `${parts[1][0]}.`}` : parts[0] || '—';
  };
  const firstCounts = new Map();
  const surnameCounts = new Map();
  for (const row of roster) {
    const name = row.player_name_snapshot;
    firstCounts.set(short(name), (firstCounts.get(short(name)) || 0) + 1);
    surnameCounts.set(short(name, true), (surnameCounts.get(short(name, true)) || 0) + 1);
  }
  return new Map(roster.map((row) => {
    const name = row.player_name_snapshot;
    const label = firstCounts.get(short(name)) === 1 ? short(name)
      : surnameCounts.get(short(name, true)) === 1 ? short(name, true) : String(name || '—');
    return [row.player_id, label];
  }));
};

const pointKey = (x, y) => `${x}:${y}`;
const shortSlotLabel = (slot) => slot.id.startsWith('SLOT_')
  ? ({ Portero: 'POR', 'Central izquierdo': 'DFC I', Central: 'DFC C',
    'Central derecho': 'DFC D', 'Carrilero izquierdo': 'CAI',
    'Carrilero derecho': 'CAD', Mediocentro: slot.x < 50 ? 'MC I' : 'MC D',
    'Extremo izquierdo': 'EI', 'Extremo derecho': 'ED', Delantero: 'DC' }[slot.label] || slot.label)
  : slot.id.replaceAll('_', ' ');

export const movePlayerBoardLayout = (layout, playerId, target, formationKey) => {
  const valid = target == null || (SESSION_SYSTEMS.includes(formationKey) &&
    getFormationSlotsForSavedLineup(formationKey).some((slot) => slot.x === target.x && slot.y === target.y));
  if (!valid) return layout;
  return layout.map((item) => item.player_id === playerId
    ? { player_id: item.player_id, placement: target ? 'manual' : 'unplaced',
      x: target?.x ?? null, y: target?.y ?? null } : item);
};

export const resolvePlayerBoardDrop = (cards, point) => {
  const target = cards.find((card) => point.x >= card.left && point.x <= card.left + card.width &&
    point.y >= card.top && point.y <= card.top + card.height);
  return target ? { x: target.x, y: target.y, groupKey: target.key } : null;
};

// La RPC solo persiste coordenadas. Los once puestos son los únicos destinos.
// Coordenadas antiguas no canónicas quedan visibles para revisión, nunca flotan.
export const layoutPlayerBoardCards = (layout = [], roster = [], _positionById = new Map(), formationKey = null) => {
  const slots = SESSION_SYSTEMS.includes(formationKey) ? getFormationSlotsForSavedLineup(formationKey) : [];
  const labels = playerCompactLabels(roster);
  const byAnchor = new Map(slots.map((slot) => [pointKey(slot.x, slot.y), slot]));
  const cards = slots.map((slot) => ({ key: slot.id, x: slot.x, y: slot.y,
    title: slot.label, shortTitle: shortSlotLabel(slot), players: [], group: true, manual: false,
    width: 14, height: 5, left: slot.x - 7, top: slot.y - 2.5 }));
  const byKey = new Map(cards.map((card) => [card.key, card]));
  const rosterById = new Map(roster.map((player) => [player.player_id, player]));
  const unplaced = [];
  const legacy = [];
  const seen = new Set();
  for (const item of layout) {
    const player = rosterById.get(item.player_id);
    if (!player || seen.has(item.player_id)) continue;
    seen.add(item.player_id);
    const slot = item.placement !== 'unplaced' && byAnchor.get(pointKey(item.x, item.y));
    if (slot) {
      const card = byKey.get(slot.id);
      card.players.push(player);
      if (item.placement === 'manual') card.manual = true;
    } else {
      unplaced.push(player);
      if (item.placement !== 'unplaced') legacy.push(player);
    }
  }
  if (slots.length) for (const player of roster) if (!seen.has(player.player_id)) unplaced.push(player);
  for (const card of cards) {
    card.players.sort((a, b) => (labels.get(a.player_id) || '').localeCompare(labels.get(b.player_id) || '', 'es'));
    // Ensanchar solo dentro del corredor de su demarcación: el ancla no cambia.
    const nearest = Math.min(...slots.filter((slot) => slot.id !== card.key &&
      Math.abs(slot.y - card.y) <= 12 && Math.abs(slot.x - card.x) > 0)
      .map((slot) => Math.abs(slot.x - card.x)), 24);
    card.width = Math.max(14, Math.min(22, nearest - 2));
    card.left = card.x - card.width / 2;
    const charsPerLine = Math.max(9, Math.floor(card.width * 0.75));
    card.nameLines = card.players.reduce((total, player) => total + Math.max(1,
      Math.ceil((labels.get(player.player_id) || '').length / charsPerLine)), 0);
    card.height = 4 + card.nameLines * 2.65;
    card.top = Math.max(0, Math.min(100 - card.height, card.y - card.height / 2));
  }
  // En filas apretadas (por ejemplo, central/portero en 5-3-2), mantener
  // el tamaño previo en ambos grupos antes que desplazar sus anclas.
  for (const [index, left] of cards.entries()) for (const right of cards.slice(index + 1)) {
    if (!left.players.length || !right.players.length) continue;
    const nearHorizontally = left.left < right.left + right.width && left.left + left.width > right.left;
    const nearVertically = left.top < right.top + right.height + 2 &&
      left.top + left.height + 2 > right.top;
    if (nearHorizontally && nearVertically) { left.compact = true; right.compact = true; }
  }
  for (const card of cards) if (card.compact) {
    card.height = 3.5 + card.nameLines * 2.3;
    card.top = Math.max(0, Math.min(100 - card.height, card.y - card.height / 2));
  }
  return { cards, unplaced, legacy };
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
