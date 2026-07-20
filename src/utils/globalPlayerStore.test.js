import assert from 'node:assert/strict';
import {
  assignGlobalPlayerToTeam,
  buildGlobalPlayerCoverage,
  buildGlobalPlayerRpcPayload,
  calculateGlobalPlayerProfileCompletion,
  ensureGlobalPlayerTeamMembership,
  filterGlobalPlayers,
  findGlobalPlayerMatches,
  globalPlayerFromImportedPlayer,
  mergeGlobalPlayerProfiles,
  removeGlobalPlayerFromCurrentTeam,
  searchGlobalPlayersForTeam,
} from './globalPlayerStore.js';

const imported = globalPlayerFromImportedPlayer({
  name: 'Aitor Ferrero', rawPositions: ['Defensa central', 'Pivote'], externalSource: 'transfermarkt', externalPlayerId: '123', sourceProfileUrl: 'https://tm.test/123',
});
const payload = buildGlobalPlayerRpcPayload({ ...imported, teamId: 'team-id' });
assert.equal(payload.p_positions.find((item) => item.position_type === 'natural' && item.is_primary).position_key, 'defender');
assert.equal(payload.p_positions.some((item) => item.position_key === 'holding_midfield' && !item.is_primary), true);
assert.equal(payload.p_sources.length, 1);

const sourcePayload = buildGlobalPlayerRpcPayload({
  name: 'Jugador con fuentes',
  sources: [
    { url: 'https://generic.test/player', sourceName: 'Otro' },
    { url: 'https://transfermarkt.test/player', sourceName: 'Transfermarkt', isPrimary: true },
  ],
});
assert.deepEqual(sourcePayload.p_sources.map((item) => item.is_primary), [false, true]);

const existing = [{ id: 'global-1', name: 'Aitor Ferrero', dob: '1997-01-02', externalSource: 'transfermarkt', externalPlayerId: '123', sources: [] }];
assert.equal(findGlobalPlayerMatches(imported, existing)[0].confidence, 'exact');
assert.equal(findGlobalPlayerMatches({ name: 'Aitor Ferrero', dob: '1997-01-02' }, existing)[0].reason, 'name_dob');
assert.equal(findGlobalPlayerMatches({ name: 'Sin nombre fiable', sources: [{ url: 'https://tm.test/123' }] }, [{ ...existing[0], sources: [{ url: 'https://tm.test/123' }] }])[0].reason, 'profile_url');
assert.equal(findGlobalPlayerMatches({ name: 'Aitor Ferrero', age: '29', specificPosition: 'Defensa central' }, [{ ...existing[0], age: '29', specificPosition: 'Defensa central' }])[0].reason, 'name_age_specific');
assert.equal(findGlobalPlayerMatches({ name: 'Aitor Ferero' }, existing)[0].reason, 'similar_name');

