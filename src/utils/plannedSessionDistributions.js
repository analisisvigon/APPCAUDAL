import { getFormationSlotsForSavedLineup } from './formationSlotCoordinates.js';
import { getSpecificPositionLabel } from '../constants/playerPositions.js';

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
const withinField = (value) => Math.max(0, Math.min(100, Number(value)));

// La RPC 05 no guarda demarcaciones. Un manual situado exactamente sobre un
// ancla táctica se incorpora a ese grupo; un manual libre conserva tarjeta propia.
export const movePlayerBoardLayout = (layout, playerId, point) => layout.map((item) =>
  item.player_id === playerId ? { player_id: item.player_id, placement: 'manual',
    x: withinField(point.x), y: withinField(point.y) } : item);

export const resolvePlayerBoardDrop = (cards, point) => {
  const target = cards.find((card) => card.group &&
    point.x >= card.left && point.x <= card.left + card.width &&
    point.y >= card.top && point.y <= card.top + card.height);
  return target ? { x: target.x, y: target.y, groupKey: target.key }
    : { x: withinField(point.x), y: withinField(point.y), groupKey: null };
};

// La misma geometría sirve para editar e imprimir; nunca se alteran las
// coordenadas guardadas para resolver colisiones visuales.
export const layoutPlayerBoardCards = (layout = [], roster = [], positionById = new Map(), formationKey = null) => {
  const rosterById = new Map(roster.map((player) => [player.player_id, player]));
  const labels = playerCompactLabels(roster);
  const anchors = new Map();
  const rememberAnchor = (item) => {
    if (item.placement === 'unplaced' || item.x == null || item.y == null) return;
    const key = pointKey(item.x, item.y);
    if (!anchors.has(key)) anchors.set(key, { key, x: item.x, y: item.y, positionKeys: new Set() });
    const positionKey = positionById.get(item.player_id);
    if (positionKey) anchors.get(key).positionKeys.add(positionKey);
  };
  for (const item of autoPlayerLayout(roster, positionById, formationKey)) rememberAnchor(item);
  for (const item of layout) if (item.placement === 'auto') rememberAnchor(item);
  const grouped = new Map();
  const unplaced = [];
  const desired = [];
  for (const item of layout) {
    const player = rosterById.get(item.player_id);
    if (!player) continue;
    if (item.placement === 'unplaced' || item.x == null || item.y == null) {
      unplaced.push(player); continue;
    }
    const key = pointKey(item.x, item.y);
    if (!anchors.has(key)) {
      desired.push({ key: `manual:${item.player_id}`, players: [player], x: item.x, y: item.y,
        manual: true, group: false, title: '' });
    } else {
      const anchor = anchors.get(key);
      const group = grouped.get(key) || { ...anchor, players: [], manual: false, group: true };
      group.players.push(player);
      grouped.set(key, group);
    }
  }
  for (const group of grouped.values()) {
    group.players.sort((a, b) => (labels.get(a.player_id) || '').localeCompare(labels.get(b.player_id) || '', 'es'));
    const keys = [...group.positionKeys];
    const title = keys.map((key) => getSpecificPositionLabel(key) || key).join(' / ') || 'Grupo táctico';
    const parts = Math.ceil(group.players.length / 8);
    for (let index = 0; index < parts; index += 1) desired.push({ ...group,
      key: parts === 1 ? group.key : `${group.key}:part${index + 1}`,
      title: parts === 1 ? title : `${title} · ${index + 1}/${parts}`,
      players: group.players.slice(index * 8, index * 8 + 8),
    });
  }
  for (const card of desired) {
    card.width = 30;
    const charsPerColumn = 14;
    let nameLines = 0;
    for (const player of card.players) {
      nameLines += Math.max(1, Math.ceil((labels.get(player.player_id) || '').length / charsPerColumn));
    }
    const headingLines = card.group ? Math.max(1, Math.ceil(card.title.length / 18)) : 0;
    card.height = 3 + headingLines * 4 + nameLines * 5;
  }
  desired.sort((a, b) => Number(b.group) - Number(a.group) || a.width - b.width || b.height - a.height || a.key.localeCompare(b.key));
  const placed = [];
  const initiallyUnplaced = [...unplaced];
  const collides = (candidate) => placed.some((other) =>
    candidate.left < other.left + other.width + 1 &&
    candidate.left + candidate.width + 1 > other.left &&
    candidate.top < other.top + other.height + 1 &&
    candidate.top + candidate.height + 1 > other.top);
  for (const card of desired) {
    const { width, height } = card;
    if (height > 98) { unplaced.push(...card.players); continue; }
    const targetLeft = Math.max(1, Math.min(99 - width, Number(card.x) - width / 2));
    const targetTop = Math.max(1, Math.min(99 - height, Number(card.y) - height / 2));
    let best = null;
    for (let top = 1; top <= 99 - height; top += 2) for (let left = 1; left <= 99 - width; left += 2) {
      const candidate = { ...card, left, top, width, height };
      if (collides(candidate)) continue;
      const distance = (left - targetLeft) ** 2 + (top - targetTop) ** 2;
      if (!best || distance < best.distance) best = { ...candidate, distance };
    }
    if (best) placed.push(best);
    else unplaced.push(...card.players);
  }
  if (placed.length !== desired.length && desired.every((card) => card.width <= 30 && card.height <= 98)) {
    const lanes = [{ left: 1, bottom: 1 }, { left: 35, bottom: 1 }, { left: 69, bottom: 1 }];
    const packed = [];
    for (const card of [...desired].sort((a, b) => a.y - b.y || b.height - a.height || a.key.localeCompare(b.key))) {
      const options = lanes.flatMap((lane, index) => {
        const top = Math.max(lane.bottom, Math.round(card.y - card.height / 2), 1);
        if (top + card.height > 99) return [];
        return [{ index, left: lane.left, top,
          cost: Math.abs(lane.left + card.width / 2 - card.x) +
            Math.abs(top + card.height / 2 - card.y) + lane.bottom / 10 }];
      }).sort((a, b) => a.cost - b.cost || a.index - b.index);
      if (!options.length) break;
      const chosen = options[0];
      packed.push({ ...card, left: chosen.left, top: chosen.top });
      lanes[chosen.index].bottom = chosen.top + card.height + 1;
    }
    if (packed.length === desired.length) return { cards: packed, unplaced: initiallyUnplaced };
  }
  return { cards: placed, unplaced };
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
