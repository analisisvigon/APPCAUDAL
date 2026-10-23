import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import PlayerApp from './PlayerApp';
import { resolveAppIdentity } from './auth/resolveAppIdentity';
import { loadAuthorizedSportsContexts, verifySportsContext } from './sports/authorizedContext';
import { findPreferredActiveContext } from './sports/primaryContext';
import { supabase } from './lib/supabase';

const StaffApp = lazy(() => import('./App'));
const CtsCoreApp = lazy(() => import('./sports/CtsCoreApp'));
const ENABLE_CTS_FRONTEND = import.meta.env.VITE_MULTICLUB_03_CTS_ENABLED === 'true';
const PREFERRED_ACTIVE_CTS_ID = import.meta.env.VITE_MULTICLUB_PRIMARY_CTS_ID || '';

const INITIAL_AUTH_STATE = {
  status: 'loading_session',
  session: null,
  identity: null,
};

const RESOLVED_STATUSES = new Set(['staff', 'player', 'denied', 'multiple_memberships']);

const logTechnicalAuthError = (context, error) => {
  if (import.meta.env.DEV) console.error(`[APP_AUTH:${context}]`, error);
};

function LoadingScreen({ message }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#02070f] px-6 text-center text-slate-100">
      <div>
        <img src="/branding/nexo-symbol-dark.png" alt="NEXO CLUB" className="mx-auto h-28 w-28 object-contain" />
        <p className="mt-5 text-sm font-black uppercase tracking-[0.18em] text-caudal-electric">{message}</p>
      </div>
    </div>
  );
}

function LoginScreen({ form, submitting, error, onChange, onSubmit }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_50%_0%,rgba(61,217,255,0.10),transparent_34%),linear-gradient(180deg,#02070f_0%,#071225_48%,#030812_100%)] text-slate-100">
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 py-7 text-center sm:px-6 sm:py-10">
        <section className="w-full rounded-[1.65rem] border border-white/10 bg-[#081326]/88 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.38)] backdrop-blur-md sm:p-8">
          <img src="/branding/nexo-lockup-dark.png" alt="Logotipo de NEXO CLUB" className="mx-auto h-auto w-64 max-w-full object-contain" />
          <p className="mt-5 text-[11px] font-black uppercase tracking-[0.26em] text-caudal-electric/90">Acceso privado</p>
          <h1 className="sr-only">NEXO CLUB</h1>
          <p className="mt-2 text-sm font-medium text-slate-500">Tu espacio de análisis, planificación y gestión de fútbol</p>
          {error ? (
            <p role="alert" className="mx-auto mt-5 max-w-sm rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </p>
          ) : null}
          <form onSubmit={onSubmit} className="mobile-form-controls mx-auto mt-7 grid max-w-sm gap-4 text-left sm:mt-8">
            <label className="space-y-2 text-sm font-semibold text-slate-300">
              <span className="text-xs uppercase tracking-[0.16em] text-slate-500">Email</span>
              <input
                required
                type="email"
                name="email"
                value={form.email}
                onChange={onChange}
                autoComplete="email"
                className="min-h-[52px] w-full rounded-2xl border border-white/15 bg-white/[0.075] px-4 py-3 text-sm font-medium text-white shadow-inner transition duration-200 placeholder:text-slate-400 hover:border-white/25 focus:border-caudal-electric focus:bg-white/[0.095] focus:shadow-[0_0_0_4px_rgba(61,217,255,0.10)]"
                placeholder="tu@email.com"
              />
            </label>
            <label className="space-y-2 text-sm font-semibold text-slate-300">
              <span className="text-xs uppercase tracking-[0.16em] text-slate-500">Contraseña</span>
              <input
                required
                type="password"
                name="password"
                value={form.password}
                onChange={onChange}
                autoComplete="current-password"
                className="min-h-[52px] w-full rounded-2xl border border-white/15 bg-white/[0.075] px-4 py-3 text-sm font-medium text-white shadow-inner transition duration-200 placeholder:text-slate-400 hover:border-white/25 focus:border-caudal-electric focus:bg-white/[0.095] focus:shadow-[0_0_0_4px_rgba(61,217,255,0.10)]"
                placeholder="Tu contraseña"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="mt-2 inline-flex min-h-[52px] items-center justify-center rounded-2xl bg-gradient-to-r from-white to-slate-200 px-6 py-3 text-sm font-black text-slate-950 transition duration-200 hover:-translate-y-0.5 hover:from-caudal-electric hover:to-[#aeefff] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? 'Comprobando…' : 'Iniciar sesión'}
            </button>
          </form>
          <p className="mx-auto mt-5 max-w-sm text-sm leading-6 text-slate-500">
            Acceso exclusivo para usuarios autorizados de NEXO CLUB
          </p>
        </section>
      </main>
    </div>
  );
}

