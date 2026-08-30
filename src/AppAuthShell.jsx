import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import PlayerApp from './PlayerApp';
import { resolveAppIdentity } from './auth/resolveAppIdentity';
import { supabase } from './lib/supabase';

const StaffApp = lazy(() => import('./App'));

const INITIAL_AUTH_STATE = {
  status: 'loading_session',
  session: null,
  identity: null,
};

const RESOLVED_STATUSES = new Set(['staff', 'player', 'denied']);

const logTechnicalAuthError = (context, error) => {
  if (import.meta.env.DEV) console.error(`[APP_AUTH:${context}]`, error);
};

function LoadingScreen({ message }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#02070f] px-6 text-center text-slate-100">
      <div>
        <img src="/pwa-192x192.png" alt="Escudo del C.D. Caudal" className="mx-auto h-28 w-28 object-contain" />
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
          <img src="/pwa-192x192.png" alt="Escudo del C.D. Caudal" className="mx-auto h-32 w-32 object-contain" />
          <p className="mt-5 text-[11px] font-black uppercase tracking-[0.26em] text-caudal-electric/90">Acceso privado</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">C.D. Caudal de Mieres</h1>
          <p className="mt-2 text-sm font-medium text-slate-500">Mieres, Asturias</p>
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
            Acceso para usuarios autorizados del C.D. Caudal.
          </p>
        </section>
      </main>
    </div>
  );
}

function AccessMessage({ title, message, onRetry, onSignOut, signingOut }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#02070f] px-4 py-8 text-slate-100">
      <main className="w-full max-w-lg rounded-[1.65rem] border border-white/10 bg-[#081326]/90 p-7 text-center shadow-[0_24px_80px_rgba(0,0,0,0.38)] sm:p-9">
        <img src="/pwa-192x192.png" alt="Escudo del C.D. Caudal" className="mx-auto h-24 w-24 object-contain" />
        <h1 className="mt-6 text-2xl font-black text-white">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">{message}</p>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          {onRetry ? (
            <button type="button" onClick={onRetry} className="min-h-12 rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold text-white hover:bg-white/15">
              Reintentar
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

function AppAuthShell() {
  const [authState, setAuthState] = useState(INITIAL_AUTH_STATE);
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const mountedRef = useRef(false);
  const stateRef = useRef(INITIAL_AUTH_STATE);
  const resolutionGenerationRef = useRef(0);
  const resolvingUserIdRef = useRef('');
  const sessionRequestRef = useRef(0);

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
        message="Esta cuenta no tiene actualmente un acceso activo a APPCAUDAL."
        onSignOut={handleSignOut}
        signingOut={signingOut}
      />
    );
  }
  if (authState.status === 'player') {
    return <PlayerApp client={supabase} onSignOut={handleSignOut} signingOut={signingOut} />;
  }
  if (authState.status === 'staff') {
    return (
      <Suspense fallback={<LoadingScreen message="Cargando APPCAUDAL…" />}>
        <StaffApp controlledSession={authState.session} onControlledSignOut={handleSignOut} />
      </Suspense>
    );
  }

  return <LoadingScreen message="Comprobando acceso…" />;
}

export default AppAuthShell;