const teamOne = { id: 'team-1', name: 'C.D. Lealtad' };
const teamTwo = { id: 'team-2', name: "L'Entregu CF" };
const globalDefender = {
  id: 'global-defender', globalPlayerId: 'global-defender', name: 'Álex Central', dob: '1996-04-10',
  externalSource: 'transfermarkt', externalPlayerId: '100',
  primaryNaturalPosition: 'defender', secondaryNaturalPositions: ['midfielder'],
  primarySpecificPosition: 'centre_back', secondarySpecificPositions: ['holding_midfield'],
  memberships: [{ id: 'membership-1', team_id: teamOne.id, is_current: true }], sources: [], traits: [],
};
const globalWithoutTeam = {
  id: 'global-free', globalPlayerId: 'global-free', name: 'Jugador Libre',
  primaryNaturalPosition: 'forward', secondaryNaturalPositions: [], primarySpecificPosition: 'centre_forward', secondarySpecificPositions: [],
  memberships: [], sources: [], traits: [],
};
const coverage = buildGlobalPlayerCoverage({
  globalPlayers: [globalDefender, globalWithoutTeam],
  legacyPlayers: [
    {
      id: 'legacy-linked', jugadorRivalId: 'legacy-linked', teamId: teamTwo.id, name: 'Álex Central', dob: '1996-04-10',
      externalSource: 'transfermarkt', externalPlayerId: '100', position: 'Defensa', specificPosition: 'Defensa central', activeInSquad: true,
    },
    {
      id: 'legacy-back', jugadorRivalId: 'legacy-back', teamId: teamTwo.id, name: 'Lateral Legacy',
      position: 'Defensa', specificPosition: 'Lateral derecho', activeInSquad: true,
    },
  ],
  teams: [teamOne, teamTwo],
});
assert.equal(coverage.players.length, 3, 'legacy exact matches must not duplicate the global profile');
assert.equal(coverage.missingMemberships.length, 1);
assert.equal(coverage.orphanLegacyPlayers.length, 1);
assert.equal(coverage.playersByTeam[teamOne.id].total, 1);
assert.equal(coverage.playersByTeam[teamTwo.id].total, 2);
assert.equal(coverage.playersByTeam[teamTwo.id].linkedPlayers, 0);
assert.equal(coverage.playersByTeam[teamTwo.id].legacyPending, 2);
assert.equal(filterGlobalPlayers(coverage.players, { teamId: teamOne.id }).length, 1);
assert.equal(filterGlobalPlayers(coverage.players, { teamId: teamTwo.id }).length, 2);
assert.equal(filterGlobalPlayers(coverage.players, { naturalPosition: 'defender' }).length, 2);
assert.equal(filterGlobalPlayers(coverage.players, { naturalPosition: 'midfielder' }).map((player) => player.name).includes('Álex Central'), true);
assert.equal(filterGlobalPlayers(coverage.players, { specificPosition: 'right_back' })[0].name, 'Lateral Legacy');
assert.equal(filterGlobalPlayers(coverage.players, { naturalPosition: 'defender', specificPosition: 'centre_back' })[0].name, 'Álex Central');
assert.equal(filterGlobalPlayers(coverage.players, { specificPosition: 'holding_midfield' })[0].name, 'Álex Central');
assert.equal(filterGlobalPlayers(coverage.players, { teamId: '__without_team__' })[0].name, 'Jugador Libre');
assert.equal(filterGlobalPlayers(coverage.players, { search: 'alex', teamId: teamTwo.id, naturalPosition: 'defender', specificPosition: 'centre_back' }).length, 1);
assert.equal(filterGlobalPlayers(coverage.players, { search: 'lealtad', teams: [teamOne, teamTwo] })[0].name, 'Álex Central');
assert.equal(filterGlobalPlayers([{ ...globalDefender, foot: 'Derecho', height: '1,86 m', observed: true }], { foot: 'derech', heightMin: 180, heightMax: 190, observed: true }).length, 1);
assert.equal(filterGlobalPlayers([{ ...globalDefender, injuredAlert: true }], { injured: true }).length, 1);
assert.equal(filterGlobalPlayers([{ ...globalDefender, memberships: [{ ...globalDefender.memberships[0], is_current: false }] }], { hasHistory: true }).length, 1);
assert.equal(filterGlobalPlayers([globalDefender], { missingPhoto: true, incomplete: true }).length, 1);
const completeProfile = calculateGlobalPlayerProfileCompletion({
  ...globalDefender,
  photoUrl: 'https://example.test/player.jpg',
  height: '186 cm',
  foot: 'Derecho',
  traits: [{ category: 'strength', label: 'Juego aéreo' }],
  scoutingSummary: 'Central dominante.',
  sources: [{ url: 'https://example.test/player' }],
});
assert.equal(completeProfile.percentage, 100);
assert.equal(completeProfile.label, 'Completo');
assert.equal(searchGlobalPlayersForTeam(coverage.players, [teamOne, teamTwo], 'lealtad')[0].name, 'Álex Central');
assert.equal(searchGlobalPlayersForTeam(coverage.players, [teamOne, teamTwo], 'lateral derecho')[0].name, 'Lateral Legacy');

let membershipRpcCalls = 0;
const membershipClient = {
  from: () => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      }),
    }),
  }),
  rpc: async (name, args) => {
    membershipRpcCalls += 1;
    assert.equal(name, 'assign_global_player_to_team');
    assert.equal(args.p_player_id, 'global-defender');
    assert.equal(args.p_team_id, teamTwo.id);
    return { data: 'membership-created', error: null };
  },
};
assert.equal(await ensureGlobalPlayerTeamMembership(membershipClient, { playerId: 'global-defender', teamId: teamTwo.id }), 'membership-created');
assert.equal(membershipRpcCalls, 1);

const moveCalls = [];
const moveClient = {
  rpc: async (name, args) => {
    moveCalls.push({ name, args });
    return { data: 'new-stage-id', error: null };
  },
};
assert.equal(await assignGlobalPlayerToTeam(moveClient, {
  playerId: 'same-player-id', teamId: teamTwo.id, mode: 'replace', startDate: '2026-07-20',
}), 'new-stage-id');
assert.deepEqual(moveCalls[0], {
  name: 'assign_global_player_to_team',
  args: {
    p_player_id: 'same-player-id', p_team_id: teamTwo.id, p_mode: 'replace', p_season: null, p_start_date: '2026-07-20',
  },
});

const removalCalls = [];
const removalClient = {
  rpc: async (name, args) => {
    removalCalls.push({ name, args });
    return { data: 1, error: null };
  },
};
assert.equal(await removeGlobalPlayerFromCurrentTeam(removalClient, { playerId: 'global-defender', endDate: '2026-07-20' }), 1);
assert.deepEqual(removalCalls[0], {
  name: 'remove_global_player_from_current_team',
  args: { p_player_id: 'global-defender', p_end_date: '2026-07-20' },
});

const mergeCalls = [];
const mergeClient = {
  rpc: async (name, args) => {
    mergeCalls.push({ name, args });
    return { data: 'player-kept', error: null };
  },
};
assert.equal(await mergeGlobalPlayerProfiles(mergeClient, { keepPlayerId: 'player-kept', mergePlayerId: 'player-merged' }), 'player-kept');
assert.deepEqual(mergeCalls[0], {
  name: 'merge_global_player_profiles',
  args: { p_keep_player_id: 'player-kept', p_merge_player_id: 'player-merged' },
});

console.log('globalPlayerStore tests passed');
