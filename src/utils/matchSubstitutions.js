import {
  createMatchPlayerIdentityIndex,
  getMatchPlayerIdentityKey,
  resolveMatchPlayerCandidate,
} from './matchPlayerIdentity.js';

const clean = (value) => String(value ?? '').trim();
const rows = (value) => Array.isArray(value) ? value : [];
const normalizeName = (value) => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase('es');

export const SUBSTITUTION_REASONS = Object.freeze([
  'tactical',
  'injury',
  'discomfort',
  'other',
]);

const playerFromStats = (playerName, stats = {}) => ({
  playerId: clean(stats.jugadorId || stats.jugador_id || stats.playerId || stats.player_id),
  playerName: clean(playerName || stats.playerName || stats.player_name),
});

const normalizeParticipant = (event = {}, side = 'outgoing') => {
  const outgoing = side === 'outgoing';
  return {
    playerId: clean(outgoing
      ? event.outgoingPlayerId || event.outgoing_player_id || event.outPlayerId || event.outgoingPlayer?.playerId || event.outgoingPlayer?.jugadorId || event.outPlayer?.playerId || event.outPlayer?.jugadorId
      : event.incomingPlayerId || event.incoming_player_id || event.inPlayerId || event.incomingPlayer?.playerId || event.incomingPlayer?.jugadorId || event.inPlayer?.playerId || event.inPlayer?.jugadorId),
    playerName: clean(outgoing
      ? event.outgoingNameSnapshot || event.outgoing_name_snapshot || event.outPlayerName || event.outgoingPlayer?.playerName || event.outPlayer?.playerName || event.outPlayer
      : event.incomingNameSnapshot || event.incoming_name_snapshot || event.inPlayerName || event.incomingPlayer?.playerName || event.inPlayer?.playerName || event.inPlayer),
  };
};

export const normalizeSubstitutionEvent = (event = {}, index = 0) => ({
  id: clean(event.id) || `substitution-${index}`,
  partidoId: clean(event.partidoId || event.partido_id),
  minute: Number(event.minute),
  eventOrder: Number(event.eventOrder ?? event.event_order ?? index),
  outgoingPlayer: normalizeParticipant(event, 'outgoing'),
  incomingPlayer: normalizeParticipant(event, 'incoming'),
  reason: SUBSTITUTION_REASONS.includes(clean(event.reason)) ? clean(event.reason) : null,
  createdAt: clean(event.createdAt || event.created_at),
  updatedAt: clean(event.updatedAt || event.updated_at),
  source: event.source || 'canonical',
});

export const sortSubstitutionEvents = (events = []) => rows(events)
  .map(normalizeSubstitutionEvent)
  .sort((left, right) => (
    left.minute - right.minute
    || left.eventOrder - right.eventOrder
    || left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id)
  ));

const buildIdentityContext = ({ playerStats = {}, lineup = [], players = [] } = {}) => {
  const statsPlayers = Object.entries(playerStats || {}).map(([playerName, stats]) => playerFromStats(playerName, stats));
  const lineupPlayers = rows(lineup).map((entry) => (
    typeof entry === 'string' ? { playerName: entry } : entry
  ));
  const candidates = [...rows(players), ...statsPlayers, ...lineupPlayers];
  return {
    candidates: statsPlayers,
    lineupPlayers,
    identityIndex: createMatchPlayerIdentityIndex(candidates),
  };
};

