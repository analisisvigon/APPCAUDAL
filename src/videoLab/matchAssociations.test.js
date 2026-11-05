import assert from 'node:assert/strict';
import { associateLocalAnalysis, canSeeLocalAnalysis,
  isAnalysisForMatch, preparePreMatches } from './matchAssociations.js';

const context = { id: 'cts-1', clubId: 'club-1', teamId: 'team-1', seasonId: 'season-1',
  seasonStatus: 'open', role: 'owner' };
const matches = preparePreMatches([
  { id: 'pre-1', club_team_season_id: 'cts-1', opponent: 'Rival A', date: '2026-11-12', status: 'Previa' },
  { id: 'pre-1', club_team_season_id: 'cts-1', opponent: 'Duplicado' },
  { id: 'other', club_team_season_id: 'cts-2', opponent: 'Otro equipo' },
  { id: 'historical', club_team_season_id: 'cts-1', opponent: 'Rival B', status: 'Finalizado' },
], context);
assert.deepEqual(matches.map((match) => match.id), ['historical', 'pre-1']);
assert.equal(matches[1].ctsId, context.id);

const legacyA = { id: 'analysis-a', ownerUserId: null, matchPreId: null, clips: [{ id: 'clip-a' }] };
const legacyB = { id: 'analysis-b', ownerUserId: null, matchPreId: null, clips: [{ id: 'clip-b' }] };
assert.equal(canSeeLocalAnalysis(legacyA, { userId: 'owner-1', ownerRole: 'owner', context }), true);
assert.equal(canSeeLocalAnalysis(legacyA, { userId: 'staff-1', ownerRole: 'staff', context }), false);

const linkedA = associateLocalAnalysis(legacyA, matches[1], context, 'owner-1');
const linkedB = associateLocalAnalysis(legacyB, matches[1], context, 'owner-1');
assert.equal(linkedA.matchPreId, 'pre-1');
assert.equal(linkedB.matchPreId, 'pre-1');
assert.equal(linkedA.clips[0].id, 'clip-a');
assert.equal(linkedB.clips[0].id, 'clip-b');
assert.equal(isAnalysisForMatch(linkedA, 'pre-1', context), true);
assert.equal(isAnalysisForMatch(linkedA, 'historical', context), false);
assert.equal(canSeeLocalAnalysis(linkedA, { userId: 'owner-1', ownerRole: 'owner', context }), true);
assert.equal(canSeeLocalAnalysis(linkedA, { userId: 'other-user', ownerRole: 'owner', context }), false);
assert.equal(canSeeLocalAnalysis(linkedA, { userId: 'owner-1', ownerRole: 'owner',
  context: { ...context, id: 'cts-2' } }), false);
assert.equal(associateLocalAnalysis(linkedA, matches[0], context, 'owner-1'), null);
assert.equal(associateLocalAnalysis(legacyA, matches[1], { ...context, seasonStatus: 'closed' }, 'owner-1'), null);
assert.equal(associateLocalAnalysis(legacyA, matches[1], { ...context, teamId: '' }, 'owner-1'), null);
assert.equal(legacyA.matchPreId, null);
console.log('Video lab match associations: OK');
