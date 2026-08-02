import { Component, useEffect, useId, useMemo, useRef, useState } from 'react';

import {
  PLAYER_TACTICAL_SUGGESTED_QUESTIONS,
  answerRivalPlayerTacticalQuestion,
} from '../../utils/rivalPlayerTacticalAssistant.js';

const sourceTone = {
  Perfil: 'border-cyan-300/15 bg-cyan-300/[0.06] text-cyan-100',
  Evidencias: 'border-violet-300/15 bg-violet-300/[0.06] text-violet-100',
  Pizarra: 'border-blue-300/15 bg-blue-300/[0.06] text-blue-100',
  Conexiones: 'border-amber-300/15 bg-amber-300/[0.06] text-amber-100',
  Vídeo: 'border-fuchsia-300/15 bg-fuchsia-300/[0.06] text-fuchsia-100',
  Staff: 'border-emerald-300/15 bg-emerald-300/[0.06] text-emerald-100',
};

const priorityTone = {
  Crítica: 'border-rose-300/25 bg-rose-300/[0.09] text-rose-100',
  Importante: 'border-amber-300/20 bg-amber-300/[0.07] text-amber-100',
  Opcional: 'border-slate-300/15 bg-slate-300/[0.05] text-slate-200',
};

const influenceTone = {
  structural: 'border-caudal-electric/30 bg-caudal-electric/[0.10] text-caudal-electric',
  important: 'border-violet-300/20 bg-violet-300/[0.08] text-violet-100',
  complementary: 'border-emerald-300/18 bg-emerald-300/[0.07] text-emerald-100',
  residual: 'border-slate-300/15 bg-slate-300/[0.05] text-slate-400',
};

const formatDate = (value, includeTime = false) => {
  if (!value) return 'Fecha no registrada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
};

const factTimestamp = (fact) => {
  const value = new Date(fact?.date || '').getTime();
  return Number.isFinite(value) ? value : 0;
};

const buildAutomaticSummary = (model) => {
  if (!model || model.facts.length < 2) return 'No existen suficientes evidencias para generar un resumen fiable.';
  const parts = [];
  const identity = [model.summary.position, model.summary.mainProfile ? `perfil ${model.summary.mainProfile.toLowerCase()}` : ''].filter(Boolean).join(' de ');
  if (identity) parts.push(`${identity.charAt(0).toUpperCase()}${identity.slice(1)}.`);
  const recorded = model.registeredBehaviors.slice(0, 3).map((item) => item.label).filter(Boolean);
  if (recorded.length) parts.push(`Comportamientos registrados: ${recorded.join(' · ')}.`);
  if (model.summary.influence.key !== 'residual') parts.push(`${model.summary.influence.label}: ${model.summary.influence.reason}.`);
  const observedPhases = new Set(model.behaviors.map((group) => group.key));
  if (!observedPhases.has('without-ball')) parts.push('Todavía no existen evidencias suficientes sobre su comportamiento sin balón.');
  if (!observedPhases.has('with-ball')) parts.push('Todavía no existen evidencias suficientes sobre su comportamiento con balón.');
  return parts.join(' ') || 'No existen suficientes evidencias para generar un resumen fiable.';
};

const behaviorState = (item, model) => {
  const fact = model.facts.find((row) => row.id === item.id);
  if (fact?.status === 'confirmed' || fact?.meta?.confirmed === true) return 'Confirmado';
  if (model.trends.some((trend) => trend.id === `trend:${item.behaviourKey}`)) return 'Pendiente validar';
  return 'Registrado';
};

const behaviorStateTone = {
  Confirmado: 'border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100',
  'Pendiente validar': 'border-amber-300/20 bg-amber-300/[0.08] text-amber-100',
  Registrado: 'border-caudal-electric/20 bg-caudal-electric/[0.07] text-cyan-100',
};

const maturityTone = {
  consolidated: 'border-emerald-300/25 bg-emerald-300/[0.08] text-emerald-100',
  partial: 'border-amber-300/20 bg-amber-300/[0.07] text-amber-100',
  initial: 'border-slate-300/15 bg-white/[0.04] text-slate-300',
};

