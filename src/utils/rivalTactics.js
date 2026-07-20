import { getPlayerSlotCompatibility } from '../constants/playerPositions.js';

const normalizeText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const getSide = (value) => {
  const text = normalizeText(value);
  if (/izquier|\bli\b|\bei\b|\bmi\b|\bmpi\b|\bcai\b/.test(text)) return 'left';
  if (/derech|\bld\b|\bed\b|\bmd\b|\bmpd\b|\bcad\b/.test(text)) return 'right';
  return 'center';
};

export const getFootballRoleFamily = (value) => {
  const text = normalizeText(value);
  if (!text) return 'unknown';
  if (/portero|arquero|guardameta|goalkeeper|\bgk\b|\bpor\b/.test(text)) return 'goalkeeper';
  if (/carrilero|wing back/.test(text)) return 'wingback';
  if (/lateral|full back|\bli\b|\bld\b|\blb\b|\brb\b/.test(text)) return 'fullback';
  if (/central|defensa central|centre back|center back|\bdfc\b|\bcb\b/.test(text)) return 'centerback';
  if (/pivote|medio defensivo|mediocentro defensivo|defensive midfield|\bmcd\b|\bdm\b/.test(text)) return 'pivot';
  if (/mediapunta|media punta|attacking midfield|\bmp\b|\bam\b/.test(text)) return 'attacking_midfielder';
  if (/extremo|winger|interior de banda|\bei\b|\bed\b|\blw\b|\brw\b/.test(text)) return 'winger';
  if (/interior|mediocentro|centrocampista|central midfield|\bmc\b|\bcm\b/.test(text)) return 'midfielder';
  if (/delantero|punta|ariete|striker|forward|\bdc\b|\bcf\b|\bst\b/.test(text)) return 'striker';
  if (/defensa|defender/.test(text)) return 'defender';
  if (/medio|midfield/.test(text)) return 'midfielder';
  if (/atacante|attack/.test(text)) return 'attacker';
  return 'unknown';
};

const familyCompatibility = {
  goalkeeper: { goalkeeper: 100 },
  centerback: { centerback: 100, defender: 72, fullback: 42, pivot: 35 },
  fullback: { fullback: 100, wingback: 88, defender: 70, centerback: 42, winger: 38 },
  wingback: { wingback: 100, fullback: 90, winger: 66, defender: 62 },
  pivot: { pivot: 100, midfielder: 78, centerback: 48 },
  midfielder: { midfielder: 100, pivot: 82, attacking_midfielder: 72 },
  attacking_midfielder: { attacking_midfielder: 100, midfielder: 76, winger: 68, attacker: 58 },
  winger: { winger: 100, attacking_midfielder: 70, wingback: 58, attacker: 64 },
  striker: { striker: 100, attacker: 78, winger: 48, attacking_midfielder: 42 },
};

const scorePositionValue = (positionValue, role) => {
  const position = normalizeText(positionValue);
  const normalizedRole = normalizeText(role);
  if (!position) return 0;
  const targetFamily = getFootballRoleFamily(role);
  const playerFamily = getFootballRoleFamily(positionValue);
  let score = familyCompatibility[targetFamily]?.[playerFamily] || 0;
  if (position === normalizedRole) score += 35;
  else if (position.includes(normalizedRole) || normalizedRole.includes(position)) score += 18;
  const targetSide = getSide(role);
  const playerSide = getSide(positionValue);
  if (targetSide !== 'center' && playerSide === targetSide) score += 16;
  if (targetSide !== 'center' && playerSide !== 'center' && playerSide !== targetSide) score -= 75;
  return Math.max(0, score);
};

export const getPlayerRoleFitScore = (player = {}, role = '') => {
  const catalogScore = getPlayerSlotCompatibility(player, role);
  if (catalogScore) return catalogScore;
  const specificPosition = player.specificPosition || player.specific_position;
  const specificScore = scorePositionValue(specificPosition, role);
  const naturalScore = scorePositionValue(player.position, role);
  if (normalizeText(specificPosition) && specificScore) return Math.max(specificScore + 18, naturalScore * 0.6);
  return naturalScore;
};

