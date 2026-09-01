import { useEffect, useState } from 'react';
import PlayerHeader from './components/player/PlayerHeader';
import PlayerNavigation from './components/player/PlayerNavigation';
import PlayerAnalysisPanel from './components/player/PlayerAnalysisPanel';
import PlayerHomeDashboard from './components/player/PlayerHomeDashboard';
import PlayerMatchesPanel from './components/player/PlayerMatchesPanel';
import PlayerPerformancePanel from './components/player/PlayerPerformancePanel';

const EMPTY_PROFILE_STATE = { status: 'loading', profile: null, errorKind: '' };
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caudal-electric focus-visible:ring-offset-2 focus-visible:ring-offset-[#02070f]';

const getProfileErrorKind = (error) => {
  const status = Number(error?.status || error?.statusCode);
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return status === 401 || code === 'PGRST301' || message.includes('jwt expired') || message.includes('invalid jwt')
    ? 'invalid_session'
    : 'profile_unavailable';
};

function PlayerApp({ client, onSignOut, signingOut = false }) {
  const [profileState, setProfileState] = useState(EMPTY_PROFILE_STATE);
  const [reloadToken, setReloadToken] = useState(0);
  const [activeSection, setActiveSection] = useState('home');

  useEffect(() => {
    let cancelled = false;
    const loadProfile = async () => {
      setProfileState(EMPTY_PROFILE_STATE);
      if (!client || typeof client.rpc !== 'function') {
        if (!cancelled) setProfileState({ status: 'error', profile: null, errorKind: 'invalid_session' });
        return;
      }
      let response;
      try {
        response = await client.rpc('get_my_player_profile');
      } catch (error) {
        if (!cancelled) setProfileState({ status: 'error', profile: null, errorKind: getProfileErrorKind(error) });
        return;
      }
      if (cancelled) return;
      if (response?.error) {
        setProfileState({ status: 'error', profile: null, errorKind: getProfileErrorKind(response.error) });
        return;
      }
      if (!Array.isArray(response?.data) || response.data.length !== 1) {
        setProfileState({ status: 'error', profile: null, errorKind: 'identity_invalid' });
        return;
      }
      const profile = response.data[0];
      if (!profile || typeof profile !== 'object' || !String(profile.jugador_id || '').trim()) {
        setProfileState({ status: 'error', profile: null, errorKind: 'identity_invalid' });
        return;
      }
      setProfileState({ status: 'ready', profile, errorKind: '' });
    };
    void loadProfile();
    return () => { cancelled = true; };
  }, [client, reloadToken]);

  return (
    <div className="min-h-screen overflow-x-clip bg-[radial-gradient(circle_at_50%_0%,rgba(61,217,255,0.10),transparent_30%),linear-gradient(180deg,#02070f_0%,#071225_52%,#030812_100%)] px-3 py-3 text-slate-100 sm:px-4 sm:py-5 lg:py-7">
      <main className="mx-auto w-full max-w-6xl space-y-3 sm:space-y-4">
        {profileState.status === 'loading' ? (
          <section role="status" className="rounded-[1.35rem] border border-white/10 bg-[#0b1220] px-5 py-12 text-center shadow-[0_16px_48px_rgba(0,0,0,0.24)]">
            <img src="/pwa-192x192.png" alt="Escudo del C.D. Caudal" className="mx-auto h-20 w-20 object-contain" />
            <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-caudal-electric">Cargando mi espacio…</p>
          </section>
        ) : null}

        {profileState.status === 'error' ? (
          <section className="mx-auto max-w-xl rounded-[1.35rem] border border-white/10 bg-[#0b1220] px-5 py-8 text-center shadow-[0_16px_48px_rgba(0,0,0,0.24)]">
            <img src="/pwa-192x192.png" alt="Escudo del C.D. Caudal" className="mx-auto h-20 w-20 object-contain" />
            <h1 className="mt-5 text-xl font-black text-white">No se pudo cargar tu perfil</h1>
            <p role="alert" className="mt-2 text-sm leading-6 text-slate-400">
              {profileState.errorKind === 'invalid_session'
                ? 'Tu sesión ha caducado. Cierra sesión y vuelve a identificarte.'
                : profileState.errorKind === 'identity_invalid'
                  ? 'No hemos podido resolver de forma segura el jugador vinculado a esta cuenta.'
                  : 'Ha ocurrido un problema temporal al cargar tu perfil.'}
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => setReloadToken((current) => current + 1)} className={`min-h-[46px] rounded-xl bg-caudal-electric px-4 py-2.5 text-sm font-black text-slate-950 ${FOCUS_RING}`}>Reintentar</button>
              <button type="button" onClick={onSignOut} disabled={signingOut} className={`min-h-[46px] rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-black text-slate-300 disabled:opacity-60 ${FOCUS_RING}`}>{signingOut ? 'Cerrando…' : 'Cerrar sesión'}</button>
            </div>
          </section>
        ) : null}

        {profileState.status === 'ready' ? (
          <>
            <PlayerHeader profile={profileState.profile} />
            <PlayerNavigation activeSection={activeSection} onChange={setActiveSection} onSignOut={onSignOut} signingOut={signingOut} />
            {activeSection === 'home' ? <PlayerHomeDashboard client={client} profile={profileState.profile} onNavigate={setActiveSection} /> : null}
            {activeSection === 'performance' ? <PlayerPerformancePanel client={client} /> : null}
            {activeSection === 'analysis' ? <PlayerAnalysisPanel client={client} /> : null}
            {activeSection === 'matches' ? <PlayerMatchesPanel client={client} /> : null}
          </>
        ) : null}
      </main>
    </div>
  );
}

export default PlayerApp;