function AccessMessage({ title, message, onRetry, retryLabel = 'Reintentar', onSignOut, signingOut }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#02070f] px-4 py-8 text-slate-100">
      <main className="w-full max-w-lg rounded-[1.65rem] border border-white/10 bg-[#081326]/90 p-7 text-center shadow-[0_24px_80px_rgba(0,0,0,0.38)] sm:p-9">
        <img src="/branding/nexo-symbol-dark.png" alt="NEXO CLUB" className="mx-auto h-24 w-24 object-contain" />
        <h1 className="mt-6 text-2xl font-black text-white">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">{message}</p>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          {onRetry ? (
            <button type="button" onClick={onRetry} className="min-h-12 rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold text-white hover:bg-white/15">
              {retryLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
            className={`${onRetry ? '' : 'sm:col-span-2'} min-h-12 rounded-2xl bg-caudal-electric px-4 py-3 text-sm font-black text-slate-950 hover:bg-[#7aacff] disabled:opacity-60`}
          >
            {signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </button>
        </div>
      </main>
    </div>
  );
}

function TeamSelector({ contexts, preferredId, onSelect, onSignOut, busy, error }) {
  const orderedContexts = [...contexts].sort((a, b) =>
    Number(b.id === preferredId) - Number(a.id === preferredId));
  return <main className="min-h-screen bg-[#02070f] px-4 py-10 text-slate-100">
    <div className="mx-auto max-w-4xl">
      <img src="/branding/nexo-lockup-dark.png" alt="NEXO CLUB" className="h-24 w-auto" />
      <h1 className="mt-7 text-2xl font-black">Elige equipo y temporada</h1>
      <p className="mt-2 text-sm text-slate-400">Solo aparecen espacios autorizados para tu cuenta.</p>
      {error && <p role="alert" className="mt-5 rounded-xl bg-red-500/10 p-4 text-red-100">{error}</p>}
      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        {orderedContexts.map((context) => <button type="button" key={context.id}
          disabled={busy} onClick={() => onSelect(context.id)}
          className="flex min-h-28 items-center gap-4 rounded-2xl border border-white/10 bg-[#081326] p-4 text-left hover:border-caudal-electric/60 disabled:opacity-50">
          {context.teamCrest ? <img src={context.teamCrest} alt="" className="h-14 w-14 object-contain" />
            : <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/10">⚽</span>}
          <span className="min-w-0">
            <span className="block text-xs font-bold text-caudal-electric">{context.id === preferredId ? 'Espacio preferido · ' : ''}{context.clubName}</span>
            <span className="block truncate text-base font-black">{context.teamName}</span>
            <span className="block text-xs text-slate-400">{context.seasonLabel} · {context.seasonStatus === 'open' ? 'Temporada abierta' : 'Temporada cerrada'}</span>
          </span>
        </button>)}
      </div>
      {!contexts.length && <p className="mt-6 text-slate-400">No hay equipos y temporadas autorizados.</p>}
      <button type="button" onClick={onSignOut} className="mt-8 rounded-xl border border-white/20 px-4 py-2 text-sm">Cerrar sesión</button>
    </div>
  </main>;
}

function AppAuthShell() {
  const [authState, setAuthState] = useState(INITIAL_AUTH_STATE);
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [selectedSportsContext, setSelectedSportsContext] = useState(null);
  const [selectorContexts, setSelectorContexts] = useState(null);
  const [selectorBusy, setSelectorBusy] = useState(false);
  const [selectorError, setSelectorError] = useState('');
  const [showSelector, setShowSelector] = useState(false);
  const mountedRef = useRef(false);
  const stateRef = useRef(INITIAL_AUTH_STATE);
  const resolutionGenerationRef = useRef(0);
  const resolvingUserIdRef = useRef('');
  const sessionRequestRef = useRef(0);
  const contextRequestRef = useRef(0);
  const autoAttemptedRef = useRef('');

  const commitAuthState = useCallback((nextState) => {
    if (!mountedRef.current) return;
    stateRef.current = nextState;
    setAuthState(nextState);
  }, []);

  const resolveSessionIdentity = useCallback((nextSession) => {
    const userId = String(nextSession?.user?.id || '');
    if (!userId) return;
    const generation = ++resolutionGenerationRef.current;
    resolvingUserIdRef.current = userId;
    commitAuthState({ status: 'resolving_identity', session: nextSession, identity: null });
    contextRequestRef.current += 1;
    autoAttemptedRef.current = '';
    setShowSelector(false);
    setSelectedSportsContext(null);
    setSelectorContexts(null);

    void resolveAppIdentity(supabase, nextSession)
      .then((identity) => {
        if (
          !mountedRef.current
          || generation !== resolutionGenerationRef.current
          || resolvingUserIdRef.current !== userId
        ) return;
        const latestSession = String(stateRef.current.session?.user?.id || '') === userId
          ? stateRef.current.session
          : nextSession;
        commitAuthState({ status: identity.kind, session: latestSession, identity });
      })
      .catch((error) => {
        if (
          !mountedRef.current
          || generation !== resolutionGenerationRef.current
          || resolvingUserIdRef.current !== userId
        ) return;
        logTechnicalAuthError('IDENTITY_RESOLUTION', error);
        const latestSession = String(stateRef.current.session?.user?.id || '') === userId
          ? stateRef.current.session
          : nextSession;
        commitAuthState({ status: 'identity_error', session: latestSession, identity: null });
      });
  }, [commitAuthState]);

  const applySessionSnapshot = useCallback((nextSession, event = 'SESSION_CHECK') => {
    const nextUserId = String(nextSession?.user?.id || '');
    if (!nextUserId) {
      resolutionGenerationRef.current += 1;
      resolvingUserIdRef.current = '';
      commitAuthState({ status: 'unauthenticated', session: null, identity: null });
      contextRequestRef.current += 1;
      autoAttemptedRef.current = '';
      setShowSelector(false);
      setSelectedSportsContext(null);
      setSelectorContexts(null);
      return;
    }

    const currentState = stateRef.current;
    const currentUserId = String(currentState.session?.user?.id || '');
    const sameUser = currentUserId === nextUserId;

    if (sameUser && currentState.status === 'resolving_identity') {
      commitAuthState({ ...currentState, session: nextSession });
      return;
    }
    if (
      sameUser
      && RESOLVED_STATUSES.has(currentState.status)
      && ['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED', 'SESSION_CHECK'].includes(event)
    ) {
      commitAuthState({ ...currentState, session: nextSession });
      return;
    }

    resolveSessionIdentity(nextSession);
  }, [commitAuthState, resolveSessionIdentity]);

  const checkCurrentSession = useCallback(async () => {
    const requestId = ++sessionRequestRef.current;
    commitAuthState({ status: 'loading_session', session: null, identity: null });
    const { data, error } = await supabase.auth.getSession();
    if (!mountedRef.current || requestId !== sessionRequestRef.current) return;
    if (error) {
      logTechnicalAuthError('GET_SESSION', error);
      commitAuthState({ status: 'identity_error', session: null, identity: null });
      return;
    }
    applySessionSnapshot(data.session ?? null, 'SESSION_CHECK');
  }, [applySessionSnapshot, commitAuthState]);

  useEffect(() => {
    mountedRef.current = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      sessionRequestRef.current += 1;
      window.setTimeout(() => {
        if (mountedRef.current) applySessionSnapshot(nextSession, event);
      }, 0);
    });
    void checkCurrentSession();

    return () => {
      mountedRef.current = false;
      resolutionGenerationRef.current += 1;
      sessionRequestRef.current += 1;
      subscription.unsubscribe();
    };
  }, [applySessionSnapshot, checkCurrentSession]);

  const handleAuthFormChange = (event) => {
    const { name, value } = event.target;
    setAuthForm((current) => ({ ...current, [name]: value }));
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setAuthError('');
    setAuthSubmitting(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: authForm.email.trim(),
      password: authForm.password,
    });
    if (error) {
      logTechnicalAuthError('SIGN_IN', error);
      setAuthError('No se pudo iniciar sesión. Revisa tus credenciales y vuelve a intentarlo.');
      setAuthSubmitting(false);
      return;
    }
    setAuthForm((current) => ({ ...current, password: '' }));
    setAuthSubmitting(false);
    if (data.session) applySessionSnapshot(data.session, 'SIGNED_IN');
  };

  const handleSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    setAuthError('');
    resolutionGenerationRef.current += 1;
    resolvingUserIdRef.current = '';
    contextRequestRef.current += 1;
    const previousSession = stateRef.current.session;
    commitAuthState({ status: 'loading_session', session: null, identity: null });
    const { error } = await supabase.auth.signOut();
    if (error) {
      logTechnicalAuthError('SIGN_OUT', error);
      commitAuthState({ status: 'identity_error', session: previousSession, identity: null });
      setSigningOut(false);
      return;
    }
    applySessionSnapshot(null, 'SIGNED_OUT');
    setSigningOut(false);
  }, [applySessionSnapshot, commitAuthState, signingOut]);

  const retryIdentity = () => {
    const currentSession = stateRef.current.session;
    if (currentSession?.user?.id) resolveSessionIdentity(currentSession);
    else void checkCurrentSession();
  };

  useEffect(() => {
    const identity = authState.identity;
    const isOwner = (authState.status === 'staff' && identity?.membership?.role === 'owner')
      || (authState.status === 'multiple_memberships'
        && identity?.memberships?.every((row) => row.role === 'owner'));
    if (!ENABLE_CTS_FRONTEND || !isOwner || selectorContexts) return;
    let cancelled = false;
    void loadAuthorizedSportsContexts(supabase).then((contexts) => {
      if (!cancelled) setSelectorContexts(contexts.filter((row) => row.role === 'owner'));
    }).catch((error) => {
      logTechnicalAuthError('CONTEXT_LIST', error);
      if (!cancelled) setSelectorError('No se pudieron verificar tus equipos.');
    });
    return () => { cancelled = true; };
  }, [authState.identity, authState.status, selectorContexts]);

  const chooseSportsContext = async (requestedId) => {
    const request = ++contextRequestRef.current;
    const userId = String(stateRef.current.session?.user?.id || '');
    setSelectorBusy(true);
    setSelectorError('');
    try {
      const verified = await verifySportsContext(supabase, requestedId);
      if (request !== contextRequestRef.current
        || userId !== String(stateRef.current.session?.user?.id || '')) return;
      if (verified.role !== 'owner') throw new Error('Contexto no autorizado.');
      setSelectedSportsContext(verified);
    } catch (error) {
      if (request !== contextRequestRef.current) return;
      logTechnicalAuthError('CONTEXT_SELECTION', error);
      setSelectorError('El equipo ya no está autorizado. Vuelve a verificar tu acceso.');
      setSelectorContexts(null);
    } finally {
      setSelectorBusy(false);
    }
  };
  const returnToSelector = () => {
    contextRequestRef.current += 1;
    setShowSelector(true);
    setSelectedSportsContext(null);
    setSelectorContexts(null);
    setSelectorError('');
  };

  const preferredContext = findPreferredActiveContext(selectorContexts, PREFERRED_ACTIVE_CTS_ID);
  useEffect(() => {
    const userId = String(authState.session?.user?.id || '');
    const key = `${userId}:${preferredContext?.id || ''}`;
    if (!ENABLE_CTS_FRONTEND || !userId || !preferredContext || showSelector
      || selectedSportsContext || selectorBusy || autoAttemptedRef.current === key) return;
    autoAttemptedRef.current = key;
    void chooseSportsContext(preferredContext.id);
  }, [authState.session?.user?.id, preferredContext?.id, showSelector,
    selectedSportsContext, selectorBusy]);

  if (authState.status === 'loading_session') {
    return <LoadingScreen message={signingOut ? 'Cerrando sesión…' : 'Comprobando sesión…'} />;
  }
  if (authState.status === 'resolving_identity') {
    return <LoadingScreen message="Verificando acceso…" />;
  }
  if (authState.status === 'unauthenticated') {
    return (
      <LoginScreen
        form={authForm}
        submitting={authSubmitting}
        error={authError}
        onChange={handleAuthFormChange}
        onSubmit={handleAuthSubmit}
      />
    );
  }
  if (authState.status === 'identity_error') {
    return (
      <AccessMessage
        title="No se pudo verificar el acceso"
        message="Ha ocurrido un problema temporal al comprobar tu identidad. Puedes reintentarlo o cerrar sesión."
        onRetry={retryIdentity}
        onSignOut={handleSignOut}
        signingOut={signingOut}
      />
    );
  }
  if (authState.status === 'denied') {
    return (
      <AccessMessage
        title="Acceso no habilitado"
        message="Esta cuenta no tiene actualmente un acceso activo a NEXO CLUB."
        onSignOut={handleSignOut}
        signingOut={signingOut}
      />
    );
  }
  if (authState.status === 'multiple_memberships') {
    if (ENABLE_CTS_FRONTEND && authState.identity.memberships.every((row) => row.role === 'owner')) {
      if (selectedSportsContext) return <Suspense fallback={<LoadingScreen message="Cargando equipo…" />}>
        <CtsCoreApp key={selectedSportsContext.id} client={supabase} contextId={selectedSportsContext.id}
          onChangeTeam={returnToSelector} onSignOut={handleSignOut} />
      </Suspense>;
      return <TeamSelector contexts={selectorContexts || []} preferredId={preferredContext?.id} onSelect={chooseSportsContext}
        onSignOut={handleSignOut} busy={selectorBusy || !selectorContexts} error={selectorError} />;
    }
    return (
      <AccessMessage
        title="Varios accesos autorizados"
        message="Tu cuenta tiene acceso a varios clubes. La selección de equipo estará disponible cuando se complete el aislamiento de datos. Por seguridad, todavía no se abre ningún espacio deportivo."
        onSignOut={handleSignOut}
        signingOut={signingOut}
      />
    );
  }
  if (authState.status === 'player') {
    return <PlayerApp client={supabase} identity={authState.identity} onRefreshIdentity={retryIdentity} onSignOut={handleSignOut} signingOut={signingOut} />;
  }
  if (authState.status === 'staff') {
    if (ENABLE_CTS_FRONTEND && authState.identity.membership?.role === 'owner') {
      if (selectedSportsContext) return <Suspense fallback={<LoadingScreen message="Cargando equipo…" />}>
        <CtsCoreApp key={selectedSportsContext.id} client={supabase} contextId={selectedSportsContext.id}
          onChangeTeam={returnToSelector} onSignOut={handleSignOut} />
      </Suspense>;
      return <TeamSelector contexts={selectorContexts || []} preferredId={preferredContext?.id} onSelect={chooseSportsContext}
        onSignOut={handleSignOut} busy={selectorBusy || !selectorContexts} error={selectorError} />;
    }
    if (ENABLE_CTS_FRONTEND && authState.identity.contexts?.length !== 1) {
      return <AccessMessage title="Seleccion de equipo pendiente"
        message="Tu cuenta necesita una seleccion explicita de equipo y temporada antes de abrir el espacio deportivo."
        onSignOut={handleSignOut} signingOut={signingOut} />;
    }
    if (ENABLE_CTS_FRONTEND) return <Suspense fallback={<LoadingScreen message="Cargando equipo…" />}>
      <CtsCoreApp key={authState.identity.contexts[0].club_team_season_id} client={supabase}
        contextId={authState.identity.contexts[0].club_team_season_id} onSignOut={handleSignOut} />
    </Suspense>;
    return (
      <Suspense fallback={<LoadingScreen message="Cargando NEXO CLUB…" />}>
        <StaffApp controlledSession={authState.session} identity={authState.identity}
          selectedCtsId={ENABLE_CTS_FRONTEND && authState.identity.contexts?.length === 1
            ? authState.identity.contexts[0].club_team_season_id : null}
          onControlledSignOut={handleSignOut} />
      </Suspense>
    );
  }

  return <LoadingScreen message="Comprobando acceso…" />;
}

export default AppAuthShell;
