import { useEffect, useState } from 'react';
import { blankMicrocycleDraft, hydrateMicrocycleDraft } from '../../data/microcycles2bStore.js';

export const WEEK_PRIORITIES = ['Táctica', 'Técnica', 'Física', 'Estratégica / ABP', 'Recuperación', 'Otros'];
export const DAY_TYPES = ['', 'Entrenamiento', 'Descanso', 'Recuperación', 'Partido', 'Otro'];
export const DAY_FOCUS = ['', 'Táctico', 'Técnico', 'Físico', 'Estratégico / ABP', 'Recuperación', 'Mixto'];
export const DAY_INTENSITIES = ['', 'Muy baja', 'Baja', 'Media', 'Alta', 'Muy alta'];
const INTENSITY_STYLE = {
  'Muy baja': 'border-emerald-300/50 text-emerald-100',
  Baja: 'border-teal-300/50 text-teal-100',
  Media: 'border-sky-300/50 text-sky-100',
  Alta: 'border-amber-300/50 text-amber-100',
  'Muy alta': 'border-orange-300/50 text-orange-100',
};

export const emptyMicrocyclePreview = blankMicrocycleDraft;

const dateLabel = (key) => new Date(`${key}T12:00:00`).toLocaleDateString('es-ES', {
  weekday: 'long', day: 'numeric', month: 'long',
});

