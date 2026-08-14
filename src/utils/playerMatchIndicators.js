import { goalParticipantMatchesPlayer } from './goalEvents.js';

const toCount = (value) => {
  const count = Number(value || 0);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
};

const uniqueOfficialGoals = (events = []) => {
  const seenIds = new Set();
  return events.filter((event) => {
    if (event?.type !== 'Gol a favor') return false;
    const id = String(event?.id || '').trim();
    if (!id) return true;
    if (seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });
};

const countLabel = (symbol, count) => `${symbol}${count > 1 ? `×${count}` : ''}`;
const countTitle = (count, singular, plural) => `${count} ${count === 1 ? singular : plural}`;

export const getPlayerMatchIndicators = ({
  player,
  goalEvents = [],
  playerStats = {},
  isCaptain = false,
} = {}) => {
  if (!player?.id && !player?.name) return [];

  const officialGoals = uniqueOfficialGoals(goalEvents);
  const goals = officialGoals.filter((event) => goalParticipantMatchesPlayer(event, 'scorer', player)).length;
  const assists = officialGoals.filter((event) => goalParticipantMatchesPlayer(event, 'assistant', player)).length;
  const yellowCount = toCount(
    playerStats.yellowCount
      ?? playerStats.yellow_count
      ?? (playerStats.yellow ? 1 : 0)
  );
  const hasRedCard = Boolean(playerStats.red);
  const hasMatchInjury = Boolean(playerStats.injured);

  return [
    isCaptain ? {
      key: 'captain',
      label: 'C',
      title: 'Capitán',
      className: 'rounded-full border border-white bg-black text-white',
    } : null,
    goals ? {
      key: 'goals',
      label: countLabel('⚽', goals),
      title: countTitle(goals, 'gol', 'goles'),
      className: 'border border-white/70 bg-white text-slate-950',
    } : null,
    assists ? {
      key: 'assists',
      label: countLabel('A', assists),
      title: countTitle(assists, 'asistencia', 'asistencias'),
      className: 'border border-white/70 bg-slate-100 text-slate-950',
    } : null,
    yellowCount ? {
      key: 'yellow',
      label: countLabel('🟨', yellowCount),
      title: countTitle(yellowCount, 'tarjeta amarilla', 'tarjetas amarillas'),
      className: 'border border-yellow-900/40 bg-yellow-300 text-slate-950',
    } : null,
    hasRedCard ? {
      key: 'red',
      label: '🟥',
      title: 'Tarjeta roja',
      className: 'border border-white/70 bg-red-700 text-white',
    } : null,
    hasMatchInjury ? {
      key: 'injury',
      label: '🩹',
      title: 'Lesión durante el partido',
      className: 'border border-white/70 bg-slate-100 text-slate-950',
    } : null,
  ].filter(Boolean);
};