export const isPlayerCompatibleWithRole = (player, role, minimumScore = 40) => getPlayerRoleFitScore(player, role) >= minimumScore;

const playerKey = (player = {}) => String(
  player.membershipId
  || player.membership_id
  || player.globalPlayerId
  || player.global_player_id
  || player.jugadorRivalId
  || player.jugador_rival_id
  || player.id
  || normalizeText(player.name)
);

export const TACTICAL_PLACEMENT_STATUS = Object.freeze({
  STARTER: 'starter',
  RESERVE: 'reserve',
  UNPLACED: 'unplaced',
  INACTIVE: 'inactive',
});

export const getStarterSlotId = (slotIndex) => `starter:${Number(slotIndex)}`;
export const getReserveSlotId = (slotIndex, reserveOrder) => `reserve:${Number(slotIndex)}:${Number(reserveOrder)}`;

const normalizePlacement = (placement = {}) => {
  const status = Object.values(TACTICAL_PLACEMENT_STATUS).includes(placement.status)
    ? placement.status
    : TACTICAL_PLACEMENT_STATUS.UNPLACED;
  if (status === TACTICAL_PLACEMENT_STATUS.STARTER) {
    const slotIndex = Number(placement.slotIndex);
    return Number.isInteger(slotIndex)
      ? { status, slotIndex, slotId: placement.slotId || getStarterSlotId(slotIndex), reserveOrder: null, reserveSlotId: null }
      : { status: TACTICAL_PLACEMENT_STATUS.UNPLACED, slotIndex: null, slotId: null, reserveOrder: null, reserveSlotId: null };
  }
  if (status === TACTICAL_PLACEMENT_STATUS.RESERVE) {
    const slotIndex = Number(placement.slotIndex);
    const reserveOrder = Number(placement.reserveOrder);
    return Number.isInteger(slotIndex) && [0, 1].includes(reserveOrder)
      ? {
          status,
          slotIndex,
          slotId: placement.slotId || getStarterSlotId(slotIndex),
          reserveOrder,
          reserveSlotId: placement.reserveSlotId || getReserveSlotId(slotIndex, reserveOrder),
        }
      : { status: TACTICAL_PLACEMENT_STATUS.UNPLACED, slotIndex: null, slotId: null, reserveOrder: null, reserveSlotId: null };
  }
  return { status, slotIndex: null, slotId: null, reserveOrder: null, reserveSlotId: null };
};

const placementTargetKey = (placement = {}) => {
  const normalized = normalizePlacement(placement);
  if (normalized.status === TACTICAL_PLACEMENT_STATUS.STARTER) return normalized.slotId;
  if (normalized.status === TACTICAL_PLACEMENT_STATUS.RESERVE) return normalized.reserveSlotId;
  return null;
};

export const buildTacticalPlacements = ({ players = [], lineup = [] } = {}) => {
  const placements = {};
  const occupiedTargets = new Set();
  const lineupByPlayer = new Map(sanitizeTacticalLineup(lineup).map((player) => [playerKey(player), player]));

  players.forEach((player) => {
    const id = playerKey(player);
    if (!id) return;
    const lineupPlayer = lineupByPlayer.get(id);
    let placement;
    if (player.activeInSquad === false) {
      placement = normalizePlacement({ status: TACTICAL_PLACEMENT_STATUS.INACTIVE });
    } else if (player.fieldRole === 'Titular' && Number.isInteger(Number(player.slotIndex))) {
      placement = normalizePlacement({ status: TACTICAL_PLACEMENT_STATUS.STARTER, slotIndex: Number(player.slotIndex) });
    } else if (player.fieldRole === 'Reserva' && Number.isInteger(Number(player.slotIndex)) && [0, 1].includes(Number(player.reserveIndex))) {
      placement = normalizePlacement({ status: TACTICAL_PLACEMENT_STATUS.RESERVE, slotIndex: Number(player.slotIndex), reserveOrder: Number(player.reserveIndex) });
    } else if (lineupPlayer && Number.isInteger(Number(lineupPlayer.slot))) {
      placement = normalizePlacement({ status: TACTICAL_PLACEMENT_STATUS.STARTER, slotIndex: Number(lineupPlayer.slot) });
    } else {
      placement = normalizePlacement({ status: TACTICAL_PLACEMENT_STATUS.UNPLACED });
    }
    const targetKey = placementTargetKey(placement);
    if (targetKey && occupiedTargets.has(targetKey)) placement = normalizePlacement({ status: TACTICAL_PLACEMENT_STATUS.UNPLACED });
    else if (targetKey) occupiedTargets.add(targetKey);
    placements[id] = placement;
  });
  return placements;
};

