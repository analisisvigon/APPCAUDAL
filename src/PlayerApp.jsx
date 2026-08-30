function PlayerApp({ onSignOut, signingOut = false }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_50%_0%,rgba(61,217,255,0.12),transparent_34%),linear-gradient(180deg,#02070f_0%,#071225_52%,#030812_100%)] px-4 py-8 text-slate-100">
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl items-center justify-center">
        <section className="w-full rounded-[1.65rem] border border-white/10 bg-[#081326]/90 p-7 text-center shadow-[0_24px_80px_rgba(0,0,0,0.38)] backdrop-blur-md sm:p-10">
          <img
            src="/pwa-192x192.png"
            alt="Escudo del C.D. Caudal"
            className="mx-auto h-28 w-28 object-contain"
          />
          <p className="mt-6 text-[11px] font-black uppercase tracking-[0.26em] text-caudal-electric/90">
            Espacio personal
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Mi espacio</h1>
          <p className="mt-3 text-sm font-semibold text-slate-400">Acceso de jugador activo</p>
          <button
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
            className="mt-8 inline-flex min-h-[50px] w-full items-center justify-center rounded-2xl bg-caudal-electric px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-[#7aacff] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </button>
        </section>
      </main>
    </div>
  );
}

export default PlayerApp;

