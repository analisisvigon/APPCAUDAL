import { useId, useState } from 'react';

import { getRivalRecommendationListView } from '../../utils/rivalCollectiveAssistant.js';
import {
  buildRivalMissingInformation,
  getRivalScoutingMaturity,
} from '../../utils/rivalTacticalCenter.js';
import RivalTacticalAssistant from './RivalTacticalAssistant.jsx';

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

const confidenceTone = {
  Alta: 'text-emerald-200',
  Media: 'text-amber-200',
  Baja: 'text-slate-400',
};

const formatAnalysisTimestamp = (value) => {
  if (!value) return 'Sin actualización registrada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

function SourceChips({ sources = [] }) {
  if (!sources.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Fuentes utilizadas">
      {sources.map((source) => (
        <span
          key={source}
          className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] ${sourceTone[source] || sourceTone.Perfil}`}
        >
          {source}
        </span>
      ))}
    </div>
  );
}

function EmptyState({ children }) {
  return (
    <p className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.018] px-4 py-5 text-sm font-semibold leading-6 text-slate-400">
      {children}
    </p>
  );
}

function BehaviorCard({ behavior }) {
  return (
    <article className="min-w-0 rounded-[1.35rem] bg-white/[0.028] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-caudal-electric/[0.08] text-base font-black text-caudal-electric" aria-hidden="true">
            {behavior.icon}
          </span>
          <h4 className="text-sm font-black text-white">{behavior.title}</h4>
        </div>
        {behavior.confidence ? (
          <span className={`shrink-0 text-[9px] font-black uppercase tracking-[0.12em] ${confidenceTone[behavior.confidence]}`}>
            Confianza {behavior.confidence}
          </span>
        ) : null}
      </div>
      {behavior.summary ? (
        <>
          <p className="mt-4 text-sm font-semibold leading-6 text-slate-200">{behavior.summary}</p>
          <div className="mt-4"><SourceChips sources={behavior.sources} /></div>
        </>
      ) : (
        <div className="mt-4"><EmptyState>{behavior.emptyMessage}</EmptyState></div>
      )}
    </article>
  );
}

function RecommendationCard({ recommendation }) {
  const [expanded, setExpanded] = useState(false);
  const reactId = useId();
  const detailsId = `rival-recommendation-${reactId.replace(/:/g, '')}`;
  return (
    <article className="rounded-[1.35rem] bg-black/15 p-4 transition hover:bg-black/20 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.12em] ${priorityTone[recommendation.priority]}`}>
            {recommendation.priority}
          </span>
          {recommendation.evidenceLabel ? <span className="rounded-full border border-white/[0.08] bg-white/[0.025] px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-slate-400">{recommendation.evidenceLabel}</span> : null}
        </div>
        <span className={`text-[9px] font-black uppercase tracking-[0.12em] ${confidenceTone[recommendation.confidence]}`}>
          Confianza {recommendation.confidence}
        </span>
      </div>
      <h4 className="mt-3 text-base font-black leading-6 text-white">{recommendation.action}</h4>
      <div className="mt-3 rounded-xl bg-white/[0.025] px-3 py-2.5">
        <p className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-500">Impacto esperado</p>
        <p className="mt-1 text-xs font-bold leading-5 text-slate-200">{recommendation.expectedImpact}</p>
      </div>
      <div className="mt-3"><SourceChips sources={recommendation.sources} /></div>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={() => setExpanded((current) => !current)}
        className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-[10px] font-black text-slate-300 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70"
      >
        {expanded ? 'Ocultar explicación' : 'Ver por qué'}
        <span aria-hidden="true" className={`transition ${expanded ? 'rotate-180' : ''}`}>⌄</span>
      </button>
      <div id={detailsId} hidden={!expanded} className="mt-3 rounded-xl border border-white/[0.06] bg-[#07111f] p-3 text-xs leading-5 text-slate-300">
        <p><span className="font-black text-white">Comportamiento y regla:</span> {recommendation.rationale}</p>
        <p className="mt-2"><span className="font-black text-white">Impacto:</span> {recommendation.expectedImpact}</p>
        <p className="mt-2"><span className="font-black text-white">Confianza:</span> {recommendation.confidence}</p>
        {recommendation.traceabilityExplanation ? <p className="mt-2"><span className="font-black text-white">Trazabilidad:</span> {recommendation.traceabilityExplanation}</p> : null}
        <p className="mt-2"><span className="font-black text-white">Unidades independientes:</span> {recommendation.independentSourceCount || 0}</p>
        <div className="mt-2"><SourceChips sources={recommendation.sources} /></div>
        <div className="mt-3 space-y-1.5">
          <p className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-500">Evidencias concretas</p>
          {recommendation.evidence.map((evidence) => (
            <p key={evidence.id} className="rounded-lg bg-white/[0.025] px-2.5 py-2">
              <span className="font-black text-slate-100">{evidence.source}{evidence.playerName ? ` · ${evidence.playerName}` : ''}:</span> {evidence.text}
            </p>
          ))}
        </div>
      </div>
    </article>
  );
}

function RecommendationSection({ title, eyebrow, recommendations, emptyMessage, tone = 'defense' }) {
  const [expanded, setExpanded] = useState(false);
  const view = getRivalRecommendationListView(recommendations, expanded);
  return (
    <section className={`min-w-0 rounded-[1.8rem] p-5 sm:p-6 ${
      tone === 'attack'
        ? 'bg-gradient-to-br from-[#0d1d2c] to-[#091525] shadow-[0_22px_70px_rgba(17,94,89,0.08)]'
        : 'bg-gradient-to-br from-[#101a2b] to-[#091525] shadow-[0_22px_70px_rgba(30,64,175,0.08)]'
    }`}>
      <p className={`text-[9px] font-black uppercase tracking-[0.2em] ${tone === 'attack' ? 'text-emerald-300' : 'text-caudal-electric'}`}>{eyebrow}</p>
      <h3 className="mt-1 text-xl font-black text-white sm:text-2xl">{title}</h3>
      <div className="mt-5 space-y-3">
        {view.items.length
          ? view.items.map((recommendation) => <RecommendationCard key={recommendation.id} recommendation={recommendation} />)
          : <EmptyState>{emptyMessage}</EmptyState>}
      </div>
      {recommendations.length > 5 ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
          className="mt-4 min-h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-2.5 text-xs font-black text-slate-300 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70"
        >
          {expanded ? 'Mostrar solo las cinco principales' : `Ver ${view.hiddenCount} recomendaciones más`}
        </button>
      ) : null}
    </section>
  );
}

export default function RivalCollectiveAssistant({ model, onEditCollectiveProfile, onCompleteMissingInformation }) {
  if (!model) return null;
  const maturity = getRivalScoutingMaturity(model);
  const missingInformation = buildRivalMissingInformation(model);
  const visibleBehaviors = model.behaviors.filter((behavior) => behavior.summary);
  const maturityTone = {
    initial: 'border-slate-300/15 bg-slate-300/[0.05] text-slate-300',
    partial: 'border-amber-300/18 bg-amber-300/[0.07] text-amber-100',
    consolidated: 'border-emerald-300/18 bg-emerald-300/[0.07] text-emerald-100',
  }[maturity.key];
  const getCoverageTone = (source) => {
    if (!source.available) return 'border-white/[0.06] bg-white/[0.018] text-slate-500';
    const consolidated = source.key === 'video' || source.count >= 3 || (source.key === 'profile' && source.count >= 5);
    return consolidated
      ? 'border-emerald-300/18 bg-emerald-300/[0.07] text-emerald-100'
      : 'border-amber-300/18 bg-amber-300/[0.07] text-amber-100';
  };
  return (
    <div className="min-w-0 space-y-5 xl:col-span-2" data-testid="rival-collective-assistant">
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#10223a] via-[#0b182b] to-[#07111f] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.22)] sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-caudal-electric">Resumen del rival</p>
            <h2 className="mt-2 truncate text-2xl font-black text-white sm:text-3xl">{model.rivalName}</h2>
          </div>
          {onEditCollectiveProfile ? (
            <button
              type="button"
              onClick={onEditCollectiveProfile}
              className="shrink-0 rounded-xl border border-white/[0.09] bg-white/[0.035] px-3 py-2 text-[9px] font-black text-slate-300 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70 sm:px-4 sm:text-[10px]"
            >
              Editar perfil colectivo
            </button>
          ) : null}
        </div>
        <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-wrap gap-x-7 gap-y-4">
              <div>
                <p className="text-[8px] font-black uppercase tracking-[0.15em] text-slate-500">Sistema habitual</p>
                <p className="mt-1 text-xl font-black text-white">{model.summary.usualSystem}</p>
              </div>
              <div>
                <p className="text-[8px] font-black uppercase tracking-[0.15em] text-slate-500">Partidos analizados</p>
                <p className="mt-1 text-xl font-black text-white">{model.summary.analyzedMatchCount}</p>
              </div>
              <div>
                <p className="text-[8px] font-black uppercase tracking-[0.15em] text-slate-500">Última actualización</p>
                <p className="mt-1 text-sm font-black text-slate-200">{formatAnalysisTimestamp(model.summary.lastUpdatedAt)}</p>
              </div>
              <div>
                <p className="text-[8px] font-black uppercase tracking-[0.15em] text-slate-500">Madurez del scouting</p>
                <span className={`mt-1 inline-flex rounded-full border px-3 py-1.5 text-[9px] font-black ${maturityTone}`} title={maturity.detail}>
                  {maturity.label}
                </span>
              </div>
          </div>
          {model.summary.profileChips.length ? (
            <div className="flex max-w-2xl flex-wrap gap-2 lg:justify-end">
              {model.summary.profileChips.map((chip, index) => (
                <span
                  key={`${chip.label}-${chip.value}-${index}`}
                  className={`rounded-full border px-3 py-1.5 text-[9px] font-bold ${
                    chip.tone === 'positive'
                      ? 'border-emerald-300/15 bg-emerald-300/[0.06] text-emerald-100'
                      : chip.tone === 'warning'
                        ? 'border-amber-300/15 bg-amber-300/[0.06] text-amber-100'
                        : 'border-white/[0.08] bg-white/[0.035] text-slate-200'
                  }`}
                >
                  <span className="font-black text-slate-500">{chip.label}</span> · {chip.value}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {model.summary.emptyMessage ? <div className="mt-5"><EmptyState>{model.summary.emptyMessage}</EmptyState></div> : null}
      </section>

      <RivalTacticalAssistant model={model} missingInformation={missingInformation} />

      <section className="rounded-[1.8rem] bg-[#0a1628] p-5 sm:p-6">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-caudal-electric">Lectura colectiva</p>
        <h3 className="mt-1 text-xl font-black text-white sm:text-2xl">Cómo atacan</h3>
        {visibleBehaviors.length ? (
          <div className={`mt-5 grid gap-3 ${visibleBehaviors.length > 1 ? 'sm:grid-cols-2' : ''} ${visibleBehaviors.length > 2 ? 'xl:grid-cols-4' : ''}`}>
            {visibleBehaviors.map((behavior) => <BehaviorCard key={behavior.key} behavior={behavior} />)}
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-white/[0.02] px-4 py-3 text-sm font-semibold text-slate-400">
            No existen evidencias suficientes para describir el comportamiento ofensivo del rival.
          </p>
        )}
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <RecommendationSection
          title="Cómo defenderles"
          eyebrow="Plan defensivo"
          recommendations={model.recommendations.defense}
          emptyMessage={model.recommendations.defenseEmptyMessage}
        />
        <RecommendationSection
          title="Cómo hacerles daño"
          eyebrow="Plan ofensivo"
          tone="attack"
          recommendations={model.recommendations.attack}
          emptyMessage={model.recommendations.attackEmptyMessage}
        />
      </div>

      <section className="rounded-[1.8rem] bg-[#0a1628] p-5 sm:p-6">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-caudal-electric">Siguiente paso</p>
        <h3 className="mt-1 text-xl font-black text-white sm:text-2xl">Información que falta</h3>
        {missingInformation.length ? (
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {missingInformation.map((item) => (
              <article key={item.id} className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-white/[0.025] px-3.5 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold leading-5 text-slate-300">{item.text}</p>
                  <p className="mt-0.5 text-[9px] font-semibold text-slate-600">Destino · {item.destinationLabel}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onCompleteMissingInformation?.(item.destination)}
                  className="shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-[9px] font-black text-slate-300 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric/70"
                >
                  Completar
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-emerald-300/[0.045] px-4 py-3 text-sm font-semibold text-emerald-100">
            Las fuentes colectivas principales están registradas.
          </p>
        )}
      </section>

      <section className="rounded-[1.8rem] bg-[#0a1628] px-5 py-4 sm:px-6">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-caudal-electric">Trazabilidad</p>
        <h3 className="mt-1 text-xl font-black text-white sm:text-2xl">Evidencias que respaldan el plan</h3>
        {model.evidenceEmptyMessage ? (
          <div className="mt-5"><EmptyState>{model.evidenceEmptyMessage}</EmptyState></div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {model.evidenceCoverage.map((source) => (
              <span
                key={source.key}
                title={`${source.label} · ${source.detail}`}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[9px] font-black ${getCoverageTone(source)}`}
              >
                {source.key === 'evidences' ? 'Observaciones' : source.label}
                {source.key === 'video' ? (source.available ? 'Disponible' : 'No disponible') : source.count}
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
