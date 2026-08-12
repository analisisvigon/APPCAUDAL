import { normalizeStatsLineup } from './statsLineup.js';

const cleanName = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const normalizedName = (value) => cleanName(value).toLocaleLowerCase('es-ES');
const cleanId = (value) => String(value || '').trim();
const isUuidValue = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleanId(value));

export const getStatsSquadIdentity = (value = {}) => {
  const resolvedId = cleanId(value.jugador_id || value.jugadorId || value.id);
  const resolvedName = value.player_name || value.playerName || value.name;
  return resolvedId ? `id:${resolvedId}` : `legacy:${normalizedName(resolvedName)}`;
};

export const getActiveStatsCalledPlayerNames = ({ calledPlayerNames = [], lineupNames = [] } = {}) => {
  const namesByIdentity = new Map();
  [...calledPlayerNames, ...lineupNames].forEach((value) => {
    const name = cleanName(value);
    const identity = normalizedName(name);
    if (identity && !namesByIdentity.has(identity)) namesByIdentity.set(identity, name);
  });
  return Array.from(namesByIdentity.values());
};

const resolvePlayerId = (player, calledPlayerIds = {}, statsPlayerData = {}) => {
  const candidate = cleanId(
  player?.jugador_id
  || player?.jugadorId
  || player?.id
  || calledPlayerIds[player?.name]
  || statsPlayerData[player?.name]?.jugadorId
  || statsPlayerData[player?.name]?.jugador_id
  );
  return isUuidValue(candidate) ? candidate : '';
};

export const buildMatchSquadSnapshot = ({
  matchId,
  system,
  lineup = [],
  rosterPlayers = [],
  calledPlayers = [],
  calledPlayerIds = {},
  statsPlayerData = {},
} = {}) => {
  const cleanLineup = normalizeStatsLineup(lineup);
  const rosterByName = new Map();
  rosterPlayers.forEach((player) => {
    const key = normalizedName(player?.name);
    if (!key) return;
    const current = rosterByName.get(key) || [];
    rosterByName.set(key, [...current, player]);
  });

  const resolvePlayer = (source) => {
    const name = cleanName(source?.name || source?.player_name || source?.playerName);
    const matchingRoster = rosterByName.get(normalizedName(name)) || [];
    const rosterMatch = matchingRoster.length === 1 ? matchingRoster[0] : null;
    const player = { ...(rosterMatch || {}), ...(source || {}), name: name || rosterMatch?.name || '' };
    return {
      source: player,
      jugador_id: resolvePlayerId(player, calledPlayerIds, statsPlayerData) || null,
      player_name: cleanName(player.name),
    };
  };

  const allPlayers = new Map();
  [...rosterPlayers, ...calledPlayers].forEach((player) => {
    const resolved = resolvePlayer(player);
    if (!resolved.player_name) return;
    const identity = getStatsSquadIdentity(resolved);
    if (!allPlayers.has(identity)) allPlayers.set(identity, resolved);
  });
  cleanLineup.filter(Boolean).forEach((playerName) => {
    const resolved = resolvePlayer({ name: playerName });
    allPlayers.set(getStatsSquadIdentity(resolved), resolved);
  });

  const starterIdentities = new Set(cleanLineup.filter(Boolean).map((playerName) => (
    getStatsSquadIdentity(resolvePlayer({ name: playerName }))
  )));
  const calledIdentities = new Set(calledPlayers.map((player) => getStatsSquadIdentity(resolvePlayer(player))));
  starterIdentities.forEach((identity) => calledIdentities.add(identity));

  const squad = Array.from(allPlayers.values()).map((player) => {
    const identity = getStatsSquadIdentity(player);
    return {
      jugador_id: player.jugador_id,
      player_name: player.player_name,
      role: starterIdentities.has(identity) ? 'Titular' : calledIdentities.has(identity) ? 'Suplente' : 'Fuera',
    };
  });

  const squadByIdentity = new Map(squad.map((player) => [getStatsSquadIdentity(player), player]));
  const slots = cleanLineup.flatMap((playerName, slot) => {
    if (!playerName) return [];
    const resolved = resolvePlayer({ name: playerName });
    const player = squadByIdentity.get(getStatsSquadIdentity(resolved)) || resolved;
    return [{ slot, jugador_id: player.jugador_id, player_name: player.player_name }];
  });

  return {
    p_partido_id: matchId,
    p_stats_system: cleanName(system),
    p_squad: squad,
    p_slots: slots,
  };
};

