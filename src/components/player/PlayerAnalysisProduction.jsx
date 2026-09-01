import { useMemo, useState } from 'react';
import AccordionSection from '../shared/AccordionSection';
import {
  PLAYER_ANALYSIS_ACTION_FILTERS,
  buildPlayerAnalysisConnections,
  buildPlayerProductionCategories,
  buildPlayerProductionZones,
  filterPlayerProductionActions,
  formatPlayerAnalysisDate,
  getPlayerAnalysisVideoActions,
} from '../../utils/playerAnalysisPresentation';
import {
  PLAYER_ANALYSIS_CARD,
  PLAYER_ANALYSIS_FOCUS,
  PlayerAnalysisEmpty,
  PlayerAnalysisError,
  PlayerAnalysisLoading,
  PlayerAnalysisSectionHeader,
} from './PlayerAnalysisDomainState';
import PlayerAnalysisZoneMap from './PlayerAnalysisZoneMap';

const actionLabel = (action) => action.actionType === 'goal' ? 'Gol' : 'Asistencia';
const minuteLabel = (minute) => minute === null ? 'Sin minuto' : `${minute}'`;

function CategoryRows({ title, rows }) {
  if (!rows.length) return null;
  const maximum = Math.max(1, ...rows.map((row) => row.count));
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5">
      <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-white">{title}</h4>
      <div className="mt-3 space-y-2.5">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="flex items-center justify-between gap-3 text-[10px] font-bold text-slate-400">
              <span className="truncate">{row.label}</span>
              <span className="shrink-0 text-white">{row.count}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-caudal-electric/75" style={{ width: `${(row.count / maximum) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SafeVideoLink({ action, compact = false }) {
  if (!action.videoAvailable || !action.videoUrl) return null;
  return (
    <a
      href={action.videoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl bg-caudal-electric px-3 font-black text-slate-950 transition hover:bg-sky-300 ${compact ? 'text-[10px]' : 'text-xs'} ${PLAYER_ANALYSIS_FOCUS}`}
    >
      ▶ Ver vídeo
    </a>
  );
}

function ActionSummary({ action }) {
  const counterpartLabel = action.actionType === 'goal' ? 'Asistente' : 'Goleador';
  const zoneLabel = action.actionType === 'goal' ? action.shotZoneName : action.assistZoneName;
  const detailFields = [
    [counterpartLabel, action.counterpartName],
    [action.actionType === 'goal' ? 'Zona de tiro' : 'Zona de asistencia', zoneLabel],
    ['Tipo de jugada', [action.phase, action.subphase].filter(Boolean).join(' · ')],
    ['Finalización', action.actionType === 'goal' ? action.contact : ''],
    ['Destino', action.actionType === 'goal' ? action.goalZoneName : ''],
  ].filter(([, value]) => value);
  return (
    <article className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-3.5 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-black text-white">{actionLabel(action)} · {minuteLabel(action.minute)}</p>
          <p className="mt-1 truncate text-xs text-slate-300">vs {action.opponent || 'Rival no registrado'}{action.result ? ` · ${action.result}` : ''}</p>
          <p className="mt-1 text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
            {action.competitionName || 'Competición no registrada'} · {formatPlayerAnalysisDate(action.matchDate)}
          </p>
        </div>
        <SafeVideoLink action={action} compact />
      </div>
      {detailFields.length ? (
        <dl className="mt-3 grid gap-x-4 gap-y-2 min-[390px]:grid-cols-2">
          {detailFields.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">{label}</dt>
              <dd className="mt-0.5 break-words text-xs font-semibold text-slate-200">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  );
}

export default function PlayerAnalysisProduction({ state, onRetry }) {
  const [filter, setFilter] = useState('Todos');
  const actions = state.status === 'ready' ? state.data : [];
  const filteredActions = useMemo(() => filterPlayerProductionActions(actions, filter), [actions, filter]);
  const zones = useMemo(() => buildPlayerProductionZones(filteredActions), [filteredActions]);
  const categories = useMemo(() => buildPlayerProductionCategories(filteredActions), [filteredActions]);
  const connections = useMemo(() => buildPlayerAnalysisConnections(filteredActions), [filteredActions]);
  const videos = useMemo(() => getPlayerAnalysisVideoActions(filteredActions), [filteredActions]);

  if (state.status === 'loading') return <PlayerAnalysisLoading label="Cargando producción" />;
  if (state.status === 'error') return <PlayerAnalysisError title="Producción no disponible" kind={state.errorKind} onRetry={onRetry} />;

  return (
    <AccordionSection title="Producción" subtitle="Zonas, conexiones y acciones" defaultOpen>
      <section className={`${PLAYER_ANALYSIS_CARD} p-4 sm:p-5`}>
        <PlayerAnalysisSectionHeader
          eyebrow="Producción propia"
          title="Zonas y acciones"
          description="Goles y asistencias sanitizados para los filtros activos."
          action={<span className="rounded-xl border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] font-black text-slate-300">{actions.length} acciones</span>}
        />

        <div role="group" aria-label="Filtrar producción" className="mt-4 grid grid-cols-3 gap-1.5 rounded-2xl border border-white/[0.08] bg-black/20 p-1.5">
          {PLAYER_ANALYSIS_ACTION_FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={filter === option}
              onClick={() => setFilter(option)}
              className={`min-h-[42px] rounded-xl px-2 text-[10px] font-black uppercase tracking-[0.08em] transition ${filter === option ? 'bg-caudal-electric text-slate-950' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'} ${PLAYER_ANALYSIS_FOCUS}`}
            >
              {option}
            </button>
          ))}
        </div>

        {!actions.length ? (
          <div className="mt-4"><PlayerAnalysisEmpty title="Sin producción registrada" copy="No hay goles o asistencias propias en este ámbito." /></div>
        ) : !filteredActions.length ? (
          <div className="mt-4"><PlayerAnalysisEmpty title={`Sin ${filter.toLowerCase()}`} copy="Prueba otro filtro de acción o ámbito deportivo." /></div>
        ) : (
          <>
            <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filter !== 'Asistencias' ? (
                <div className="min-w-0 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-3">
                  <p className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-white">Zonas de tiro</p>
                  <PlayerAnalysisZoneMap zones={zones.shots} emptyLabel="Sin zonas de tiro" />
                </div>
              ) : null}
              {filter !== 'Goles' ? (
                <div className="min-w-0 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-3">
                  <p className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-white">Zonas de asistencia</p>
                  <PlayerAnalysisZoneMap zones={zones.assists} emptyLabel="Sin zonas de asistencia" />
                </div>
              ) : null}
              {filter !== 'Asistencias' ? (
                <div className="min-w-0 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-3">
                  <p className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-white">Zonas de portería</p>
                  <PlayerAnalysisZoneMap zones={zones.goals} compact emptyLabel="Sin destino registrado" />
                </div>
              ) : null}
            </div>

            {(categories.contacts.length || categories.phases.length || categories.subphases.length) ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <CategoryRows title="Cómo marca" rows={categories.contacts} />
                <CategoryRows title="Tipo de gol" rows={categories.phases} />
                <CategoryRows title="Detalle de jugada" rows={categories.subphases} />
              </div>
            ) : null}

            <div className="mt-5 grid min-w-0 gap-4 xl:grid-cols-[0.75fr_1.25fr]">
              <section className="min-w-0 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
                <PlayerAnalysisSectionHeader eyebrow="Relaciones" title="Conexiones" />
                {connections.length ? (
                  <div className="mt-3 divide-y divide-white/[0.08]">
                    {connections.map((connection) => (
                      <div key={connection.name} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-white">{connection.name}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">{connection.given} dadas · {connection.received} recibidas</p>
                        </div>
                        <strong className="shrink-0 rounded-xl bg-caudal-electric/10 px-2.5 py-1 text-sm text-caudal-electric">{connection.total}</strong>
                      </div>
                    ))}
                  </div>
                ) : <div className="mt-3"><PlayerAnalysisEmpty title="Sin conexiones registradas" /></div>}
              </section>

              <section className="min-w-0 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
                <PlayerAnalysisSectionHeader eyebrow="Vídeo permitido" title="Videoteca" />
                {videos.length ? (
                  <div className="mt-3 divide-y divide-white/[0.08]">
                    {videos.map((action, index) => (
                      <div key={`${action.matchDate}-${action.minute}-${action.actionType}-${index}`} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-white">{actionLabel(action)} · {minuteLabel(action.minute)}</p>
                          <p className="mt-0.5 truncate text-xs text-slate-400">{action.opponent}{action.result ? ` · ${action.result}` : ''}</p>
                          <p className="mt-0.5 text-[10px] text-slate-500">{action.competitionName} · {formatPlayerAnalysisDate(action.matchDate)}</p>
                          <p className="mt-1 text-[10px] text-slate-500">{[action.actionType === 'goal' ? action.shotZoneName : action.assistZoneName, action.counterpartName].filter(Boolean).join(' · ')}</p>
                        </div>
                        <SafeVideoLink action={action} compact />
                      </div>
                    ))}
                  </div>
                ) : <div className="mt-3"><PlayerAnalysisEmpty title="Sin vídeos disponibles" copy="Solo aparecen vídeos autorizados por el backend." /></div>}
              </section>
            </div>

            <section className="mt-5 border-t border-white/[0.08] pt-5">
              <PlayerAnalysisSectionHeader
                eyebrow="Partido a partido"
                title="Detalle de acciones"
                action={<span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{filteredActions.length} acciones</span>}
              />
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {filteredActions.map((action, index) => <ActionSummary key={`${action.matchDate}-${action.minute}-${action.actionType}-${index}`} action={action} />)}
              </div>
            </section>
          </>
        )}
      </section>
    </AccordionSection>
  );
}
