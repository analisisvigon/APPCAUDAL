import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { buildPlayerProfilePrintReport } from '../src/utils/playerProfilePrintReport.js';
import { createPlayerProfilePdf } from '../src/utils/playerProfilePdfExport.js';
import {
  buildPlayerBodyPartSummary,
  buildPlayerConnectionRows,
  buildPlayerGoalTargetSummary,
  buildPlayerGoalTypeSummary,
  buildPlayerProductionInvariantReport,
} from '../src/utils/playerProductionDetails.js';
import { resolveSportsSeasonFromMatches } from '../src/utils/sportsSeason.js';
import { buildPlayerPositionUsage } from '../src/utils/playerPositionUsage.js';
import { buildTacticalMatchHistory, getHistoricalSubstitutionMinutes } from '../src/utils/tacticalSnapshots.js';
import { OWN_CLUB_IDENTITY, getOwnClubDisplayName } from '../src/constants/clubIdentity.js';

const clean = (value) => String(value ?? '').trim();
const rows = (value) => Array.isArray(value) ? value : [];
const filenameSlug = (value) => clean(value).toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const outputDirectory = path.resolve(process.env.PLAYER_PDF_QA_OUTPUT || 'artifacts/player-pdf-final-qa');
const playerId = clean(process.env.PLAYER_PDF_QA_PLAYER_ID) || 'f7f5aaeb-e82b-4e6b-8920-694bc32cb6c7';
const competitionKey = 'copa_rfef';
const competitionLabel = 'Copa RFEF';
const fieldZones = [
  ['finalizacion_izquierda', 'F. Finalización izquierda'], ['finalizacion_centro', 'F. Finalización centro'], ['finalizacion_derecha', 'F. Finalización derecha'],
  ['creacion_izquierda', 'F. Creación izquierda'], ['creacion_centro', 'F. Creación centro'], ['creacion_derecha', 'F. Creación derecha'],
  ['inicio_izquierda', 'F. Inicio izquierda'], ['inicio_centro', 'F. Inicio centro'], ['inicio_derecha', 'F. Inicio derecha'],
].map(([value, label]) => ({ value, label, shortLabel: label.replace('F. ', '').replace(' ', '\n') }));
const targetZones = [
  ['alta_izquierda', 'Alta izquierda'], ['alta_centro', 'Alta centro'], ['alta_derecha', 'Alta derecha'],
  ['media_izquierda', 'Media izquierda'], ['media_centro', 'Media centro'], ['media_derecha', 'Media derecha'],
  ['baja_izquierda', 'Baja izquierda'], ['baja_centro', 'Baja centro'], ['baja_derecha', 'Baja derecha'],
].map(([value, label]) => ({ value, label, shortLabel: label.replace(' ', '\n') }));

const client = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
const [playerResponse, statsResponse, goalsResponse, ownTeamResponse] = await Promise.all([
  client.from('jugadores').select('*').eq('id', playerId).single(),
  client.from('partido_estadisticas_jugador').select('*').eq('jugador_id', playerId),
  client.from('partido_eventos_gol').select('*').or(`scorer_id.eq.${playerId},assistant_id.eq.${playerId}`),
  client.from('equipos_rivales').select('*').eq('team_kind', 'own').maybeSingle(),
]);
for (const response of [playerResponse, statsResponse, goalsResponse, ownTeamResponse]) {
  if (response.error) throw response.error;
}

const stats = statsResponse.data || [];
const matchIds = [...new Set(stats.map((row) => row.partido_id).filter(Boolean))];
const matchResponse = await client.from('partidos').select('*').in('id', matchIds).order('date');
if (matchResponse.error) throw matchResponse.error;
const matches = (matchResponse.data || []).filter((match) => match.competition_key === competitionKey);
const matchesById = Object.fromEntries(matches.map((match) => [match.id, match]));
const scopedStats = stats.filter((row) => matchesById[row.partido_id]);
const scopedGoals = (goalsResponse.data || []).filter((goal) => matchesById[goal.partido_id]);
const player = playerResponse.data;
const [lineupResponse, allMatchStatsResponse, systemEventsResponse, snapshotsResponse] = matches.length
  ? await Promise.all([
    client.from('partido_alineacion_slots').select('*').in('partido_id', matches.map((match) => match.id)).eq('scope', 'stats').order('slot'),
    client.from('partido_estadisticas_jugador').select('*').in('partido_id', matches.map((match) => match.id)),
    client.from('partido_eventos_sistema').select('*').in('partido_id', matches.map((match) => match.id)).order('minute'),
    client.from('partido_snapshots_tacticos').select('*').in('partido_id', matches.map((match) => match.id)).order('minute'),
  ])
  : Array.from({ length: 4 }, () => ({ data: [], error: null }));
