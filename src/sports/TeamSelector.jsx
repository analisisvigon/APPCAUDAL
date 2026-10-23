import React from 'react';

export default function TeamSelector({ contexts, preferredId, onSelect, onExit,
  exitLabel = 'Cerrar sesión', description = 'Solo aparecen espacios autorizados para tu cuenta.',
  canSelectContext = () => true, busy = false, error = '' }) {
  const orderedContexts = [...contexts].sort((a, b) =>
    Number(b.id === preferredId) - Number(a.id === preferredId));
  return <main className="min-h-screen bg-[#02070f] px-4 py-10 text-slate-100">
    <div className="mx-auto max-w-4xl">
      <img src="/branding/nexo-lockup-dark.png" alt="NEXO CLUB" className="h-24 w-auto" />
      <h1 className="mt-7 text-2xl font-black">Elige equipo y temporada</h1>
      <p className="mt-2 text-sm text-slate-400">{description}</p>
      {error && <p role="alert" className="mt-5 rounded-xl bg-red-500/10 p-4 text-red-100">{error}</p>}
      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        {orderedContexts.map((context) => <button type="button" key={context.id}
          disabled={busy || !canSelectContext(context)} onClick={() => onSelect(context.id)}
          className="flex min-h-28 items-center gap-4 rounded-2xl border border-white/10 bg-[#081326] p-4 text-left hover:border-caudal-electric/60 disabled:opacity-50">
          {context.teamCrest ? <img src={context.teamCrest} alt="" className="h-14 w-14 object-contain" />
            : <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/10">⚽</span>}
          <span className="min-w-0">
            <span className="block text-xs font-bold text-caudal-electric">{context.id === preferredId ? 'Espacio preferido · ' : ''}{context.clubName}</span>
            <span className="block truncate text-base font-black">{context.teamName}</span>
            <span className="block text-xs text-slate-400">{context.seasonLabel} · {context.seasonStatus === 'open' ? 'Temporada abierta' : canSelectContext(context) ? 'Temporada cerrada' : 'Archivo pendiente de protección'}</span>
          </span>
        </button>)}
      </div>
      {!contexts.length && <p className="mt-6 text-slate-400">No hay equipos y temporadas autorizados.</p>}
      {onExit && <button type="button" onClick={onExit} className="mt-8 rounded-xl border border-white/20 px-4 py-2 text-sm">{exitLabel}</button>}
    </div>
  </main>;
}