export const applyPlayerMove = ({ placements = {}, playerId, destination } = {}) => {
  const id = String(playerId || '');
  if (!id || !Object.prototype.hasOwnProperty.call(placements, id)) {
    return { placements, changed: false, movedPlayerIds: [], occupantPlayerId: null, origin: null, destination: null };
  }
  const origin = normalizePlacement(placements[id]);
  const target = normalizePlacement(destination);
  const originTargetKey = placementTargetKey(origin);
  const destinationTargetKey = placementTargetKey(target);
  const sameDestination = origin.status === target.status
    && originTargetKey === destinationTargetKey;
  if (sameDestination) {
    return { placements, changed: false, movedPlayerIds: [], occupantPlayerId: null, origin, destination: target };
  }

  const occupantEntry = destinationTargetKey
    ? Object.entries(placements).find(([candidateId, placement]) => candidateId !== id && placementTargetKey(placement) === destinationTargetKey)
    : null;
  const occupantPlayerId = occupantEntry?.[0] || null;
  const next = { ...placements, [id]: target };
  if (occupantPlayerId) {
    next[occupantPlayerId] = originTargetKey
      ? origin
      : normalizePlacement({ status: TACTICAL_PLACEMENT_STATUS.UNPLACED });
  }
  return {
    placements: next,
    changed: true,
    movedPlayerIds: occupantPlayerId ? [id, occupantPlayerId] : [id],
    occupantPlayerId,
    origin,
    destination: target,
  };
};

export const sanitizeTacticalLineup = (lineup = [], maxSlots = 11) => {
  const usedPlayers = new Set();
  const usedSlots = new Set();
  return lineup.reduce((result, player) => {
    const key = playerKey(player);
    const slot = Number(player?.slot);
    if (!key || !Number.isInteger(slot) || slot < 0 || slot >= maxSlots || usedPlayers.has(key) || usedSlots.has(slot)) return result;
    usedPlayers.add(key);
    usedSlots.add(slot);
    return [...result, { ...player, slot }];
  }, []);
};

export const movePlayerInLineup = ({ lineup = [], player, targetSlot, coordinates = [] }) => {
  const slot = Number(targetSlot);
  if (!player || !Number.isInteger(slot)) return sanitizeTacticalLineup(lineup, coordinates.length || 11);
  const maxSlots = coordinates.length || 11;
  const clean = sanitizeTacticalLineup(lineup, maxSlots);
  const key = playerKey(player);
  const source = clean.find((item) => playerKey(item) === key);
  const occupant = clean.find((item) => Number(item.slot) === slot && playerKey(item) !== key);
  const remaining = clean.filter((item) => playerKey(item) !== key && (!occupant || playerKey(item) !== playerKey(occupant)));
  const targetCoordinates = coordinates[slot] || {};
  const next = [...remaining, { ...player, role: 'Titular', slot, ...targetCoordinates }];
  if (occupant && Number.isInteger(source?.slot)) {
    next.push({ ...occupant, role: 'Titular', slot: source.slot, ...(coordinates[source.slot] || {}) });
  }
  return sanitizeTacticalLineup(next, maxSlots).sort((left, right) => left.slot - right.slot);
};