for (const response of [lineupResponse, allMatchStatsResponse, systemEventsResponse, snapshotsResponse]) {
  if (response.error) throw response.error;
}
const snapshotSlotsResponse = rows(snapshotsResponse.data).length
  ? await client.from('partido_snapshot_tactico_slots').select('*').in('snapshot_id', rows(snapshotsResponse.data).map((snapshot) => snapshot.id)).order('slot')
  : { data: [], error: null };
if (snapshotSlotsResponse.error) throw snapshotSlotsResponse.error;
const lineupByMatch = (lineupResponse.data || []).reduce((acc, row) => {
  acc[row.partido_id] = [...(acc[row.partido_id] || []), {
    slot: Number(row.slot), playerId: row.jugador_id || '', playerName: row.player_name || '',
  }];
  return acc;
}, {});
const statsByMatch = rows(allMatchStatsResponse.data).reduce((acc, row) => {
  acc[row.partido_id] ||= {};
  acc[row.partido_id][row.player_name] = {
    role: row.role || 'Suplente',
    minutes: row.minutes ?? '',
    replacementName: row.replacement_name || '',
    jugadorId: row.jugador_id || '',
  };
  return acc;
}, {});
const systemEventsByMatch = rows(systemEventsResponse.data).reduce((acc, event) => {
  acc[event.partido_id] = [...(acc[event.partido_id] || []), event];
  return acc;
}, {});
const slotsBySnapshot = rows(snapshotSlotsResponse.data).reduce((acc, slot) => {
  acc[slot.snapshot_id] = [...(acc[slot.snapshot_id] || []), slot];
  return acc;
}, {});
const snapshotsByMatch = rows(snapshotsResponse.data).reduce((acc, snapshot) => {
  acc[snapshot.partido_id] = [...(acc[snapshot.partido_id] || []), { ...snapshot, slots: slotsBySnapshot[snapshot.id] || [] }];
  return acc;
}, {});

const goalActions = scopedGoals.filter((goal) => goal.scorer_id === playerId).map((goal) => ({
  id: goal.id,
  action: 'Gol',
  type: 'Gol',
  matchId: goal.partido_id,
  minute: goal.minute,
  scorer: goal.scorer,
  assistant: goal.assistant,
  phase: goal.phase,
  subphase: goal.subphase,
  shotZone: goal.shot_zone,
  shotZoneLabel: fieldZones.find((zone) => zone.value === goal.shot_zone)?.label || '',
  assistZone: goal.assist_zone,
  assistZoneLabel: fieldZones.find((zone) => zone.value === goal.assist_zone)?.label || '',
  goalZone: goal.goal_zone,
  goalZoneLabel: targetZones.find((zone) => zone.value === goal.goal_zone)?.label || '',
  contact: goal.contact,
  videoUrl: goal.video_url,
  url: goal.video_url,
}));
const assistActions = scopedGoals.filter((goal) => goal.assistant_id === playerId).map((goal) => ({
  id: goal.id, action: 'Asistencia', type: 'Asistencia', matchId: goal.partido_id, minute: goal.minute,
  scorer: goal.scorer, assistant: goal.assistant, phase: goal.phase, subphase: goal.subphase,
  assistZone: goal.assist_zone, assistZoneLabel: fieldZones.find((zone) => zone.value === goal.assist_zone)?.label || '',
  videoUrl: goal.video_url, url: goal.video_url,
}));

