export const PLAYER_SOURCE_FUNCTION_NAME = 'analyze-player-source';

export class PlayerSourceFunctionError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'PlayerSourceFunctionError';
    this.code = code;
    this.status = options.status || null;
    this.detail = options.detail || '';
    this.cause = options.cause;
  }
}

const readResponseDetail = async (response) => {
  if (!response || typeof response.clone !== 'function') return '';
  try {
    const body = await response.clone().json();
    return body?.error || body?.message || JSON.stringify(body);
  } catch {
    try {
      return (await response.clone().text()).trim();
    } catch {
      return '';
    }
  }
};

export const classifyPlayerSourceFunctionError = async (error) => {
  if (error instanceof PlayerSourceFunctionError) return error;
  if (error?.name === 'AbortError' || /abort|timeout|timed out/i.test(error?.message || '')) {
    return new PlayerSourceFunctionError('timeout', 'El analizador superó el tiempo máximo de espera.', { cause: error });
  }
  const response = error?.context;
  const status = Number(response?.status || error?.status || 0) || null;
  const detail = await readResponseDetail(response);
  if (status === 404) {
    return new PlayerSourceFunctionError('not_deployed', `La Edge Function “${PLAYER_SOURCE_FUNCTION_NAME}” no está desplegada en este proyecto.`, { status, detail, cause: error });
  }
  if (status === 401 || status === 403) {
    return new PlayerSourceFunctionError('authentication', 'La sesión no está autorizada para ejecutar el analizador. Vuelve a iniciar sesión.', { status, detail, cause: error });
  }
  if (status && status >= 500) {
    return new PlayerSourceFunctionError('internal', detail || 'La Edge Function respondió con un error interno.', { status, detail, cause: error });
  }
  if (error?.name === 'FunctionsFetchError' || /failed to send|fetch failed|network|load failed/i.test(error?.message || '')) {
    return new PlayerSourceFunctionError('network', 'No se pudo alcanzar el endpoint de Supabase. Comprueba la conexión y la URL del proyecto.', { status, detail, cause: error });
  }
  return new PlayerSourceFunctionError('unknown', detail || error?.message || 'No se pudo ejecutar el analizador.', { status, detail, cause: error });
};

export const getPlayerSourceFunctionUserMessage = (error) => {
  const reason = error instanceof PlayerSourceFunctionError ? error.message : 'No se pudo ejecutar el analizador.';
  return `No se pudo conectar con el analizador. Motivo: ${reason}`;
};

export const getPlayerPhotoSource = (player = {}) => player.imageSource
  || player.fieldSources?.image?.source
  || player.fieldSources?.photoUrl?.source
  || '';

export const isManualPlayerPhoto = (player = {}) => ['manual', 'manual_upload', 'manual_url'].includes(getPlayerPhotoSource(player));

export const invokePlayerSourceAnalyzer = async (client, sourceUrl, options = {}) => {
  const timeoutMs = options.timeoutMs || 25000;
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) {
    throw new PlayerSourceFunctionError('authentication', `No se pudo validar la sesión: ${sessionError.message}`, { cause: sessionError });
  }
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) {
    throw new PlayerSourceFunctionError('authentication', 'No hay una sesión activa. Inicia sesión antes de analizar una fuente.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const mode = options.mode || 'full_analysis';
    const body = mode === 'store_photo'
      ? { mode, photoUrl: options.photoUrl || sourceUrl, playerId: options.playerId || null }
      : { mode, url: sourceUrl };
    const { data, error } = await client.functions.invoke(PLAYER_SOURCE_FUNCTION_NAME, {
      body,
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    if (error) throw await classifyPlayerSourceFunctionError(error);
    if (!data?.ok) {
      throw new PlayerSourceFunctionError('source_access', data?.error || 'La fuente no devolvió información analizable.', { detail: data?.error || '' });
    }
    return data;
  } catch (error) {
    throw await classifyPlayerSourceFunctionError(error);
  } finally {
    clearTimeout(timeout);
  }
};
