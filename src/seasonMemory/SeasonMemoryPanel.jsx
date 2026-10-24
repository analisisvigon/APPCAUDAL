import { useEffect, useMemo, useState } from 'react';
import { loadRealSeasonMemoryContexts, loadRealSeasonMemorySnapshot } from './realData.js';
import { buildRealSeasonMemory } from './realModel.js';

const stateMessage = {
  loading: 'Comprobando equipo, temporada y partidos…',
  empty: 'No hay partidos acreditados para esta temporada.',
  ambiguous: 'No hay un CTS propio con temporada acreditada para generar la memoria.',
  select: 'Selecciona una temporada acreditada para preparar el informe.',
  error: 'No se pudieron leer los datos necesarios. Comprueba permisos y vuelve a intentarlo.',
  generating: 'Generando PDF…',
};

async function loadCrest(url) {
  if (!url?.startsWith('/branding/')) throw new Error('Escudo local no acreditado.');
  const response = await fetch(`${import.meta.env.BASE_URL}${url.slice(1)}`);
  if (!response.ok) throw new Error('No se pudo cargar el escudo local.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

export default function SeasonMemoryPanel({ client, identity, sessionUserId }) {
  const [open, setOpen] = useState(false);
  const [contexts, setContexts] = useState([]);
  const [contextId, setContextId] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [competitionId, setCompetitionId] = useState('all');
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const [readAt, setReadAt] = useState(null);
  const context = contexts.find((row) => row.id === contextId);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setState('loading');
    setError('');
    loadRealSeasonMemoryContexts(client, identity?.membership).then((rows) => {
      if (cancelled) return;
      setContexts(rows);
      const active = rows.filter((row) => row.active && row.status === 'open');
      setContextId(active.length === 1 ? active[0].id : rows.length === 1 ? rows[0].id : '');
      if (!rows.length) setState('ambiguous');
      else if (active.length !== 1 && rows.length !== 1) setState('select');
    }).catch((cause) => {
      if (cancelled) return;
      setError(cause.message);
      setState('error');
    });
    return () => { cancelled = true; };
  }, [open, client, identity?.membership?.club_id, identity?.membership?.role,
    identity?.membership?.is_active, sessionUserId]);

  useEffect(() => {
    if (!open || !context) return undefined;
    let cancelled = false;
    setSnapshot(null);
    setCompetitionId('all');
    setState('loading');
    loadRealSeasonMemorySnapshot(client, context, { includeIndividual: true }).then((data) => {
      if (cancelled) return;
      setSnapshot(data);
      setReadAt(new Date());
      setState('ready');
    }).catch((cause) => {
      if (cancelled) return;
      setError(cause.message);
      setState('error');
    });
    return () => { cancelled = true; };
  }, [open, client, contextId]);

  const whole = useMemo(() => context && snapshot
    ? buildRealSeasonMemory({ context, ...snapshot, now: readAt || new Date() }) : null,
  [context, snapshot, readAt]);
  const model = useMemo(() => whole && context && snapshot
    ? buildRealSeasonMemory({ context, ...snapshot, competitionId, now: readAt || new Date() }) : null,
  [whole, context, snapshot, competitionId, readAt]);
  const canExport = (state === 'ready' || state === 'generationError')
    && model?.verified > 0 && model?.totals.played > 0;

  async function exportPdf() {
    if (!canExport) return;
    setState('generating');
    setError('');
    try {
      // Revalidar identidad y CTS; después releer los partidos. El PDF no
      // depende del caché de Inicio ni de la primera lectura del panel.
      const membershipResponse = await client.rpc('current_membership');
      const currentMembership = membershipResponse?.data;
      if (membershipResponse?.error || !Array.isArray(currentMembership)
        || currentMembership.length !== 1 || currentMembership[0].user_id !== sessionUserId
        || currentMembership[0].club_id !== context.clubId
        || currentMembership[0].is_active !== true
        || !['owner', 'admin', 'staff'].includes(currentMembership[0].role)) {
        throw new Error('El acceso del cuerpo técnico ya no está acreditado.');
      }
      const freshContexts = await loadRealSeasonMemoryContexts(client, currentMembership[0]);
      const freshContext = freshContexts.find((item) => item.id === context.id);
      if (!freshContext || ['clubId', 'teamId', 'teamName', 'seasonId',
        'seasonLabel', 'startsOn', 'endsOn', 'displayName'].some((key) => freshContext[key] !== context[key])) {
        throw new Error('El equipo o la temporada cambió desde la lectura previa.');
      }
      const fresh = await loadRealSeasonMemorySnapshot(client, freshContext, { includeIndividual: true });
      const next = buildRealSeasonMemory({ context: freshContext, ...fresh,
        competitionId, now: new Date() });
      if (!next.verified || !next.totals.played) throw new Error('Ya no hay partidos válidos para esta selección.');
      const crestDataUrl = await loadCrest(freshContext.crest);
      const { createRealSeasonMemoryPdf } = await import('./realPdf.js');
      const pdf = createRealSeasonMemoryPdf({ model: next, crestDataUrl });
      const blob = new Blob([pdf.output('arraybuffer')], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `NEXO_CLUB_Memoria_${freshContext.seasonLabel.replace(/[^a-zA-Z0-9]+/g, '_')}${competitionId === 'all' ? '' : '_Competicion'}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setSnapshot(fresh);
      setReadAt(next.generatedAt);
      setState('ready');
    } catch (cause) {
      setError(cause?.message || 'No se pudo generar el PDF.');
      setState('generationError');
    }
  }

  if (identity?.kind !== 'staff' || !sessionUserId) return null;
  return <section className="rounded-2xl border border-white/10 bg-[#0b1220] px-4 py-4 text-white">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-sm font-black uppercase tracking-[0.12em]">Memoria de Temporada</h2>
        <p className="mt-1 text-xs text-slate-400">Genera y descarga el informe estadístico de tu equipo</p>
      </div>
      <button type="button" onClick={() => setOpen((value) => !value)}
        className="rounded-xl border border-caudal-electric/40 bg-caudal-electric/10 px-4 py-2 text-xs font-bold text-caudal-electric hover:bg-caudal-electric/20">
        Exportar PDF
      </button>
    </div>
    {open ? <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-wrap gap-3">
        <label className="min-w-[200px] flex-1 text-xs text-slate-300">Temporada acreditada
          <select className="mt-1 w-full rounded-lg border border-white/20 bg-[#111c2b] p-2 text-white"
            value={contextId} onChange={(event) => setContextId(event.target.value)}>
            <option value="">Selecciona una temporada</option>
            {contexts.map((item) => <option key={item.id} value={item.id}>{item.displayName} · {item.seasonLabel}</option>)}
          </select>
        </label>
        <label className="min-w-[200px] flex-1 text-xs text-slate-300">Competición
          <select className="mt-1 w-full rounded-lg border border-white/20 bg-[#111c2b] p-2 text-white"
            value={competitionId} onChange={(event) => setCompetitionId(event.target.value)}
            disabled={!whole?.competitions.length}>
            <option value="all">Todas las competiciones</option>
            {(whole?.competitions || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      </div>
      {!contextId && contexts.length > 1 ? <p className="text-xs text-amber-200">Hay varias temporadas. Selecciona el CTS que deseas informar.</p> : null}
      {context && model ? <>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div className="rounded-lg bg-white/5 p-2">Equipo<br /><strong>{context.displayName}</strong></div>
          <div className="rounded-lg bg-white/5 p-2">Partidos acreditados<br /><strong>{model.verified}</strong></div>
          <div className="rounded-lg bg-white/5 p-2">Disputados<br /><strong>{model.totals.played}</strong></div>
          <div className="rounded-lg bg-white/5 p-2">Excluidos<br /><strong>{model.excludedTotal}</strong></div>
        </div>
        <p className="text-xs text-slate-300">{model.selection === 'season'
          ? model.excludedTotal ? 'Informe del CTS con registros excluidos' : 'Memoria completa del CTS seleccionado'
          : 'Informe de competición · selección parcial'} · {model.competitions.map((item) => item.name).join(', ') || 'Sin competiciones'}</p>
        <p className="text-xs text-slate-400">Indicadores disponibles: {model.metrics.filter((item) => item.covered).map((item) => `${item.label} (${item.covered}/${item.eligible})`).join(', ') || 'ninguno'}.</p>
        <p className="text-xs text-slate-400">Plantilla: {model.individualUnavailable ? 'lectura no verificada' : `${model.individual?.rows.length || 0} jugadores con participación acreditada`}. {model.totals.played && !model.individual?.rows.length && !model.individualUnavailable ? 'Aún no hay estadísticas individuales atribuibles por UUID.' : ''}</p>
        {model.individualUnavailable ? <p className="text-xs text-amber-200">Los datos individuales no pudieron verificarse. El PDF conservará las secciones colectivas y señalará esta limitación.</p> : null}
        {model.excludedTotal ? <p className="text-xs text-amber-200">Excluidos: {model.excluded.unlinked} sin vínculo CTS en la base, {model.excluded.teamContradiction} con identidad de equipo contradictoria, {model.excluded.invalidDate} fuera de temporada o sin fecha, {model.excluded.competitionConflict} con competición discrepante y {model.excluded.duplicate} duplicados.</p> : null}
        <p className="text-xs text-slate-400">Fecha prevista: {new Date().toLocaleDateString('es-ES')}. Lectura: {readAt?.toLocaleString('es-ES')}. El PDF reflejará los datos existentes al generarlo.</p>
      </> : null}
      {state === 'loading' || state === 'error' || state === 'generating' || state === 'ambiguous' || state === 'select' ? <p role="status" className="text-xs text-slate-300">{stateMessage[state]}</p> : null}
      {state === 'ready' && model && !model.verified ? <p className="text-xs text-amber-200">{model.excludedTotal
        ? 'No hay partidos exportables: revisa los registros sin vínculo o con datos contradictorios.'
        : stateMessage.empty}</p> : null}
      {state === 'ready' && model?.verified > 0 && !model.totals.played ? <p className="text-xs text-amber-200">Hay partidos acreditados, pero ninguno finalizado con marcador completo. Se bloquea la exportación oficial.</p> : null}
      {error ? <p role="alert" className="text-xs text-red-200">{state === 'generationError' ? 'Error de generación. ' : 'Error de lectura. '}{error}</p> : null}
      <button type="button" disabled={!canExport} onClick={exportPdf}
        className="rounded-lg bg-caudal-electric px-4 py-2 text-xs font-bold text-[#0b1220] disabled:cursor-not-allowed disabled:opacity-50">
        {state === 'generating' ? 'Generando…' : 'Descargar informe'}</button>
    </div> : null}
  </section>;
}