const enrich = (action) => {
  const match = matchesById[action.matchId];
  const caudalGoals = Number(match.goals_for ?? (match.is_home ? match.home_score : match.away_score));
  const rivalGoals = Number(match.goals_against ?? (match.is_home ? match.away_score : match.home_score));
  return {
    ...action,
    opponent: match.opponent,
    opponentCrest: match.opponent_crest || '',
    competition: competitionLabel,
    date: new Date(`${match.date}T12:00:00`).toLocaleDateString('es-ES'),
    result: `${caudalGoals}-${rivalGoals}`,
  };
};
const actions = [...goalActions, ...assistActions].map(enrich);
const goals = actions.filter((action) => action.type === 'Gol');
const assists = actions.filter((action) => action.type === 'Asistencia');
const bodyParts = buildPlayerBodyPartSummary(goals);
const types = buildPlayerGoalTypeSummary(goals);
const targetSummary = buildPlayerGoalTargetSummary(goals);
const target = { ...targetSummary, zones: targetZones.map((zone) => ({ ...zone, count: goals.filter((goal) => goal.goalZone === zone.value).length })) };
const society = buildPlayerConnectionRows({ goalActions: goals, assistActions: assists, filter: 'Todos' });
const invariant = buildPlayerProductionInvariantReport({ goals, assists, bodyParts, goalTypes: types, goalTarget: target, connections: society });
if (!invariant.valid) throw new Error(`Invariante de producción inválido: ${JSON.stringify(invariant.checks)}`);

const playedRows = scopedStats.map((row) => ({ row, match: matchesById[row.partido_id] }));
const played = playedRows.filter(({ row }) => Number(row.minutes || 0) > 0 || row.role === 'Titular').length;
const starts = playedRows.filter(({ row }) => row.role === 'Titular').length;
const minutes = playedRows.reduce((sum, { row }) => sum + Number(row.minutes || 0), 0);
const positionUsage = buildPlayerPositionUsage({
  playerId,
  playerName: player.name,
  matchRows: playedRows.map(({ row, match }) => ({
    matchId: match.id,
    minutes: Number(row.minutes || 0),
    role: row.role,
    duration: Math.max(90, ...Object.values(statsByMatch[match.id] || {}).map((statsRow) => Number(statsRow.minutes || 0))),
    initialSystem: match.stats_system || '4-4-2',
    initialSlots: lineupByMatch[match.id] || [],
    intervals: buildTacticalMatchHistory({
      matchId: match.id,
      duration: Math.max(90, ...Object.values(statsByMatch[match.id] || {}).map((statsRow) => Number(statsRow.minutes || 0))),
      initialSystem: match.stats_system || '4-4-2',
      initialSlots: lineupByMatch[match.id] || [],
      snapshots: snapshotsByMatch[match.id] || [],
      systemEvents: systemEventsByMatch[match.id] || [],
      substitutionMinutes: getHistoricalSubstitutionMinutes(statsByMatch[match.id] || {}),
    }).intervals,
    playerStats: statsByMatch[match.id] || {},
  })),
});
if (!positionUsage.valid || positionUsage.totalMinutes !== minutes) throw new Error('Invariante de posiciones inválido.');
const seasonResolution = resolveSportsSeasonFromMatches(matches);
if (!seasonResolution.valid) throw new Error(`Temporada no resoluble: ${seasonResolution.reason}`);
const ownTeam = ownTeamResponse.data || {};
const age = (() => {
  const birth = new Date(`${player.dob}T12:00:00`);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) years -= 1;
  return `${years} años`;
})();
const foot = /^(no indicada|no indicado|sin datos|—|-)$/i.test(clean(player.foot)) ? '' : clean(player.foot);
const pitchCounts = (source, field) => Object.fromEntries(fieldZones.map((zone) => [zone.value, source.filter((action) => action[field] === zone.value).length]));
const allCounts = pitchCounts(actions, 'shotZone');
assists.forEach((action) => { if (action.assistZone) allCounts[action.assistZone] = (allCounts[action.assistZone] || 0) + 1; });
const goalCounts = pitchCounts(goals, 'shotZone');
const assistCounts = pitchCounts(assists, 'assistZone');

