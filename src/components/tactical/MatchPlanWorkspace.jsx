import { useEffect, useMemo, useState } from 'react';

import {
  MATCH_PLAN_EXECUTIVE_FIELDS,
  MATCH_PLAN_PHASES,
  MATCH_PLAN_PRIORITIES,
  buildMatchPlanImportCandidates,
  createMatchPlanWorkspace,
  duplicateMatchPlanCard,
  moveMatchPlanCard,
  moveMatchPlanCardByOffset,
  moveMatchPlanChecklistItem,
  persistMatchPlanWorkspace,
} from '../../utils/matchPlanWorkspace.js';

const priorityTone = {
  Crítica: 'border-rose-300/30 bg-rose-300/[0.12] text-rose-100',
  Alta: 'border-orange-300/25 bg-orange-300/[0.10] text-orange-100',
  Media: 'border-amber-300/20 bg-amber-300/[0.08] text-amber-100',
  Baja: 'border-slate-300/15 bg-slate-300/[0.06] text-slate-300',
};

const phaseTone = {
  with_ball: 'from-cyan-400/20 via-cyan-400/[0.04] to-transparent text-cyan-100',
  without_ball: 'from-violet-400/20 via-violet-400/[0.04] to-transparent text-violet-100',
  transition: 'from-amber-400/20 via-amber-400/[0.04] to-transparent text-amber-100',
  set_piece: 'from-emerald-400/20 via-emerald-400/[0.04] to-transparent text-emerald-100',
};

const phaseIcon = { with_ball: '↗', without_ball: '◇', transition: '⇄', set_piece: '◎' };
const executiveConfig = [
  { field: 'objective', label: 'Objetivo principal', placeholder: 'Qué queremos conseguir.' },
  { field: 'attackPriority', label: 'Prioridad ofensiva', placeholder: 'Cómo hacerles daño.' },
  { field: 'defensePriority', label: 'Prioridad defensiva', placeholder: 'Qué debemos neutralizar.' },
  { field: 'mainRisk', label: 'Riesgo principal', placeholder: 'Qué no podemos conceder.' },
];
const executiveStateLabel = { pending: 'Pendiente', validated: 'Validada', discarded: 'Descartada' };
const executiveStateTone = {
  pending: 'border-amber-300/20 bg-amber-300/[0.07] text-amber-100',
  validated: 'border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100',
  discarded: 'border-slate-300/15 bg-white/[0.03] text-slate-400',
};

const clean = (value) => String(value ?? '').trim();
const makeId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const formatSavedAgo = (value, now) => {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Guardado';
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 10) return 'Guardado ahora';
  if (seconds < 60) return `Guardado hace ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Guardado hace ${minutes} min`;
  return `Guardado · ${new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp))}`;
};

function SourceChips({ sources = [] }) {
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Fuentes de la consigna">
      {sources.map((source) => (
        <span key={source} className="rounded-full border border-white/[0.09] bg-white/[0.035] px-2 py-1 text-[8px] font-black uppercase tracking-[0.08em] text-slate-400">{source}</span>
      ))}
    </div>
  );
}

function ImprovementProposal({ proposal, onChange, onAccept, onReject }) {
  if (!proposal) return null;
  if (proposal.unavailable) {
    return (
      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-dashed border-white/10 bg-black/15 px-3 py-2.5">
        <p className="text-xs font-semibold text-slate-500">No existe una propuesta respaldada por los datos actuales.</p>
        <button type="button" onClick={onReject} className="shrink-0 text-[9px] font-black uppercase text-slate-400">Cerrar</button>
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-2xl border border-caudal-electric/20 bg-caudal-electric/[0.055] p-3" data-testid="match-plan-proposal">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[9px] font-black uppercase tracking-[0.15em] text-caudal-electric">Propuesta pendiente</p>
        <span className="text-[8px] font-black uppercase text-slate-500">Requiere validación</span>
      </div>
      <textarea value={proposal.action} onChange={(event) => onChange({ ...proposal, action: event.target.value })} rows={2} className="mt-2 min-h-16 w-full resize-none rounded-xl border border-white/10 bg-[#07111f] px-3 py-2 text-sm font-bold leading-5 text-white outline-none focus:border-caudal-electric/40" aria-label="Editar propuesta" />
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onReject} className="min-h-9 rounded-lg border border-white/10 px-3 py-2 text-[9px] font-black uppercase text-slate-300">Rechazar</button>
        <button type="button" onClick={onAccept} disabled={!clean(proposal.action)} className="min-h-9 rounded-lg bg-caudal-electric px-3 py-2 text-[9px] font-black uppercase text-slate-950 disabled:opacity-40">Aceptar propuesta</button>
      </div>
    </div>
  );
}

