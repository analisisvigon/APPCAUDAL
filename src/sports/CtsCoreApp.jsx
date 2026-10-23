import React, { useEffect, useRef, useState } from 'react';
import { SportsContextCoordinator, verifySportsContext } from './authorizedContext';
import { loadCtsMatches, loadCtsRoster } from './ctsSportsData';

// Solo importa lecturas CTS. No monta App.jsx ni sus efectos globales.
export default function CtsCoreApp({ client, contextId, onChangeTeam, onSignOut }) {
  const coordinatorRef = useRef(new SportsContextCoordinator());
  const [tab, setTab] = useState('Inicio');
  const [result, setResult] = useState({ status: 'loading', context: null, players: [], matches: [] });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const coordinator = coordinatorRef.current;
    coordinator.change(null);
    setResult({ status: 'loading', context: null, players: [], matches: [] });
    setTab('Inicio');
    void (async () => {
      try {
        const context = await verifySportsContext(client, contextId);
        if (cancelled) return;
        const snapshot = coordinator.change(context);
        const [players, matches] = await Promise.all([
          loadCtsRoster(client, coordinator, snapshot),
          loadCtsMatches(client, coordinator, snapshot),
        ]);
        if (cancelled || !coordinator.isCurrent(snapshot)) return;
        setResult({ status: 'ready', context, players, matches });
      } catch {
        if (!cancelled) setResult({ status: 'error', context: null, players: [], matches: [] });
      }
    })();
    return () => { cancelled = true; coordinator.change(null); };
  }, [client, contextId, revision]);

  const { context, players, matches } = result;
  return <div className="min-h-screen bg-[#02070f] p-4 text-slate-100 sm:p-8">
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <img src="/branding/nexo-symbol-dark.png" alt="NEXO CLUB" className="h-12 w-12 object-contain" />
          <div><strong className="block">NEXO CLUB</strong>
            <span className="text-sm text-slate-400">{context ? `${context.clubName} · ${context.teamName} · ${context.seasonLabel}` : 'Verificando equipo'}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {onChangeTeam && <button type="button" onClick={onChangeTeam} className="rounded-xl border border-white/20 px-3 py-2 text-sm">Cambiar equipo</button>}
          <button type="button" onClick={onSignOut} className="rounded-xl border border-white/20 px-3 py-2 text-sm">Cerrar sesión</button>
        </div>
      </header>
      {result.status === 'loading' && <p className="mt-8" role="status">Verificando acceso y cargando datos…</p>}
      {result.status === 'error' && <div className="mt-8" role="alert"><p>No se pudo verificar este equipo o cargar sus datos.</p>
        <button type="button" onClick={() => setRevision((value) => value + 1)} className="mt-4 rounded-xl border border-white/20 px-3 py-2">Reintentar</button></div>}
      {result.status === 'ready' && <>
        <p className="mt-5 text-sm text-slate-400">{context.seasonStatus === 'open' ? 'Temporada activa' : 'Temporada histórica'} · Consulta CTS</p>
        <nav aria-label="Secciones deportivas" className="mt-6 flex flex-wrap gap-2">
          {['Inicio', 'Plantilla', 'Partidos'].map((name) => <button type="button" key={name}
            aria-current={tab === name ? 'page' : undefined} onClick={() => setTab(name)}
            className={`rounded-xl px-4 py-2 text-sm ${tab === name ? 'bg-caudal-electric text-slate-950' : 'bg-white/10'}`}>{name}</button>)}
        </nav>
        {tab === 'Inicio' && <main className="mt-7 grid gap-4 sm:grid-cols-2">
          <section className="rounded-2xl bg-white/5 p-6"><h1 className="text-xl font-bold">{context.teamName}</h1><p className="mt-2 text-slate-400">{context.clubName} · {context.seasonLabel}</p></section>
          <section className="rounded-2xl bg-white/5 p-6"><h2 className="font-bold">Resumen del equipo</h2><p className="mt-3">{players.length} fichas · {matches.length} partidos</p></section>
        </main>}
        {tab === 'Plantilla' && <main className="mt-7"><h1 className="text-xl font-bold">Plantilla</h1>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">{players.map((player) => <li key={player.id} className="rounded-xl bg-white/5 p-4">{player.name || 'Jugador'}{player.position ? ` · ${player.position}` : ''}</li>)}</ul>
          {!players.length && <p className="mt-4 text-slate-400">Sin fichas vinculadas a este equipo y temporada.</p>}
        </main>}
        {tab === 'Partidos' && <main className="mt-7"><h1 className="text-xl font-bold">Partidos</h1>
          <ul className="mt-4 grid gap-2">{matches.map((match) => <li key={match.id} className="rounded-xl bg-white/5 p-4">{match.date || 'Fecha pendiente'} · {match.opponent || 'Partido'}</li>)}</ul>
          {!matches.length && <p className="mt-4 text-slate-400">Sin partidos en este equipo y temporada.</p>}
        </main>}
        <p className="mt-8 text-xs text-slate-500">Las ediciones y los demás módulos permanecerán cerrados hasta completar la autorización por fila.</p>
      </>}
    </div>
  </div>;
}