export const deriveLegacySubstitutionEvents = ({
  playerStats = {},
  lineup = [],
  players = [],
  duration = 90,
} = {}) => {
  const errors = [];
  const normalizedDuration = Number(duration);
  const { candidates, lineupPlayers, identityIndex } = buildIdentityContext({ playerStats, lineup, players });
  const lineupKeys = new Set(lineupPlayers.map((player) => getMatchPlayerIdentityKey(player, identityIndex)).filter(Boolean));
  const perMinuteOrder = new Map();
  const events = [];

  Object.entries(playerStats || {}).forEach(([outgoingName, stats]) => {
    const incomingName = clean(stats?.replacementName || stats?.replacement_name);
    if (!incomingName) return;
    const minute = Number(stats?.minutes);
    const outgoingPlayer = playerFromStats(outgoingName, stats);
    const outgoingKey = getMatchPlayerIdentityKey(outgoingPlayer, identityIndex);
    const incomingResolution = resolveMatchPlayerCandidate({
      reference: { playerName: incomingName },
      candidates,
      identityIndex,
    });
    const incomingPlayer = incomingResolution.candidate;
    if (!outgoingPlayer.playerId || !outgoingKey) {
      errors.push(`LEGACY_OUTGOING_IDENTITY_REQUIRED:${outgoingName}`);
      return;
    }
    if (lineupKeys.size && !lineupKeys.has(outgoingKey)) {
      errors.push(`LEGACY_NON_STARTER_EXIT_AMBIGUOUS:${outgoingName}`);
      return;
    }
    if (incomingResolution.status !== 'resolved' || !incomingPlayer?.playerId) {
      errors.push(`LEGACY_INCOMING_IDENTITY_AMBIGUOUS:${incomingName}`);
      return;
    }
    if (!Number.isInteger(minute) || minute < 0 || minute > normalizedDuration) {
      errors.push(`LEGACY_MINUTE_INVALID:${outgoingName}`);
      return;
    }
    const eventOrder = perMinuteOrder.get(minute) || 0;
    perMinuteOrder.set(minute, eventOrder + 1);
    events.push(normalizeSubstitutionEvent({
      id: `legacy-${outgoingPlayer.playerId}-${incomingPlayer.playerId}-${minute}-${eventOrder}`,
      minute,
      eventOrder,
      outgoingPlayerId: outgoingPlayer.playerId,
      incomingPlayerId: incomingPlayer.playerId,
      outgoingNameSnapshot: outgoingPlayer.playerName,
      incomingNameSnapshot: incomingPlayer.playerName,
      source: 'legacy',
    }));
  });

  return {
    source: 'legacy',
    valid: errors.length === 0,
    events: errors.length ? [] : sortSubstitutionEvents(events),
    errors,
  };
};

export const getMatchSubstitutionEvents = ({
  canonicalEvents = [],
  playerStats = {},
  lineup = [],
  players = [],
  duration = 90,
} = {}) => {
  if (rows(canonicalEvents).length) {
    return {
      source: 'canonical',
      valid: true,
      events: sortSubstitutionEvents(canonicalEvents),
      errors: [],
    };
  }
  return deriveLegacySubstitutionEvents({ playerStats, lineup, players, duration });
};

const normalizeInitialPlayers = (initialPlayers = []) => rows(initialPlayers).map((player) => ({
  playerId: clean(player?.playerId || player?.jugadorId || player?.jugador_id || player?.id),
  playerName: clean(player?.playerName || player?.player_name || player?.name),
}));

