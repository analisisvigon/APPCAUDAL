export const PLAYER_ANALYSIS_CARD = 'min-w-0 rounded-[1.35rem] border border-white/10 bg-[#0b1424]/92 shadow-[0_16px_42px_rgba(0,0,0,0.18)]';
export const PLAYER_ANALYSIS_FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric focus-visible:ring-offset-2 focus-visible:ring-offset-[#081326]';

export function PlayerAnalysisSectionHeader({ eyebrow, title, description = '', action = null }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? <p className="text-[9px] font-black uppercase tracking-[0.2em] text-caudal-electric/80">{eyebrow}</p> : null}
        <h3 className="mt-1 text-base font-black text-white sm:text-lg">{title}</h3>
        {description ? <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function PlayerAnalysisLoading({ label = 'Cargando datos' }) {
  return (
    <div role="status" aria-live="polite" className={`${PLAYER_ANALYSIS_CARD} animate-pulse p-4 sm:p-5`}>
      <div className="h-3 w-28 rounded-full bg-white/10" />
      <div className="mt-3 h-6 w-52 max-w-full rounded-full bg-white/10" />
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <div key={item} className="h-20 rounded-2xl bg-white/[0.055]" />)}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

const errorCopy = (kind) => {
  if (kind === 'invalid_session') return 'Tu sesión ya no es válida. Vuelve a identificarte.';
  if (kind === 'identity_invalid') return 'No se pudo resolver este bloque para tu cuenta.';
  return 'No se pudo cargar este bloque. Comprueba tu conexión y vuelve a intentarlo.';
};

export function PlayerAnalysisError({ title, kind, onRetry }) {
  return (
    <section className={`${PLAYER_ANALYSIS_CARD} p-5`}>
      <p role="alert" className="text-sm font-black text-white">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-400">{errorCopy(kind)}</p>
      <button type="button" onClick={onRetry} className={`mt-4 min-h-[44px] rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-black text-white transition hover:bg-white/10 ${PLAYER_ANALYSIS_FOCUS}`}>
        Reintentar
      </button>
    </section>
  );
}

export function PlayerAnalysisEmpty({ title, copy }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] px-4 py-5 text-center">
      <p className="text-sm font-black text-slate-200">{title}</p>
      {copy ? <p className="mt-1 text-xs leading-5 text-slate-500">{copy}</p> : null}
    </div>
  );
}