export default function MicrocyclePlanningPreview({ days, selectedDay, onSelectDay, onEditingChange,
  plan = null, backendReady = false, previewAllowed = true, canWrite = false,
  loading = false, error = '', saving = false, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => hydrateMicrocycleDraft(plan, days));
  const [saveError, setSaveError] = useState('');
  const baseline = hydrateMicrocycleDraft(plan, days);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  useEffect(() => { if (!editing) setDraft(hydrateMicrocycleDraft(plan, days)); }, [plan, days, editing]);
  useEffect(() => { onEditingChange?.(editing && dirty); }, [editing, dirty, onEditingChange]);
  const day = days.includes(selectedDay) ? selectedDay : days[0];
  const daily = draft.days[day] || emptyMicrocyclePreview([day]).days[day];
  const updateDay = (field, value) => setDraft((current) => ({ ...current,
    days: { ...current.days, [day]: { ...current.days[day], [field]: value } },
  }));
  const cancel = () => {
    setDraft(hydrateMicrocycleDraft(plan, days)); setEditing(false); setSaveError('');
    onEditingChange?.(false);
  };
  const save = async () => {
    if (!backendReady || !canWrite || !dirty || saving || !onSave) return;
    setSaveError('');
    try {
      await onSave(draft);
      setEditing(false);
      onEditingChange?.(false);
    } catch (cause) {
      setSaveError(cause?.code === '40001'
        ? 'Otra edición cambió esta semana. Tus cambios siguen en pantalla; cancela y recarga antes de reintentarlo.'
        : `No se pudo verificar el guardado. Tus cambios siguen en pantalla. ${cause?.message || ''}`);
    }
  };
  return <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4" aria-label="Planificación semanal">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h4 className="text-sm font-black uppercase tracking-wide text-white">Planificación semanal</h4>
        <p className="mt-1 text-xs text-slate-400">{!backendReady
          ? 'Vista previa local: aún no se consulta ni guarda la planificación semanal.'
          : loading ? 'Cargando planificación semanal…'
            : error ? 'No se pudo consultar esta planificación.'
              : plan ? `Planificación guardada · revisión ${plan.revision}` : 'Semana sin planificación guardada.'}</p></div>
      {!editing && !loading && !error && (backendReady ? canWrite : previewAllowed) ? <button type="button" onClick={() => { setDraft(baseline); setEditing(true); }}
        className="min-h-10 rounded-lg border border-sky-300/35 px-3 py-2 text-xs font-bold text-sky-100 hover:bg-sky-300/10">
        Editar planificación</button> : null}
    </div>
    {error ? <p role="alert" className="mt-3 text-sm text-red-200">{error}</p> : null}
    {backendReady && !loading && !error && !canWrite ? <p role="status" className="mt-2 text-xs text-amber-200">
      Solo lectura: falta un equipo-temporada abierto o permiso de escritura.</p> : null}
    {!editing && plan && !error ? <div className="mt-3 space-y-2 text-xs text-slate-200">
      {baseline.objective ? <p><strong>Objetivo:</strong> {baseline.objective}</p> : null}
      {baseline.priorities.length ? <p><strong>Prioridades:</strong> {baseline.priorities.join(' · ')}</p> : null}
      {baseline.responsible ? <p><strong>Responsable:</strong> {baseline.responsible}</p> : null}
      {baseline.observations ? <p className="whitespace-pre-wrap"><strong>Observaciones:</strong> {baseline.observations}</p> : null}
    </div> : null}
    {!editing && plan && !error ? <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-7" aria-label="Intensidad semanal prevista">
      {days.map((key) => <div key={key} className={`rounded-md border px-2 py-1.5 text-[11px] ${INTENSITY_STYLE[baseline.days[key].intensity] || 'border-white/15 text-slate-400'}`}>
        <span className="block font-bold capitalize">{new Date(`${key}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short' })}</span>
        <span>{baseline.days[key].intensity || 'Sin asignar'}</span>
        {baseline.days[key].type || baseline.days[key].objective ? <span className="block break-words">{[baseline.days[key].type, baseline.days[key].objective].filter(Boolean).join(' · ')}</span> : null}
      </div>)}
    </div> : null}
    {editing ? <div className="mt-4 space-y-4">
      {!backendReady ? <p role="status" className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-xs text-amber-100">
        Vista previa local: estos datos no se guardan. La persistencia segura está pendiente de aprobación.</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs text-slate-200">Objetivo principal
          <textarea value={draft.objective} onChange={(event) => setDraft((current) => ({ ...current, objective: event.target.value }))}
            className="mt-1 min-h-20 w-full rounded-lg border border-white/20 bg-[#091428] p-2 text-sm text-white" /></label>
        <label className="text-xs text-slate-200">Observaciones del cuerpo técnico
          <textarea value={draft.observations} onChange={(event) => setDraft((current) => ({ ...current, observations: event.target.value }))}
            className="mt-1 min-h-20 w-full rounded-lg border border-white/20 bg-[#091428] p-2 text-sm text-white" />
          <span className="mt-1 block text-[11px] text-slate-400">No incluyas diagnósticos ni datos clínicos individuales.</span></label>
      </div>
      <fieldset className="text-xs text-slate-200"><legend className="mb-2">Prioridades de la semana</legend>
        <div className="flex flex-wrap gap-2">{WEEK_PRIORITIES.map((priority) => <label key={priority}
          className="flex items-center gap-2 rounded-lg border border-white/15 px-2 py-1.5">
          <input type="checkbox" checked={draft.priorities.includes(priority)} onChange={(event) => setDraft((current) => ({ ...current,
            priorities: event.target.checked ? [...current.priorities, priority] : current.priorities.filter((item) => item !== priority),
          }))} />{priority}</label>)}</div>
      </fieldset>
      <label className="block max-w-sm text-xs text-slate-200">Responsable (opcional)
        <input value={draft.responsible} onChange={(event) => setDraft((current) => ({ ...current, responsible: event.target.value }))}
          className="mt-1 w-full rounded-lg border border-white/20 bg-[#091428] p-2 text-sm text-white" /></label>
      <div className="border-t border-white/10 pt-4">
        <h5 className="text-xs font-black uppercase tracking-wide text-sky-200">Planificación del día</h5>
        <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-7" aria-label="Vista previa de intensidad semanal no guardada">
          {days.map((key) => {
            const intensity = draft.days[key]?.intensity || '';
            return <div key={key} className={`rounded-md border px-2 py-1.5 text-[11px] ${INTENSITY_STYLE[intensity] || 'border-white/15 text-slate-400'}`}>
              <span className="block font-bold capitalize">{new Date(`${key}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short' })}</span>
              <span>{intensity || 'Sin asignar'}</span>
            </div>;
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">{days.map((key) => <button type="button" key={key}
          onClick={() => onSelectDay(key)} aria-pressed={day === key}
          className={`min-h-9 rounded-lg border px-2 text-xs ${day === key ? 'border-sky-300 bg-sky-300/15 text-white' : 'border-white/15 text-slate-300'}`}>
          {new Date(`${key}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })}</button>)}</div>
        <p className="mt-3 text-xs capitalize text-slate-300">{dateLabel(day)}</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label className="text-xs text-slate-200">Tipo de jornada
            <select value={daily.type} onChange={(event) => updateDay('type', event.target.value)}
              className="mt-1 w-full rounded-lg border border-white/20 bg-[#091428] p-2 text-sm text-white">
              {DAY_TYPES.map((value) => <option key={value} value={value}>{value || 'Sin asignar'}</option>)}</select></label>
          <label className="text-xs text-slate-200">Foco principal
            <select value={daily.focus} onChange={(event) => updateDay('focus', event.target.value)}
              className="mt-1 w-full rounded-lg border border-white/20 bg-[#091428] p-2 text-sm text-white">
              {DAY_FOCUS.map((value) => <option key={value} value={value}>{value || 'Sin asignar'}</option>)}</select></label>
          <label className="text-xs text-slate-200">Intensidad prevista (no es RPE)
            <select value={daily.intensity} onChange={(event) => updateDay('intensity', event.target.value)}
              className="mt-1 w-full rounded-lg border border-white/20 bg-[#091428] p-2 text-sm text-white">
              {DAY_INTENSITIES.map((value) => <option key={value} value={value}>{value || 'Sin asignar'}</option>)}</select></label>
          <label className="text-xs text-slate-200">Objetivo del día
            <input value={daily.objective} onChange={(event) => updateDay('objective', event.target.value)}
              className="mt-1 w-full rounded-lg border border-white/20 bg-[#091428] p-2 text-sm text-white" /></label>
          <label className="text-xs text-slate-200">Duración prevista de jornada · min (separada de sesiones)
            <input type="number" min="1" step="1" value={daily.durationMinutes}
              onChange={(event) => {
                const value = event.target.value;
                if (value === '' || /^[1-9]\d*$/.test(value)) updateDay('durationMinutes', value);
              }}
              className="mt-1 w-full rounded-lg border border-white/20 bg-[#091428] p-2 text-sm text-white" /></label>
          <label className="text-xs text-slate-200">Observaciones diarias
            <textarea value={daily.observations} onChange={(event) => updateDay('observations', event.target.value)}
              className="mt-1 min-h-10 w-full rounded-lg border border-white/20 bg-[#091428] p-2 text-sm text-white" /></label>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={!backendReady || !canWrite || saving || !dirty}
          className="rounded-lg bg-sky-500 px-4 py-2 text-xs font-bold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-200 disabled:opacity-60">
          {saving ? 'Guardando…' : backendReady ? 'Guardar' : 'Guardar (pendiente de backend)'}</button>
        <button type="button" onClick={cancel} className="rounded-lg border border-white/20 px-4 py-2 text-xs font-bold text-white">Cancelar</button>
      </div>
      {saveError ? <p role="alert" className="text-xs text-red-200">{saveError}</p> : null}
    </div> : null}
  </section>;
}
