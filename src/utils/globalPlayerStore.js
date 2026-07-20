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

const getNumericAge = (player = {}) => {
  if (player.dob) {
    const birthDate = new Date(`${player.dob}T00:00:00`);
    if (!Number.isNaN(birthDate.getTime())) {
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const birthdayPending = today.getMonth() < birthDate.getMonth()
        || (today.getMonth() === birthDate.getMonth() && today.getDate() < birthDate.getDate());
      if (birthdayPending) age -= 1;
      return age;
    }
  }
  const parsed = Number.parseInt(String(player.age || '').replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const getHeightCentimeters = (value) => {
  const normalized = String(value || '').trim().replace(',', '.');
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(parsed)) return null;
  return parsed < 3 ? Math.round(parsed * 100) : Math.round(parsed);
};

export const calculateGlobalPlayerProfileCompletion = (player = {}) => {
  const model = getPlayerPositionModel(player);
  const memberships = safeArray(player.memberships);
  const checks = [
    ['photo', Boolean(player.photoUrl || player.image)],
    ['age', getNumericAge(player) !== null],
    ['height', getHeightCentimeters(player.height) !== null],
    ['foot', Boolean(String(player.foot || '').trim())],
    ['naturalPosition', Boolean(model.primaryNaturalPosition)],
    ['specificPosition', Boolean(model.primarySpecificPosition || model.secondarySpecificPositions.length)],
    ['traits', safeArray(player.traits).length > 0],
    ['team', memberships.some((membership) => membership.is_current)],
    ['source', Boolean(player.externalPlayerId || player.sourceProfileUrl || safeArray(player.sources).length)],
    ['scoutingSummary', Boolean(String(player.scoutingSummary || player.notes || '').trim())],
  ];
  const completed = checks.filter(([, present]) => present).length;
  const percentage = Math.round((completed / checks.length) * 100);
  return {
    percentage,
    completed,
    total: checks.length,
    missing: checks.filter(([, present]) => !present).map(([key]) => key),
    label: percentage === 100 ? 'Completo' : percentage >= 70 ? 'Casi completo' : 'Faltan datos',
  };
};

const levenshteinDistance = (left, right) => {
  if (!left) return right.length;
  if (!right) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
};

const getNameSimilarity = (left, right) => {
  const normalizedLeft = normalizeText(left).replace(/\s+/g, '');
  const normalizedRight = normalizeText(right).replace(/\s+/g, '');
  const longest = Math.max(normalizedLeft.length, normalizedRight.length);
  if (!longest) return 0;
  return 1 - (levenshteinDistance(normalizedLeft, normalizedRight) / longest);
};

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
  const teamById = new Map(safeArray(filters.teams).map((team) => [String(team.id), team]));
  return safeArray(players).filter((player) => {
    const model = getPlayerPositionModel(player);
    const naturalPositions = [model.primaryNaturalPosition, ...model.secondaryNaturalPositions].filter(Boolean);
    const specificPositions = [model.primarySpecificPosition, ...model.secondarySpecificPositions].filter(Boolean);
    const memberships = safeArray(player.memberships);
    const currentMemberships = memberships.filter((membership) => membership.is_current);
    const currentTeamIds = currentMemberships.map((membership) => String(membership.team_id));
    const membershipTeamNames = memberships.map((membership) => teamById.get(String(membership.team_id))?.name || '');
    const searchText = normalizeText([
      player.name,
      ...naturalPositions.map(getNaturalPositionLabel),
      ...specificPositions.map(getSpecificPositionLabel),
      ...membershipTeamNames,
      ...safeArray(player.traits).map((trait) => trait.label),
      player.scoutingSummary,
      player.notes,
    ].join(' '));
    const matchesSearch = !normalizedSearch || searchText.includes(normalizedSearch);
    const matchesNatural = !filters.naturalPosition || naturalPositions.includes(filters.naturalPosition);
    const matchesSpecific = !filters.specificPosition || specificPositions.includes(filters.specificPosition);
    const matchesTeam = !filters.teamId
      || (filters.teamId === '__without_team__' ? currentTeamIds.length === 0 : currentTeamIds.includes(String(filters.teamId)));
    const matchesTrait = !filters.trait || safeArray(player.traits).some((trait) => trait.label === filters.trait);
    const age = getNumericAge(player);
    const matchesAge = (!filters.ageMin || (age !== null && age >= Number(filters.ageMin)))
      && (!filters.ageMax || (age !== null && age <= Number(filters.ageMax)));
    const height = getHeightCentimeters(player.height);
    const matchesHeight = (!filters.heightMin || (height !== null && height >= Number(filters.heightMin)))
      && (!filters.heightMax || (height !== null && height <= Number(filters.heightMax)));
    const matchesFoot = !filters.foot || normalizeText(player.foot).includes(normalizeText(filters.foot));
    const currentMembership = currentMemberships[0] || player.membership || {};
    const matchesObserved = !filters.observed || Boolean(player.observed || currentMembership.observed);
    const matchesKey = !filters.isKey || Boolean(player.isKey || currentMembership.is_key);
    const matchesCaptain = !filters.captain || Boolean(player.captain || currentMembership.captain);
    const matchesInjured = !filters.injured || Boolean(player.injured || player.injuredAlert);
    const matchesSuspended = !filters.suspended || Boolean(player.suspended || player.suspendedAlert || player.sentOffAlert);
    const matchesHistory = !filters.hasHistory || memberships.some((membership) => !membership.is_current);
    const matchesPhoto = !filters.missingPhoto || !Boolean(player.photoUrl || player.image);
    const completion = calculateGlobalPlayerProfileCompletion(player);
    const matchesCompletion = !filters.incomplete || completion.percentage < 100;
    return matchesSearch && matchesNatural && matchesSpecific && matchesTeam && matchesTrait
      && matchesAge && matchesHeight && matchesFoot && matchesObserved && matchesKey && matchesCaptain
      && matchesInjured && matchesSuspended && matchesHistory && matchesPhoto && matchesCompletion;
  });
};

