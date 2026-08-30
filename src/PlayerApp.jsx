import { useEffect, useState } from 'react';
import PlayerAvatar from './components/player/PlayerAvatar';
import PlayerPerformancePanel from './components/player/PlayerPerformancePanel';

const EMPTY_PROFILE_STATE = {
  status: 'loading',
  profile: null,
};

function PlayerApp({ client, onSignOut, signingOut = false }) {
  const [profileState, setProfileState] = useState(EMPTY_PROFILE_STATE);
  const [reloadToken, setReloadToken] = useState(0);
  const [activeSection, setActiveSection] = useState('space');

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      setProfileState(EMPTY_PROFILE_STATE);

      if (!client || typeof client.rpc !== 'function') {
        if (!cancelled) setProfileState({ status: 'error', profile: null });
        return;
      }

      let response;
      try {
        response = await client.rpc('get_my_player_profile');
      } catch {
        if (!cancelled) setProfileState({ status: 'error', profile: null });
        return;
      }

      if (cancelled) return;
      if (response?.error || !Array.isArray(response?.data) || response.data.length !== 1) {
        setProfileState({ status: 'error', profile: null });
        return;
      }

      const profile = response.data[0];
      if (!profile || typeof profile !== 'object' || !String(profile.jugador_id || '').trim()) {
        setProfileState({ status: 'error', profile: null });
        return;
      }

      setProfileState({ status: 'ready', profile });
    };

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [client, reloadToken]);

  const profile = profileState.profile;
  const shirtName = String(profile?.shirt_name || '').trim();
  const fullName = String(profile?.name || '').trim() || 'Jugador';
  const dorsal = Number.isInteger(profile?.number) && profile.number > 0
    ? String(profile.number)
    : '—';
  const playerPosition = String(profile?.player_position || '').trim() || 'Sin posición asignada';

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_50%_0%,rgba(61,217,255,0.12),transparent_34%),linear-gradient(180deg,#02070f_0%,#071225_52%,#030812_100%)] px-4 py-8 text-slate-100">
      <main className="mx-auto max-w-4xl">
        <section className="w-full rounded-[1.65rem] border border-white/10 bg-[#081326]/90 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.38)] backdrop-blur-md sm:p-7">
          {profileState.status === 'ready' ? (
            <nav className="mb-5 grid grid-cols-2 gap-2 rounded-2xl bg-black/20 p-1" aria-label="Espacio de jugador">
              {[
                ['space', 'Mi espacio'],
                ['performance', 'Mi rendimiento'],
              ].map(([section, label]) => (
                <button
                  key={section}
                  type="button"
                  onClick={() => setActiveSection(section)}
                  aria-current={activeSection === section ? 'page' : undefined}
                  className={`min-h-[46px] rounded-xl px-3 py-2 text-sm font-black transition ${
                    activeSection === section
                      ? 'bg-caudal-electric text-slate-950'
                      : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>
          ) : null}

          {profileState.status === 'loading' ? (
            <div role="status" className="py-10 text-center">
              <img
                src="/pwa-192x192.png"
                alt="Escudo del C.D. Caudal"
                className="mx-auto h-24 w-24 object-contain"
              />
              <p className="mt-6 text-sm font-black uppercase tracking-[0.18em] text-caudal-electric">
                Cargando mi perfil…
              </p>
            </div>
          ) : null}

          {profileState.status === 'error' ? (
            <div className="py-6 text-center">
              <img
                src="/pwa-192x192.png"
                alt="Escudo del C.D. Caudal"
                className="mx-auto h-24 w-24 object-contain"
              />
              <h1 className="mt-6 text-2xl font-black text-white">No se pudo cargar tu perfil</h1>
              <p role="alert" className="mt-3 text-sm leading-6 text-slate-400">
                Tu sesión está activa, pero no hemos podido resolver de forma segura el jugador vinculado.
              </p>
              <button
                type="button"
                onClick={() => setReloadToken((current) => current + 1)}
                className="mt-7 min-h-[50px] w-full rounded-2xl bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white/15"
              >
                Reintentar
              </button>
            </div>
          ) : null}

          {profileState.status === 'ready' && activeSection === 'space' ? (
            <div className="mx-auto max-w-xl py-3 text-center">
              <PlayerAvatar
                player={profile}
                alt={fullName}
                className="mx-auto h-36 w-36 rounded-[2rem] border border-white/15 shadow-[0_18px_46px_rgba(0,0,0,0.35)] sm:h-40 sm:w-40"
                fallbackTextClassName="text-3xl"
              />
              <p className="mt-7 text-[11px] font-black uppercase tracking-[0.26em] text-caudal-electric/90">
                Mi perfil
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
                {shirtName || fullName}
              </h1>
              {shirtName && shirtName.toLocaleLowerCase('es') !== fullName.toLocaleLowerCase('es') ? (
                <p className="mt-2 text-sm font-semibold text-slate-400">{fullName}</p>
              ) : null}
              <div className="mt-7 grid grid-cols-2 gap-3 text-left">
                <div className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Dorsal</p>
                  <p className="mt-1 text-2xl font-black text-white">{dorsal}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Posición</p>
                  <p className="mt-1 text-sm font-black leading-7 text-white">{playerPosition}</p>
                </div>
              </div>
            </div>
          ) : null}

          {profileState.status === 'ready' && activeSection === 'performance' ? (
            <PlayerPerformancePanel client={client} />
          ) : null}

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