function PlanCard({
  card, phase, mode, plays, editing, liveExecution = {}, onEdit, onChange, onDuplicate, onDelete,
  onStatus, onLiveChange, onOpenPlay, onDragStart, onDrop, onMoveUp, onMoveDown, onMovePhase,
  onPlanChange, canMoveUp, canMoveDown,
}) {
  const presentation = mode === 'presentation';
  const live = mode === 'live';
  const linkedPlay = plays.find((play) => String(play.id) === String(card.playId));
  const displayedPriority = liveExecution.priority || card.priority;
  const executed = live && Boolean(liveExecution.executed);

  return (
    <article draggable={mode === 'workspace' && !editing} onDragStart={() => onDragStart(card.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); onDrop(card.id); }} className={`group rounded-[1.35rem] border p-4 transition ${card.status === 'discarded' ? 'border-white/[0.05] bg-black/10 opacity-45' : executed ? 'border-emerald-300/25 bg-emerald-300/[0.065]' : 'border-white/[0.075] bg-[#0b1729] hover:border-white/[0.14]'}`} data-plan-card={card.id}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] ${priorityTone[displayedPriority]}`}>{displayedPriority}</span>
          {!presentation ? <span className="rounded-full border border-white/[0.08] bg-black/15 px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-slate-400">Plan {card.plan}</span> : null}
          {!presentation && card.status === 'confirmed' ? <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-2 py-1 text-[8px] font-black uppercase text-emerald-100">Confirmada</span> : null}
          {!presentation && card.status === 'discarded' ? <span className="rounded-full border border-slate-300/15 px-2 py-1 text-[8px] font-black uppercase text-slate-400">Descartada</span> : null}
          {executed ? <span className="rounded-full bg-emerald-400 px-2 py-1 text-[8px] font-black uppercase text-slate-950">Ejecutada</span> : null}
        </div>
        {!presentation && !live ? <span aria-label="Arrastrar consigna" title="Arrastrar para reordenar" className="cursor-grab select-none text-lg leading-none text-slate-600">⠿</span> : null}
      </div>

      {editing ? (
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">Acción<textarea value={card.action} onChange={(event) => onChange({ action: event.target.value })} rows={2} className="min-h-16 resize-none rounded-xl border border-white/10 bg-[#07111f] px-3 py-2 text-sm font-bold normal-case leading-5 tracking-normal text-white outline-none" /></label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">Prioridad<select value={card.priority} onChange={(event) => onChange({ priority: event.target.value })} className="h-10 rounded-xl border border-white/10 bg-[#07111f] px-3 text-xs font-bold normal-case text-white">{MATCH_PLAN_PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
            <label className="grid gap-1 text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">Plan<select value={card.plan} onChange={(event) => onPlanChange(event.target.value)} className="h-10 rounded-xl border border-white/10 bg-[#07111f] px-3 text-xs font-bold normal-case text-white"><option value="A">Plan A</option><option value="B">Plan B</option></select></label>
          </div>
          <label className="grid gap-1 text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">Fase<select value={phase} onChange={(event) => onMovePhase(event.target.value)} className="h-10 rounded-xl border border-white/10 bg-[#07111f] px-3 text-xs font-bold normal-case text-white">{MATCH_PLAN_PHASES.map((row) => <option key={row.key} value={row.key}>{row.label}</option>)}</select></label>
          <label className="grid gap-1 text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">Impacto esperado<input value={card.impact} onChange={(event) => onChange({ impact: event.target.value })} className="h-10 rounded-xl border border-white/10 bg-[#07111f] px-3 text-xs font-semibold normal-case text-white outline-none" /></label>
          <label className="grid gap-1 text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">Explicación<textarea value={card.explanation} onChange={(event) => onChange({ explanation: event.target.value })} rows={2} className="min-h-16 resize-none rounded-xl border border-white/10 bg-[#07111f] px-3 py-2 text-xs font-semibold normal-case leading-5 text-white outline-none" /></label>
          <fieldset><legend className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">Fuentes</legend><div className="mt-2 flex flex-wrap gap-1.5">{['Perfil', 'Evidencias', 'Pizarra', 'Conexiones', 'Vídeo', 'Staff'].map((source) => { const active = card.sources.includes(source); return <button key={source} type="button" aria-pressed={active} onClick={() => onChange({ sources: active ? card.sources.filter((row) => row !== source) : [...card.sources, source] })} className={`rounded-full border px-2.5 py-1.5 text-[8px] font-black uppercase ${active ? 'border-caudal-electric/30 bg-caudal-electric/10 text-caudal-electric' : 'border-white/10 text-slate-500'}`}>{source}</button>; })}</div></fieldset>
          <label className="grid gap-1 text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">Jugada vinculada<select value={card.playId} onChange={(event) => onChange({ playId: event.target.value })} className="h-10 min-w-0 rounded-xl border border-white/10 bg-[#07111f] px-3 text-xs font-bold normal-case text-white"><option value="">Sin jugada vinculada</option>{plays.map((play) => <option key={play.id} value={play.id}>{play.name}</option>)}</select></label>
          <button type="button" onClick={onEdit} className="min-h-10 rounded-xl bg-caudal-electric px-4 py-2 text-xs font-black text-slate-950">Terminar edición</button>
        </div>
      ) : (
        <>
          <h4 className="mt-3 text-base font-black leading-6 text-white">{card.action}</h4>
          {card.impact ? <p className="mt-2 text-xs font-semibold leading-5 text-slate-400"><span className="text-slate-600">Impacto</span> · {card.impact}</p> : !presentation ? <p className="mt-2 text-xs font-semibold text-slate-600">Impacto pendiente de validar</p> : null}
          {!presentation ? <div className="mt-3"><SourceChips sources={card.sources} /></div> : null}
          {!presentation && card.explanation ? <details className="mt-3 rounded-xl bg-black/15 px-3 py-2"><summary className="cursor-pointer text-[9px] font-black uppercase text-slate-400">Por qué</summary><p className="mt-2 text-xs font-semibold leading-5 text-slate-300">{card.explanation}</p></details> : null}
          {!presentation && linkedPlay ? <button type="button" onClick={() => onOpenPlay(phase, linkedPlay.id)} className="mt-3 text-[9px] font-black uppercase text-caudal-electric">Abrir en Pizarra · {linkedPlay.name}</button> : null}
        </>
      )}

      {!presentation && !editing ? (
        <div className="mt-4 border-t border-white/[0.06] pt-3">
          {live ? (
            <div className="grid gap-2 sm:grid-cols-[auto_auto_minmax(160px,1fr)]">
              <button type="button" onClick={() => onLiveChange({ executed: !executed })} className={`min-h-9 rounded-lg px-3 py-2 text-[9px] font-black uppercase ${executed ? 'border border-emerald-300/20 text-emerald-100' : 'bg-emerald-400 text-slate-950'}`}>{executed ? 'Desmarcar' : 'Marcar ejecutada'}</button>
              <select value={displayedPriority} onChange={(event) => onLiveChange({ priority: event.target.value })} aria-label={`Prioridad en directo de ${card.action}`} className="h-9 rounded-lg border border-white/10 bg-[#07111f] px-2 text-[9px] font-black uppercase text-white">{MATCH_PLAN_PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select>
              <input value={liveExecution.observation || ''} onChange={(event) => onLiveChange({ observation: event.target.value })} placeholder="Añadir observación rápida" aria-label={`Observación en directo de ${card.action}`} className="h-9 min-w-0 rounded-lg border border-white/10 bg-[#07111f] px-3 text-xs font-semibold text-white outline-none placeholder:text-slate-600" />
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={onMoveUp} disabled={!canMoveUp} aria-label={`Subir ${card.action}`} title="Subir consigna" className="h-9 w-9 rounded-lg border border-white/10 text-sm font-black text-slate-300 disabled:cursor-not-allowed disabled:opacity-25">↑</button>
              <button type="button" onClick={onMoveDown} disabled={!canMoveDown} aria-label={`Bajar ${card.action}`} title="Bajar consigna" className="h-9 w-9 rounded-lg border border-white/10 text-sm font-black text-slate-300 disabled:cursor-not-allowed disabled:opacity-25">↓</button>
              <button type="button" onClick={onEdit} className="min-h-9 rounded-lg border border-white/10 px-3 py-2 text-[9px] font-black uppercase text-slate-300">Editar</button>
              <button type="button" onClick={onDuplicate} className="min-h-9 rounded-lg border border-white/10 px-3 py-2 text-[9px] font-black uppercase text-slate-300">Duplicar</button>
              <button type="button" onClick={() => onStatus(card.status === 'confirmed' ? 'draft' : 'confirmed')} className="min-h-9 rounded-lg border border-emerald-300/20 px-3 py-2 text-[9px] font-black uppercase text-emerald-100">{card.status === 'confirmed' ? 'Reabrir' : 'Confirmar'}</button>
              <button type="button" onClick={() => onStatus(card.status === 'discarded' ? 'draft' : 'discarded')} className="min-h-9 rounded-lg border border-amber-300/15 px-3 py-2 text-[9px] font-black uppercase text-amber-100">{card.status === 'discarded' ? 'Recuperar' : 'Descartar'}</button>
              <button type="button" onClick={onDelete} className="min-h-9 rounded-lg border border-rose-300/15 px-3 py-2 text-[9px] font-black uppercase text-rose-200">Eliminar</button>
            </div>
          )}
          {live && clean(liveExecution.observation) ? <p className="mt-2 text-xs font-semibold leading-5 text-slate-400">Nota en directo · {liveExecution.observation}</p> : null}
        </div>
      ) : null}
    </article>
  );
}

function ImportRecommendationsDrawer({ phase, candidates, onClose, onImport }) {
  const origins = ['Rival', 'Jugadores', 'Pizarra', 'Evidencias'];
  const [activeOrigin, setActiveOrigin] = useState('Rival');
  const [selectedIds, setSelectedIds] = useState([]);
  const visible = candidates.filter((candidate) => candidate.origins.includes(activeOrigin));
  const selected = candidates.filter((candidate) => selectedIds.includes(candidate.id));
  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={`Importar recomendaciones para ${phase.label}`}>
      <button type="button" onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-label="Cerrar importación" />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col overflow-hidden border-l border-white/10 bg-[#07111f] shadow-[-30px_0_90px_rgba(0,0,0,0.45)]">
        <header className="shrink-0 border-b border-white/10 p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-caudal-electric">Importación manual</p><h3 className="mt-2 text-2xl font-black text-white">{phase.label}</h3><p className="mt-2 text-sm font-semibold text-slate-500">Selecciona qué propuestas quieres copiar como consignas editables.</p></div><button type="button" onClick={onClose} className="h-10 w-10 rounded-xl border border-white/10 text-lg text-slate-300" aria-label="Cerrar">×</button></div></header>
        <div className="shrink-0 overflow-x-auto border-b border-white/[0.07] p-3"><div className="flex min-w-max gap-2">{origins.map((origin) => { const count = candidates.filter((candidate) => candidate.origins.includes(origin)).length; return <button key={origin} type="button" onClick={() => setActiveOrigin(origin)} aria-pressed={activeOrigin === origin} className={`rounded-xl px-3 py-2 text-[9px] font-black uppercase ${activeOrigin === origin ? 'bg-white text-slate-950' : 'border border-white/10 text-slate-400'}`}>{origin} · {count}</button>; })}</div></div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">{visible.length ? <div className="space-y-3">{visible.map((candidate) => { const checked = selectedIds.includes(candidate.id); return <label key={candidate.id} className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition ${checked ? 'border-caudal-electric/35 bg-caudal-electric/[0.07]' : 'border-white/[0.08] bg-white/[0.025]'}`}><input type="checkbox" checked={checked} onChange={() => setSelectedIds((current) => checked ? current.filter((id) => id !== candidate.id) : [...current, candidate.id])} className="mt-0.5 h-4 w-4 shrink-0 accent-caudal-electric" /><span className="min-w-0"><span className="block text-sm font-black leading-5 text-white">{candidate.action}</span>{candidate.impact ? <span className="mt-2 block text-xs font-semibold leading-5 text-slate-400">{candidate.impact}</span> : null}<span className="mt-3 flex flex-wrap gap-1">{candidate.origins.map((origin) => <span key={origin} className="rounded-full border border-white/10 px-2 py-1 text-[8px] font-black uppercase text-slate-500">{origin}</span>)}</span></span></label>; })}</div> : <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center"><p className="text-sm font-bold text-slate-400">No hay propuestas disponibles desde {activeOrigin}.</p><p className="mt-2 text-xs text-slate-600">No se generará contenido nuevo ni se importará automáticamente.</p></div>}</div>
        <footer className="shrink-0 border-t border-white/10 bg-[#091528] p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><p className="text-xs font-bold text-slate-500">{selected.length} seleccionada{selected.length === 1 ? '' : 's'}</p><div className="flex gap-2"><button type="button" onClick={onClose} className="min-h-10 rounded-xl border border-white/10 px-4 text-[9px] font-black uppercase text-slate-300">Cancelar</button><button type="button" disabled={!selected.length} onClick={() => onImport(selected)} className="min-h-10 rounded-xl bg-caudal-electric px-4 text-[9px] font-black uppercase text-slate-950 disabled:opacity-35">Importar seleccionadas</button></div></div></footer>
      </aside>
    </div>
  );
}

