import { useEffect, useMemo, useState } from 'react';

import {
  MATCH_PLAN_PHASES,
  createMatchPlanWorkspace,
  moveMatchPlanCard,
} from '../../utils/matchPlanWorkspace.js';

const priorityTone = {
  'Crítica': 'border-rose-300/25 bg-rose-300/[0.10] text-rose-100',
  Importante: 'border-amber-300/20 bg-amber-300/[0.08] text-amber-100',
  Opcional: 'border-slate-300/15 bg-slate-300/[0.06] text-slate-300',
};

const phaseTone = {
  with_ball: 'from-cyan-400/20 via-cyan-400/[0.04] to-transparent text-cyan-100',
  without_ball: 'from-violet-400/20 via-violet-400/[0.04] to-transparent text-violet-100',
  transition: 'from-amber-400/20 via-amber-400/[0.04] to-transparent text-amber-100',
  set_piece: 'from-emerald-400/20 via-emerald-400/[0.04] to-transparent text-emerald-100',
};

const clean = (value) => String(value ?? '').trim();
const makeId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function SourceChips({ sources = [] }) {
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Fuentes de la consigna">
      {sources.map((source) => (
        <span key={source} className="rounded-full border border-white/[0.09] bg-white/[0.035] px-2 py-1 text-[8px] font-black uppercase tracking-[0.08em] text-slate-400">
          {source}
        </span>
      ))}
    </div>
  );
}

function ImprovementProposal({ proposal, onChange, onAccept, onReject }) {
  if (!proposal) return null;
  if (proposal.unavailable) {
    return (
      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-dashed border-white/10 bg-black/15 px-3 py-2.5">
        <p className="text-xs font-semibold text-slate-500">No existe una mejora respaldada por los datos actuales.</p>
        <button type="button" onClick={onReject} className="shrink-0 text-[9px] font-black uppercase text-slate-400">Cerrar</button>
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-2xl border border-caudal-electric/20 bg-caudal-electric/[0.055] p-3" data-testid="match-plan-proposal">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[9px] font-black uppercase tracking-[0.15em] text-caudal-electric">Propuesta pendiente</p>
        <span className="text-[8px] font-black uppercase text-slate-500">La IA no aplica cambios</span>
      </div>
      <textarea
        value={proposal.action}
        onChange={(event) => onChange({ ...proposal, action: event.target.value })}
        rows={2}
        className="mt-2 min-h-16 w-full resize-none rounded-xl border border-white/10 bg-[#07111f] px-3 py-2 text-sm font-bold leading-5 text-white outline-none focus:border-caudal-electric/40"
        aria-label="Editar propuesta"
      />
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onReject} className="min-h-9 rounded-lg border border-white/10 px-3 py-2 text-[9px] font-black uppercase text-slate-300">Rechazar</button>
        <button type="button" onClick={onAccept} disabled={!clean(proposal.action)} className="min-h-9 rounded-lg bg-caudal-electric px-3 py-2 text-[9px] font-black uppercase text-slate-950 disabled:opacity-40">Aceptar propuesta</button>
      </div>
    </div>
  );
}

