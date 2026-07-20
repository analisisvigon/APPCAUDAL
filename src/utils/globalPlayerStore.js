import {
  getNaturalPositionLabel,
  getPlayerPositionModel,
  getSpecificPositionLabel,
  mapExternalPositionToPlayerPositions,
} from '../constants/playerPositions.js';

const normalizeText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const safeArray = (value) => Array.isArray(value) ? value : [];
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));

const getPlayerSourceUrls = (player) => new Set([
  ...safeArray(player.sources).map((item) => item.url),
  player.sourceProfileUrl,
  player.source_profile_url,
].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean));

const findExactCoveragePlayer = (legacyPlayer, players) => {
  const linkedId = legacyPlayer.globalPlayerId || legacyPlayer.global_player_id;
  if (linkedId) {
    const linked = players.find((player) => String(player.globalPlayerId || player.id) === String(linkedId));
    if (linked) return linked;
  }
  const legacyExternalSource = normalizeText(legacyPlayer.externalSource || legacyPlayer.external_source);
  const legacyExternalId = String(legacyPlayer.externalPlayerId || legacyPlayer.external_player_id || '').trim();
  const legacyUrl = String(legacyPlayer.sourceProfileUrl || legacyPlayer.source_profile_url || '').trim().toLowerCase();
  const legacyName = normalizeText(legacyPlayer.name);
  return players.find((player) => {
    if (legacyExternalSource && legacyExternalId
      && normalizeText(player.externalSource) === legacyExternalSource
      && String(player.externalPlayerId || '').trim() === legacyExternalId) return true;
    if (legacyUrl && getPlayerSourceUrls(player).has(legacyUrl)) return true;
    return Boolean(legacyName && legacyPlayer.dob && normalizeText(player.name) === legacyName && player.dob === legacyPlayer.dob);
  }) || null;
};

const createLegacyMembership = (legacyPlayer, legacyId) => ({
  id: `legacy-membership:${legacyId}`,
  player_id: null,
  team_id: legacyPlayer.teamId || legacyPlayer.equipo_rival_id || '',
  is_current: legacyPlayer.activeInSquad !== false && legacyPlayer.active_in_squad !== false,
  number: legacyPlayer.number || '',
  captain: Boolean(legacyPlayer.captain),
  is_key: Boolean(legacyPlayer.isKey || legacyPlayer.is_key),
  observed: Boolean(legacyPlayer.observed),
  squad_role: legacyPlayer.role || '',
  tactical_role: legacyPlayer.fieldRole || legacyPlayer.tactical_role || null,
  tactical_slot: legacyPlayer.slotIndex ?? legacyPlayer.tactical_slot ?? null,
  tactical_reserve_slot: legacyPlayer.reserveIndex ?? legacyPlayer.tactical_reserve_slot ?? null,
  legacy_compatible: true,
});