function SourceChips({ sources = [] }) {
  if (!sources.length) return <span className="text-[10px] font-semibold text-slate-600">Sin fuentes suficientes</span>;
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Fuentes utilizadas">
      {sources.map((source) => (
        <span key={source} className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] ${sourceTone[source] || sourceTone.Perfil}`}>
          {source}
        </span>
      ))}
    </div>
  );
}

function CompactEmpty({ children = 'No existen suficientes evidencias.' }) {
  return <p className="rounded-xl border border-dashed border-white/[0.08] bg-white/[0.018] px-4 py-3 text-sm font-semibold text-slate-500">{children}</p>;
}

class PlayerProfileEditorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div role="alert" className="mt-5 rounded-2xl border border-rose-300/20 bg-rose-300/[0.06] p-4">
        <p className="text-sm font-black text-rose-100">No se pudo cargar el editor de debilidades.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => this.setState({ hasError: false })} className="min-h-10 rounded-xl bg-white/[0.06] px-4 py-2 text-xs font-black text-white">Reintentar</button>
          <button type="button" onClick={this.props.onClose} className="min-h-10 rounded-xl border border-white/10 px-4 py-2 text-xs font-black text-slate-300">Cerrar</button>
        </div>
      </div>
    );
  }
}

function SectionHeader({ eyebrow, title, detail }) {
  return (
    <div>
      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-caudal-electric">{eyebrow}</p>
      <h3 className="mt-1 text-xl font-black text-white sm:text-2xl">{title}</h3>
      {detail ? <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{detail}</p> : null}
    </div>
  );
}

function PlayerPortrait({ player, name }) {
  const [failed, setFailed] = useState(false);
  const image = player?.image || player?.imageUrl || player?.photoUrl || '';
  const initials = String(name || 'JR').split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-slate-800 to-slate-950 text-2xl font-black text-slate-400 shadow-[0_18px_50px_rgba(0,0,0,0.28)] sm:h-36 sm:w-36">
      {image && !failed
        ? <img src={image} alt={`Retrato de ${name}`} className="h-full w-full object-cover" onError={() => setFailed(true)} />
        : <span aria-label={`Iniciales de ${name}`}>{initials}</span>}
    </div>
  );
}

function RecommendationCard({ recommendation, onOpenEvidence }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId().replace(/:/g, '');
  return (
    <article className="rounded-[1.3rem] bg-black/15 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.12em] ${priorityTone[recommendation.priority]}`}>
          {recommendation.priority}
        </span>
        <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Confianza {recommendation.confidence}</span>
      </div>
      <h4 className="mt-3 text-sm font-black leading-6 text-white">{recommendation.action}</h4>
      <p className="mt-2 text-xs font-semibold leading-5 text-slate-400">{recommendation.expectedImpact}</p>
      <div className="mt-3"><SourceChips sources={recommendation.sources} /></div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={`player-rec-${detailsId}`}
          onClick={() => setExpanded((current) => !current)}
          className="min-h-10 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-[10px] font-black text-slate-300 transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70"
        >
          {expanded ? 'Ocultar explicación' : 'Ver explicación'}
        </button>
        <button type="button" onClick={() => onOpenEvidence?.(recommendation.evidenceIds)} disabled={!recommendation.evidenceIds.length} className="min-h-10 rounded-xl border border-caudal-electric/20 px-3 py-2 text-[10px] font-black text-caudal-electric disabled:opacity-35">
          Ver evidencias · {recommendation.evidenceIds.length}
        </button>
      </div>
      <div id={`player-rec-${detailsId}`} hidden={!expanded} className="mt-3 rounded-xl bg-[#07111f] p-3 text-xs font-semibold leading-5 text-slate-300">
        {recommendation.rationale}
      </div>
    </article>
  );
}

function RecommendationPanel({ title, eyebrow, rows, onOpenEvidence }) {
  return (
    <section className="rounded-[1.8rem] bg-gradient-to-br from-[#101d31] to-[#091525] p-5 sm:p-6">
      <SectionHeader eyebrow={eyebrow} title={title} />
      <div className="mt-4 space-y-3">
        {rows.length ? rows.map((row) => <RecommendationCard key={row.id} recommendation={row} onOpenEvidence={onOpenEvidence} />) : (
          <CompactEmpty>No existen consignas respaldadas por evidencias del jugador.</CompactEmpty>
        )}
      </div>
    </section>
  );
}