export const validateMatchSquadSnapshot = (snapshot, availabilityById = {}) => {
  if (!cleanId(snapshot?.p_partido_id)) throw new Error('Match id is required');
  if (!cleanName(snapshot?.p_stats_system)) throw new Error('Stats system is required');
  if (!Array.isArray(snapshot?.p_squad) || !Array.isArray(snapshot?.p_slots)) throw new Error('Squad and slots must be arrays');
  if (snapshot.p_slots.length > 11) throw new Error('A lineup cannot contain more than 11 starters');

  const squadIdentities = new Set();
  const activePlayerNames = new Set();
  snapshot.p_squad.forEach((player) => {
    if (!cleanName(player.player_name) || !['Titular', 'Suplente', 'Fuera'].includes(player.role)) throw new Error('Invalid squad row');
    const identity = getStatsSquadIdentity(player);
    if (squadIdentities.has(identity)) throw new Error('Duplicated squad player');
    squadIdentities.add(identity);
    if (player.role !== 'Fuera') {
      const playerName = normalizedName(player.player_name);
      if (activePlayerNames.has(playerName)) throw new Error('Duplicated active player name conflicts with legacy unique constraint');
      activePlayerNames.add(playerName);
    }
  });

  const slots = new Set();
  const slotPlayers = new Set();
  snapshot.p_slots.forEach((slot) => {
    if (!Number.isInteger(slot.slot) || slot.slot < 0 || slot.slot > 10) throw new Error('Invalid lineup slot');
    if (slots.has(slot.slot)) throw new Error('Duplicated lineup slot');
    slots.add(slot.slot);
    const identity = getStatsSquadIdentity(slot);
    if (slotPlayers.has(identity)) throw new Error('Duplicated lineup player');
    slotPlayers.add(identity);
  });

  const starters = new Set(snapshot.p_squad.filter((player) => player.role === 'Titular').map(getStatsSquadIdentity));
  if (starters.size !== slotPlayers.size || [...starters].some((identity) => !slotPlayers.has(identity))) {
    throw new Error('Starters and lineup slots do not match');
  }
  snapshot.p_squad.filter((player) => player.role === 'Titular' && player.jugador_id).forEach((player) => {
    if ((availabilityById[player.jugador_id] || 'available') !== 'available') {
      throw new Error('An unavailable player cannot be a starter');
    }
  });
  return snapshot;
};

export const applyMatchSquadSnapshotModel = (state, snapshot, availabilityById = {}) => {
  validateMatchSquadSnapshot(snapshot, availabilityById);
  const next = structuredClone(state);
  next.system = snapshot.p_stats_system;
  next.slots = snapshot.p_slots.map((slot) => ({ ...slot }));
  next.callups = snapshot.p_squad.filter((player) => player.role !== 'Fuera').map((player) => {
    const identity = getStatsSquadIdentity(player);
    const existing = next.callups.find((row) => getStatsSquadIdentity(row) === identity);
    return { ...existing, ...player, row_id: existing?.row_id || `callup:${identity}` };
  });

  snapshot.p_squad.filter((player) => player.role !== 'Fuera').forEach((player) => {
    const identity = getStatsSquadIdentity(player);
    const index = next.stats.findIndex((row) => getStatsSquadIdentity(row) === identity);
    if (index >= 0) {
      const existing = next.stats[index];
      next.stats[index] = {
        ...existing,
        jugador_id: player.jugador_id,
        player_name: player.player_name,
        role: player.role,
        minutes: cleanName(existing.minutes) || (player.role === 'Titular' ? '90' : ''),
      };
    } else {
      next.stats.push({
        row_id: `stats:${identity}`,
        ...player,
        minutes: player.role === 'Titular' ? '90' : '',
        yellow: false,
        yellow_count: 0,
        red: false,
        injured: false,
        rating: '',
        replacement_name: '',
      });
    }
  });
  return next;
};
