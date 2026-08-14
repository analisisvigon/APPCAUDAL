import { useMemo, useState } from 'react';
import { getPlayerDisplayName } from '../../utils/playerDisplayName';

export default function CaptainPriorityPanel({
  players = [],
  priorities = [],
  loading = false,
  saving = false,
  schemaAvailable = true,
  error = '',
  status = '',
  onSave,
}) {
  const [playerToAddId, setPlayerToAddId] = useState('');
  const playersById = useMemo(() => new Map(players.map((player) => [String(player.id), player])), [players]);
  const orderedPlayers = priorities.map((entry) => playersById.get(String(entry.jugadorId))).filter(Boolean);
  const selectedIds = new Set(orderedPlayers.map((player) => String(player.id)));
  const availablePlayers = players
    .filter((player) => player.membershipId && !selectedIds.has(String(player.id)))
    .sort((left, right) => getPlayerDisplayName(left).localeCompare(getPlayerDisplayName(right), 'es'));

  const saveOrder = (nextPlayers) => onSave?.(nextPlayers);
  const move = (index, offset) => {
    const target = index + offset;
    if (target < 0 || target >= orderedPlayers.length || saving) return;
    const next = [...orderedPlayers];
    [next[index], next[target]] = [next[target], next[index]];
    saveOrder(next);
  };
  const add = () => {
    const player = playersById.get(String(playerToAddId));
    if (!player || saving) return;
    saveOrder([...orderedPlayers, player]);
    setPlayerToAddId('');
  };

  return (
    <section className="rounded-[1.15rem] border border-amber-200/15 bg-amber-200/[0.035] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-xs font-black uppercase tracking-[0.18em] text-amber-100">Orden de capitanes</h3>
          <p className="mt-1 text-xs text-slate-400">El primer jugador de esta lista que forme parte del XI inicial real será el capitán automático.</p>
        </div>
        <span className="w-fit rounded-xl border border-amber-200/15 bg-amber-200/10 px-2.5 py-1 text-xs font-black text-amber-100">{priorities.length} configurados</span>
      </div>

      {!schemaAvailable ? (
        <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs font-bold text-amber-100">Falta aplicar la migración de prioridades en Supabase. La lista permanece desactivada para evitar una persistencia incompleta.</p>
      ) : null}
      {error ? <p className="mt-3 rounded-xl border border-red-300/20 bg-red-400/10 px-3 py-2 text-xs font-bold text-red-100">{error}</p> : null}
      {status ? <p className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-xs font-bold text-emerald-100">{status}</p> : null}

      <div className="mt-3 grid gap-2">
        {loading ? <p className="text-xs text-slate-400">Cargando orden…</p> : null}
        {!loading && schemaAvailable && !orderedPlayers.length ? <p className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-xs text-slate-400">Todavía no hay capitanes configurados.</p> : null}
        {orderedPlayers.map((player, index) => (
          <div key={player.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/15 px-3 py-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-200 text-xs font-black text-slate-950">{index + 1}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-black text-white">#{player.number || '-'} · {getPlayerDisplayName(player)}</span>
            <button type="button" aria-label={`Subir a ${getPlayerDisplayName(player)}`} disabled={saving || index === 0} onClick={() => move(index, -1)} className="rounded-lg bg-white/10 px-2 py-1 text-xs font-black text-white disabled:opacity-30">↑</button>
            <button type="button" aria-label={`Bajar a ${getPlayerDisplayName(player)}`} disabled={saving || index === orderedPlayers.length - 1} onClick={() => move(index, 1)} className="rounded-lg bg-white/10 px-2 py-1 text-xs font-black text-white disabled:opacity-30">↓</button>
            <button type="button" disabled={saving} onClick={() => saveOrder(orderedPlayers.filter((_, playerIndex) => playerIndex !== index))} className="rounded-lg bg-red-400/10 px-2 py-1 text-xs font-black text-red-100 disabled:opacity-30">Quitar</button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <select disabled={!schemaAvailable || saving || loading} value={playerToAddId} onChange={(event) => setPlayerToAddId(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white px-3 py-2 text-sm font-bold text-slate-950 disabled:opacity-50">
          <option value="">Añadir jugador al orden…</option>
          {availablePlayers.map((player) => <option key={player.id} value={player.id}>#{player.number || '-'} · {getPlayerDisplayName(player)}</option>)}
        </select>
        <button type="button" disabled={!playerToAddId || !schemaAvailable || saving || loading} onClick={add} className="rounded-xl bg-amber-200 px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-40">{saving ? 'Guardando…' : 'Añadir'}</button>
      </div>
      {players.some((player) => !player.membershipId) ? <p className="mt-2 text-[11px] text-slate-500">Los jugadores sin relación UUID vigente no se ofrecen como candidatos.</p> : null}
    </section>
  );
}