export const buildGlobalPlayerCoverage = ({ globalPlayers = [], legacyPlayers = [], teams = [] } = {}) => {
  const players = globalPlayers.map((player) => ({
    ...player,
    memberships: safeArray(player.memberships).map((membership) => ({ ...membership })),
    currentMemberships: safeArray(player.memberships).filter((membership) => membership.is_current).map((membership) => ({ ...membership })),
  }));
  const orphanLegacyPlayers = [];
  const missingMemberships = [];

  safeArray(legacyPlayers).forEach((legacyPlayer, index) => {
    const legacyId = legacyPlayer.jugadorRivalId || legacyPlayer.legacyPlayerId || legacyPlayer.id || `row-${index}`;
    const teamId = legacyPlayer.teamId || legacyPlayer.equipo_rival_id || '';
    let player = findExactCoveragePlayer(legacyPlayer, players);
    const matchedGlobal = Boolean(player && player.globalPlayerId);
    if (!player) {
      const model = getPlayerPositionModel(legacyPlayer);
      const membership = createLegacyMembership(legacyPlayer, legacyId);
      player = {
        ...createBlankGlobalPlayer(),
        ...legacyPlayer,
        ...model,
        id: `legacy:${legacyId}`,
        globalPlayerId: null,
        legacyPlayerId: legacyId,
        jugadorRivalId: legacyId,
        legacyCompatible: true,
        photoUrl: legacyPlayer.photoUrl || legacyPlayer.image || '',
        position: getNaturalPositionLabel(model.primaryNaturalPosition) || legacyPlayer.position || '',
        specificPosition: getSpecificPositionLabel(model.primarySpecificPosition) || legacyPlayer.specificPosition || legacyPlayer.specific_position || '',
        sources: legacyPlayer.sourceProfileUrl || legacyPlayer.source_profile_url ? [{
          url: legacyPlayer.sourceProfileUrl || legacyPlayer.source_profile_url,
          sourceName: legacyPlayer.externalSource || legacyPlayer.external_source || 'Fuente legacy',
          isPrimary: true,
        }] : [],
        traits: safeArray(legacyPlayer.traits),
        memberships: teamId ? [membership] : [],
        currentMemberships: teamId && membership.is_current ? [membership] : [],
        membership: teamId ? membership : null,
        membershipId: null,
        teamId: membership.is_current ? teamId : '',
      };
      players.push(player);
      orphanLegacyPlayers.push(legacyPlayer);
      return;
    }

    if (!teamId) return;
    if (!matchedGlobal) orphanLegacyPlayers.push(legacyPlayer);
    const hasTeamMembership = safeArray(player.memberships).some((membership) => (
      String(membership.team_id) === String(teamId)
      && membership.is_current === (legacyPlayer.activeInSquad !== false && legacyPlayer.active_in_squad !== false)
    ));
    if (!hasTeamMembership) {
      const membership = createLegacyMembership(legacyPlayer, legacyId);
      player.memberships.push(membership);
      if (membership.is_current) player.currentMemberships.push(membership);
      if (matchedGlobal) missingMemberships.push({ legacyPlayer, globalPlayer: player, membership });
    }
  });

  const playersByTeam = Object.fromEntries(safeArray(teams).map((team) => {
    const teamPlayers = players.filter((player) => safeArray(player.memberships).some((membership) => membership.is_current && String(membership.team_id) === String(team.id)));
    return [team.id, {
      teamId: team.id,
      teamName: team.name,
      linkedPlayers: teamPlayers.filter((player) => safeArray(player.memberships).some((membership) => (
        membership.is_current && String(membership.team_id) === String(team.id) && !membership.legacy_compatible
      ))).length,
      legacyPending: teamPlayers.filter((player) => safeArray(player.memberships).some((membership) => (
        membership.is_current && String(membership.team_id) === String(team.id) && membership.legacy_compatible
      ))).length,
      total: teamPlayers.length,
    }];
  }));

  return {
    players,
    orphanLegacyPlayers,
    missingMemberships,
    playersByTeam,
    stats: {
      rivalTeams: safeArray(teams).length,
      globalPlayers: globalPlayers.length,
      activeMemberships: globalPlayers.flatMap((player) => safeArray(player.memberships)).filter((membership) => membership.is_current).length,
      legacyPlayers: safeArray(legacyPlayers).length,
      orphanLegacyPlayers: orphanLegacyPlayers.length,
    },
  };
};

export const filterGlobalPlayers = (players = [], filters = {}) => {
  const normalizedSearch = normalizeText(filters.search);
  return safeArray(players).filter((player) => {
    const model = getPlayerPositionModel(player);
    const naturalPositions = [model.primaryNaturalPosition, ...model.secondaryNaturalPositions].filter(Boolean);
    const specificPositions = [model.primarySpecificPosition, ...model.secondarySpecificPositions].filter(Boolean);
    const currentTeamIds = safeArray(player.memberships).filter((membership) => membership.is_current).map((membership) => String(membership.team_id));
    const searchText = normalizeText([
      player.name,
      ...naturalPositions.map(getNaturalPositionLabel),
      ...specificPositions.map(getSpecificPositionLabel),
    ].join(' '));
    const matchesSearch = !normalizedSearch || searchText.includes(normalizedSearch);
    const matchesNatural = !filters.naturalPosition || naturalPositions.includes(filters.naturalPosition);
    const matchesSpecific = !filters.specificPosition || specificPositions.includes(filters.specificPosition);
    const matchesTeam = !filters.teamId
      || (filters.teamId === '__without_team__' ? currentTeamIds.length === 0 : currentTeamIds.includes(String(filters.teamId)));
    const matchesTrait = !filters.trait || safeArray(player.traits).some((trait) => trait.label === filters.trait);
    return matchesSearch && matchesNatural && matchesSpecific && matchesTeam && matchesTrait;
  });
};

