import { useEffect, useMemo, useState } from 'react';
import { loadMicrocycle2b } from '../../data/microcycles2bStore.js';
import { applyMicrocycleCopy, copyMicrocycleDraft } from '../../data/microcycles2cCopy.js';
import { calendarWeekDays, shiftCalendarWeek } from '../../utils/teamCalendar.js';

const label = (monday) => monday ? new Date(`${monday}T12:00:00`).toLocaleDateString('es-ES', {
  day: 'numeric', month: 'long', year: 'numeric',
}) : '—';
const contextLabel = (row) => `${row.team_name} · ${row.label}${row.status === 'closed' ? ' · Cerrada' : ''}`;

export default function MicrocycleCopyDialog({ client, contexts, initialContextId, initialMonday,
  onClose, onOpenDestination }) {
  const [sourceContextId, setSourceContextId] = useState(initialContextId);
  const [targetContextId, setTargetContextId] = useState(initialContextId);
  const [sourceMonday, setSourceMonday] = useState(initialMonday);
  const [targetMonday, setTargetMonday] = useState(shiftCalendarWeek(initialMonday, 1));
  const [includeObservations, setIncludeObservations] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [sourcePlan, setSourcePlan] = useState(null);
  const [targetPlan, setTargetPlan] = useState(null);
  const [loadedSourceKey, setLoadedSourceKey] = useState('');
  const [loadedTargetKey, setLoadedTargetKey] = useState('');
  const [sourceError, setSourceError] = useState('');
  const [targetError, setTargetError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [retryBlocked, setRetryBlocked] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const sourceDays = useMemo(() => calendarWeekDays(sourceMonday), [sourceMonday]);
  const targetDays = useMemo(() => calendarWeekDays(targetMonday), [targetMonday]);
  const targetContext = contexts.find((row) => row.id === targetContextId);
  const sameWeek = sourceContextId === targetContextId && sourceMonday === targetMonday;
  const sourceReady = loadedSourceKey === `${sourceContextId}:${sourceMonday}`;
  const targetReady = loadedTargetKey === `${targetContextId}:${targetMonday}`;

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, saving]);
  useEffect(() => {
    let cancelled = false;
    setSourcePlan(null); setSourceError(''); setLoadedSourceKey('');
    setConfirmOverwrite(false); setSaved(null);
    if (!sourceContextId || !sourceMonday) return () => { cancelled = true; };
    loadMicrocycle2b(client, sourceContextId, sourceMonday).then((row) => {
      if (!cancelled) { setSourcePlan(row); setLoadedSourceKey(`${sourceContextId}:${sourceMonday}`); }
    }).catch(() => {
      if (!cancelled) setSourceError('No se pudo consultar la semana de origen.');
    });
    return () => { cancelled = true; };
  }, [client, sourceContextId, sourceMonday, reloadVersion]);
  useEffect(() => {
    let cancelled = false;
    setTargetPlan(null); setTargetError(''); setLoadedTargetKey('');
    setConfirmOverwrite(false); setSaved(null);
    if (!targetContextId || !targetMonday) return () => { cancelled = true; };
    loadMicrocycle2b(client, targetContextId, targetMonday).then((row) => {
      if (!cancelled) { setTargetPlan(row); setLoadedTargetKey(`${targetContextId}:${targetMonday}`); }
    }).catch(() => {
      if (!cancelled) setTargetError('No se pudo consultar la semana de destino.');
    });
    return () => { cancelled = true; };
  }, [client, targetContextId, targetMonday, reloadVersion]);

  let preview = null;
  let previewError = '';
  if (sourceReady && sourcePlan && targetContext && targetDays.length === 7) {
    try {
      preview = copyMicrocycleDraft(sourcePlan, sourceDays, targetDays,
        includeObservations, targetContext);
    } catch (cause) { previewError = cause.message; }
  }
  const canApply = sourceReady && targetReady && Boolean(preview) && !sameWeek &&
    targetContext?.status === 'open' && (!targetPlan || confirmOverwrite) &&
    !saving && !saved && !retryBlocked;
  const changeWeek = (value, setter) => {
    const days = calendarWeekDays(value);
    setter(days[0] || ''); setSaveError(''); setConfirmOverwrite(false); setSaved(null);
  };
  const apply = async () => {
    if (!canApply) return;
    setSaving(true); setSaveError('');
    try {
      const row = await applyMicrocycleCopy(client, { sourcePlan, sourceContextId, sourceDays,
        targetPlan, targetContextId, targetDays, includeObservations,
        overwriteConfirmed: confirmOverwrite, season: targetContext });
      setSaved(row);
    } catch (cause) {
      setRetryBlocked(true);
      setSaveError(cause?.code === '40001'
        ? 'Otra persona modificó el origen o el destino. Recarga ambas semanas antes de volver a copiar.'
        : `No se pudo confirmar la copia. No repitas el guardado sin comprobar el destino. ${cause?.message || ''}`);
    } finally { setSaving(false); }
  };
  const reload = () => {
    if (saving) return;
    setRetryBlocked(false); setSaveError(''); setLoadedSourceKey(''); setLoadedTargetKey('');
    setReloadVersion((current) => current + 1);
  };

  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/80 p-3 sm:p-6"
    role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="microcycle-copy-title"
      className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/15 bg-[#0b1a2d] p-4 text-slate-100 shadow-2xl sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div><h3 id="microcycle-copy-title" className="text-lg font-black">Copiar planificación</h3>
          <p className="mt-1 text-xs text-slate-300">Se copian solo objetivos y jornadas previstas. No se copian sesiones, partidos ni datos físicos reales.</p></div>
        <button type="button" onClick={onClose} disabled={saving} aria-label="Cerrar copia"
          className="min-h-10 rounded-lg border border-white/20 px-3 text-sm disabled:opacity-50">Cerrar</button>
      </div>
      <fieldset disabled={saving || Boolean(saved)} className="mt-5 grid gap-4 sm:grid-cols-2 disabled:opacity-70">
        <div className="space-y-3 rounded-xl border border-white/10 p-3">
          <h4 className="text-sm font-bold text-sky-200">Origen</h4>
          <label className="block text-xs">Equipo y temporada
            <select value={sourceContextId} onChange={(event) => setSourceContextId(event.target.value)}
              className="mt-1 min-h-10 w-full rounded-lg border border-white/20 bg-[#091428] px-2 text-sm">
              {contexts.map((row) => <option key={row.id} value={row.id}>{contextLabel(row)}</option>)}
            </select></label>
          <label className="block text-xs">Semana de origen
            <input type="date" value={sourceMonday} onChange={(event) => changeWeek(event.target.value, setSourceMonday)}
              className="mt-1 min-h-10 w-full rounded-lg border border-white/20 bg-[#091428] px-2 text-sm" /></label>
          {sourceError ? <p role="alert" className="text-xs text-red-200">{sourceError}</p>
            : sourceReady ? <p className="text-xs text-slate-300">{sourcePlan
              ? `Guardada · revisión ${sourcePlan.revision}` : 'No hay planificación guardada y accesible en esta semana.'}</p>
              : <p className="text-xs text-slate-400">{sourceMonday ? 'Consultando origen…' : 'Selecciona una semana de origen.'}</p>}
        </div>
        <div className="space-y-3 rounded-xl border border-white/10 p-3">
          <h4 className="text-sm font-bold text-sky-200">Destino</h4>
          <label className="block text-xs">Equipo y temporada
            <select value={targetContextId} onChange={(event) => setTargetContextId(event.target.value)}
              className="mt-1 min-h-10 w-full rounded-lg border border-white/20 bg-[#091428] px-2 text-sm">
              {contexts.map((row) => <option key={row.id} value={row.id}>{contextLabel(row)}</option>)}
            </select></label>
          <label className="block text-xs">Semana de destino
            <input type="date" value={targetMonday} onChange={(event) => changeWeek(event.target.value, setTargetMonday)}
              className="mt-1 min-h-10 w-full rounded-lg border border-white/20 bg-[#091428] px-2 text-sm" /></label>
          {targetContext?.status === 'closed' ? <p className="text-xs text-amber-200">Temporada cerrada: solo lectura.</p> : null}
          {targetError ? <p role="alert" className="text-xs text-red-200">{targetError}</p>
            : targetReady ? <p className="text-xs text-slate-300">{targetPlan
              ? `Ya existe planificación · revisión ${targetPlan.revision}` : 'Semana sin planificación: se creará una nueva.'}</p>
              : <p className="text-xs text-slate-400">{targetMonday ? 'Consultando destino…' : 'Selecciona una semana de destino.'}</p>}
        </div>
        <label className="flex items-center gap-2 text-xs sm:col-span-2">
          <input type="checkbox" checked={includeObservations} onChange={(event) => {
            setIncludeObservations(event.target.checked); setConfirmOverwrite(false);
          }} />
          Incluir observaciones semanales y diarias</label>
      </fieldset>
      {sameWeek ? <p className="mt-3 text-xs text-amber-200">Origen y destino deben ser semanas diferentes.</p> : null}
      {previewError ? <p role="alert" className="mt-3 text-xs text-red-200">{previewError}</p> : null}
      {preview && !sameWeek ? <div className="mt-4 rounded-xl border border-sky-300/25 bg-sky-300/[0.04] p-3">
        <h4 className="text-sm font-bold">Vista previa · {label(sourceMonday)} → {label(targetMonday)}</h4>
        <p className="mt-2 text-sm"><strong>Objetivo:</strong> {preview.objective || 'Sin definir'}</p>
        <p className="mt-1 text-xs text-slate-300">{preview.priorities.join(' · ') || 'Sin prioridades'} · Responsable: {preview.responsible || 'Sin definir'}</p>
        <div className="mt-3 grid gap-1 sm:grid-cols-2">{targetDays.map((day) => <p key={day} className="rounded border border-white/10 p-2 text-xs">
          <strong>{new Date(`${day}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}:</strong>{' '}
          {[preview.days[day].type, preview.days[day].objective, preview.days[day].focus,
            preview.days[day].intensity, preview.days[day].durationMinutes ? `${preview.days[day].durationMinutes} min` : '']
            .filter(Boolean).join(' · ') || 'Sin datos previstos'}
        </p>)}</div>
        {targetDays.some((day) => day < targetContext.starts_on || day > targetContext.ends_on) ?
          <p className="mt-2 text-xs text-amber-200">Los días fuera de la temporada de destino permanecerán vacíos.</p> : null}
      </div> : null}
      {targetPlan && targetReady && !saved ? <label className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300/30 p-3 text-xs text-amber-100">
        <input type="checkbox" checked={confirmOverwrite} disabled={saving}
          onChange={(event) => setConfirmOverwrite(event.target.checked)} />
        Confirmo que quiero sustituir la planificación existente del destino. Si cambió desde esta consulta, CAS rechazará la copia.</label> : null}
      {saveError ? <p role="alert" className="mt-3 text-xs text-red-200">{saveError}</p> : null}
      {(saveError || sourceError || targetError) && !saved ? <button type="button" onClick={reload} disabled={saving}
        className="mt-2 rounded-lg border border-white/25 px-3 py-2 text-xs font-bold disabled:opacity-50">
        Recargar origen y destino</button> : null}
      {saved ? <div className="mt-4 flex flex-wrap items-center gap-3">
        <p role="status" className="text-sm text-emerald-200">Copia guardada y verificada · revisión {saved.revision}.</p>
        <button type="button" onClick={() => onOpenDestination(targetContextId, targetMonday)}
          className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-bold text-slate-950">Ver semana destino</button>
      </div> : <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={apply} disabled={!canApply}
          className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-200">
          {saving ? 'Copiando…' : targetPlan ? 'Confirmar sustitución' : 'Confirmar copia'}</button>
        <button type="button" onClick={onClose} disabled={saving}
          className="rounded-lg border border-white/20 px-4 py-2 text-sm disabled:opacity-50">Cancelar</button>
      </div>}
    </section>
  </div>;
}
