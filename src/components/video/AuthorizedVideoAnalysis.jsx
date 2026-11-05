import { useEffect, useRef, useState } from 'react';
import { loadAuthorizedSportsContexts, SportsContextCoordinator,
  verifySelectableSportsContext } from '../../sports/authorizedContext.js';
import { loadCtsMatches } from '../../sports/ctsSportsData.js';
import VideoAnalysisLab from '../../videoLab/VideoAnalysisLab.jsx';

export default function AuthorizedVideoAnalysis({ client, userId, preferredContextId = '' }) {
  const [contexts, setContexts] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [scope, setScope] = useState({ status: 'loading', context: null, matches: [] });
  const coordinatorRef = useRef(new SportsContextCoordinator());

  useEffect(() => {
    let cancelled = false;
    setScope({ status: 'loading', context: null, matches: [] });
    loadAuthorizedSportsContexts(client).then((options) => {
      if (cancelled) return;
      setContexts(options);
      setSelectedId((current) => {
        if (options.some((option) => option.id === preferredContextId)) return preferredContextId;
        if (options.some((option) => option.id === current)) return current;
        return options.length === 1 ? options[0].id : '';
      });
      if (!options.length) setScope({ status: 'empty', context: null, matches: [] });
    }).catch(() => {
      if (!cancelled) setScope({ status: 'error', context: null, matches: [] });
    });
    return () => { cancelled = true; };
  }, [client, preferredContextId, userId]);

  useEffect(() => {
    let cancelled = false;
    const coordinator = coordinatorRef.current;
    coordinator.change(null);
    if (!selectedId) {
      if (contexts.length) setScope({ status: 'choose', context: null, matches: [] });
      return undefined;
    }
    setScope({ status: 'loading', context: null, matches: [] });
    void (async () => {
      try {
        const context = await verifySelectableSportsContext(client, selectedId);
        if (cancelled) return;
        const token = coordinator.change(context);
        const matches = await loadCtsMatches(client, coordinator, token);
        if (!cancelled && coordinator.isCurrent(token)) {
          setScope({ status: 'ready', context, matches });
        }
      } catch {
        if (!cancelled) setScope({ status: 'error', context: null, matches: [] });
      }
    })();
    return () => { cancelled = true; coordinator.change(null); };
  }, [client, selectedId, contexts]);

  return <div>
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-[#101824] px-4 py-3 text-sm">
      <label htmlFor="video-analysis-cts" className="font-semibold text-slate-200">Equipo y temporada</label>
      <select id="video-analysis-cts" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}
        className="min-w-0 max-w-full rounded-lg border border-white/15 bg-[#172333] px-3 py-2 text-white">
        <option value="">Selecciona un equipo y temporada</option>
        {contexts.map((context) => <option key={context.id} value={context.id}>
          {context.clubName} · {context.teamName} · {context.seasonLabel}
        </option>)}
      </select>
      {scope.status === 'loading' && <span role="status">Verificando acceso…</span>}
      {scope.status === 'error' && <span role="alert" className="text-amber-200">No se pudo verificar este contexto y sus partidos.</span>}
      {scope.status === 'empty' && <span>No hay equipos y temporadas autorizados.</span>}
    </div>
    {scope.status === 'ready' && <VideoAnalysisLab key={scope.context.id} embedded
      context={scope.context} matches={scope.matches} userId={userId} />}
  </div>;
}