export const createBlankGlobalPlayer = () => ({
  id: null,
  name: '',
  photoUrl: '',
  dob: '',
  age: '',
  height: '',
  foot: '',
  primaryNaturalPosition: '',
  secondaryNaturalPositions: [],
  primarySpecificPosition: '',
  secondarySpecificPositions: [],
  scoutingSummary: '',
  cardAlert: false,
  sentOffAlert: false,
  suspendedAlert: false,
  injuredAlert: false,
  externalSource: '',
  externalPlayerId: '',
  fieldSources: {},
  sources: [],
  traits: [],
  memberships: [],
  membership: null,
  teamId: '',
  number: '',
  captain: false,
  isKey: false,
  observed: false,
});

export const normalizeGlobalPlayer = (row = {}, related = {}) => {
  const positions = safeArray(related.positions).filter((item) => item.player_id === row.id);
  const natural = positions.filter((item) => item.position_type === 'natural');
  const specific = positions.filter((item) => item.position_type === 'specific');
  const legacyModel = getPlayerPositionModel(row);
  const primaryNaturalPosition = natural.find((item) => item.is_primary)?.position_key || legacyModel.primaryNaturalPosition || '';
  const primarySpecificPosition = specific.find((item) => item.is_primary)?.position_key || legacyModel.primarySpecificPosition || '';
  const memberships = safeArray(related.memberships).filter((item) => item.player_id === row.id);
  const currentMemberships = memberships.filter((item) => item.is_current);
  const membership = currentMemberships[0] || null;
  return {
    ...createBlankGlobalPlayer(),
    id: row.id,
    globalPlayerId: row.id,
    name: row.name || '',
    photoUrl: row.photo_url || '',
    image: row.photo_url || '',
    dob: row.dob || '',
    age: row.age || '',
    height: row.height || '',
    foot: row.foot || '',
    scoutingSummary: row.scouting_summary || '',
    cardAlert: Boolean(row.card_alert),
    yellowRisk: Boolean(row.card_alert),
    sentOffAlert: Boolean(row.sent_off_alert),
    suspendedAlert: Boolean(row.suspended_alert),
    suspended: Boolean(row.suspended_alert),
    injuredAlert: Boolean(row.injured_alert),
    injured: Boolean(row.injured_alert),
    externalSource: row.external_source || '',
    externalPlayerId: row.external_player_id || '',
    fieldSources: {
      ...(row.field_sources || {}),
      ...(natural.find((item) => item.is_primary)?.source ? { position: { source: natural.find((item) => item.is_primary).source, updatedAt: natural.find((item) => item.is_primary).updated_at } } : {}),
      ...(specific.find((item) => item.is_primary)?.source ? { specificPosition: { source: specific.find((item) => item.is_primary).source, updatedAt: specific.find((item) => item.is_primary).updated_at } } : {}),
    },
    positionSource: specific.find((item) => item.is_primary)?.source || natural.find((item) => item.is_primary)?.source || '',
    primaryNaturalPosition,
    secondaryNaturalPositions: natural.filter((item) => !item.is_primary).map((item) => item.position_key),
    primarySpecificPosition,
    secondarySpecificPositions: specific.filter((item) => !item.is_primary).map((item) => item.position_key),
    position: getNaturalPositionLabel(primaryNaturalPosition),
    specificPosition: getSpecificPositionLabel(primarySpecificPosition),
    sources: safeArray(related.sources).filter((item) => item.player_id === row.id).map((item) => ({
      id: item.id, url: item.url, sourceName: item.source_name, isPrimary: Boolean(item.is_primary),
    })),
    traits: safeArray(related.traits).filter((item) => item.player_id === row.id).map((item) => ({
      id: item.id, category: item.category, label: item.label, positionFamily: item.position_family || '',
    })),
    memberships,
    currentMemberships,
    membership,
    membershipId: membership?.id || null,
    teamId: membership?.team_id || '',
    number: membership?.number || '',
    captain: Boolean(membership?.captain),
    isKey: Boolean(membership?.is_key),
    observed: Boolean(membership?.observed),
    role: membership?.squad_role || '',
    fieldRole: membership?.tactical_role || null,
    slotIndex: membership?.tactical_slot ?? null,
    reserveIndex: membership?.tactical_reserve_slot ?? null,
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  };
};

