import { useId, useState } from 'react';

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

function RecommendationCard({ recommendation }) {
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
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={`player-rec-${detailsId}`}
        onClick={() => setExpanded((current) => !current)}
        className="mt-3 min-h-10 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-[10px] font-black text-slate-300 transition hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70"
      >
        {expanded ? 'Ocultar explicación' : 'Ver por qué'}
      </button>
      <div id={`player-rec-${detailsId}`} hidden={!expanded} className="mt-3 rounded-xl bg-[#07111f] p-3 text-xs font-semibold leading-5 text-slate-300">
        {recommendation.rationale}
      </div>
    </article>
  );
}

function RecommendationPanel({ title, eyebrow, rows }) {
  return (
    <section className="rounded-[1.8rem] bg-gradient-to-br from-[#101d31] to-[#091525] p-5 sm:p-6">
      <SectionHeader eyebrow={eyebrow} title={title} />
      <div className="mt-4 space-y-3">
        {rows.length ? rows.map((row) => <RecommendationCard key={row.id} recommendation={row} />) : (
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
        </div>
      ) : null}
    </section>
  );
}

function ProfileEditor({ profile, positionOptions, profileOptions, behaviourOptions, incompatibleTraits, onUpdateProfile, onToggleTrait }) {
  return (
    <details className="mt-5 rounded-2xl border border-white/[0.08] bg-black/15">
      <summary className="cursor-pointer list-none px-4 py-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70">Editar datos y comportamientos</summary>
      <div className="grid gap-4 border-t border-white/[0.07] p-4 lg:grid-cols-2">
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ['Posición táctica', 'position', positionOptions],
            ['Pie dominante', 'foot', ['Derecho', 'Izquierdo', 'Ambos']],
            ['Perfil principal', 'mainProfile', profileOptions],
            ['Perfil secundario', 'secondaryProfile', profileOptions.filter((value) => value !== profile.mainProfile)],
          ].map(([label, field, options]) => (
            <label key={field} className="grid gap-1 text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
              <span>{label}</span>
              <select value={profile[field] || ''} onChange={(event) => onUpdateProfile({ [field]: event.target.value })} className="h-10 min-w-0 rounded-lg border border-white/10 bg-[#07111f] px-2 text-xs font-bold normal-case tracking-normal text-white outline-none">
                <option value="">Sin información</option>
                {options.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          ))}
        </div>
        <div className="space-y-3">
          {behaviourOptions ? [
            ['Con balón', behaviourOptions.withBall],
            ['Sin balón', behaviourOptions.withoutBall],
          ].map(([label, traits]) => (
            <div key={label}>
              <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {traits.map((trait) => {
                  const active = profile.traits.some((item) => String(item).toLowerCase() === String(trait).toLowerCase());
                  return <button key={trait} type="button" aria-pressed={active} onClick={() => onToggleTrait(trait)} className={`rounded-lg border px-2 py-1.5 text-[9px] font-black ${active ? 'border-caudal-electric/25 bg-caudal-electric/10 text-caudal-electric' : 'border-white/10 bg-black/15 text-slate-500'}`}>{trait}</button>;
                })}
              </div>
            </div>
          )) : <CompactEmpty>Selecciona una posición para mostrar comportamientos compatibles.</CompactEmpty>}
          {incompatibleTraits.length ? <p className="rounded-lg bg-amber-300/[0.07] px-3 py-2 text-[10px] font-bold text-amber-100">Revisar rasgos incompatibles con la posición: {incompatibleTraits.join(', ')}.</p> : null}
        </div>
      </div>
    </details>
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
}) {
  const [observationDraft, setObservationDraft] = useState('');
  if (!model?.player) return <CompactEmpty>Sin jugadores disponibles para preparar duelos individuales.</CompactEmpty>;
  const { summary } = model;
  const addObservation = () => {
    const value = observationDraft.trim();
    if (!value) return;
    onAddObservation?.(value);
    setObservationDraft('');
  };
  return (
    <div className="min-w-0 space-y-5 xl:col-span-2" data-testid="rival-player-tactical-center">
      <section className="rounded-[1.6rem] bg-[#0a1628] p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {['Todos', 'Amenazas', 'Vigilancias', 'Debilidades', 'Perfil pendiente'].map((filter) => (
              <button key={filter} type="button" aria-pressed={playerFilter === filter} onClick={() => onChangeFilter?.(filter)} className={`min-h-9 rounded-lg border px-3 py-2 text-[9px] font-black uppercase tracking-[0.08em] ${playerFilter === filter ? 'border-caudal-electric/30 bg-caudal-electric text-slate-950' : 'border-white/10 bg-white/[0.035] text-slate-400'}`}>{filter}</button>
            ))}
          </div>
          <label className="min-w-0 lg:w-80">
            <span className="sr-only">Seleccionar jugador rival</span>
            <select value={selectedPlayerKey} onChange={(event) => onSelectPlayer?.(event.target.value)} className="h-11 w-full rounded-xl border border-white/10 bg-[#07111f] px-3 text-sm font-black text-white outline-none">
              {playerGroups.length ? playerGroups.map(({ group, players: rows }) => (
                <optgroup key={group} label={group}>
                  {rows.map((player) => <option key={player.key} value={player.key}>{player.label}</option>)}
                </optgroup>
              )) : players.map((player) => <option key={player.key} value={player.key}>{player.label}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#10223a] via-[#0b182b] to-[#07111f] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.22)] sm:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
          <PlayerPortrait key={model.playerKey} player={model.player} name={summary.name} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-caudal-electric">Resumen del jugador</p>
                <h2 className="mt-1 text-2xl font-black text-white sm:text-3xl">{summary.name}</h2>
                <p className="mt-1 text-sm font-bold text-slate-400">{summary.position || 'Posición sin registrar'}{summary.role ? ` · ${summary.role}` : ''}</p>
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
                ['Madurez', summary.maturity.label],
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
          </div>
        </div>
        <ProfileEditor profile={profile} positionOptions={positionOptions} profileOptions={profileOptions} behaviourOptions={behaviourOptions} incompatibleTraits={incompatibleTraits} onUpdateProfile={onUpdateProfile} onToggleTrait={onToggleTrait} />
      </section>

      <section className="rounded-[1.8rem] bg-[#0a1628] p-5 sm:p-6">
        <SectionHeader eyebrow="Influencia funcional" title="Impacto en el modelo colectivo" detail="Recuentos reales y cobertura por unidades de evidencia independientes." />
        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {model.impact.map((indicator) => (
            <article key={indicator.key} className="rounded-xl bg-white/[0.028] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-black text-slate-200">{indicator.label}</p>
                <span className="text-[9px] font-black text-slate-500">{indicator.evidenceCount ? `${indicator.evidenceCount} evid.` : 'Sin evidencia'}</span>
              </div>
              <div className="mt-3 rounded-lg bg-black/15 px-3 py-2" aria-label={`${indicator.evidenceCount} evidencias y ${indicator.independentEvidenceCount} unidades independientes en ${indicator.label}`}>
                <p className="text-[10px] font-black text-slate-200">{indicator.coverageLevel}</p>
                <p className="mt-1 text-[9px] font-semibold text-slate-500">{indicator.independentEvidenceCount} {indicator.independentEvidenceCount === 1 ? 'unidad independiente' : 'unidades independientes'}</p>
              </div>
              {indicator.evidenceCount ? <div className="mt-3"><SourceChips sources={indicator.sources} /></div> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-[1.8rem] bg-[#0a1628] p-5 sm:p-6">
        <SectionHeader eyebrow="Lectura individual" title="Cómo juega" />
        {model.behaviors.length ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {model.behaviors.map((group) => (
              <article key={group.key} className="rounded-[1.3rem] bg-white/[0.028] p-4">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="text-sm font-black text-white">{group.label}</h4>
                  <span className="text-[8px] font-black uppercase text-slate-500">Confianza {group.confidence}</span>
                </div>
                <div className="mt-3 space-y-2">
                  {group.items.slice(0, 5).map((item) => <p key={item.id} className="rounded-lg bg-black/15 px-3 py-2 text-xs font-semibold leading-5 text-slate-300">{item.text}</p>)}
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <SourceChips sources={group.sources} />
                  <span className="shrink-0 text-[9px] font-semibold text-slate-600">{group.items.length} evid. · {group.lastObservedAt ? formatDate(group.lastObservedAt) : 'Sin fecha'}</span>
                </div>
              </article>
            ))}
          </div>
        ) : <div className="mt-4"><CompactEmpty /></div>}
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <RecommendationPanel eyebrow="Sin balón" title="Plan defensivo" rows={model.recommendations.defense} />
        <RecommendationPanel eyebrow="Con balón" title="Cómo hacerle daño" rows={model.recommendations.attack} />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section className="rounded-[1.8rem] bg-[#0a1628] p-5 sm:p-6">
          <SectionHeader eyebrow="Patrones repetidos" title="Tendencias observadas" detail="Solo aparecen cuando existen al menos dos evidencias independientes o dos contextos reales." />
          <div className="mt-4 space-y-2">
            {model.trends.length ? model.trends.slice(0, 8).map((trend) => (
              <article key={trend.id} className="rounded-xl bg-white/[0.025] px-3.5 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-black leading-5 text-slate-200">{trend.label}</p>
                  <span className="shrink-0 text-[8px] font-black uppercase text-slate-500">{trend.confidence}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <SourceChips sources={trend.sources} />
                  <span className="text-[9px] font-semibold text-slate-600">{trend.frequency} · {trend.lastObservedAt ? formatDate(trend.lastObservedAt) : 'Fecha no registrada'}</span>
                </div>
              </article>
            )) : <CompactEmpty>No existen repeticiones suficientes para hablar de tendencia.</CompactEmpty>}
          </div>
        </section>
        <section className="rounded-[1.8rem] bg-[#0a1628] p-5 sm:p-6">
          <SectionHeader eyebrow="Red de juego" title="Relaciones tácticas" />
          <div className="mt-4 space-y-2">
            {model.relations.length ? model.relations.slice(0, 8).map((relation) => (
              <article key={relation.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.025] px-3.5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-black text-slate-200">{relation.label}</p>
                  <p className="mt-1 text-[9px] font-bold text-amber-100">{relation.classification.label} · {relation.classification.reason}</p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-300/[0.08] px-3 py-1.5 text-[10px] font-black text-amber-100">{relation.count} conexiones</span>
              </article>
            )) : <CompactEmpty>No existen conexiones vinculadas a este jugador.</CompactEmpty>}
          </div>
        </section>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section className="rounded-[1.8rem] bg-[#0a1628] p-5 sm:p-6">
          <SectionHeader eyebrow="Contexto" title="Fases del juego" />
          <div className="mt-4 space-y-3">
            {model.phases.length ? model.phases.map((phase) => (
              <div key={phase.label} className="rounded-xl bg-white/[0.025] px-3.5 py-3">
                <div className="flex items-center justify-between gap-3 text-xs font-black text-slate-200"><span>{phase.label}</span><span>{phase.count} jugada{phase.count === 1 ? '' : 's'}</span></div>
                <div className="mt-2 flex gap-1">{Array.from({ length: Math.min(phase.count, 8) }, (_, index) => <span key={index} className="h-1.5 flex-1 rounded-full bg-caudal-electric" />)}</div>
              </div>
            )) : <CompactEmpty>No existen jugadas vinculadas a este jugador.</CompactEmpty>}
          </div>
        </section>
        <section className="rounded-[1.8rem] bg-[#0a1628] p-5 sm:p-6">
          <SectionHeader eyebrow="Trazabilidad" title="Evolución del scouting" />
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              ['Partidos', model.scouting.matches],
              ['Vídeos vinculados', model.scouting.videos],
              ['Jugadas', model.scouting.plays],
              ['Conexiones', model.scouting.connections],
              ['Observaciones', model.scouting.observations],
              ['Perfil', `${model.scouting.profileCoverage.completed}/${model.scouting.profileCoverage.total}`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-white/[0.028] px-3 py-3 text-center">
                <p className="text-xl font-black text-white">{value}</p>
                <p className="mt-1 text-[8px] font-black uppercase tracking-[0.1em] text-slate-500">{label}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black/15 px-3 py-3">
            <SourceChips sources={model.scouting.sources} />
            <span className="text-[9px] font-black uppercase text-slate-300">Confianza {model.scouting.confidence}</span>
          </div>
        </section>
      </div>

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

      <PlayerAssistant key={model.playerKey} model={model} />

      <section className="rounded-[1.8rem] bg-[#0a1628] p-5 sm:p-6">
        <SectionHeader eyebrow="Emparejamientos" title="Duelos recomendados" />
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {model.duels.length ? model.duels.map((duel) => (
            <article key={duel.id} className="rounded-[1.3rem] bg-white/[0.028] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h4 className="text-sm font-black leading-5 text-white">{duel.duel}</h4>
                <span className="rounded-full border border-amber-300/18 bg-amber-300/[0.07] px-2.5 py-1 text-[8px] font-black uppercase text-amber-100">{duel.favorability}</span>
              </div>
              <dl className="mt-4 grid gap-3 text-xs">
                {[['Riesgo', duel.risk], ['Motivo', duel.reason], ['Consigna', duel.instruction], ['Impacto esperado', duel.expectedImpact]].map(([label, value]) => (
                  <div key={label}><dt className="text-[8px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</dt><dd className="mt-1 font-semibold leading-5 text-slate-200">{value}</dd></div>
                ))}
              </dl>
              <div className="mt-3"><SourceChips sources={duel.sources} /></div>
            </article>
          )) : <CompactEmpty>No existe un emparejamiento respaldado por datos suficientes.</CompactEmpty>}
        </div>
      </section>
    </div>
  );
}
