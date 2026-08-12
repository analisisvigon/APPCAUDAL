import SetPieceDiagramCanvas from './SetPieceDiagramCanvas';
import SetPieceDiagramEditor from './SetPieceDiagramEditor';
import MatchPlanIdentityLegend from './MatchPlanIdentityLegend';
import {
  MATCH_PLAN_PHASES,
  MATCH_PLAN_TACTICAL_LABELS,
  MATCH_PLAN_TYPES,
  createMatchPlanSituation,
  duplicateMatchPlanSituation,
  getMatchPlanInstructions,
  getMatchPlanPhaseLabel,
  reorderMatchPlanSituations,
  updateMatchPlanSituationMeta,
} from '../../utils/matchPlanPrint';
import { getDrawableSetPieceElements, getSetPieceTacticalMeta } from '../../utils/setPieceProfessional';

const newInstruction = (order) => ({ id: `instruction-${Date.now()}-${order}`, text: '', order });

export default function MatchPlanEditor({ situations = [], selectedId, onSelectedIdChange, onChange, onSave, onDelete, saving, loading, error, status, dirty }) {
  const selected = situations.find((situation) => situation.id === selectedId) || null;
  const updateSituation = (id, nextSituation) => onChange(situations.map((situation) => situation.id === id ? nextSituation : situation));
  const addSituation = (phase) => {
    const situation = createMatchPlanSituation({ phase, order: situations.length + 1 });
    onChange([...situations, situation]);
    onSelectedIdChange(situation.id);
  };
  const duplicateSituation = (situation) => {
    const duplicate = duplicateMatchPlanSituation(situation, situations.length + 1);
    onChange([...situations, duplicate]);
    onSelectedIdChange(duplicate.id);
  };
  const moveSituation = (situation, direction) => onChange(reorderMatchPlanSituations(situations, situation.id, direction));
  const updateMeta = (patch) => updateSituation(selected.id, updateMatchPlanSituationMeta(selected, patch));
  const instructions = selected ? getMatchPlanInstructions(selected) : [];
  const setInstructions = (rows) => updateMeta({ collectiveInstructions: rows.map((row, index) => ({ ...row, order: index + 1 })) });

  return (
    <div data-print-workspace="true" className="print-hidden space-y-5 rounded-3xl border border-white/5 bg-[#091428]/80 p-3 shadow-glow sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div><p className="text-xs font-black uppercase tracking-[0.18em] text-caudal-electric">Plan de partido</p><h4 className="mt-2 text-xl font-black text-white">Situaciones tácticas</h4><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Comportamientos colectivos dibujados por posiciones, independientes de la convocatoria.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => addSituation(MATCH_PLAN_PHASES.WITHOUT_BALL)} className="min-h-11 rounded-2xl bg-white px-4 text-xs font-black text-slate-950">+ Sin balón</button><button type="button" onClick={() => addSituation(MATCH_PLAN_PHASES.WITH_BALL)} className="min-h-11 rounded-2xl bg-white px-4 text-xs font-black text-slate-950">+ Con balón</button><button type="button" onClick={() => onSave(situations)} disabled={saving || loading} className="min-h-11 rounded-2xl bg-caudal-electric px-4 text-xs font-black text-slate-950 disabled:opacity-50">{saving ? 'Guardando...' : error ? 'Reintentar' : 'Guardar plan'}</button></div>
      </div>
      {loading ? <p className="rounded-2xl bg-white/5 p-4 text-sm text-slate-400">Cargando situaciones...</p> : null}
      {error ? <p className="rounded-2xl bg-red-500/10 p-4 text-sm text-red-100">{error}</p> : null}
      {dirty && !error ? <p className="rounded-2xl bg-amber-300/10 p-4 text-sm text-amber-100">Cambios pendientes.</p> : null}
      {status ? <p className="rounded-2xl bg-emerald-400/10 p-4 text-sm text-emerald-100">{status}</p> : null}

      <section aria-label="Galería Plan de partido">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {situations.map((situation, index) => {
            const meta = getSetPieceTacticalMeta(situation.elements);
            return (
              <article key={situation.id} className={`min-w-0 rounded-2xl border p-3 ${selectedId === situation.id ? 'border-caudal-electric/60 bg-caudal-electric/10' : 'border-white/10 bg-white/[0.035]'}`}>
                <button type="button" onClick={() => onSelectedIdChange(situation.id)} className="w-full text-left">
                  <div className="overflow-hidden rounded-xl bg-white p-1 text-black"><div className="aspect-[16/10]"><SetPieceDiagramCanvas elements={getDrawableSetPieceElements(situation.elements)} players={[]} fullField readOnly visibleLayers={meta.displayLayers} identityConvention="match-plan" /></div><MatchPlanIdentityLegend compact /></div>
                  <p className="mt-3 text-[10px] font-black uppercase tracking-[0.14em] text-caudal-electric">{getMatchPlanPhaseLabel(situation)}</p>
                  <h5 className="mt-1 truncate text-sm font-black text-white">{situation.titulo || 'Situación sin título'}</h5>
                </button>
                <div className="mt-3 grid grid-cols-4 gap-1.5"><button type="button" onClick={() => onSelectedIdChange(situation.id)} className="rounded-lg bg-caudal-electric px-2 py-2 text-[9px] font-black text-slate-950">Editar</button><button type="button" onClick={() => duplicateSituation(situation)} className="rounded-lg bg-white/10 px-2 py-2 text-[9px] font-black text-white">Duplicar</button><button type="button" onClick={() => moveSituation(situation, -1)} disabled={index === 0} className="rounded-lg bg-white/10 px-2 py-2 text-[9px] font-black text-white disabled:opacity-30">Subir</button><button type="button" onClick={() => moveSituation(situation, 1)} disabled={index === situations.length - 1} className="rounded-lg bg-white/10 px-2 py-2 text-[9px] font-black text-white disabled:opacity-30">Bajar</button></div>
                <button type="button" onClick={() => onDelete(situation)} className="mt-2 w-full rounded-lg bg-red-500/10 px-2 py-2 text-[9px] font-black text-red-100">Eliminar</button>
              </article>
            );
          })}
        </div>
        {!situations.length && !loading ? <p className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-slate-400">Crea la primera situación con o sin balón.</p> : null}
      </section>

      {selected ? (
        <section data-match-plan-editor="true" className="space-y-4 rounded-3xl border border-white/10 bg-black/15 p-3 sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[180px_1fr]">
            <label className="grid gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Fase<select value={selected.phase} onChange={(event) => updateSituation(selected.id, { ...selected, phase: event.target.value, tipo: MATCH_PLAN_TYPES[event.target.value] })} className="min-h-11 rounded-xl border border-white/10 bg-white px-3 text-sm font-bold normal-case text-slate-950"><option value={MATCH_PLAN_PHASES.WITHOUT_BALL}>Sin balón</option><option value={MATCH_PLAN_PHASES.WITH_BALL}>Con balón</option></select></label>
            <label className="grid gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Título<input value={selected.titulo || ''} onChange={(event) => updateSituation(selected.id, { ...selected, titulo: event.target.value })} placeholder="PRESIÓN ALTA" className="min-h-11 rounded-xl border border-white/10 bg-white px-3 text-sm font-bold normal-case text-slate-950" /></label>
          </div>
          <label className="grid gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Objetivo opcional<textarea value={getSetPieceTacticalMeta(selected.elements).objective} onChange={(event) => updateMeta({ objective: event.target.value })} rows="2" placeholder="Orientar la salida hacia su lateral izquierdo" className="rounded-xl border border-white/10 bg-white px-3 py-2 text-sm font-bold normal-case text-slate-950" /></label>
          <SetPieceDiagramEditor diagram={selected} players={[]} roleOnly editorContext="match-plan" participantRoleOptions={MATCH_PLAN_TACTICAL_LABELS} participantRoleMode="single" fullFieldOverride onChange={(next) => updateSituation(selected.id, next)} />
          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-white">Claves</p><p className="mt-1 text-xs text-slate-500">Consignas colectivas breves; si está vacío no aparece en PDF.</p></div><button type="button" onClick={() => setInstructions([...instructions, newInstruction(instructions.length + 1)])} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-black text-white">Añadir</button></div>
            <div className="mt-3 space-y-2">{instructions.map((instruction, index) => <div key={instruction.id} className="grid grid-cols-[28px_1fr_auto] items-center gap-2"><span className="text-center text-xs font-black text-caudal-electric">{index + 1}</span><input value={instruction.text} onChange={(event) => setInstructions(instructions.map((row) => row.id === instruction.id ? { ...row, text: event.target.value } : row))} className="min-h-10 rounded-xl border border-white/10 bg-white px-3 text-sm font-bold text-slate-950" placeholder="DC orienta hacia fuera" /><div className="flex gap-1"><button type="button" disabled={index === 0} onClick={() => { const next = [...instructions]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setInstructions(next); }} className="h-10 rounded-lg bg-white/10 px-2 text-xs text-white disabled:opacity-30">↑</button><button type="button" disabled={index === instructions.length - 1} onClick={() => { const next = [...instructions]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; setInstructions(next); }} className="h-10 rounded-lg bg-white/10 px-2 text-xs text-white disabled:opacity-30">↓</button><button type="button" onClick={() => setInstructions(instructions.filter((row) => row.id !== instruction.id))} className="h-10 rounded-lg bg-red-500/10 px-2 text-xs text-red-100">×</button></div></div>)}</div>
          </section>
        </section>
      ) : null}
    </div>
  );
}