export const loadGlobalPlayerDatabase = async (client) => {
  const playersResponse = await client.from('players_database').select('*').order('name', { ascending: true });
  if (playersResponse.error) {
    const missingSchema = /players_database|relation .* does not exist|schema cache/i.test(playersResponse.error.message || '');
    if (missingSchema) return { available: false, players: [], error: playersResponse.error };
    throw playersResponse.error;
  }
  const [membershipsResponse, positionsResponse, sourcesResponse, traitsResponse] = await Promise.all([
    client.from('player_team_memberships').select('*').order('created_at', { ascending: false }),
    client.from('player_positions').select('*').order('is_primary', { ascending: false }),
    client.from('player_sources').select('*').order('is_primary', { ascending: false }),
    client.from('player_scouting_traits').select('*').order('created_at', { ascending: true }),
  ]);
  const failed = [membershipsResponse, positionsResponse, sourcesResponse, traitsResponse].find((response) => response.error);
  if (failed) throw failed.error;
  const related = {
    memberships: membershipsResponse.data || [], positions: positionsResponse.data || [],
    sources: sourcesResponse.data || [], traits: traitsResponse.data || [],
  };
  return {
    available: true,
    players: (playersResponse.data || []).map((row) => normalizeGlobalPlayer(row, related)),
    ...related,
  };
};

export const findGlobalPlayerMatches = (candidate = {}, players = []) => {
  const name = normalizeText(candidate.name);
  return players.map((player) => {
    if (candidate.externalSource && candidate.externalPlayerId
      && normalizeText(candidate.externalSource) === normalizeText(player.externalSource)
      && String(candidate.externalPlayerId) === String(player.externalPlayerId)) return { player, confidence: 'exact', reason: 'external_id' };
    const sourceUrls = new Set(safeArray(player.sources).map((item) => String(item.url || '').trim().toLowerCase()));
    if (candidate.sourceProfileUrl && sourceUrls.has(String(candidate.sourceProfileUrl).trim().toLowerCase())) return { player, confidence: 'exact', reason: 'profile_url' };
    if (name && normalizeText(player.name) === name && candidate.dob && player.dob === candidate.dob) return { player, confidence: 'exact', reason: 'name_dob' };
    if (name && normalizeText(player.name) === name) {
      const candidateModel = getPlayerPositionModel(candidate);
      const playerModel = getPlayerPositionModel(player);
      const samePosition = candidateModel.primaryNaturalPosition && candidateModel.primaryNaturalPosition === playerModel.primaryNaturalPosition;
      return { player, confidence: samePosition ? 'possible' : 'ambiguous', reason: samePosition ? 'name_position' : 'name_only' };
    }
    return null;
  }).filter(Boolean).sort((left, right) => (
    { exact: 0, possible: 1, ambiguous: 2 }[left.confidence]
    - { exact: 0, possible: 1, ambiguous: 2 }[right.confidence]
  ));
};

