import { getFormationSlotsForSavedLineup, hasFormationSlotsForSavedLineup } from '../utils/formationSlotCoordinates.js';
import { SEASON_MEMORY_METRICS } from './realModelMetrics.js';
import { persistentVideoUrl, videoAtSeconds } from './realMatchLinks.js';

const clean = (value) => String(value ?? '').trim();
const uuid = (value) => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(clean(value));
const unique = (rows) => [...new Map((rows || []).filter((row) => row?.id).map((row) => [row.id, row])).values()];
const minute = (value) => Number.isInteger(Number(value)) && clean(value) !== '' && Number(value) >= 0
  ? Number(value) : null;
const ownMetric = (value, max) => {
  const text = clean(value).replace(',', '.').replace(/%$/, '');
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 && (max === null ? Number.isInteger(n) : n <= max) ? n : null;
};
const forMatch = (rows, id) => unique(rows).filter((row) => row.partido_id === id);

export function buildRealMatchCards({ context, matches = [], individual, source = {} }) {
  const players = new Map(unique(source.players).filter((row) => uuid(row.id)
    && row.stage?.id === row.membership_id && row.stage.team_id === context.teamId
    && row.stage.player_id === row.global_player_id)
    .map((row) => [row.id, { id: row.id, name: clean(row.name) || 'Jugador sin nombre',
      number: row.number }]));
  return matches.map((match) => {
    const raw = match.raw || {};
    const valid = (id) => players.get(id) || null;
    const slots = forMatch(source.slots, match.id).filter((row) => row.scope === 'stats');
    const lineup = slots.filter((row) => Number.isInteger(row.slot) && row.slot >= 0 && row.slot < 11
      && valid(row.jugador_id)).map((row) => ({ slot: row.slot, player: valid(row.jugador_id) }))
      .sort((a, b) => a.slot - b.slot);
    const distinct = new Set(lineup.map((row) => row.slot)).size === lineup.length
      && new Set(lineup.map((row) => row.player.id)).size === lineup.length;
    const formation = clean(raw.stats_system);
    // stats_system tiene DEFAULT 4-4-2 en la base. Sin una marca de edición
    // explícita, ese valor aislado no acredita el sistema elegido ese día.
    const positioned = distinct && lineup.length === 11 && formation !== '4-4-2'
      && hasFormationSlotsForSavedLineup(formation);
    const formationSlots = positioned ? getFormationSlotsForSavedLineup(formation) : [];
    const substitutions = forMatch(source.substitutions, match.id).flatMap((row) => {
      const outgoing = valid(row.outgoing_jugador_id), incoming = valid(row.incoming_jugador_id);
      return outgoing && incoming ? [{ id: row.id, minute: minute(row.minute),
        outgoing: outgoing.name, incoming: incoming.name }] : [];
    });
    const goals = forMatch(source.goals, match.id).filter((row) =>
      ['Gol a favor', 'Gol en contra'].includes(row.type)).map((row) => {
      const scorer = valid(row.scorer_id), assistant = valid(row.assistant_id);
      return { id: row.id, minute: minute(row.minute), team: row.type === 'Gol a favor' ? 'own' : 'rival',
        scorer: scorer?.name || null, assistant: assistant?.name || null,
        ownGoal: row.is_own_goal === true,
        video: persistentVideoUrl(row.video_url) };
    });
    const quick = forMatch(source.quickEvents, match.id).filter((row) => row.reviewed === true
      && ['caudal', 'rival'].includes(row.equipo)
      && row.tipo_evento !== 'gol' && row.tipo_evento !== 'corner'
      && row.tipo_evento !== 'corner_rival').map((row) => ({ id: row.id,
      minute: Number(row.minuto) > 0 ? minute(row.minuto) : null,
      team: row.equipo === 'rival' ? 'rival' : 'own',
      type: clean(row.tipo_evento).replaceAll('_', ' '), player: valid(row.jugador_id)?.name || null }));
    const quickTotals = [...quick.reduce((counts, row) => {
      const key = `${row.team}|${row.type}`;
      counts.set(key, { team: row.team, type: row.type,
        count: (counts.get(key)?.count || 0) + 1 });
      return counts;
    }, new Map()).values()].sort((a, b) => b.count - a.count
      || a.type.localeCompare(b.type, 'es'));
    const stats = (individual?.rows || []).flatMap((row) => {
      const detail = row.contributions.find((item) => item.matchId === match.id);
      return detail ? [{ player: row.name, number: row.number, ...detail }] : [];
    }).sort((a, b) => (b.knownGoals + b.knownAssists) - (a.knownGoals + a.knownAssists)
      || (b.minutes ?? -1) - (a.minutes ?? -1) || a.player.localeCompare(b.player, 'es'));
    const cards = stats.flatMap((row, index) => [
      ...(row.yellow > 0 ? [{ id: `${match.id}-yellow-${index}`, kind: 'card',
        minute: null, card: 'yellow', count: row.yellow, player: row.player }] : []),
      ...(row.red > 0 ? [{ id: `${match.id}-red-${index}`, kind: 'card',
        minute: null, card: 'red', count: row.red, player: row.player }] : []),
    ]);
    const timeline = [
      ...goals.map((row) => ({ ...row, kind: 'goal' })),
      ...substitutions.map((row) => ({ ...row, kind: 'substitution' })),
      ...cards,
    ].sort((a, b) => (a.minute ?? Infinity) - (b.minute ?? Infinity)
      || a.id.localeCompare(b.id));
    const metrics = SEASON_MEMORY_METRICS.flatMap(([key, label, unit, max]) => {
      const value = ownMetric(raw[key], max);
      return value === null ? [] : [{ label, value: `${value}${unit}` }];
    });
    const notes = [raw.post_notes, raw.post_reality, raw.post_fulfilled, raw.post_not_fulfilled,
      raw.post_why, raw.post_next_adjustment, raw.post_repeat, raw.post_improve,
      raw.post_train_week].map(clean).filter(Boolean);
    const videos = goals.filter((row) => row.video).map((row) => ({ url: row.video,
      label: row.scorer ? `Gol ${row.scorer}` : row.team === 'own' ? 'Gol a favor' : 'Gol del rival',
      minute: row.minute }));
    const postVideo = persistentVideoUrl(raw.post_video_link);
    if (postVideo) {
      videos.push({ url: postVideo, label: 'Vídeo del partido (POST)', minute: null });
      for (const event of forMatch(source.postEvents, match.id)) {
        const seconds = minute(event.video_seconds);
        if (seconds === null || !clean(event.type)) continue;
        videos.push({ url: videoAtSeconds(postVideo, seconds),
          label: `Acción POST: ${clean(event.type)} · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
            + `${valid(event.jugador_id) ? ` · ${valid(event.jugador_id).name}` : ''}`,
          minute: null });
      }
    }
    return { id: match.id, match, context, lineup: distinct ? lineup : [],
      lineupCoverage: distinct ? lineup.length : 0, formation: positioned ? formation : null,
      positions: positioned ? lineup.map((row) => ({ ...row, ...formationSlots[row.slot] })) : [],
      substitutions, goals, timeline, quickTotals, stats, metrics, notes, videos,
      rejectedVideos: forMatch(source.goals, match.id).filter((row) => clean(row.video_url)
        && !persistentVideoUrl(row.video_url)).length
        + Number(Boolean(clean(raw.post_video_link) && !postVideo)),
      opponentCrest: clean(raw.opponent_crest) };
  });
}
