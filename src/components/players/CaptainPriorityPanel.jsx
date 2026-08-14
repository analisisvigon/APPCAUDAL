import { useEffect, useMemo, useState } from 'react';
import { getPlayerDisplayName } from '../../utils/playerDisplayName';
import {
  appendCaptainOrderId,
  moveCaptainOrderId,
  removeCaptainOrderId,
  replaceCaptainOrderId,
} from '../../utils/captainOrder';

const sortRosterPlayers = (left, right) => {
  const leftNumber = Number(left?.number) || Number.MAX_SAFE_INTEGER;
  const rightNumber = Number(right?.number) || Number.MAX_SAFE_INTEGER;
  return leftNumber - rightNumber || getPlayerDisplayName(left).localeCompare(getPlayerDisplayName(right), 'es');
};

function CaptainAvatar({ player }) {
  const initials = getPlayerDisplayName(player).split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.07] text-[10px] font-black text-white">
      {player?.image ? <img src={player.image} alt="" className="h-full w-full object-cover object-center" /> : initials || '—'}
    </span>
  );
}

export default function CaptainPriorityPanel({
  open = false,
  players = [],
  priorities = [],
  loading = false,
  saving = false,
  schemaAvailable = true,
  error = '',
  status = '',
  onClose,
  onSave,
}) {
  const [draftIds, setDraftIds] = useState([]);
  const [playerToAddId, setPlayerToAddId] = useState('');
  const [dirty, setDirty] = useState(false);
  const activePlayers = useMemo(() => {
    const byId = new Map();
    players.filter((player) => player?.id && player?.membershipId && player.activeInSquad !== false)
      .forEach((player) => byId.set(String(player.id), player));
    return [...byId.values()].sort(sortRosterPlayers);
  }, [players]);
  const playersById = useMemo(() => new Map(activePlayers.map((player) => [String(player.id), player])), [activePlayers]);

  useEffect(() => {
    if (!open) return;
    setDraftIds(priorities.map((entry) => String(entry.jugadorId)).filter((id) => playersById.has(id)));
    setPlayerToAddId('');
    setDirty(false);
  }, [open, priorities, playersById]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !saving) onClose?.();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open, saving, onClose]);

  if (!open) return null;

  const draftPlayers = draftIds.map((id) => playersById.get(id)).filter(Boolean);
  const selectedIds = new Set(draftIds);
  const availablePlayers = activePlayers.filter((player) => !selectedIds.has(String(player.id)));
  const updateDraft = (nextIds) => {
    setDraftIds(nextIds);
    setDirty(true);
  };
  const addCaptain = () => {
    if (!playerToAddId || saving) return;
    updateDraft(appendCaptainOrderId(draftIds, playerToAddId));
    setPlayerToAddId('');
  };
  const saveDraft = async () => {
    if (!dirty || saving || !schemaAvailable) return;
    const result = await onSave?.(draftPlayers);
    if (!result?.ok) return;
    const confirmedIds = (result.rows || []).map((entry) => String(entry.jugadorId)).filter((id) => playersById.has(id));
    setDraftIds(confirmedIds);
    setDirty(false);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="captains-dialog-title">
      <section className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#07111f] shadow-[0_28px_90px_rgba(0,0,0,0.5)]">
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-200">Plantilla</p>
            <h2 id="captains-dialog-title" className="mt-1 text-xl font-black text-white">Capitanes del equipo</h2>
            <p className="mt-1 text-sm text-slate-400">El primer integrante de la lista que sea titular será el capitán automático.</p>
          </div>
          <button type="button" disabled={saving} onClick={onClose} aria-label="Cerrar capitanes" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-2xl text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-40">×</button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {!schemaAvailable ? <p className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm font-bold text-amber-100">MIGRACIÓN PENDIENTE: ejecuta supabase_own_captain_priority.sql antes de guardar.</p> : null}
          {error ? <p className="mb-4 rounded-2xl border border-red-300/20 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">{error}</p> : null}
          {!dirty && status ? <p className="mb-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100">{status}</p> : null}
          {loading ? <p className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-sm text-slate-400">Cargando orden desde Supabase…</p> : null}

          {!loading && !draftPlayers.length ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.025] px-5 py-7 text-center">
              <p className="font-black text-white">No hay capitanes configurados</p>
              <p className="mt-1 text-sm text-slate-400">Añade el primero desde la plantilla propia activa.</p>
            </div>
          ) : null}

          <div className="space-y-2.5">
            {draftPlayers.map((player, index) => {
              const currentId = String(player.id);
              const selectablePlayers = activePlayers.filter((candidate) => String(candidate.id) === currentId || !selectedIds.has(String(candidate.id)));
              return (
                <div key={currentId} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                  <span className="flex h-9 min-w-9 items-center justify-center rounded-xl bg-amber-200 px-2 text-sm font-black text-slate-950">{index + 1}.º</span>
                  <div className="flex min-w-0 items-center gap-3">
                    <CaptainAvatar player={player} />
                    <select
                      value={currentId}
                      disabled={saving || !schemaAvailable}
                      onChange={(event) => updateDraft(replaceCaptainOrderId(draftIds, index, event.target.value))}
                      aria-label={`Capitán número ${index + 1}`}
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white px-3 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50"
                    >
                      {selectablePlayers.map((candidate) => <option key={candidate.id} value={candidate.id}>#{candidate.number || '-'} · {getPlayerDisplayName(candidate)}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" aria-label={`Subir a ${getPlayerDisplayName(player)}`} disabled={saving || index === 0} onClick={() => updateDraft(moveCaptainOrderId(draftIds, index, -1))} className="rounded-lg bg-white/10 px-2.5 py-2 text-sm font-black text-white disabled:opacity-25">↑</button>
                    <button type="button" aria-label={`Bajar a ${getPlayerDisplayName(player)}`} disabled={saving || index === draftPlayers.length - 1} onClick={() => updateDraft(moveCaptainOrderId(draftIds, index, 1))} className="rounded-lg bg-white/10 px-2.5 py-2 text-sm font-black text-white disabled:opacity-25">↓</button>
                    <button type="button" aria-label={`Eliminar a ${getPlayerDisplayName(player)}`} disabled={saving} onClick={() => updateDraft(removeCaptainOrderId(draftIds, index))} className="rounded-lg bg-red-400/10 px-2.5 py-2 text-xs font-black text-red-100 disabled:opacity-25">Quitar</button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <select disabled={!schemaAvailable || saving || loading || !availablePlayers.length} value={playerToAddId} onChange={(event) => setPlayerToAddId(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white px-3 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-50">
              <option value="">Seleccionar jugador por dorsal…</option>
              {availablePlayers.map((player) => <option key={player.id} value={player.id}>#{player.number || '-'} · {getPlayerDisplayName(player)}</option>)}
            </select>
            <button type="button" disabled={!playerToAddId || !schemaAvailable || saving || loading} onClick={addCaptain} className="rounded-xl border border-amber-200/25 bg-amber-200/10 px-4 py-2.5 text-sm font-black text-amber-100 disabled:opacity-40">+ Añadir capitán</button>
          </div>
          {players.some((player) => !player.membershipId) ? <p className="mt-2 text-xs text-slate-500">Los jugadores sin relación UUID vigente no se ofrecen como candidatos.</p> : null}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-slate-500">{dirty ? 'Cambios pendientes de guardar' : `${draftPlayers.length} capitán${draftPlayers.length === 1 ? '' : 'es'} confirmados`}</p>
          <div className="flex gap-2">
            <button type="button" disabled={saving} onClick={onClose} className="rounded-xl bg-white/[0.07] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">Cerrar</button>
            <button type="button" disabled={!dirty || saving || !schemaAvailable} onClick={saveDraft} className="rounded-xl bg-caudal-electric px-5 py-2.5 text-sm font-black text-slate-950 disabled:opacity-40">{saving ? 'Guardando…' : error ? 'Reintentar' : 'Guardar'}</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
