import AccordionSection from '../shared/AccordionSection';
import {
  formatPlayerAnalysisDate,
  getPlayerHistoryOutcomePresentation,
} from '../../utils/playerAnalysisPresentation';
import {
  PLAYER_ANALYSIS_CARD,
  PLAYER_ANALYSIS_FOCUS,
  PlayerAnalysisEmpty,
  PlayerAnalysisError,
  PlayerAnalysisLoading,
  PlayerAnalysisSectionHeader,
} from './PlayerAnalysisDomainState';

function Opponent({ row, compact = false }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {row.opponentCrest ? <img src={row.opponentCrest} alt="" className={`${compact ? 'h-8 w-8' : 'h-9 w-9'} shrink-0 object-contain`} loading="lazy" /> : <span aria-hidden="true" className={`${compact ? 'h-8 w-8' : 'h-9 w-9'} shrink-0 rounded-xl border border-white/10 bg-white/[0.04]`} />}
      <span className="truncate font-bold text-white">{row.opponent || 'Rival no registrado'}</span>
    </div>
  );
}

function ResultBadge({ row }) {
  const outcome = getPlayerHistoryOutcomePresentation(row.outcome);
  return (
    <span className={`inline-flex rounded-xl px-2 py-1 text-[11px] font-black ${outcome.tone}`}>
      {row.result ? `${outcome.label ? `${outcome.label} · ` : ''}${row.result}` : 'Sin resultado'}
    </span>
  );
}

function MobileHistoryCard({ row }) {
  return (
    <article className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-3.5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1"><Opponent row={row} compact /></div>
        <ResultBadge row={row} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">
        <span>{formatPlayerAnalysisDate(row.matchDate)}</span>
        <span aria-hidden="true">·</span>
        <span>{row.competitionName || 'Sin competición'}</span>
        <span aria-hidden="true">·</span>
        <span>{row.venue === 'home' ? 'Local' : row.venue === 'away' ? 'Visitante' : 'Sin localía'}</span>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-1.5 min-[390px]:grid-cols-6">
        {[
          ['Rol', row.role || 'Sin dato'],
          ['Min', row.minutes],
          ['Goles', row.goals],
          ['Asist.', row.assists],
          ['TA', row.yellowCards],
          ['TR', row.redCards],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-xl bg-black/20 px-2 py-2 text-center">
            <dt className="text-[8px] font-black uppercase tracking-[0.08em] text-slate-600">{label}</dt>
            <dd className="mt-1 truncate text-xs font-black text-slate-100">{value}</dd>
          </div>
        ))}
      </dl>
      {row.hasAllowedVideo ? <p className="mt-2 text-right text-[10px] font-bold text-caudal-electric">▶ Vídeo disponible en sus acciones</p> : null}
    </article>
  );
}

export default function PlayerAnalysisHistory({ state, onRetry, onLoadMore }) {
  if (state.status === 'loading') return <PlayerAnalysisLoading label="Cargando historial" />;
  if (state.status === 'error' && !state.rows.length) return <PlayerAnalysisError title="Historial no disponible" kind={state.errorKind} onRetry={onRetry} />;

  return (
    <AccordionSection title="Historial" subtitle="Partido a partido" defaultOpen>
      <section className={`${PLAYER_ANALYSIS_CARD} p-4 sm:p-5`}>
        <PlayerAnalysisSectionHeader
          eyebrow="Registro propio"
          title="Historial partido a partido"
          description="Participación y producción propias en el ámbito seleccionado."
          action={<span className="rounded-xl border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] font-black text-slate-300">{state.rows.length} registros</span>}
        />

        {!state.rows.length ? (
          <div className="mt-4"><PlayerAnalysisEmpty title="Sin historial en estos filtros" copy="Prueba otro ámbito de competición o localía." /></div>
        ) : (
          <>
            <div className="mt-4 grid gap-2.5 lg:hidden">
              {state.rows.map((row, index) => <MobileHistoryCard key={`${row.matchDate}-${row.opponent}-${index}`} row={row} />)}
            </div>

            <div className="mt-4 hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[980px] text-left text-xs">
                <thead className="uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    {['Fecha', 'Rival', 'Resultado', 'Competición', 'L/V', 'Rol', 'Min', 'Goles', 'Asist.', 'TA', 'TR'].map((head) => <th key={head} className="whitespace-nowrap px-2.5 py-3">{head}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {state.rows.map((row, index) => (
                    <tr key={`${row.matchDate}-${row.opponent}-${index}`} className="border-t border-white/[0.08]">
                      <td className="whitespace-nowrap px-2.5 py-3 text-slate-400">{formatPlayerAnalysisDate(row.matchDate)}</td>
                      <td className="max-w-[210px] px-2.5 py-3"><Opponent row={row} compact /></td>
                      <td className="whitespace-nowrap px-2.5 py-3"><ResultBadge row={row} /></td>
                      <td className="max-w-[170px] truncate px-2.5 py-3 text-slate-300">{row.competitionName || 'Sin competición'}</td>
                      <td className="whitespace-nowrap px-2.5 py-3 text-slate-300">{row.venue === 'home' ? 'Local' : row.venue === 'away' ? 'Visit.' : '—'}</td>
                      <td className="whitespace-nowrap px-2.5 py-3 font-bold text-slate-200">{row.role || '—'}</td>
                      <td className="px-2.5 py-3 font-black text-white">{row.minutes}</td>
                      <td className="px-2.5 py-3 text-emerald-100">{row.goals}</td>
                      <td className="px-2.5 py-3 text-caudal-electric">{row.assists}</td>
                      <td className="px-2.5 py-3 text-amber-100">{row.yellowCards}</td>
                      <td className="px-2.5 py-3 text-red-100">{row.redCards}{row.hasAllowedVideo ? <span className="ml-2 text-caudal-electric" title="Vídeo permitido disponible">▶</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {state.status === 'error' && state.rows.length ? (
          <div className="mt-4 rounded-xl border border-amber-200/15 bg-amber-200/[0.05] px-3 py-3">
            <p className="text-xs font-bold text-amber-100">No se pudo cargar la siguiente página. Lo ya cargado sigue disponible.</p>
            <button type="button" onClick={onRetry} className={`mt-2 min-h-[42px] rounded-xl bg-white/[0.07] px-3 text-[10px] font-black uppercase text-white ${PLAYER_ANALYSIS_FOCUS}`}>Reintentar página</button>
          </div>
        ) : null}

        {state.hasMore && state.status !== 'error' ? (
          <div className="mt-4 flex justify-center">
            <button type="button" disabled={state.loadingMore} onClick={onLoadMore} className={`min-h-[46px] rounded-xl border border-caudal-electric/25 bg-caudal-electric/10 px-5 text-xs font-black text-caudal-electric transition hover:bg-caudal-electric hover:text-slate-950 disabled:cursor-wait disabled:opacity-60 ${PLAYER_ANALYSIS_FOCUS}`}>
              {state.loadingMore ? 'Cargando…' : 'Ver más'}
            </button>
          </div>
        ) : null}
      </section>
    </AccordionSection>
  );
}