export const buildIntelligentLineup = ({
  players = [],
  roles = [],
  coordinates = [],
  currentLineup = [],
  currentRoles = roles,
  minimumScore = 40,
}) => {
  const activePlayers = players.filter((player) => player?.activeInSquad !== false && !player?.injured && !player?.suspended);
  const currentByPlayer = new Map(sanitizeTacticalLineup(currentLineup, roles.length).map((player) => [playerKey(player), player]));
  const candidatesBySlot = roles.map((role, slot) => ({
    role,
    slot,
    candidates: activePlayers.map((player) => {
      const fitScore = getPlayerRoleFitScore(player, role);
      const previous = currentByPlayer.get(playerKey(player));
      const previousRole = previous ? currentRoles[previous.slot] : '';
      const continuityBonus = previous
        ? getFootballRoleFamily(previousRole) === getFootballRoleFamily(role) ? 28 : 10
        : 0;
      const starterBonus = player.role === 'Titular' ? 8 : 0;
      return { player, fitScore, totalScore: fitScore + continuityBonus + starterBonus };
    }).filter((candidate) => candidate.fitScore >= minimumScore),
  }));

  const orderedSlots = [...candidatesBySlot].sort((left, right) =>
    left.candidates.length - right.candidates.length
    || Math.max(...right.candidates.map((candidate) => candidate.totalScore), 0) - Math.max(...left.candidates.map((candidate) => candidate.totalScore), 0)
    || left.slot - right.slot
  );
  const used = new Set();
  const assignments = [];
  orderedSlots.forEach(({ slot, role, candidates }) => {
    const candidate = candidates
      .filter(({ player }) => !used.has(playerKey(player)))
      .sort((left, right) =>
        right.totalScore - left.totalScore
        || String(left.player.name || '').localeCompare(String(right.player.name || ''), 'es')
      )[0];
    if (!candidate) return;
    used.add(playerKey(candidate.player));
    assignments.push({ ...candidate.player, role: 'Titular', slot, ...(coordinates[slot] || {}), tacticalFitScore: candidate.fitScore });
  });

  const lineup = sanitizeTacticalLineup(assignments, roles.length).sort((left, right) => left.slot - right.slot);
  return {
    lineup,
    unplacedPlayers: activePlayers.filter((player) => !used.has(playerKey(player))),
    emptySlots: roles.map((_, slot) => slot).filter((slot) => !lineup.some((player) => player.slot === slot)),
};
};

export const buildIntelligentReservePlacements = ({
  players = [],
  roles = [],
  currentPlacements = new Map(),
  currentRoles = roles,
  minimumScore = 40,
  maxPerSlot = 2,
}) => {
  const capacities = roles.map(() => maxPerSlot);
  const normalizedCurrent = currentPlacements instanceof Map
    ? currentPlacements
    : new Map(Object.entries(currentPlacements || {}));
  const rankedPlayers = players
    .filter((player) => player?.activeInSquad !== false && !player?.injured && !player?.suspended)
    .map((player) => {
      const current = normalizedCurrent.get(playerKey(player));
      const candidates = roles.map((role, slotIndex) => {
        const fitScore = getPlayerRoleFitScore(player, role);
        const continuityBonus = current?.fieldRole === 'Reserva'
          && getFootballRoleFamily(currentRoles[current.slotIndex]) === getFootballRoleFamily(role) ? 18 : 0;
        return { slotIndex, fitScore, totalScore: fitScore + continuityBonus };
      }).filter((candidate) => candidate.fitScore >= minimumScore)
        .sort((left, right) => right.totalScore - left.totalScore || left.slotIndex - right.slotIndex);
      return { player, candidates, bestScore: candidates[0]?.totalScore || 0 };
    })
    .sort((left, right) => right.bestScore - left.bestScore || left.candidates.length - right.candidates.length || String(left.player.name || '').localeCompare(String(right.player.name || ''), 'es'));

  const placements = [];
  const unplacedPlayers = [];
  rankedPlayers.forEach(({ player, candidates }) => {
    const target = candidates.find((candidate) => capacities[candidate.slotIndex] > 0);
    if (!target) {
      unplacedPlayers.push(player);
      return;
    }
    const reserveIndex = maxPerSlot - capacities[target.slotIndex];
    capacities[target.slotIndex] -= 1;
    placements.push({ player, fieldRole: 'Reserva', slotIndex: target.slotIndex, reserveIndex, tacticalFitScore: target.fitScore });
  });
  return { placements, unplacedPlayers };
};

export const getTacticalPlayerKey = playerKey;