export const projectSubstitutionMinutes = ({ initialPlayers = [], events = [], duration = 90 } = {}) => {
  const normalizedDuration = Number(duration);
  const orderedEvents = sortSubstitutionEvents(events);
  const starters = normalizeInitialPlayers(initialPlayers);
  const errors = [];
  if (!Number.isInteger(normalizedDuration) || normalizedDuration <= 0) errors.push('INVALID_MATCH_DURATION');
  if (starters.some((player) => !player.playerId)) errors.push('INITIAL_PLAYER_IDENTITY_REQUIRED');
  if (new Set(starters.map((player) => player.playerId)).size !== starters.length) errors.push('DUPLICATE_INITIAL_PLAYER');
  const onField = new Set(starters.map((player) => player.playerId));
  const exitedPlayers = new Set();
  const entryMinute = new Map(starters.map((player) => [player.playerId, 0]));
  const minutesByPlayer = new Map(starters.map((player) => [player.playerId, 0]));
  const namesByPlayer = new Map(starters.map((player) => [player.playerId, player.playerName]));
  const seenOrders = new Set();

  orderedEvents.forEach((event) => {
    const outgoingId = event.outgoingPlayer.playerId;
    const incomingId = event.incomingPlayer.playerId;
    const orderKey = `${event.minute}:${event.eventOrder}`;
    if (!Number.isInteger(event.minute) || event.minute < 0 || event.minute > normalizedDuration) {
      errors.push(`INVALID_EVENT_MINUTE:${event.id}`);
      return;
    }
    if (!Number.isInteger(event.eventOrder) || event.eventOrder < 0 || seenOrders.has(orderKey)) {
      errors.push(`INVALID_EVENT_ORDER:${event.id}`);
      return;
    }
    seenOrders.add(orderKey);
    if (!outgoingId || !incomingId) {
      errors.push(`EVENT_IDENTITY_REQUIRED:${event.id}`);
      return;
    }
    if (outgoingId === incomingId) {
      errors.push(`SAME_PLAYER_SUBSTITUTION:${event.id}`);
      return;
    }
    if (!onField.has(outgoingId)) {
      errors.push(`OUTGOING_PLAYER_NOT_ON_FIELD:${event.id}`);
      return;
    }
    if (onField.has(incomingId)) {
      errors.push(`INCOMING_PLAYER_ALREADY_ON_FIELD:${event.id}`);
      return;
    }
    if (exitedPlayers.has(incomingId)) {
      errors.push(`PLAYER_REENTRY_NOT_SUPPORTED:${event.id}`);
      return;
    }
    const enteredAt = entryMinute.get(outgoingId);
    if (!Number.isFinite(enteredAt) || event.minute < enteredAt) {
      errors.push(`OUTGOING_PLAYER_BEFORE_ENTRY:${event.id}`);
      return;
    }
    minutesByPlayer.set(outgoingId, (minutesByPlayer.get(outgoingId) || 0) + event.minute - enteredAt);
    onField.delete(outgoingId);
    exitedPlayers.add(outgoingId);
    onField.add(incomingId);
    entryMinute.delete(outgoingId);
    entryMinute.set(incomingId, event.minute);
    minutesByPlayer.set(incomingId, minutesByPlayer.get(incomingId) || 0);
    namesByPlayer.set(outgoingId, event.outgoingPlayer.playerName || namesByPlayer.get(outgoingId) || '');
    namesByPlayer.set(incomingId, event.incomingPlayer.playerName || namesByPlayer.get(incomingId) || '');
  });

  if (!errors.length) {
    onField.forEach((playerId) => {
      const enteredAt = entryMinute.get(playerId);
      minutesByPlayer.set(playerId, (minutesByPlayer.get(playerId) || 0) + normalizedDuration - enteredAt);
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    duration: normalizedDuration,
    events: orderedEvents,
    onFieldPlayerIds: errors.length ? [] : Array.from(onField),
    minutesByPlayer: errors.length ? {} : Object.fromEntries(minutesByPlayer),
    namesByPlayer: Object.fromEntries(namesByPlayer),
  };
};

export const getOnFieldPlayerIdsAtMinute = ({ initialPlayers = [], events = [], minute = 0 } = {}) => {
  const targetMinute = Number(minute);
  const onField = new Set(normalizeInitialPlayers(initialPlayers).map((player) => player.playerId).filter(Boolean));
  const exitedPlayers = new Set();
  sortSubstitutionEvents(events).forEach((event) => {
    if (event.minute > targetMinute) return;
    if (!onField.has(event.outgoingPlayer.playerId) || onField.has(event.incomingPlayer.playerId) || exitedPlayers.has(event.incomingPlayer.playerId)) return;
    onField.delete(event.outgoingPlayer.playerId);
    exitedPlayers.add(event.outgoingPlayer.playerId);
    onField.add(event.incomingPlayer.playerId);
  });
  return Array.from(onField);
};

export const buildSubstitutionTimelineEvents = (events = []) => sortSubstitutionEvents(events).map((event) => ({
  id: event.id,
  key: 'substitution',
  source: event.source,
  minute: event.minute,
  eventOrder: event.eventOrder,
  outPlayer: event.outgoingPlayer,
  inPlayer: event.incomingPlayer,
  reason: event.reason,
}));