const history = playedRows.map(({ row, match }) => {
  const matchActions = actions.filter((action) => action.matchId === match.id);
  const caudalGoals = Number(match.goals_for ?? (match.is_home ? match.home_score : match.away_score));
  const rivalGoals = Number(match.goals_against ?? (match.is_home ? match.away_score : match.home_score));
  return {
    id: match.id,
    date: new Date(`${match.date}T12:00:00`).toLocaleDateString('es-ES'),
    opponent: match.opponent,
    opponentCrest: match.opponent_crest || '',
    result: `${caudalGoals}-${rivalGoals}`,
    outcome: caudalGoals > rivalGoals ? 'V' : caudalGoals < rivalGoals ? 'D' : 'E',
    competition: competitionLabel,
    venue: match.is_home ? 'L' : 'V',
    role: row.role,
    minutes: `${Number(row.minutes || 0)}'`,
    goals: matchActions.filter((action) => action.type === 'Gol').length || '-',
    assists: matchActions.filter((action) => action.type === 'Asistencia').length || '-',
    cards: [row.yellow_count ? `${row.yellow_count} TA` : '', row.red ? '1 TR' : ''].filter(Boolean).join(' · ') || '-',
    injury: row.injured ? 'Sí' : '-',
    goalLinks: matchActions.filter((action) => action.type === 'Gol').map((action) => action.url).filter(Boolean),
    assistLinks: matchActions.filter((action) => action.type === 'Asistencia').map((action) => action.url).filter(Boolean),
  };
});

const report = buildPlayerProfilePrintReport({
  identity: { name: player.name, image: player.image || '', number: player.number, position: player.position, age, foot, team: getOwnClubDisplayName(ownTeam.name), teamCrest: ownTeam.crest || OWN_CLUB_IDENTITY.crest, season: seasonResolution.season.label },
  filters: { season: seasonResolution.season.label, competition: competitionLabel, venue: 'Todos' },
  validation: { seasonValid: true, production: invariant, positionUsage },
  seasonSummary: {
    played, starts, minutes, minutesPerMatch: played ? Math.round(minutes / played) : 0,
    starterPercentage: played ? Math.round(starts / played * 100) : 0,
    goals: goals.length, assists: assists.length, goalContributions: goals.length + assists.length,
    yellow: scopedStats.reduce((sum, row) => sum + Number(row.yellow_count || (row.yellow ? 1 : 0)), 0),
    red: scopedStats.filter((row) => row.red).length, injuries: scopedStats.filter((row) => row.injured).length,
    benchEntries: Math.max(0, played - starts),
  },
  competitionBreakdown: [{ key: competitionKey, label: competitionLabel, played, starts, minutes, goals: goals.length, assists: assists.length }],
  positionUsage,
  production: {
    goalsPer90: minutes ? (goals.length / minutes * 90).toFixed(2) : '0.00',
    assistsPer90: minutes ? (assists.length / minutes * 90).toFixed(2) : '0.00',
    goalContributionsPer90: minutes ? ((goals.length + assists.length) / minutes * 90).toFixed(2) : '0.00',
    goalContributions: goals.length + assists.length,
  },
  influenceMaps: [
    { key: 'all', label: 'Todos', zones: fieldZones.map((zone) => ({ ...zone, count: allCounts[zone.value] || 0 })) },
    { key: 'goals', label: 'Goles', zones: fieldZones.map((zone) => ({ ...zone, count: goalCounts[zone.value] || 0 })) },
    { key: 'assists', label: 'Asistencias', zones: fieldZones.map((zone) => ({ ...zone, count: assistCounts[zone.value] || 0 })) },
  ],
  goalAnalysis: { bodyParts, types, target },
  society,
  actions,
  history,
});

const result = await createPlayerProfilePdf({ report });
await fs.mkdir(outputDirectory, { recursive: true });
const pdfPath = path.join(outputDirectory, `${filenameSlug(player.name) || 'jugador'}-dossier-profesional.pdf`);
const auditPath = path.join(outputDirectory, 'audit.json');
await fs.writeFile(pdfPath, Buffer.from(result.arrayBuffer));
await fs.writeFile(auditPath, JSON.stringify({
  generatedAt: new Date().toISOString(), pdfPath, identity: report.identity, filters: report.filters,
  seasonSummary: report.seasonSummary, invariant, positionUsage, goalTarget: report.goalAnalysis.target,
  pages: result.pages, pageSections: result.pageSections, linkAudit: result.audit,
}, null, 2));
console.log(JSON.stringify({ pdfPath, auditPath, pages: result.pages, pageSections: result.pageSections, linkAnnotations: result.audit.linkAnnotations, urls: result.audit.urls, invariant, positionUsage }, null, 2));
