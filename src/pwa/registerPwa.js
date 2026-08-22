const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

export const registerAppServiceWorker = async ({
  navigatorRef = globalThis.navigator,
  locationRef = globalThis.location,
  setIntervalImpl = globalThis.setInterval,
} = {}) => {
  if (!import.meta.env.PROD || !navigatorRef?.serviceWorker || locationRef?.protocol !== 'https:') return null;

  try {
    const registration = await navigatorRef.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
    await registration.update();
    setIntervalImpl?.(() => registration.update().catch((error) => {
      console.error('No se pudo comprobar la actualización periódica de APPCAUDAL.', error);
    }), UPDATE_INTERVAL_MS);
    return registration;
  } catch (error) {
    console.error('No se pudo registrar el service worker de APPCAUDAL.', error);
    return null;
  }
};
