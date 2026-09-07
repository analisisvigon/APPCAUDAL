const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric focus-visible:ring-offset-2 focus-visible:ring-offset-[#02070f]';

export default function PlayerNavigation({ activeSection, canManageFines = false, onChange, onSignOut, signingOut = false }) {
  const sections = [
    ['home', 'Inicio'],
    ['analysis', 'Mi análisis'],
    ['matches', 'Partidos'],
    ['performance', 'Rendimiento'],
    ['fines', 'Multas'],
    ...(canManageFines ? [['fines-management', 'Gestión de multas']] : []),
  ];
  return (
    <nav className="grid grid-cols-[minmax(0,1fr)_44px] items-start gap-2" aria-label="Espacio de jugador">
      <div className={`grid min-w-0 grid-cols-2 gap-1 rounded-[1.05rem] border border-white/[0.07] bg-black/20 p-1 min-[400px]:grid-cols-3 ${canManageFines ? 'lg:grid-cols-6' : 'sm:grid-cols-5'}`}>
        {sections.map(([section, label]) => (
          <button
            key={section}
            type="button"
            onClick={() => onChange(section)}
            aria-current={activeSection === section ? 'page' : undefined}
            className={`min-h-[44px] min-w-0 rounded-xl px-2 py-2 text-xs font-black leading-4 transition sm:min-h-12 sm:px-4 sm:text-sm ${FOCUS_RING} ${
              activeSection === section
                ? 'bg-caudal-electric text-slate-950 shadow-[0_8px_24px_rgba(79,140,255,0.22)]'
                : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onSignOut}
        disabled={signingOut}
        aria-label={signingOut ? 'Cerrando sesión' : 'Cerrar sesión'}
        className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[1.05rem] border border-white/10 bg-white/[0.045] text-slate-400 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:opacity-60 sm:h-12 sm:w-auto sm:px-4 ${FOCUS_RING}`}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
          <path d="M10 5H6.5A2.5 2.5 0 0 0 4 7.5v9A2.5 2.5 0 0 0 6.5 19H10M14.5 8l4 4-4 4M8 12h10" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        </svg>
        <span className="ml-2 hidden text-xs font-black sm:inline">{signingOut ? 'Cerrando…' : 'Salir'}</span>
      </button>
    </nav>
  );
}