function PlayerAssistant({ model }) {
  const [mode, setMode] = useState('evidence');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const responseId = useId().replace(/:/g, '');
  const ask = (value = question) => {
    const next = String(value || '').trim();
    if (!next) return;
    setQuestion(next);
    setAnswer(answerRivalPlayerTacticalQuestion({ question: next, mode, model }));
  };
  const changeMode = (value) => {
    setMode(value);
    setAnswer(null);
  };
  const relatedQuestions = PLAYER_TACTICAL_SUGGESTED_QUESTIONS.filter((suggestion) => suggestion !== question).slice(0, 4);
  return (
    <section className="rounded-[1.8rem] bg-gradient-to-br from-[#10223a] via-[#0b192c] to-[#081321] p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader eyebrow="APPCAUDAL" title="Asistente del jugador" detail="Prepara el duelo separando evidencia registrada y criterio general del entrenador." />
        <div className="inline-flex w-full rounded-xl bg-black/20 p-1 sm:w-auto" role="radiogroup" aria-label="Modo de respuesta">
          {[
            ['evidence', 'Basado en evidencias'],
            ['coach', 'Criterio del entrenador'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              onClick={() => changeMode(value)}
              className={`min-h-10 flex-1 rounded-lg px-3 py-2 text-[9px] font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70 sm:flex-none ${mode === value ? 'bg-caudal-electric text-slate-950' : 'text-slate-400 hover:bg-white/[0.05] hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <form className="mt-5 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); ask(); }}>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Pregunta sobre el jugador</span>
          <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Escribe tu pregunta..." className="h-12 w-full rounded-xl border border-white/[0.09] bg-black/20 px-4 text-sm font-semibold text-white outline-none placeholder:text-slate-600 focus:border-caudal-electric/50 focus:ring-2 focus:ring-caudal-electric/20" />
        </label>
        <button type="submit" disabled={!question.trim()} className="min-h-12 rounded-xl bg-caudal-electric px-6 py-3 text-xs font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">Preguntar</button>
      </form>
      <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Preguntas sugeridas">
        {PLAYER_TACTICAL_SUGGESTED_QUESTIONS.map((suggestion) => (
          <button key={suggestion} type="button" onClick={() => ask(suggestion)} className="rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 py-1.5 text-[9px] font-bold text-slate-400 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70">
            {suggestion}
          </button>
        ))}
      </div>
      {answer ? (
        <div id={responseId} aria-live="polite" className="mt-5 rounded-[1.35rem] bg-[#07111f] p-4 sm:p-5">
          {answer.disclaimer ? <p className="mb-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2 text-xs font-bold leading-5 text-amber-100">{answer.disclaimer}</p> : null}
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ['Lectura', answer.reading],
              ['Consigna', answer.instruction],
              ['Riesgos', answer.risks],
              ['Alternativa', answer.alternative],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-[8px] font-black uppercase tracking-[0.15em] text-slate-500">{label}</p>
                <p className="mt-1.5 text-sm font-semibold leading-6 text-slate-200">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-4">
            <SourceChips sources={answer.sources} />
            <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[9px] font-black uppercase text-slate-300">Confianza {answer.confidence}</span>
          </div>
          <div className="mt-4 border-t border-white/[0.06] pt-4">
            <p className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-500">Preguntas relacionadas</p>
            <div className="mt-2 flex flex-wrap gap-1.5">{relatedQuestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => ask(suggestion)} className="rounded-full border border-white/[0.08] px-3 py-1.5 text-[9px] font-bold text-slate-300 transition hover:border-caudal-electric/25 hover:text-white">{suggestion}</button>)}</div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

const createPlayerProfileDraft = (profile = {}) => ({
  position: String(profile.position || ''),
  foot: String(profile.foot || ''),
  mainProfile: String(profile.mainProfile || ''),
  secondaryProfile: String(profile.secondaryProfile || ''),
  traits: Array.isArray(profile.traits) ? [...profile.traits] : [],
});

function ProfileEditor({ open, profile, positionOptions, profileOptions, behaviourOptions, incompatibleTraits, onSave, onCancel, onOpenChange }) {
  const firstFieldRef = useRef(null);
  const [draft, setDraft] = useState(() => createPlayerProfileDraft(profile));
  useEffect(() => {
    if (!open) return undefined;
    setDraft(createPlayerProfileDraft(profile));
    const focusTimer = window.setTimeout(() => firstFieldRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [open]);
  const toggleDraftTrait = (trait) => setDraft((current) => {
    const normalized = String(trait).toLowerCase();
    const active = current.traits.some((item) => String(item).toLowerCase() === normalized);
    return { ...current, traits: active ? current.traits.filter((item) => String(item).toLowerCase() !== normalized) : [...current.traits, trait] };
  });
  return (
    <details
      open={open}
      onToggle={(event) => onOpenChange?.(event.currentTarget.open, event.currentTarget.querySelector('summary'))}
      className="mt-5 rounded-2xl border border-white/[0.08] bg-black/15"
    >
      <summary className="cursor-pointer list-none px-4 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70">Scouting · editar perfil</summary>
      <div className="grid gap-4 border-t border-white/[0.07] p-4 lg:grid-cols-2">
        <div>
          <p className="mb-3 text-[9px] font-black uppercase tracking-[0.14em] text-caudal-electric">Identidad y perfiles</p>
          <div className="grid gap-2 sm:grid-cols-2">
          {[
            ['Posición táctica', 'position', positionOptions],
            ['Pie dominante', 'foot', ['Derecho', 'Izquierdo', 'Ambos']],
            ['Perfil principal', 'mainProfile', profileOptions],
            ['Perfil secundario', 'secondaryProfile', profileOptions.filter((value) => value !== draft.mainProfile)],
          ].map(([label, field, options], index) => (
            <label key={field} className="grid gap-1 text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
              <span>{label}</span>
              <select ref={index === 0 ? firstFieldRef : undefined} value={draft[field]} onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))} className="h-10 min-w-0 rounded-lg border border-white/10 bg-[#07111f] px-2 text-xs font-bold normal-case tracking-normal text-white outline-none">
                <option value="">Sin información</option>
                {options.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          ))}
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-caudal-electric">Comportamientos</p>
          {behaviourOptions ? [
            ['Con balón', behaviourOptions.withBall],
            ['Sin balón', behaviourOptions.withoutBall],
          ].map(([label, traits]) => (
            <div key={label}>
              <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {traits.map((trait) => {
                  const active = draft.traits.some((item) => String(item).toLowerCase() === String(trait).toLowerCase());
                  return <button key={trait} type="button" aria-pressed={active} onClick={() => toggleDraftTrait(trait)} className={`rounded-lg border px-2 py-1.5 text-[9px] font-black ${active ? 'border-caudal-electric/25 bg-caudal-electric/10 text-caudal-electric' : 'border-white/10 bg-black/15 text-slate-500'}`}>{trait}</button>;
                })}
              </div>
            </div>
          )) : <CompactEmpty>Selecciona una posición para mostrar comportamientos compatibles.</CompactEmpty>}
          {incompatibleTraits.length ? <p className="rounded-lg bg-amber-300/[0.07] px-3 py-2 text-[10px] font-bold text-amber-100">Revisar rasgos incompatibles con la posición: {incompatibleTraits.join(', ')}.</p> : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-white/[0.07] pt-4 lg:col-span-2">
          <button type="button" onClick={onCancel} className="min-h-10 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-black text-slate-300">Cancelar</button>
          <button type="button" onClick={() => onSave?.(createPlayerProfileDraft(draft))} className="min-h-10 rounded-xl bg-caudal-electric px-4 py-2 text-xs font-black text-slate-950">Guardar</button>
        </div>
      </div>
    </details>
  );
}

function InfluenceMap({ indicators }) {
  const maxEvidence = Math.max(1, ...indicators.map((indicator) => indicator.evidenceCount || 0));
  return (
    <section className="rounded-[1.8rem] bg-[#0a1628] p-5 sm:p-6">
      <SectionHeader eyebrow="Influencia funcional" title="Mapa de influencia" detail="Intensidad relativa construida solo con unidades de evidencia reales; no es una estadística de rendimiento." />
      <div className="mt-5 grid gap-x-7 gap-y-4 lg:grid-cols-2">
        {indicators.map((indicator) => {
          const width = indicator.evidenceCount ? Math.max(8, Math.round((indicator.evidenceCount / maxEvidence) * 100)) : 0;
          return (
            <article key={indicator.key}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-black text-slate-200">{indicator.label}</p>
                <span className="text-[9px] font-bold text-slate-500">{indicator.evidenceCount ? `${indicator.evidenceCount} evid. · ${indicator.coverageLevel}` : 'Sin evidencia'}</span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/[0.055]" title={`${indicator.independentEvidenceCount} unidades independientes`}>
                <div className="h-full rounded-full bg-gradient-to-r from-caudal-electric to-violet-300 transition-all duration-500" style={{ width: `${width}%` }} />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function BehaviorDossier({ model }) {
  return (
    <section className="rounded-[1.8rem] bg-[#0a1628] p-5 sm:p-6">
      <SectionHeader eyebrow="Comprender" title="Comportamientos observados" detail="Cada rasgo conserva su estado real de conocimiento y su fuente original." />
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {model.behaviors.map((group) => (
          <article key={group.key} className="rounded-[1.4rem] border border-white/[0.06] bg-white/[0.025] p-4">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-[8px] font-black uppercase tracking-[0.13em] text-caudal-electric">{group.key === 'with-ball' ? 'Con balón' : group.key === 'without-ball' ? 'Sin balón' : 'Contexto'}</p><h4 className="mt-1 text-base font-black text-white">{group.label}</h4></div>
              <span className="text-[8px] font-black uppercase text-slate-500">Confianza {group.confidence}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {group.items.slice(0, 8).map((item) => {
                const state = behaviorState(item, model);
                return <span key={item.id} className={`rounded-xl border px-3 py-2 text-[9px] font-black ${behaviorStateTone[state]}`} title={`${item.text} · ${item.source}`}>{item.text}<span className="ml-2 opacity-65">· {state}</span></span>;
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3"><SourceChips sources={group.sources} /><span className="text-[9px] font-semibold text-slate-600">Última observación · {group.lastObservedAt ? formatDate(group.lastObservedAt) : 'Sin fecha'}</span></div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ScoutingTraits({ player }) {
  const traits = Array.isArray(player?.traits) ? player.traits : [];
  const strengths = traits.filter((trait) => trait && typeof trait === 'object' && trait.category === 'strength');
  const weaknesses = traits.filter((trait) => trait && typeof trait === 'object' && trait.category === 'vulnerability');
  const renderRows = (rows, empty) => rows.length ? rows.map((trait, index) => <span key={trait.id || `${trait.label}-${index}`} className="rounded-xl border border-white/[0.07] bg-black/15 px-3 py-2 text-[10px] font-black text-slate-200">{trait.label}</span>) : <CompactEmpty>{empty}</CompactEmpty>;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-[1.8rem] bg-gradient-to-br from-emerald-300/[0.055] to-[#091525] p-5 sm:p-6"><SectionHeader eyebrow="Aprovechar" title="Fortalezas registradas" /><div className="mt-4 flex flex-wrap gap-2">{renderRows(strengths, 'No existen fortalezas clasificadas en los datos actuales.')}</div></section>
      <section className="rounded-[1.8rem] bg-gradient-to-br from-rose-300/[0.045] to-[#091525] p-5 sm:p-6"><SectionHeader eyebrow="Neutralizar" title="Debilidades registradas" /><div className="mt-4 flex flex-wrap gap-2">{renderRows(weaknesses, 'No existen debilidades clasificadas en los datos actuales.')}</div></section>
    </div>
  );
}

function TeamConditioning({ model }) {
  const phaseRows = model.phases.map((phase) => ({ id: `phase-${phase.label}`, text: `${phase.label} · ${phase.count} jugada${phase.count === 1 ? '' : 's'} observada${phase.count === 1 ? '' : 's'}` }));
  const relationRows = model.relations.map((relation) => ({ id: relation.id, text: `${relation.label} · ${relation.count} conexiones` }));
  const rows = [...relationRows, ...phaseRows].slice(0, 8);
  return (
    <section className="rounded-[1.8rem] bg-gradient-to-br from-[#111f35] to-[#081321] p-5 sm:p-6">
      <SectionHeader eyebrow="Impacto colectivo" title="Cómo condiciona al equipo" detail="Se muestran participaciones y relaciones observadas; no se atribuye causalidad sin una comparación real." />
      {rows.length ? <div className="mt-5 grid gap-2 md:grid-cols-2">{rows.map((row) => <article key={row.id} className="rounded-xl border border-white/[0.06] bg-black/15 px-4 py-3 text-xs font-bold leading-5 text-slate-200">{row.text}</article>)}</div> : <div className="mt-4"><CompactEmpty>No existen evidencias suficientes para explicar cómo condiciona al rival.</CompactEmpty></div>}
    </section>
  );
}

function ScoutingTimeline({ model }) {
  const events = useMemo(() => {
    const datedFacts = model.facts.filter((fact) => factTimestamp(fact)).slice().sort((left, right) => factTimestamp(left) - factTimestamp(right));
    const firstFact = datedFacts[0];
    const firstEvidence = datedFacts.find((fact) => fact.source === 'Evidencias');
    const firstPlay = datedFacts.find((fact) => fact.source === 'Pizarra');
    const trend = model.trends.filter((row) => row.lastObservedAt).slice().sort((left, right) => new Date(left.lastObservedAt) - new Date(right.lastObservedAt))[0];
    const lastFact = datedFacts[datedFacts.length - 1];
    return [
      firstFact ? { id: 'first', at: firstFact.date, label: 'Primera observación fechada', detail: firstFact.text } : null,
      firstEvidence ? { id: 'evidence', at: firstEvidence.date, label: 'Primera evidencia individual', detail: firstEvidence.text } : null,
      firstPlay ? { id: 'play', at: firstPlay.date, label: 'Primera jugada vinculada', detail: firstPlay.text } : null,
      trend ? { id: 'trend', at: trend.lastObservedAt, label: 'Patrón repetido detectado', detail: trend.label } : null,
      lastFact && lastFact !== firstFact ? { id: 'last', at: lastFact.date, label: 'Última actualización fechada', detail: lastFact.text } : null,
    ].filter(Boolean).filter((event, index, rows) => rows.findIndex((row) => row.id === event.id || `${row.at}:${row.detail}` === `${event.at}:${event.detail}`) === index);
  }, [model]);
  return (
    <section className="rounded-[1.8rem] bg-[#0a1628] p-5 sm:p-6">
      <SectionHeader eyebrow="Trazabilidad" title="Evolución del scouting" detail="Hitos construidos exclusivamente con fechas y registros existentes." />
      {events.length ? <div className="mt-5 border-l border-white/10 pl-5">{events.map((event) => <article key={event.id} className="relative pb-5 last:pb-0"><span className="absolute -left-[1.55rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-[#0a1628] bg-caudal-electric" /><p className="text-[9px] font-black uppercase text-slate-500">{formatDate(event.at, true)}</p><p className="mt-1 text-sm font-black text-white">{event.label}</p><p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-400">{event.detail}</p></article>)}</div> : <div className="mt-4"><CompactEmpty>No hay registros fechados para construir la evolución del scouting.</CompactEmpty></div>}
      <div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-4 text-center">{[['Partidos', model.scouting.matches], ['Jugadas', model.scouting.plays], ['Observaciones', model.scouting.observations]].map(([label, value]) => <div key={label}><p className="text-lg font-black text-white">{value}</p><p className="text-[8px] font-black uppercase text-slate-600">{label}</p></div>)}</div>
    </section>
  );
}

function ContextualVideo({ model }) {
  const videos = model.facts.filter((fact) => fact.source === 'Vídeo' && (fact.meta?.url || fact.text));
  return (
    <section className="rounded-[1.8rem] bg-[#0a1628] p-5 sm:p-6">
      <SectionHeader eyebrow="Contexto audiovisual" title="Vídeo del jugador" />
      {videos.length ? <div className="mt-4 grid gap-2 md:grid-cols-2">{videos.map((video) => <article key={video.id} className="flex items-center justify-between gap-3 rounded-xl bg-black/15 p-3"><div className="min-w-0"><p className="truncate text-xs font-black text-white">{video.text}</p><p className="mt-1 text-[9px] font-semibold text-slate-500">{video.date ? formatDate(video.date, true) : 'Fecha no registrada'}</p></div>{video.meta?.url ? <a href={video.meta.url} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg border border-caudal-electric/20 px-3 py-2 text-[9px] font-black uppercase text-caudal-electric">Ver clip</a> : <span className="text-[8px] font-black uppercase text-slate-600">Sin enlace</span>}</article>)}</div> : <div className="mt-4"><CompactEmpty>No existen clips vinculados a este jugador.</CompactEmpty></div>}
    </section>
  );
}

function AutomaticReport({ model }) {
  const confirmedFacts = model.facts.filter((fact) => fact.status === 'confirmed' || fact.meta?.confirmed === true);
  const confirmedIds = new Set(confirmedFacts.map((fact) => fact.id));
  const defensive = model.recommendations.defense.filter((row) => row.evidenceIds.some((id) => confirmedIds.has(id)));
  const attacking = model.recommendations.attack.filter((row) => row.evidenceIds.some((id) => confirmedIds.has(id)));
  const hasReport = confirmedFacts.length >= 2;
  return (
    <section className="rounded-[1.8rem] border border-caudal-electric/15 bg-[radial-gradient(circle_at_top_right,rgba(79,140,255,0.12),transparent_36%),#091525] p-5 sm:p-6">
      <SectionHeader eyebrow="Dossier ejecutivo" title="Informe automático" detail="Solo utiliza elementos marcados explícitamente como confirmados en los datos disponibles." />
      {hasReport ? <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[
        ['Quién es', [model.summary.name, model.summary.position].filter(Boolean).join(' · ')],
        ['Cómo juega', confirmedFacts.slice(0, 3).map((fact) => fact.text).join(' · ')],
        ['Cómo defenderle', defensive.map((row) => row.action).slice(0, 2).join(' ') || 'Sin consigna confirmada.'],
        ['Cómo hacerle daño', attacking.map((row) => row.action).slice(0, 2).join(' ') || 'Sin consigna confirmada.'],
        ['Nivel de confianza', model.scouting.confidence],
      ].map(([label, value]) => <div key={label} className="rounded-xl border border-white/[0.06] bg-black/15 p-4"><p className="text-[8px] font-black uppercase tracking-[0.13em] text-caudal-electric">{label}</p><p className="mt-2 text-sm font-semibold leading-6 text-slate-200">{value}</p></div>)}</div> : <div className="mt-4"><CompactEmpty>No existe un conjunto de evidencias confirmadas suficiente para generar un informe fiable.</CompactEmpty></div>}
    </section>
  );
}

function AbsenceScenario({ model }) {
  const hasInfluence = model.summary.influence.key !== 'residual' && model.facts.length >= 2;
  return (
    <section className="rounded-[1.8rem] bg-[#0a1628] p-5 sm:p-6">
      <SectionHeader eyebrow="Escenario alternativo" title="Si hoy no juega" detail="No se atribuyen cambios sin datos comparativos del rival con y sin el jugador." />
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl bg-black/15 p-4"><p className="text-[8px] font-black uppercase text-slate-500">Qué perfil pierde el rival</p><p className="mt-2 text-xs font-semibold leading-5 text-slate-200">{hasInfluence ? `${model.summary.influence.label} · ${model.summary.influence.reason}` : 'No existen evidencias suficientes.'}</p></div>
        <div className="rounded-xl bg-black/15 p-4"><p className="text-[8px] font-black uppercase text-slate-500">Posible sustituto</p><p className="mt-2 text-xs font-semibold leading-5 text-slate-500">No existen datos comparativos suficientes para identificarlo.</p></div>
        <div className="rounded-xl bg-black/15 p-4"><p className="text-[8px] font-black uppercase text-slate-500">Cambio del plan</p><p className="mt-2 text-xs font-semibold leading-5 text-slate-500">No existe un cambio respaldado por evidencias disponibles.</p></div>
      </div>
    </section>
  );
}

export default function RivalPlayerTacticalCenter({
  model,
  players = [],
  selectedPlayerKey = '',
  playerFilter = 'Todos',
  playerGroups = [],
  profile = {},
  positionOptions = [],
  profileOptions = [],
  behaviourOptions = null,
  incompatibleTraits = [],
  onSelectPlayer,
  onChangeFilter,
  onOpenPlayer,
  onUpdateProfile,
  onToggleTrait,
  onAddObservation,
  onOpenEvidence,
}) {
  const [observationDraft, setObservationDraft] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const editorTriggerRef = useRef(null);
  const activePlayerKey = model?.player ? model.playerKey : '';

  const restoreEditorFocus = () => {
    const trigger = editorTriggerRef.current;
    if (!trigger?.isConnected) return;
    window.setTimeout(() => trigger.focus(), 0);
  };
  const closeEditor = ({ restoreFocus = true } = {}) => {
    setEditorOpen(false);
    if (restoreFocus) restoreEditorFocus();
    editorTriggerRef.current = null;
  };
  const openEditor = (event) => {
    editorTriggerRef.current = event?.currentTarget || editorTriggerRef.current;
    setEditorOpen(true);
  };
  const handleEditorOpenChange = (nextOpen, summaryElement) => {
    if (nextOpen) {
      editorTriggerRef.current = editorTriggerRef.current || summaryElement;
      setEditorOpen(true);
      return;
    }
    closeEditor();
  };

  useEffect(() => {
    setEditorOpen(false);
  }, [activePlayerKey]);

  useEffect(() => {
    if (!editorOpen) return undefined;
    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeEditor();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [editorOpen]);

  const changeFilter = (filter) => {
    closeEditor({ restoreFocus: false });
    onChangeFilter?.(filter);
  };
  const filterBar = (
    <section className="rounded-[1.6rem] bg-[#0a1628] p-3 sm:p-4" data-testid="rival-player-filter-bar">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {['Todos', 'Amenazas', 'Vigilancias', 'Debilidades', 'Perfil pendiente'].map((filter) => (
            <button key={filter} type="button" aria-label={`Filtrar jugadores: ${filter}`} aria-pressed={playerFilter === filter} onClick={() => changeFilter(filter)} className={`min-h-9 rounded-lg border px-3 py-2 text-[9px] font-black uppercase tracking-[0.08em] ${playerFilter === filter ? 'border-caudal-electric/30 bg-caudal-electric text-slate-950' : 'border-white/10 bg-white/[0.035] text-slate-400'}`}>{filter}</button>
          ))}
        </div>
        {playerGroups.length || players.length ? (
          <label className="min-w-0 lg:w-80">
            <span className="sr-only">Seleccionar jugador rival</span>
            <select value={selectedPlayerKey} onChange={(event) => { closeEditor({ restoreFocus: false }); onSelectPlayer?.(event.target.value); }} className="h-11 w-full rounded-xl border border-white/10 bg-[#07111f] px-3 text-sm font-black text-white outline-none">
              {playerGroups.length ? playerGroups.map(({ group, players: rows }) => (
                <optgroup key={group} label={group}>
                  {rows.map((player) => <option key={player.key} value={player.key}>{player.label}</option>)}
                </optgroup>
              )) : players.map((player) => <option key={player.key} value={player.key}>{player.label}</option>)}
            </select>
          </label>
        ) : null}
      </div>
    </section>
  );

  if (!model?.player) {
    return (
      <div className="min-w-0 space-y-4 xl:col-span-2" data-testid="rival-player-empty-filter">
        {filterBar}
        <div className="rounded-[1.6rem] border border-white/[0.08] bg-[#0a1628] p-5">
          <p className="text-sm font-black text-white">No hay jugadores en “{playerFilter}”.</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">El filtro no ha encontrado perfiles compatibles. Puedes volver sin recargar la página.</p>
          <button type="button" onClick={() => changeFilter('Todos')} className="mt-4 min-h-10 rounded-xl bg-caudal-electric px-4 py-2 text-xs font-black text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80">Ver todos los jugadores</button>
        </div>
      </div>
    );
  }
  const { summary } = model;
  const fullName = String(model.player?.name || summary.name || 'Jugador rival').trim();
  const shirtName = String(model.player?.shirtName || model.player?.shirt_name || '').trim();
  const showShirtName = shirtName && shirtName.localeCompare(fullName, 'es', { sensitivity: 'base' }) !== 0;
  const impactWithData = model.impact.filter((indicator) => indicator.evidenceCount > 0);
  const hasDefensivePlan = model.recommendations.defense.length > 0;
  const hasAttackingPlan = model.recommendations.attack.length > 0;
  const hasTacticalAnalysis = impactWithData.length > 0
    || model.behaviors.length > 0
    || hasDefensivePlan
    || hasAttackingPlan
    || model.trends.length > 0
    || model.relations.length > 0
    || model.phases.length > 0
    || model.duels.length > 0;
  const missingAnalysisInputs = [
    !model.registeredBehaviors.length ? 'Comportamientos' : '',
    !model.facts.some((fact) => fact.source === 'Evidencias') ? 'Evidencias' : '',
    !model.scouting.connections ? 'Conexiones' : '',
    !model.scouting.plays ? 'Jugadas' : '',
    !model.scouting.observations ? 'Observaciones' : '',
  ].filter(Boolean);
  const automaticSummary = buildAutomaticSummary(model);
  const addObservation = () => {
    const value = observationDraft.trim();
    if (!value) return;
    onAddObservation?.(value);
    setObservationDraft('');
  };
  return (
    <div className="min-w-0 space-y-5 xl:col-span-2" data-testid="rival-player-tactical-center">
      {filterBar}

      <section className="overflow-hidden rounded-[2rem] border border-caudal-electric/15 bg-[radial-gradient(circle_at_top_right,rgba(79,140,255,0.20),transparent_34%),linear-gradient(145deg,#10223a,#07111f)] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.28)] sm:p-7">
        <div className="flex flex-col gap-7 lg:flex-row lg:items-start">
          <PlayerPortrait key={model.playerKey} player={model.player} name={fullName} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-caudal-electric">Dossier individual · Observar → Comprender → Neutralizar → Aprovechar</p>
                <h2 className="mt-2 text-3xl font-black text-white sm:text-4xl">{fullName}</h2>
                {showShirtName ? <p className="mt-1 text-xs font-bold text-caudal-electric">Nombre de camiseta · {shirtName}</p> : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-slate-400">{summary.position || 'Posición sin registrar'}</p>
                  {summary.role ? <span className="rounded-full border border-white/[0.09] bg-white/[0.04] px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-slate-300">{summary.role}</span> : null}
                  <span className={`rounded-full border px-2.5 py-1 text-[8px] font-black uppercase ${maturityTone[summary.maturity.key] || maturityTone.initial}`}>{summary.maturity.label}</span>
                </div>
              </div>
              <button type="button" onClick={onOpenPlayer} className="min-h-10 rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 py-2 text-[10px] font-black text-slate-300 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70">Abrir ficha completa</button>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['Pie', summary.foot || 'Sin dato'],
                ['Altura', summary.height || 'Sin dato'],
                ['Edad', summary.age ? `${summary.age} años` : 'Sin dato'],
                ['Perfil', summary.mainProfile || 'Sin identificar'],
                ['Perfil secundario', summary.secondaryProfile || 'Sin identificar'],
                ['Estado', summary.scoutingState],
                ['Última observación', summary.lastUpdatedAt ? formatDate(summary.lastUpdatedAt, true) : 'Sin fecha registrada'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-white/[0.03] px-3 py-2.5">
                  <p className="text-[8px] font-black uppercase tracking-[0.13em] text-slate-500">{label}</p>
                  <p className="mt-1 text-xs font-black text-slate-200">{value}</p>
                </div>
              ))}
              <div className={`rounded-xl border px-3 py-2.5 ${influenceTone[summary.influence.key]}`} title={summary.influence.reason}>
                <p className="text-[8px] font-black uppercase tracking-[0.13em] opacity-70">Influencia</p>
                <p className="mt-1 text-xs font-black">{summary.influence.label}</p>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-white/[0.07] bg-black/20 p-4 sm:p-5">
              <p className="text-[9px] font-black uppercase tracking-[0.15em] text-caudal-electric">Resumen automático</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-200">{automaticSummary}</p>
            </div>
          </div>
        </div>
        <PlayerProfileEditorBoundary resetKey={`${model.playerKey}:${editorOpen}`} onClose={() => closeEditor()}>
          <ProfileEditor
            open={editorOpen}
            profile={profile}
            positionOptions={positionOptions}
            profileOptions={profileOptions}
            behaviourOptions={behaviourOptions}
            incompatibleTraits={incompatibleTraits}
            onSave={(draft) => { onUpdateProfile?.(draft); closeEditor(); }}
            onCancel={() => closeEditor()}
            onOpenChange={handleEditorOpenChange}
          />
        </PlayerProfileEditorBoundary>
      </section>

      {!hasTacticalAnalysis ? (
        <section className="rounded-[1.6rem] border border-dashed border-white/[0.09] bg-[#0a1628] p-5 sm:p-6" data-testid="rival-player-pending-analysis">
          <SectionHeader eyebrow="Información insuficiente" title="Análisis táctico pendiente" detail="Completa comportamientos, vulnerabilidades, evidencias o jugadas para generar impacto colectivo, planes y tendencias." />
          <div className="mt-4 flex flex-wrap gap-2">
            {missingAnalysisInputs.map((label) => <span key={label} className="rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-1.5 text-[9px] font-black text-slate-500">{label}</span>)}
          </div>
          <button type="button" onClick={openEditor} className="mt-4 min-h-10 rounded-xl bg-caudal-electric px-4 py-2 text-xs font-black text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80">Completar perfil</button>
        </section>
      ) : null}

      <InfluenceMap indicators={model.impact} />

      {model.behaviors.length ? <BehaviorDossier model={model} /> : null}

      <ScoutingTraits player={model.player} />

      <TeamConditioning model={model} />

      {hasDefensivePlan || hasAttackingPlan ? (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          {hasDefensivePlan ? <RecommendationPanel eyebrow="Neutralizar" title="Cómo defenderle" rows={model.recommendations.defense} onOpenEvidence={onOpenEvidence} /> : null}
          {hasAttackingPlan ? <RecommendationPanel eyebrow="Aprovechar" title="Cómo hacerle daño" rows={model.recommendations.attack} onOpenEvidence={onOpenEvidence} /> : null}
        </div>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-2"><ScoutingTimeline model={model} /><ContextualVideo model={model} /></div>

      <section className="rounded-[1.8rem] bg-[#0a1628] p-5 sm:p-6">
        <SectionHeader eyebrow="Seguimiento" title="Observaciones" detail="Se reutiliza el campo de notas y las evidencias existentes; no se crea otro registro paralelo." />
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_0.85fr]">
          <div className="space-y-2">
            {model.observations.length ? model.observations.slice(0, 8).map((observation) => (
              <article key={observation.id} className="rounded-xl bg-white/[0.025] px-3.5 py-3">
                <p className="text-sm font-semibold leading-6 text-slate-200">{observation.text}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[9px] font-bold text-slate-500">
                  <span>{observation.source}</span><span>{observation.author}</span><span>{formatDate(observation.date, true)}</span>
                </div>
              </article>
            )) : <CompactEmpty>No existen observaciones del jugador.</CompactEmpty>}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); addObservation(); }} className="rounded-xl bg-black/15 p-3">
            <label className="grid gap-2 text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
              <span>Añadir observación</span>
              <textarea value={observationDraft} onChange={(event) => setObservationDraft(event.target.value)} rows={4} placeholder="Detalle útil para preparar el duelo individual..." className="min-h-24 resize-none rounded-xl border border-white/10 bg-[#07111f] px-3 py-2 text-sm font-semibold normal-case leading-6 tracking-normal text-white outline-none placeholder:text-slate-600" />
            </label>
            <button type="submit" disabled={!observationDraft.trim()} className="mt-3 min-h-10 w-full rounded-xl bg-caudal-electric px-4 py-2 text-xs font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">Guardar observación</button>
          </form>
        </div>
      </section>

      <section className="rounded-[1.8rem] bg-[#0a1628] p-5 sm:p-6">
        <SectionHeader eyebrow="Emparejamientos" title="Comparativa con nuestros jugadores" detail="Solo se muestran duelos que ya llegan respaldados por datos comparables." />
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {model.duels.length ? model.duels.map((duel) => {
            const names = duel.duel.split(/\s+vs\s+/i);
            return (
            <article key={duel.id} className="rounded-[1.3rem] bg-white/[0.028] p-4">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
                <p className="rounded-xl border border-caudal-electric/15 bg-caudal-electric/[0.06] px-3 py-3 text-sm font-black text-white">{names[0] || 'Caudal'}</p>
                <span className="text-[10px] font-black text-slate-500">VS</span>
                <p className="rounded-xl border border-white/[0.08] bg-black/15 px-3 py-3 text-sm font-black text-white">{names[1] || model.summary.name}</p>
              </div>
              <div className="mt-3 flex justify-end"><span className="rounded-full border border-amber-300/18 bg-amber-300/[0.07] px-2.5 py-1 text-[8px] font-black uppercase text-amber-100">{duel.favorability}</span></div>
              <dl className="mt-4 grid gap-3 text-xs">
                {[['Riesgo', duel.risk], ['Motivo', duel.reason], ['Consigna', duel.instruction], ['Impacto esperado', duel.expectedImpact]].map(([label, value]) => (
                  <div key={label}><dt className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</dt><dd className="mt-1 font-semibold leading-5 text-slate-200">{value}</dd></div>
                ))}
              </dl>
              <div className="mt-3"><SourceChips sources={duel.sources} /></div>
            </article>
          ); }) : <div className="lg:col-span-2"><CompactEmpty>No existen evidencias para comparar este jugador con nuestros jugadores.</CompactEmpty></div>}
        </div>
      </section>

      <PlayerAssistant key={model.playerKey} model={model} />

      <AbsenceScenario model={model} />

      <AutomaticReport model={model} />
    </div>
  );
}