function PlanCard({
  card,
  phase,
  mode,
  plays,
  editing,
  onEdit,
  onChange,
  onDuplicate,
  onDelete,
  onStatus,
  onExecute,
  onOpenPlay,
  onDragStart,
  onDrop,
}) {
  const presentation = mode === 'presentation';
  const live = mode === 'live';
  const linkedPlay = plays.find((play) => String(play.id) === String(card.playId));

  return (
    <article
      draggable={mode === 'workspace' && !editing}
      onDragStart={() => onDragStart(card.id)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => { event.preventDefault(); event.stopPropagation(); onDrop(card.id); }}
      className={`group rounded-[1.35rem] border p-4 transition ${card.status === 'discarded' ? 'border-white/[0.05] bg-black/10 opacity-45' : card.executed ? 'border-emerald-300/25 bg-emerald-300/[0.065]' : 'border-white/[0.075] bg-[#0b1729] hover:border-white/[0.14]'}`}
      data-plan-card={card.id}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] ${priorityTone[card.priority]}`}>{card.priority}</span>
          <span className="rounded-full border border-white/[0.08] bg-black/15 px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-slate-400">Plan {card.plan}</span>
          {card.status === 'confirmed' ? <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-2 py-1 text-[8px] font-black uppercase text-emerald-100">Confirmada</span> : null}
          {card.status === 'discarded' ? <span className="rounded-full border border-slate-300/15 px-2 py-1 text-[8px] font-black uppercase text-slate-400">Descartada</span> : null}
          {card.executed ? <span className="rounded-full bg-emerald-400 px-2 py-1 text-[8px] font-black uppercase text-slate-950">Ejecutada</span> : null}
        </div>
        {!presentation && !live ? <span aria-label="Arrastrar consigna" title="Arrastrar para reordenar" className="cursor-grab select-none text-lg leading-none text-slate-600">::</span> : null}
      </div>

      {editing ? (
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">
            Acción
            <textarea value={card.action} onChange={(event) => onChange({ action: event.target.value })} rows={2} className="min-h-16 resize-none rounded-xl border border-white/10 bg-[#07111f] px-3 py-2 text-sm font-bold normal-case leading-5 tracking-normal text-white outline-none" />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">Prioridad<select value={card.priority} onChange={(event) => onChange({ priority: event.target.value })} className="h-10 rounded-xl border border-white/10 bg-[#07111f] px-3 text-xs font-bold normal-case text-white"><option>Crítica</option><option>Importante</option><option>Opcional</option></select></label>
            <label className="grid gap-1 text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">Plan<select value={card.plan} onChange={(event) => onChange({ plan: event.target.value })} className="h-10 rounded-xl border border-white/10 bg-[#07111f] px-3 text-xs font-bold normal-case text-white"><option value="A">Plan A</option><option value="B">Plan B</option></select></label>
          </div>
          <label className="grid gap-1 text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">Impacto esperado<input value={card.impact} onChange={(event) => onChange({ impact: event.target.value })} className="h-10 rounded-xl border border-white/10 bg-[#07111f] px-3 text-xs font-semibold normal-case text-white outline-none" /></label>
          <label className="grid gap-1 text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">Explicación<textarea value={card.explanation} onChange={(event) => onChange({ explanation: event.target.value })} rows={2} className="min-h-16 resize-none rounded-xl border border-white/10 bg-[#07111f] px-3 py-2 text-xs font-semibold normal-case leading-5 text-white outline-none" /></label>
          <fieldset>
            <legend className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">Fuentes</legend>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {['Perfil', 'Evidencias', 'Pizarra', 'Conexiones', 'Vídeo', 'Staff'].map((source) => {
                const active = card.sources.includes(source);
                return <button key={source} type="button" aria-pressed={active} onClick={() => onChange({ sources: active ? card.sources.filter((row) => row !== source) : [...card.sources, source] })} className={`rounded-full border px-2.5 py-1.5 text-[8px] font-black uppercase ${active ? 'border-caudal-electric/30 bg-caudal-electric/10 text-caudal-electric' : 'border-white/10 text-slate-500'}`}>{source}</button>;
              })}
            </div>
          </fieldset>
          <label className="grid gap-1 text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">Jugada vinculada<select value={card.playId} onChange={(event) => onChange({ playId: event.target.value })} className="h-10 min-w-0 rounded-xl border border-white/10 bg-[#07111f] px-3 text-xs font-bold normal-case text-white"><option value="">Sin jugada vinculada</option>{plays.map((play) => <option key={play.id} value={play.id}>{play.name}</option>)}</select></label>
          <button type="button" onClick={onEdit} className="min-h-10 rounded-xl bg-caudal-electric px-4 py-2 text-xs font-black text-slate-950">Terminar edición</button>
        </div>
      ) : (
        <>
          <h4 className="mt-3 text-base font-black leading-6 text-white">{card.action}</h4>
          {card.impact ? <p className="mt-2 text-xs font-semibold leading-5 text-slate-400"><span className="text-slate-600">Impacto</span> · {card.impact}</p> : <p className="mt-2 text-xs font-semibold text-slate-600">Impacto pendiente de validar</p>}
          <div className="mt-3"><SourceChips sources={card.sources} /></div>
          {card.explanation ? <details className="mt-3 rounded-xl bg-black/15 px-3 py-2"><summary className="cursor-pointer text-[9px] font-black uppercase text-slate-400">Por qué</summary><p className="mt-2 text-xs font-semibold leading-5 text-slate-300">{card.explanation}</p></details> : null}
          {linkedPlay ? <button type="button" onClick={() => onOpenPlay(phase, linkedPlay.id)} className="mt-3 text-[9px] font-black uppercase text-caudal-electric">Abrir en Pizarra · {linkedPlay.name}</button> : null}
        </>
      )}

      {!presentation && !editing ? (
        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-white/[0.06] pt-3">
          {live ? (
            <>
              <button type="button" onClick={onExecute} className={`min-h-9 rounded-lg px-3 py-2 text-[9px] font-black uppercase ${card.executed ? 'border border-emerald-300/20 text-emerald-100' : 'bg-emerald-400 text-slate-950'}`}>{card.executed ? 'Desmarcar' : 'Marcar ejecutada'}</button>
              <select value={card.priority} onChange={(event) => onChange({ priority: event.target.value })} aria-label={`Prioridad de ${card.action}`} className="h-9 rounded-lg border border-white/10 bg-[#07111f] px-2 text-[9px] font-black uppercase text-white"><option>Crítica</option><option>Importante</option><option>Opcional</option></select>
            </>
          ) : (
            <>
              <button type="button" onClick={onEdit} className="min-h-9 rounded-lg border border-white/10 px-3 py-2 text-[9px] font-black uppercase text-slate-300">Editar</button>
              <button type="button" onClick={onDuplicate} className="min-h-9 rounded-lg border border-white/10 px-3 py-2 text-[9px] font-black uppercase text-slate-300">Duplicar</button>
              <button type="button" onClick={() => onStatus(card.status === 'confirmed' ? 'draft' : 'confirmed')} className="min-h-9 rounded-lg border border-emerald-300/20 px-3 py-2 text-[9px] font-black uppercase text-emerald-100">{card.status === 'confirmed' ? 'Reabrir' : 'Confirmar'}</button>
              <button type="button" onClick={() => onStatus(card.status === 'discarded' ? 'draft' : 'discarded')} className="min-h-9 rounded-lg border border-amber-300/15 px-3 py-2 text-[9px] font-black uppercase text-amber-100">{card.status === 'discarded' ? 'Recuperar' : 'Descartar'}</button>
              <button type="button" onClick={onDelete} className="min-h-9 rounded-lg border border-rose-300/15 px-3 py-2 text-[9px] font-black uppercase text-rose-200">Eliminar</button>
            </>
          )}
        </div>
      ) : null}
    </article>
  );
}

export default function MatchPlanWorkspace({
  matchKey,
  rivalName,
  storedWorkspace,
  seed,
  insights = {},
  plays = [],
  onSave,
  onOpenPlay,
}) {
  const initialWorkspace = useMemo(() => createMatchPlanWorkspace({ stored: storedWorkspace, seed: { ...seed, insights } }), [matchKey, storedWorkspace?.updatedAt]);
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [mode, setMode] = useState('workspace');
  const [editingCardId, setEditingCardId] = useState('');
  const [draggedCard, setDraggedCard] = useState(null);
  const [newCardPhase, setNewCardPhase] = useState('');
  const [newCardAction, setNewCardAction] = useState('');
  const [proposals, setProposals] = useState({});
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  useEffect(() => {
    setWorkspace(initialWorkspace);
    setDirty(false);
    setSaveStatus('');
    setEditingCardId('');
    setProposals({});
  }, [initialWorkspace]);

  const applyWorkspace = (updater) => {
    setWorkspace((current) => typeof updater === 'function' ? updater(current) : updater);
    setDirty(true);
    setSaveStatus('');
  };

  const updateCard = (phase, cardId, patch) => applyWorkspace((current) => ({
    ...current,
    phases: {
      ...current.phases,
      [phase]: current.phases[phase].map((card) => card.id === cardId ? { ...card, ...patch } : card),
    },
  }));

  const addCard = (phase, proposal = null) => {
    const action = clean(proposal?.action || newCardAction);
    if (!action) return;
    const insight = insights[MATCH_PLAN_PHASES.find((row) => row.key === phase)?.label] || {};
    const nextCard = {
      id: makeId(`plan-${phase}`),
      action,
      priority: proposal?.priority || 'Importante',
      impact: clean(proposal?.impact || insight.proposedAction),
      explanation: clean(proposal?.explanation || (/información insuficiente/i.test(clean(insight.conclusion)) ? '' : insight.conclusion)),
      sources: proposal?.sources?.length ? proposal.sources : (insight.sources?.length ? ['Pizarra'] : ['Staff']),
      status: 'draft',
      plan: 'A',
      playId: '',
      executed: false,
    };
    applyWorkspace((current) => ({ ...current, phases: { ...current.phases, [phase]: [...current.phases[phase], nextCard] } }));
    setNewCardAction('');
    setNewCardPhase('');
    setEditingCardId(nextCard.id);
  };

  const requestImprovement = (blockKey) => {
    if (blockKey === 'executive') {
      const priorities = MATCH_PLAN_PHASES.flatMap(({ key }) => workspace.phases[key]).filter((card) => card.status !== 'discarded' && card.plan === 'A').slice(0, 2).map((card) => card.action);
      setProposals((current) => ({ ...current, executive: priorities.length ? { action: priorities.join(' · '), sources: ['Plan validado'] } : { unavailable: true } }));
      return;
    }
    if (blockKey === 'checklist') {
      const missing = workspace.checklist.filter((item) => !item.checked).map((item) => item.text);
      setProposals((current) => ({ ...current, checklist: missing.length ? { action: `Priorizar antes del partido: ${missing.slice(0, 2).join(' y ')}`, sources: ['Checklist'] } : { unavailable: true } }));
      return;
    }
    const label = MATCH_PLAN_PHASES.find((phase) => phase.key === blockKey)?.label;
    const insight = insights[label] || {};
    const action = clean(insight.proposedAction);
    setProposals((current) => ({
      ...current,
      [blockKey]: action && !/registrar y validar/i.test(action)
        ? { action, impact: clean(insight.conclusion), explanation: clean(insight.evidence?.join?.(' · ')), sources: insight.sources?.length ? ['Pizarra', 'Evidencias'] : ['Perfil'] }
        : { unavailable: true },
    }));
  };

  const acceptProposal = (blockKey) => {
    const proposal = proposals[blockKey];
    if (!proposal || proposal.unavailable) return;
    if (blockKey === 'executive') {
      applyWorkspace((current) => ({ ...current, executive: { ...current.executive, objective: proposal.action } }));
    } else if (blockKey === 'checklist') {
      applyWorkspace((current) => ({ ...current, checklist: [...current.checklist, { id: makeId('check'), text: proposal.action, checked: false }] }));
    } else addCard(blockKey, proposal);
    setProposals((current) => ({ ...current, [blockKey]: null }));
  };

  const saveWorkspace = async () => {
    setSaveStatus('Guardando');
    const next = { ...workspace, updatedAt: new Date().toISOString() };
    try {
      await onSave?.(next);
      setWorkspace(next);
      setDirty(false);
      setSaveStatus('Guardado');
    } catch {
      setSaveStatus('Error al guardar');
    }
  };

  const visibleCards = (phase) => workspace.phases[phase].filter((card) => {
    if (mode === 'presentation') return card.status === 'confirmed' && card.plan === (workspace.live.planBActive ? 'B' : 'A');
    if (mode === 'live') return card.status !== 'discarded' && card.plan === (workspace.live.planBActive ? 'B' : 'A');
    return true;
  });

  const presentation = mode === 'presentation';
  const live = mode === 'live';

  return (
    <section className={`${presentation ? 'fixed inset-0 z-50 overflow-y-auto bg-[#040b16] p-4 sm:p-8' : 'order-1 xl:col-span-2'} min-w-0`} data-testid="match-plan-workspace">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <header className="rounded-[2rem] border border-white/[0.08] bg-[radial-gradient(circle_at_15%_0%,rgba(61,217,255,0.12),transparent_38%),linear-gradient(135deg,#0c1b31,#07111f)] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.30)] sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-caudal-electric">Centro operativo · {rivalName || 'Rival'}</p>
              <h2 className="mt-2 text-2xl font-black text-white sm:text-4xl">Plan de partido</h2>
              <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-400">La IA propone. El cuerpo técnico edita, valida y decide.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!presentation ? <button type="button" onClick={() => setMode('workspace')} aria-pressed={mode === 'workspace'} className={`min-h-10 rounded-xl px-4 py-2 text-[10px] font-black uppercase ${mode === 'workspace' ? 'bg-white text-slate-950' : 'border border-white/10 text-slate-300'}`}>Trabajo</button> : null}
              {!presentation ? <button type="button" onClick={() => setMode('live')} aria-pressed={live} className={`min-h-10 rounded-xl px-4 py-2 text-[10px] font-black uppercase ${live ? 'bg-rose-400 text-slate-950' : 'border border-white/10 text-slate-300'}`}>En directo</button> : null}
              <button type="button" onClick={() => setMode(presentation ? 'workspace' : 'presentation')} className="min-h-10 rounded-xl border border-caudal-electric/25 bg-caudal-electric/[0.08] px-4 py-2 text-[10px] font-black uppercase text-caudal-electric">{presentation ? 'Salir de presentación' : 'Presentar al equipo'}</button>
              {!presentation ? <button type="button" onClick={saveWorkspace} disabled={!dirty || saveStatus === 'Guardando'} className="min-h-10 rounded-xl bg-caudal-electric px-5 py-2 text-[10px] font-black uppercase text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">{saveStatus === 'Guardando' ? 'Guardando...' : dirty ? 'Guardar plan' : saveStatus || 'Plan guardado'}</button> : null}
            </div>
          </div>
          {live ? (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-300/15 bg-rose-300/[0.055] px-4 py-3">
              <div><p className="text-[9px] font-black uppercase tracking-[0.14em] text-rose-200">Modo partido</p><p className="mt-1 text-xs font-semibold text-slate-400">Marca ejecuciones y ajusta prioridades sin perder el plan preparado.</p></div>
              <button type="button" onClick={() => applyWorkspace((current) => ({ ...current, live: { ...current.live, planBActive: !current.live.planBActive } }))} className={`min-h-10 rounded-xl px-4 py-2 text-[10px] font-black uppercase ${workspace.live.planBActive ? 'bg-amber-300 text-slate-950' : 'border border-amber-300/20 text-amber-100'}`}>{workspace.live.planBActive ? 'Plan B activo' : 'Activar Plan B'}</button>
            </div>
          ) : null}
        </header>

        <section className="rounded-[1.8rem] border border-white/[0.07] bg-[#091528] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-caudal-electric">Plan ejecutivo</p><h3 className="mt-1 text-xl font-black text-white">Cuatro decisiones</h3></div>{!presentation && !live ? <button type="button" onClick={() => requestImprovement('executive')} className="min-h-9 rounded-xl border border-caudal-electric/20 px-3 py-2 text-[9px] font-black uppercase text-caudal-electric">Mejorar</button> : null}</div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['Objetivo principal', 'objective'],
              ['Prioridad ofensiva', 'attackPriority'],
              ['Prioridad defensiva', 'defensePriority'],
              ['Riesgo principal', 'mainRisk'],
            ].map(([label, field]) => (
              <label key={field} className="grid gap-2 rounded-2xl border border-white/[0.07] bg-black/15 p-4 text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
                {label}
                {presentation ? <span className="text-base font-black normal-case leading-6 tracking-normal text-white">{workspace.executive[field] || 'Pendiente de validar'}</span> : <textarea value={workspace.executive[field]} onChange={(event) => applyWorkspace((current) => ({ ...current, executive: { ...current.executive, [field]: event.target.value } }))} rows={3} className="min-h-20 resize-none rounded-xl border border-white/10 bg-[#07111f] px-3 py-2 text-sm font-bold normal-case leading-5 tracking-normal text-white outline-none focus:border-caudal-electric/40" />}
              </label>
            ))}
          </div>
          {!presentation && !live ? <ImprovementProposal proposal={proposals.executive} onChange={(proposal) => setProposals((current) => ({ ...current, executive: proposal }))} onAccept={() => acceptProposal('executive')} onReject={() => setProposals((current) => ({ ...current, executive: null }))} /> : null}
        </section>

        <div className="grid items-start gap-5 xl:grid-cols-2">
          {MATCH_PLAN_PHASES.map((phase) => {
            const phasePlays = plays.filter((play) => play.phase === phase.boardPhase);
            const rows = visibleCards(phase.key);
            return (
              <section key={phase.key} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (draggedCard) applyWorkspace((current) => moveMatchPlanCard(current, draggedCard.phase, draggedCard.id, phase.key)); setDraggedCard(null); }} className={`rounded-[1.8rem] border border-white/[0.07] bg-gradient-to-br ${phaseTone[phase.key]} p-5 sm:p-6`}>
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-[9px] font-black uppercase tracking-[0.18em] opacity-70">Fase</p><h3 className="mt-1 text-2xl font-black text-white">{phase.label}</h3><p className="mt-1 text-xs font-semibold text-slate-500">{rows.length} consigna{rows.length === 1 ? '' : 's'} visible{rows.length === 1 ? '' : 's'}</p></div>
                  {!presentation && !live ? <div className="flex gap-2"><button type="button" onClick={() => requestImprovement(phase.key)} className="min-h-9 rounded-xl border border-white/10 px-3 py-2 text-[9px] font-black uppercase text-slate-200">Mejorar</button><button type="button" onClick={() => { setNewCardPhase(phase.key); setNewCardAction(''); }} className="min-h-9 rounded-xl bg-white px-3 py-2 text-[9px] font-black uppercase text-slate-950">+ Añadir</button></div> : null}
                </div>
                {!presentation && !live ? <ImprovementProposal proposal={proposals[phase.key]} onChange={(proposal) => setProposals((current) => ({ ...current, [phase.key]: proposal }))} onAccept={() => acceptProposal(phase.key)} onReject={() => setProposals((current) => ({ ...current, [phase.key]: null }))} /> : null}
                {newCardPhase === phase.key && !presentation && !live ? <form onSubmit={(event) => { event.preventDefault(); addCard(phase.key); }} className="mt-4 flex gap-2 rounded-2xl border border-caudal-electric/20 bg-black/15 p-3"><input autoFocus value={newCardAction} onChange={(event) => setNewCardAction(event.target.value)} placeholder="Escribe una consigna accionable..." className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-[#07111f] px-3 text-sm font-bold text-white outline-none" /><button type="submit" disabled={!clean(newCardAction)} className="rounded-xl bg-caudal-electric px-4 text-[9px] font-black uppercase text-slate-950 disabled:opacity-40">Crear</button><button type="button" onClick={() => setNewCardPhase('')} className="rounded-xl border border-white/10 px-3 text-[9px] font-black uppercase text-slate-300">Cancelar</button></form> : null}
                <div className="mt-4 space-y-3">
                  {rows.length ? rows.map((card) => (
                    <PlanCard
                      key={card.id}
                      card={card}
                      phase={phase.key}
                      mode={mode}
                      plays={phasePlays}
                      editing={editingCardId === card.id}
                      onEdit={() => setEditingCardId((current) => current === card.id ? '' : card.id)}
                      onChange={(patch) => updateCard(phase.key, card.id, patch)}
                      onDuplicate={() => applyWorkspace((current) => ({ ...current, phases: { ...current.phases, [phase.key]: [...current.phases[phase.key], { ...card, id: makeId(`plan-${phase.key}`), action: `${card.action} (copia)`, status: 'draft', executed: false }] } }))}
                      onDelete={() => { if (window.confirm('Eliminar esta consigna del plan?')) applyWorkspace((current) => ({ ...current, phases: { ...current.phases, [phase.key]: current.phases[phase.key].filter((row) => row.id !== card.id) } })); }}
                      onStatus={(status) => updateCard(phase.key, card.id, { status })}
                      onExecute={() => updateCard(phase.key, card.id, { executed: !card.executed })}
                      onOpenPlay={(cardPhase, playId) => onOpenPlay?.(cardPhase, playId)}
                      onDragStart={(cardId) => setDraggedCard({ phase: phase.key, id: cardId })}
                      onDrop={(targetId) => { if (draggedCard) applyWorkspace((current) => moveMatchPlanCard(current, draggedCard.phase, draggedCard.id, phase.key, targetId)); setDraggedCard(null); }}
                    />
                  )) : <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-5 text-center text-xs font-semibold text-slate-500">{presentation ? 'Sin consignas confirmadas.' : workspace.live.planBActive ? 'No hay consignas activas en el Plan B.' : 'Añade o acepta una propuesta para construir esta fase.'}</div>}
                </div>
              </section>
            );
          })}
        </div>

        <section className="rounded-[1.8rem] border border-white/[0.07] bg-[#091528] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-caudal-electric">Prepartido</p><h3 className="mt-1 text-xl font-black text-white">Checklist del cuerpo técnico</h3></div>{!presentation && !live ? <div className="flex gap-2"><button type="button" onClick={() => requestImprovement('checklist')} className="min-h-9 rounded-xl border border-caudal-electric/20 px-3 py-2 text-[9px] font-black uppercase text-caudal-electric">Mejorar</button><button type="button" onClick={() => applyWorkspace((current) => ({ ...current, checklist: [...current.checklist, { id: makeId('check'), text: 'Nuevo punto', checked: false }] }))} className="min-h-9 rounded-xl bg-white px-3 py-2 text-[9px] font-black uppercase text-slate-950">+ Añadir</button></div> : null}</div>
          {!presentation && !live ? <ImprovementProposal proposal={proposals.checklist} onChange={(proposal) => setProposals((current) => ({ ...current, checklist: proposal }))} onAccept={() => acceptProposal('checklist')} onReject={() => setProposals((current) => ({ ...current, checklist: null }))} /> : null}
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {workspace.checklist.map((item, itemIndex) => (
              <div key={item.id} className={`flex min-w-0 items-center gap-3 rounded-2xl border px-3 py-3 ${item.checked ? 'border-emerald-300/20 bg-emerald-300/[0.055]' : 'border-white/[0.07] bg-black/15'}`}>
                <input type="checkbox" checked={item.checked} onChange={(event) => applyWorkspace((current) => ({ ...current, checklist: current.checklist.map((row) => row.id === item.id ? { ...row, checked: event.target.checked } : row) }))} className="h-5 w-5 shrink-0 accent-emerald-400" aria-label={`Marcar ${item.text}`} />
                {presentation ? <p className="min-w-0 flex-1 text-sm font-bold text-white">{item.text}</p> : <input value={item.text} onChange={(event) => applyWorkspace((current) => ({ ...current, checklist: current.checklist.map((row) => row.id === item.id ? { ...row, text: event.target.value } : row) }))} className="h-9 min-w-0 flex-1 bg-transparent text-sm font-bold text-white outline-none" />}
                {!presentation && !live ? <div className="flex shrink-0 items-center gap-1"><button type="button" disabled={itemIndex === 0} aria-label={`Subir ${item.text}`} onClick={() => applyWorkspace((current) => { const checklist = [...current.checklist]; [checklist[itemIndex - 1], checklist[itemIndex]] = [checklist[itemIndex], checklist[itemIndex - 1]]; return { ...current, checklist }; })} className="h-8 w-8 rounded-lg border border-white/10 text-xs font-black text-slate-300 disabled:opacity-20">↑</button><button type="button" disabled={itemIndex === workspace.checklist.length - 1} aria-label={`Bajar ${item.text}`} onClick={() => applyWorkspace((current) => { const checklist = [...current.checklist]; [checklist[itemIndex], checklist[itemIndex + 1]] = [checklist[itemIndex + 1], checklist[itemIndex]]; return { ...current, checklist }; })} className="h-8 w-8 rounded-lg border border-white/10 text-xs font-black text-slate-300 disabled:opacity-20">↓</button><button type="button" onClick={() => applyWorkspace((current) => ({ ...current, checklist: current.checklist.filter((row) => row.id !== item.id) }))} className="ml-1 text-[9px] font-black uppercase text-rose-200">Eliminar</button></div> : null}
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