export const searchGlobalPlayersForTeam = (players = [], teams = [], query = '') => {
  const normalizedQuery = normalizeText(query);
  const teamById = new Map(safeArray(teams).map((team) => [String(team.id), team.name]));
  return safeArray(players).filter((player) => {
    if (!normalizedQuery) return true;
    const model = getPlayerPositionModel(player);
    const membershipTeams = safeArray(player.memberships).map((membership) => teamById.get(String(membership.team_id)) || '');
    const searchable = normalizeText([
      player.name,
      getNaturalPositionLabel(model.primaryNaturalPosition),
      ...model.secondaryNaturalPositions.map(getNaturalPositionLabel),
      getSpecificPositionLabel(model.primarySpecificPosition),
      ...model.secondarySpecificPositions.map(getSpecificPositionLabel),
      ...membershipTeams,
    ].join(' '));
    return searchable.includes(normalizedQuery);
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
  scoutingPriority: '',
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
    scoutingPriority: row.scouting_priority || '',
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
      id: item.id,
      url: item.url,
      sourceName: item.source_name,
      isPrimary: Boolean(item.is_primary),
      analysisStatus: item.analysis_status || 'not_analyzed',
      analyzedAt: item.analyzed_at || '',
      analysisError: item.analysis_error || '',
      analysisSummary: item.analysis_summary || {},
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
  const candidateUrls = getPlayerSourceUrls(candidate);
  return players.map((player) => {
    const sourceUrls = getPlayerSourceUrls(player);
    if ([...candidateUrls].some((url) => sourceUrls.has(url))) return { player, confidence: 'exact', reason: 'profile_url', priority: 0 };
    if (candidate.externalSource && candidate.externalPlayerId
      && normalizeText(candidate.externalSource) === normalizeText(player.externalSource)
      && String(candidate.externalPlayerId) === String(player.externalPlayerId)) return { player, confidence: 'exact', reason: 'external_id', priority: 1 };
    if (name && normalizeText(player.name) === name && candidate.dob && player.dob === candidate.dob) return { player, confidence: 'exact', reason: 'name_dob', priority: 2 };
    if (name && normalizeText(player.name) === name) {
      const candidateModel = getPlayerPositionModel(candidate);
      const playerModel = getPlayerPositionModel(player);
      const sameAgeAndSpecific = candidate.age && player.age
        && String(candidate.age) === String(player.age)
        && candidateModel.primarySpecificPosition
        && candidateModel.primarySpecificPosition === playerModel.primarySpecificPosition;
      if (sameAgeAndSpecific) return { player, confidence: 'possible', reason: 'name_age_specific', priority: 3 };
      const samePosition = candidateModel.primaryNaturalPosition && candidateModel.primaryNaturalPosition === playerModel.primaryNaturalPosition;
      return { player, confidence: samePosition ? 'possible' : 'ambiguous', reason: samePosition ? 'name_position' : 'name_only', priority: samePosition ? 4 : 5 };
    }
    if (name && getNameSimilarity(candidate.name, player.name) >= 0.86) return { player, confidence: 'ambiguous', reason: 'similar_name', priority: 6 };
    return null;
  }).filter(Boolean).sort((left, right) => (
    { exact: 0, possible: 1, ambiguous: 2 }[left.confidence]
    - { exact: 0, possible: 1, ambiguous: 2 }[right.confidence]
    || (left.priority ?? 9) - (right.priority ?? 9)
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
      scoutingPriority: draft.scoutingPriority || '',
      cardAlert: Boolean(draft.cardAlert || draft.yellowRisk), sentOffAlert: Boolean(draft.sentOffAlert),
      suspendedAlert: Boolean(draft.suspendedAlert || draft.suspended), injuredAlert: Boolean(draft.injuredAlert || draft.injured),
      externalSource: draft.externalSource || '', externalPlayerId: draft.externalPlayerId || '', fieldSources: draft.fieldSources || {},
    },
    p_positions: positions,
    p_sources: sources.map((item, index) => ({
      url: item.url,
      source_name: item.sourceName || 'Otro',
      is_primary: hasExplicitPrimarySource ? Boolean(item.isPrimary) : index === 0,
      analysis_status: item.analysisStatus || 'not_analyzed',
      analyzed_at: item.analyzedAt || null,
      analysis_error: item.analysisError || '',
      analysis_summary: item.analysisSummary || {},
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

export const removeGlobalPlayerFromCurrentTeam = async (client, { playerId, endDate = null }) => {
  if (!playerId) throw new Error('Falta el jugador que se quiere dejar sin equipo.');
  const { data, error } = await client.rpc('remove_global_player_from_current_team', {
    p_player_id: playerId,
    p_end_date: endDate || new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;
  return Number(data || 0);
};

export const mergeGlobalPlayerProfiles = async (client, { keepPlayerId, mergePlayerId }) => {
  if (!keepPlayerId || !mergePlayerId || keepPlayerId === mergePlayerId) throw new Error('Selecciona dos perfiles globales diferentes para fusionarlos.');
  const { data, error } = await client.rpc('merge_global_player_profiles', {
    p_keep_player_id: keepPlayerId,
    p_merge_player_id: mergePlayerId,
  });
  if (error) throw error;
  return data;
};

export const globalPlayerFromImportedPlayer = (player = {}) => ({
  ...createBlankGlobalPlayer(),
  ...player,
  ...mapExternalPositionToPlayerPositions(player.rawPositions || player.rawPosition || player.specificPosition || player.position),
  photoUrl: player.image || '',
  sources: player.sourceProfileUrl ? [{ url: player.sourceProfileUrl, sourceName: player.externalSource === 'transfermarkt' ? 'Transfermarkt' : player.externalSource || 'Otro', isPrimary: true }] : [],
  positionSource: player.externalSource || 'imported',
});