export default function MatchPlanWorkspace({ matchKey, rivalName, storedWorkspace, seed, insights = {}, plays = [], onSave, onOpenPlay, onDirtyChange }) {
  const initialWorkspace = useMemo(() => createMatchPlanWorkspace({ stored: storedWorkspace, seed: { ...seed, insights } }), [matchKey, storedWorkspace?.updatedAt]);
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [mode, setMode] = useState('workspace');
  const [editingCardId, setEditingCardId] = useState('');
  const [draggedCard, setDraggedCard] = useState(null);
  const [draggedChecklistId, setDraggedChecklistId] = useState('');
  const [newCardPhase, setNewCardPhase] = useState('');
  const [newCardAction, setNewCardAction] = useState('');
  const [proposals, setProposals] = useState({});
  const [importPhase, setImportPhase] = useState('');
  const [editingChecklistId, setEditingChecklistId] = useState('');
  const [openChecklistMenuId, setOpenChecklistMenuId] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState(storedWorkspace?.updatedAt || '');
  const [selectedPlan, setSelectedPlan] = useState(initialWorkspace.live.planBActive ? 'B' : 'A');
  const [clock, setClock] = useState(Date.now());

  useEffect(() => {
    setWorkspace(initialWorkspace); setDirty(false); setSaveStatus(''); setLastSavedAt(initialWorkspace.updatedAt || '');
    setSelectedPlan(initialWorkspace.live.planBActive ? 'B' : 'A'); setEditingCardId(''); setProposals({}); setImportPhase('');
  }, [initialWorkspace]);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => { if (!lastSavedAt) return undefined; const timer = window.setInterval(() => setClock(Date.now()), 15000); return () => window.clearInterval(timer); }, [lastSavedAt]);
  useEffect(() => { if (!dirty) return undefined; const warn = (event) => { event.preventDefault(); event.returnValue = ''; }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);

  const presentation = mode === 'presentation';
  const live = mode === 'live';
  const activePlan = live ? (workspace.live.planBActive ? 'B' : 'A') : selectedPlan;
  const activeCards = MATCH_PLAN_PHASES.flatMap(({ key }) => workspace.phases[key]).filter((card) => card.plan === activePlan && card.status !== 'discarded');
  const validatedDecisions = MATCH_PLAN_EXECUTIVE_FIELDS.filter((field) => workspace.executiveStates[field] === 'validated').length;
  const completedTasks = workspace.checklist.filter((item) => item.checked).length;
  const selectedImportPhase = MATCH_PLAN_PHASES.find((phase) => phase.key === importPhase);
  const importCandidates = selectedImportPhase ? buildMatchPlanImportCandidates({ phase: importPhase, insight: insights[selectedImportPhase.label], plays: plays.filter((play) => play.phase === selectedImportPhase.boardPhase) }) : [];

  const applyWorkspace = (updater) => { setWorkspace((current) => typeof updater === 'function' ? updater(current) : updater); setDirty(true); setSaveStatus(''); };
  const selectPlan = (plan) => {
    setSelectedPlan(plan);
    setEditingCardId('');
    if (live && (workspace.live.planBActive ? 'B' : 'A') !== plan) {
      applyWorkspace((current) => ({ ...current, live: { ...current.live, planBActive: plan === 'B' } }));
    }
  };
  const updateCard = (phase, cardId, patch) => applyWorkspace((current) => ({ ...current, phases: { ...current.phases, [phase]: current.phases[phase].map((card) => card.id === cardId ? { ...card, ...patch } : card) } }));
  const updateLiveCard = (cardId, patch) => applyWorkspace((current) => ({ ...current, live: { ...current.live, cardExecution: { ...current.live.cardExecution, [cardId]: { executed: false, priority: '', observation: '', ...(current.live.cardExecution?.[cardId] || {}), ...patch, updatedAt: new Date().toISOString() } } } }));

  const addCard = (phase, proposal = null) => {
    const action = clean(proposal?.action || newCardAction); if (!action) return;
    const insight = insights[MATCH_PLAN_PHASES.find((row) => row.key === phase)?.label] || {};
    const nextCard = { id: makeId(`plan-${phase}`), action, priority: proposal?.priority || 'Media', impact: proposal ? clean(proposal.impact) : clean(insight.proposedAction), explanation: proposal ? clean(proposal.explanation) : (/información insuficiente/i.test(clean(insight.conclusion)) ? '' : clean(insight.conclusion)), sources: proposal ? (proposal.sources || []) : (insight.sources?.length ? ['Pizarra'] : ['Staff']), status: 'draft', plan: selectedPlan, playId: clean(proposal?.playId), executed: false };
    applyWorkspace((current) => ({ ...current, phases: { ...current.phases, [phase]: [...current.phases[phase], nextCard] } }));
    setNewCardAction(''); setNewCardPhase(''); setEditingCardId(nextCard.id);
  };

  const requestImprovement = (blockKey) => {
    if (blockKey === 'executive') { const priorities = MATCH_PLAN_PHASES.flatMap(({ key }) => workspace.phases[key]).filter((card) => card.status !== 'discarded' && card.plan === selectedPlan).slice(0, 2).map((card) => card.action); setProposals((current) => ({ ...current, executive: priorities.length ? { action: priorities.join(' · '), sources: ['Plan validado'] } : { unavailable: true } })); return; }
    if (blockKey === 'checklist') { const missing = workspace.checklist.filter((item) => !item.checked).map((item) => item.text); setProposals((current) => ({ ...current, checklist: missing.length ? { action: `Priorizar antes del partido: ${missing.slice(0, 2).join(' y ')}`, sources: ['Checklist'] } : { unavailable: true } })); return; }
    const label = MATCH_PLAN_PHASES.find((phase) => phase.key === blockKey)?.label; const insight = insights[label] || {}; const action = clean(insight.proposedAction);
    setProposals((current) => ({ ...current, [blockKey]: action && !/registrar y validar/i.test(action) ? { action, impact: clean(insight.conclusion), explanation: clean(insight.evidence?.join?.(' · ')), sources: insight.sources?.length ? ['Pizarra', 'Evidencias'] : ['Perfil'] } : { unavailable: true } }));
  };
  const acceptProposal = (blockKey) => { const proposal = proposals[blockKey]; if (!proposal || proposal.unavailable) return; if (blockKey === 'executive') applyWorkspace((current) => ({ ...current, executive: { ...current.executive, objective: proposal.action } })); else if (blockKey === 'checklist') applyWorkspace((current) => ({ ...current, checklist: [...current.checklist, { id: makeId('check'), text: proposal.action, checked: false }] })); else addCard(blockKey, proposal); setProposals((current) => ({ ...current, [blockKey]: null })); };
  const saveWorkspace = async () => { setSaveStatus('Guardando'); const result = await persistMatchPlanWorkspace({ workspace, onSave }); if (!result.ok) { console.error('Error guardando el Plan de partido:', result.error); setDirty(true); setSaveStatus('Error al guardar'); return; } setWorkspace(result.workspace); setDirty(false); setSaveStatus('Guardado'); setLastSavedAt(result.savedAt); setClock(Date.now()); };
  const visibleCards = (phase) => workspace.phases[phase].filter((card) => { if (presentation) return card.status === 'confirmed' && card.plan === selectedPlan; if (live) return card.status !== 'discarded' && card.plan === activePlan; return card.plan === selectedPlan; });
  const importSelected = (candidates) => { applyWorkspace((current) => { const existing = current.phases[importPhase]; const imported = candidates.filter((candidate) => !existing.some((card) => card.plan === selectedPlan && card.action.toLocaleLowerCase('es') === candidate.action.toLocaleLowerCase('es'))).map((candidate) => ({ id: makeId(`plan-${importPhase}`), action: candidate.action, priority: 'Media', impact: candidate.impact, explanation: candidate.explanation, sources: candidate.sources, status: 'draft', plan: selectedPlan, playId: candidate.playId, executed: false })); return { ...current, phases: { ...current.phases, [importPhase]: [...existing, ...imported] } }; }); setImportPhase(''); };

  return (
    <section className={`${presentation ? 'fixed inset-0 z-50 overflow-y-auto bg-[#040b16] p-4 sm:p-8' : 'order-1 xl:col-span-2'} min-w-0`} data-testid="match-plan-workspace">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <header className="rounded-[2rem] border border-white/[0.08] bg-[radial-gradient(circle_at_15%_0%,rgba(61,217,255,0.12),transparent_38%),linear-gradient(135deg,#0c1b31,#07111f)] p-5 shadow-[0_26px_90px_rgba(0,0,0,0.30)] sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.22em] text-caudal-electric">Centro operativo · {rivalName || 'Rival'}</p><h2 className="mt-2 text-2xl font-black text-white sm:text-4xl">Plan de partido</h2><p className="mt-2 max-w-2xl text-sm font-semibold text-slate-400">Construye, valida y ejecuta un plan claro para el cuerpo técnico.</p></div><div className="flex flex-wrap items-center gap-2">{presentation ? <><span className="rounded-xl border border-white/10 px-3 py-2 text-[9px] font-black uppercase text-slate-300">Plan {selectedPlan}</span><button type="button" onClick={() => setMode('workspace')} className="min-h-10 rounded-xl border border-white/10 px-4 py-2 text-[10px] font-black uppercase text-white">Salir de presentación</button></> : <><div className="flex rounded-xl border border-white/10 bg-black/15 p-1" aria-label="Plan en edición"><button type="button" onClick={() => selectPlan('A')} aria-pressed={activePlan === 'A'} className={`min-h-8 rounded-lg px-3 text-[9px] font-black uppercase ${selectedPlan === 'A' ? 'bg-white text-slate-950' : 'text-slate-400'}`}>Plan A</button><button type="button" onClick={() => selectPlan('B')} aria-pressed={activePlan === 'B'} className={`min-h-8 rounded-lg px-3 text-[9px] font-black uppercase ${selectedPlan === 'B' ? 'bg-amber-300 text-slate-950' : 'text-slate-400'}`}>Plan B</button></div><div className="flex rounded-xl border border-white/10 bg-black/15 p-1"><button type="button" onClick={() => setMode('workspace')} aria-pressed={mode === 'workspace'} className={`min-h-8 rounded-lg px-3 text-[9px] font-black uppercase ${mode === 'workspace' ? 'bg-white text-slate-950' : 'text-slate-400'}`}>Trabajo</button><button type="button" onClick={() => setMode('live')} aria-pressed={live} className={`min-h-8 rounded-lg px-3 text-[9px] font-black uppercase ${live ? 'bg-rose-400 text-slate-950' : 'text-slate-400'}`}>En directo</button><button type="button" onClick={() => setMode('presentation')} className="min-h-8 rounded-lg px-3 text-[9px] font-black uppercase text-slate-400">Presentar al equipo</button></div><div className={`rounded-xl border px-3 py-2 text-[9px] font-black ${saveStatus === 'Error al guardar' ? 'border-rose-300/20 bg-rose-300/[0.07] text-rose-100' : dirty ? 'border-amber-300/20 bg-amber-300/[0.07] text-amber-100' : 'border-emerald-300/15 bg-emerald-300/[0.06] text-emerald-100'}`} role={saveStatus === 'Error al guardar' ? 'alert' : 'status'}>{saveStatus === 'Guardando' ? 'Guardando…' : saveStatus === 'Error al guardar' ? 'Error al guardar' : dirty ? 'Cambios pendientes' : lastSavedAt ? `✓ ${formatSavedAgo(lastSavedAt, clock)}` : 'Sin cambios'}</div><button type="button" onClick={saveWorkspace} disabled={!dirty || saveStatus === 'Guardando'} className="min-h-10 rounded-xl bg-caudal-electric px-4 py-2 text-[9px] font-black uppercase text-slate-950 disabled:cursor-not-allowed disabled:opacity-30">{saveStatus === 'Error al guardar' ? 'Reintentar' : 'Guardar cambios'}</button></>}</div></div>
          {live ? <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-300/15 bg-rose-300/[0.055] px-4 py-3"><div><p className="text-[9px] font-black uppercase tracking-[0.14em] text-rose-200">Modo partido · Plan {activePlan}</p><p className="mt-1 text-xs font-semibold text-slate-400">Las ejecuciones, prioridades y notas no alteran el plan diseñado.</p></div><button type="button" onClick={() => { const nextPlan = workspace.live.planBActive ? 'A' : 'B'; setSelectedPlan(nextPlan); applyWorkspace((current) => ({ ...current, live: { ...current.live, planBActive: nextPlan === 'B' } })); }} className={`min-h-10 rounded-xl px-4 py-2 text-[10px] font-black uppercase ${workspace.live.planBActive ? 'bg-amber-300 text-slate-950' : 'border border-amber-300/20 text-amber-100'}`}>{workspace.live.planBActive ? 'Volver al Plan A' : 'Activar Plan B'}</button></div> : null}
        </header>

        {!presentation ? <section className="grid gap-3 rounded-[1.5rem] border border-white/[0.07] bg-[#091528]/85 p-3 sm:grid-cols-4 sm:p-4" aria-label="Progreso del plan">{[[`${validatedDecisions}/4`, 'decisiones'], [activeCards.length, 'consignas'], [`${completedTasks}/${workspace.checklist.length}`, 'tareas'], [`Plan ${activePlan}`, 'en uso']].map(([value, label]) => <div key={label} className="rounded-xl bg-black/15 px-4 py-3"><p className="text-xl font-black text-white">{value}</p><p className="mt-1 text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</p></div>)}</section> : null}

        <section className="rounded-[1.8rem] border border-white/[0.07] bg-[#091528] p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-caudal-electric">Plan ejecutivo</p><h3 className="mt-1 text-xl font-black text-white">Cuatro decisiones</h3></div>{!presentation && !live ? <button type="button" onClick={() => requestImprovement('executive')} className="min-h-9 rounded-xl border border-caudal-electric/20 px-3 py-2 text-[9px] font-black uppercase text-caudal-electric">Generar propuesta</button> : null}</div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{executiveConfig.filter(({ field }) => !presentation || workspace.executiveStates[field] !== 'discarded').map(({ label, field, placeholder }) => { const state = workspace.executiveStates[field]; return <article key={field} className={`grid gap-3 rounded-2xl border p-4 transition ${state === 'discarded' ? 'border-white/[0.05] bg-black/10 opacity-55' : 'border-white/[0.07] bg-black/15'}`}><div className="flex items-center justify-between gap-2"><p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>{!presentation ? <span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase ${executiveStateTone[state]}`}>{executiveStateLabel[state]}</span> : null}</div>{presentation || live ? <p className="min-h-12 text-base font-black leading-6 text-white">{workspace.executive[field] || 'Pendiente de validar'}</p> : <textarea value={workspace.executive[field]} onChange={(event) => applyWorkspace((current) => ({ ...current, executive: { ...current.executive, [field]: event.target.value } }))} placeholder={placeholder} rows={3} className="min-h-20 resize-none rounded-xl border border-white/10 bg-[#07111f] px-3 py-2 text-sm font-bold leading-5 text-white outline-none placeholder:text-slate-600 focus:border-caudal-electric/40" />}{!presentation && !live ? <select value={state} onChange={(event) => applyWorkspace((current) => ({ ...current, executiveStates: { ...current.executiveStates, [field]: event.target.value } }))} aria-label={`Estado de ${label}`} className="h-9 rounded-xl border border-white/10 bg-[#07111f] px-3 text-[9px] font-black uppercase text-white"><option value="pending">Pendiente</option><option value="validated">Validada</option><option value="discarded">Descartada</option></select> : null}</article>; })}</div>{!presentation && !live ? <ImprovementProposal proposal={proposals.executive} onChange={(proposal) => setProposals((current) => ({ ...current, executive: proposal }))} onAccept={() => acceptProposal('executive')} onReject={() => setProposals((current) => ({ ...current, executive: null }))} /> : null}</section>

        <div className="grid items-start gap-5 xl:grid-cols-2">{MATCH_PLAN_PHASES.map((phase) => { const phasePlays = plays.filter((play) => play.phase === phase.boardPhase); const rows = visibleCards(phase.key); if (presentation && !rows.length) return null; const emptyWorkspace = !rows.length && !presentation && !live; if (emptyWorkspace) return <section key={phase.key} className={`rounded-[1.5rem] border border-white/[0.07] bg-gradient-to-br ${phaseTone[phase.key]} p-4 sm:p-5`}><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/15 text-xl">{phaseIcon[phase.key]}</span><div><p className="text-[9px] font-black uppercase tracking-[0.15em] opacity-65">{phase.label} · Plan {selectedPlan}</p><h3 className="mt-1 text-base font-black text-white">Todavía sin consignas</h3></div></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => { setNewCardPhase(phase.key); setNewCardAction(''); }} className="min-h-9 rounded-xl bg-white px-3 text-[9px] font-black uppercase text-slate-950">Añadir consigna</button><button type="button" onClick={() => requestImprovement(phase.key)} className="min-h-9 rounded-xl border border-white/10 px-3 text-[9px] font-black uppercase text-slate-200">Generar propuesta</button><button type="button" onClick={() => setImportPhase(phase.key)} className="min-h-9 rounded-xl border border-caudal-electric/20 px-3 text-[9px] font-black uppercase text-caudal-electric">Importar</button></div></div>{proposals[phase.key] ? <ImprovementProposal proposal={proposals[phase.key]} onChange={(proposal) => setProposals((current) => ({ ...current, [phase.key]: proposal }))} onAccept={() => acceptProposal(phase.key)} onReject={() => setProposals((current) => ({ ...current, [phase.key]: null }))} /> : null}{newCardPhase === phase.key ? <form onSubmit={(event) => { event.preventDefault(); addCard(phase.key); }} className="mt-3 flex gap-2 rounded-xl border border-caudal-electric/20 bg-black/15 p-2"><input autoFocus value={newCardAction} onChange={(event) => setNewCardAction(event.target.value)} placeholder="Escribe una consigna accionable…" className="h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#07111f] px-3 text-sm font-bold text-white outline-none" /><button type="submit" disabled={!clean(newCardAction)} className="rounded-lg bg-caudal-electric px-3 text-[9px] font-black uppercase text-slate-950 disabled:opacity-40">Crear</button><button type="button" onClick={() => setNewCardPhase('')} className="rounded-lg border border-white/10 px-2 text-[9px] font-black uppercase text-slate-300">Cancelar</button></form> : null}</section>;
          return <section key={phase.key} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (draggedCard) applyWorkspace((current) => moveMatchPlanCard(current, draggedCard.phase, draggedCard.id, phase.key)); setDraggedCard(null); }} className={`rounded-[1.8rem] border border-white/[0.07] bg-gradient-to-br ${phaseTone[phase.key]} p-5 sm:p-6`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] opacity-70">Fase · Plan {activePlan}</p><h3 className="mt-1 text-2xl font-black text-white">{phase.label}</h3><p className="mt-1 text-xs font-semibold text-slate-500">{rows.length} consigna{rows.length === 1 ? '' : 's'}</p></div>{!presentation && !live ? <div className="flex flex-wrap gap-2"><button type="button" onClick={() => requestImprovement(phase.key)} className="min-h-9 rounded-xl border border-white/10 px-3 text-[9px] font-black uppercase text-slate-200">Sugerir</button><button type="button" onClick={() => setImportPhase(phase.key)} className="min-h-9 rounded-xl border border-caudal-electric/20 px-3 text-[9px] font-black uppercase text-caudal-electric">Importar recomendaciones</button><button type="button" onClick={() => { setNewCardPhase(phase.key); setNewCardAction(''); }} className="min-h-9 rounded-xl bg-white px-3 text-[9px] font-black uppercase text-slate-950">+ Añadir</button></div> : null}</div>{!presentation && !live ? <ImprovementProposal proposal={proposals[phase.key]} onChange={(proposal) => setProposals((current) => ({ ...current, [phase.key]: proposal }))} onAccept={() => acceptProposal(phase.key)} onReject={() => setProposals((current) => ({ ...current, [phase.key]: null }))} /> : null}{newCardPhase === phase.key && !presentation && !live ? <form onSubmit={(event) => { event.preventDefault(); addCard(phase.key); }} className="mt-4 flex gap-2 rounded-2xl border border-caudal-electric/20 bg-black/15 p-3"><input autoFocus value={newCardAction} onChange={(event) => setNewCardAction(event.target.value)} placeholder="Escribe una consigna accionable…" className="h-10 min-w-0 flex-1 rounded-xl border border-white/10 bg-[#07111f] px-3 text-sm font-bold text-white outline-none" /><button type="submit" disabled={!clean(newCardAction)} className="rounded-xl bg-caudal-electric px-4 text-[9px] font-black uppercase text-slate-950 disabled:opacity-40">Crear</button><button type="button" onClick={() => setNewCardPhase('')} className="rounded-xl border border-white/10 px-3 text-[9px] font-black uppercase text-slate-300">Cancelar</button></form> : null}<div className="mt-4 space-y-3">{rows.length ? rows.map((card, cardIndex) => <PlanCard key={card.id} card={card} phase={phase.key} mode={mode} plays={phasePlays} editing={editingCardId === card.id} liveExecution={workspace.live.cardExecution?.[card.id]} onEdit={() => setEditingCardId((current) => current === card.id ? '' : card.id)} onChange={(patch) => updateCard(phase.key, card.id, patch)} onPlanChange={(plan) => { updateCard(phase.key, card.id, { plan }); setSelectedPlan(plan); setEditingCardId(''); }} onDuplicate={() => applyWorkspace((current) => duplicateMatchPlanCard(current, phase.key, card.id, makeId(`plan-${phase.key}`)))} onDelete={() => { if (window.confirm('¿Eliminar esta consigna del plan?')) applyWorkspace((current) => { const cardExecution = { ...current.live.cardExecution }; delete cardExecution[card.id]; return { ...current, live: { ...current.live, cardExecution }, phases: { ...current.phases, [phase.key]: current.phases[phase.key].filter((row) => row.id !== card.id) } }; }); }} onStatus={(status) => updateCard(phase.key, card.id, { status })} onLiveChange={(patch) => updateLiveCard(card.id, patch)} onOpenPlay={(cardPhase, playId) => onOpenPlay?.(cardPhase, playId)} onDragStart={(cardId) => setDraggedCard({ phase: phase.key, id: cardId })} onDrop={(targetId) => { if (draggedCard) applyWorkspace((current) => moveMatchPlanCard(current, draggedCard.phase, draggedCard.id, phase.key, targetId)); setDraggedCard(null); }} onMoveUp={() => applyWorkspace((current) => moveMatchPlanCardByOffset(current, phase.key, card.id, -1))} onMoveDown={() => applyWorkspace((current) => moveMatchPlanCardByOffset(current, phase.key, card.id, 1))} onMovePhase={(nextPhase) => { if (nextPhase !== phase.key) { applyWorkspace((current) => moveMatchPlanCard(current, phase.key, card.id, nextPhase)); setEditingCardId(''); } }} canMoveUp={cardIndex > 0} canMoveDown={cardIndex < rows.length - 1} />) : <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-5 text-center text-xs font-semibold text-slate-500">{presentation ? 'Sin consignas confirmadas.' : `No hay consignas activas en el Plan ${activePlan}.`}</div>}</div></section>; })}</div>

        <section className="rounded-[1.8rem] border border-white/[0.07] bg-[#091528] p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-caudal-electric">Prepartido</p><h3 className="mt-1 text-xl font-black text-white">Checklist del cuerpo técnico</h3></div>{!presentation && !live ? <div className="flex gap-2"><button type="button" onClick={() => requestImprovement('checklist')} className="min-h-9 rounded-xl border border-caudal-electric/20 px-3 text-[9px] font-black uppercase text-caudal-electric">Añadir tareas sugeridas</button><button type="button" onClick={() => { const id = makeId('check'); applyWorkspace((current) => ({ ...current, checklist: [...current.checklist, { id, text: 'Nueva tarea', checked: false }] })); setEditingChecklistId(id); }} className="min-h-9 rounded-xl bg-white px-3 text-[9px] font-black uppercase text-slate-950">+ Añadir</button></div> : null}</div>{!presentation && !live ? <ImprovementProposal proposal={proposals.checklist} onChange={(proposal) => setProposals((current) => ({ ...current, checklist: proposal }))} onAccept={() => acceptProposal('checklist')} onReject={() => setProposals((current) => ({ ...current, checklist: null }))} /> : null}<div className="mt-4 grid gap-2 md:grid-cols-2">{workspace.checklist.map((item) => <div key={item.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (draggedChecklistId) applyWorkspace((current) => moveMatchPlanChecklistItem(current, draggedChecklistId, item.id)); setDraggedChecklistId(''); }} className={`relative flex min-w-0 items-center gap-3 rounded-2xl border px-3 py-3 ${item.checked ? 'border-emerald-300/20 bg-emerald-300/[0.055]' : 'border-white/[0.07] bg-black/15'}`}>{presentation || live ? <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${item.checked ? 'border-emerald-300/30 bg-emerald-400 text-slate-950' : 'border-white/20 text-transparent'}`}>✓</span> : <input type="checkbox" checked={item.checked} onChange={(event) => applyWorkspace((current) => ({ ...current, checklist: current.checklist.map((row) => row.id === item.id ? { ...row, checked: event.target.checked } : row) }))} className="h-5 w-5 shrink-0 accent-emerald-400" aria-label={`Marcar ${item.text}`} />}{editingChecklistId === item.id && !presentation && !live ? <input autoFocus value={item.text} onChange={(event) => applyWorkspace((current) => ({ ...current, checklist: current.checklist.map((row) => row.id === item.id ? { ...row, text: event.target.value } : row) }))} onBlur={() => setEditingChecklistId('')} onKeyDown={(event) => { if (event.key === 'Enter') setEditingChecklistId(''); }} className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-[#07111f] px-2 text-sm font-bold text-white outline-none" /> : <p className="min-w-0 flex-1 text-sm font-bold text-white">{item.text}</p>}{!presentation && !live ? <><button type="button" draggable onDragStart={(event) => { event.stopPropagation(); setDraggedChecklistId(item.id); }} onKeyDown={(event) => { const index = workspace.checklist.findIndex((row) => row.id === item.id); if (event.key === 'ArrowUp' && index > 0) { event.preventDefault(); applyWorkspace((current) => moveMatchPlanChecklistItem(current, item.id, current.checklist[index - 1].id)); } if (event.key === 'ArrowDown' && index < workspace.checklist.length - 1) { event.preventDefault(); applyWorkspace((current) => moveMatchPlanChecklistItem(current, item.id, current.checklist[index + 1].id)); } }} className="h-8 w-8 shrink-0 cursor-grab rounded-lg border border-white/10 text-sm text-slate-500" aria-label={`Arrastrar ${item.text}`} title="Arrastrar o usar flechas del teclado">⠿</button><button type="button" onClick={() => setOpenChecklistMenuId((current) => current === item.id ? '' : item.id)} className="h-8 w-8 shrink-0 rounded-lg border border-white/10 text-lg leading-none text-slate-400" aria-label={`Opciones de ${item.text}`} aria-expanded={openChecklistMenuId === item.id}>⋯</button>{openChecklistMenuId === item.id ? <div className="absolute right-3 top-12 z-20 w-32 rounded-xl border border-white/10 bg-[#07111f] p-1 shadow-[0_16px_45px_rgba(0,0,0,0.45)]"><button type="button" onClick={() => { setEditingChecklistId(item.id); setOpenChecklistMenuId(''); }} className="w-full rounded-lg px-3 py-2 text-left text-[9px] font-black uppercase text-slate-200 hover:bg-white/[0.06]">Editar</button><button type="button" onClick={() => { applyWorkspace((current) => ({ ...current, checklist: current.checklist.filter((row) => row.id !== item.id) })); setOpenChecklistMenuId(''); }} className="w-full rounded-lg px-3 py-2 text-left text-[9px] font-black uppercase text-rose-200 hover:bg-rose-300/[0.07]">Eliminar</button></div> : null}</> : null}</div>)}</div></section>
      </div>
      {selectedImportPhase ? <ImportRecommendationsDrawer key={`${selectedImportPhase.key}-${selectedPlan}`} phase={selectedImportPhase} candidates={importCandidates} onClose={() => setImportPhase('')} onImport={importSelected} /> : null}
    </section>
  );
}