export const buildGlobalPlayerRpcPayload = (draft = {}) => {
  const model = getPlayerPositionModel(draft);
  const sources = safeArray(draft.sources).filter((item) => item.url);
  const hasExplicitPrimarySource = sources.some((item) => item.isPrimary);
  const positions = [
    ...(model.primaryNaturalPosition ? [{ position_type: 'natural', position_key: model.primaryNaturalPosition, is_primary: true, source: draft.positionSource || 'manual' }] : []),
    ...model.secondaryNaturalPositions.map((key) => ({ position_type: 'natural', position_key: key, is_primary: false, source: draft.positionSource || 'manual' })),
    ...(model.primarySpecificPosition ? [{ position_type: 'specific', position_key: model.primarySpecificPosition, is_primary: true, source: draft.positionSource || 'manual' }] : []),
    ...model.secondarySpecificPositions.map((key) => ({ position_type: 'specific', position_key: key, is_primary: false, source: draft.positionSource || 'manual' })),
  ];
  return {
    p_player: {
      id: isUuid(draft.globalPlayerId || draft.id) ? (draft.globalPlayerId || draft.id) : null,
      name: String(draft.name || '').trim(), photoUrl: draft.photoUrl || draft.image || '', dob: draft.dob || '', age: draft.age || '',
      height: draft.height || '', foot: draft.foot || '', scoutingSummary: String(draft.scoutingSummary || draft.notes || '').slice(0, 500),
      cardAlert: Boolean(draft.cardAlert || draft.yellowRisk), sentOffAlert: Boolean(draft.sentOffAlert),
      suspendedAlert: Boolean(draft.suspendedAlert || draft.suspended), injuredAlert: Boolean(draft.injuredAlert || draft.injured),
      externalSource: draft.externalSource || '', externalPlayerId: draft.externalPlayerId || '', fieldSources: draft.fieldSources || {},
    },
    p_positions: positions,
    p_sources: sources.map((item, index) => ({
      url: item.url,
      source_name: item.sourceName || 'Otro',
      is_primary: hasExplicitPrimarySource ? Boolean(item.isPrimary) : index === 0,
    })),
    p_traits: safeArray(draft.traits).filter((item) => item.label).map((item) => ({
      category: item.category, label: item.label, position_family: item.positionFamily || model.primarySpecificPosition || model.primaryNaturalPosition,
    })),
    p_membership: draft.teamId ? {
      id: draft.membershipId || null, teamId: draft.teamId, season: draft.season || '', startDate: draft.startDate || '',
      mode: draft.membershipMode || 'replace',
      number: draft.number || '', captain: Boolean(draft.captain), isKey: Boolean(draft.isKey), observed: Boolean(draft.observed),
      sourceUrl: draft.sources?.find((item) => item.isPrimary)?.url || '',
    } : null,
  };
};

export const saveGlobalPlayerProfile = async (client, draft) => {
  const payload = buildGlobalPlayerRpcPayload(draft);
  const { data, error } = await client.rpc('save_global_player_profile', payload);
  if (error) throw error;
  return data;
};

export const assignGlobalPlayerToTeam = async (client, { playerId, teamId, mode = 'replace', season = '', startDate = null }) => {
  const { data, error } = await client.rpc('assign_global_player_to_team', {
    p_player_id: playerId, p_team_id: teamId, p_mode: mode, p_season: season || null, p_start_date: startDate || new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;
  return data;
};

export const ensureGlobalPlayerTeamMembership = async (client, { playerId, teamId, mode = 'replace', season = '', startDate = null }) => {
  if (!playerId || !teamId) throw new Error('Faltan el jugador o el equipo para crear la relación activa.');
  const { data: existing, error: findError } = await client
    .from('player_team_memberships')
    .select('id')
    .eq('player_id', playerId)
    .eq('team_id', teamId)
    .eq('is_current', true)
    .maybeSingle();
  if (findError) throw findError;
  if (existing?.id) return existing.id;
  const membershipId = await assignGlobalPlayerToTeam(client, { playerId, teamId, mode, season, startDate });
  if (!membershipId) throw new Error('El jugador se guardó, pero Supabase no confirmó su relación activa con el equipo.');
  return membershipId;
};

export const globalPlayerFromImportedPlayer = (player = {}) => ({
  ...createBlankGlobalPlayer(),
  ...player,
  ...mapExternalPositionToPlayerPositions(player.rawPositions || player.rawPosition || player.specificPosition || player.position),
  photoUrl: player.image || '',
  sources: player.sourceProfileUrl ? [{ url: player.sourceProfileUrl, sourceName: player.externalSource === 'transfermarkt' ? 'Transfermarkt' : player.externalSource || 'Otro', isPrimary: true }] : [],
  positionSource: player.externalSource || 'imported',
});
