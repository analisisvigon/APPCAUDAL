import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const ENV_FILE = '.env.local';
const KNOWN_EQUIPOS_RIVALES_BASELINE = 22;

class AuditFailure extends Error {
  constructor(category, publicMessage, status = null) {
    super(publicMessage);
    this.name = 'AuditFailure';
    this.category = category;
    this.status = Number.isInteger(status) ? status : null;
  }
}

const readPublicSupabaseConfiguration = () => {
  if (!fs.existsSync(ENV_FILE)) {
    throw new AuditFailure('CONFIGURATION', `No existe ${ENV_FILE}.`);
  }

  const wantedKeys = new Set(['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']);
  const values = {};

  for (const rawLine of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;

    const separator = line.indexOf('=');
    const key = line.slice(0, separator).trim();
    if (!wantedKeys.has(key)) continue;

    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2
      && ((value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  const url = String(values.VITE_SUPABASE_URL || '').trim();
  const anonKey = String(values.VITE_SUPABASE_ANON_KEY || '').trim();

  if (!url || !anonKey) {
    throw new AuditFailure(
      'CONFIGURATION',
      `${ENV_FILE} no contiene VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.`,
    );
  }

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'https:') {
      throw new Error('invalid protocol');
    }
  } catch {
    throw new AuditFailure('CONFIGURATION', 'VITE_SUPABASE_URL no es una URL HTTPS válida.');
  }

  assertPublicAnonKey(anonKey);
  return { url, anonKey };
};

const assertPublicAnonKey = (key) => {
  if (key.startsWith('sb_secret_')) {
    throw new AuditFailure(
      'UNSAFE_CONFIGURATION',
      'La clave configurada es secreta; la auditoría exige una clave pública anon/publishable.',
    );
  }

  if (key.startsWith('sb_publishable_')) return;

  const jwtParts = key.split('.');
  if (jwtParts.length !== 3) {
    throw new AuditFailure(
      'UNSAFE_CONFIGURATION',
      'VITE_SUPABASE_ANON_KEY no tiene un formato público reconocido.',
    );
  }

  try {
    const payload = JSON.parse(Buffer.from(jwtParts[1], 'base64url').toString('utf8'));
    if (payload?.role !== 'anon') {
      throw new AuditFailure(
        'UNSAFE_CONFIGURATION',
        'La clave configurada no declara el rol anon; ejecución cancelada.',
      );
    }
  } catch (error) {
    if (error instanceof AuditFailure) throw error;
    throw new AuditFailure(
      'UNSAFE_CONFIGURATION',
      'No se pudo validar de forma segura que la clave configurada sea anon.',
    );
  }
};

const takePlayerCredentialsFromEnvironment = () => {
  const credentials = {
    email: String(process.env.SUPABASE_QA_PLAYER_EMAIL || '').trim(),
    password: String(process.env.SUPABASE_QA_PLAYER_PASSWORD || ''),
  };

  // Se eliminan del entorno del proceso cuanto antes. Solo permanecen en memoria
  // el tiempo imprescindible para autenticar esta ejecución no persistente.
  delete process.env.SUPABASE_QA_PLAYER_EMAIL;
  delete process.env.SUPABASE_QA_PLAYER_PASSWORD;

  if (!credentials.email || !credentials.password) {
    credentials.email = '';
    credentials.password = '';
    throw new AuditFailure(
      'CONFIGURATION',
      'Faltan SUPABASE_QA_PLAYER_EMAIL o SUPABASE_QA_PLAYER_PASSWORD.',
    );
  }

  return credentials;
};

const statusOf = (responseOrError) => {
  const status = Number(responseOrError?.status);
  return Number.isInteger(status) && status > 0 ? status : null;
};

const classifyApiFailure = (error, responseStatus, phase) => {
  const status = statusOf(error) ?? statusOf({ status: responseStatus });
  const code = typeof error?.code === 'string' ? error.code : '';

  if (status === 403 || code === '42501') {
    return new AuditFailure('PERMISSIONS', `${phase}: acceso rechazado por privilegios.`, status);
  }
  if (status === 401 || code === 'PGRST301') {
    return new AuditFailure('AUTHENTICATION', `${phase}: el JWT no fue aceptado.`, status);
  }
  if (status === 404 || code === 'PGRST202') {
    return new AuditFailure('COMPATIBILITY', `${phase}: recurso o RPC no disponible.`, status);
  }
  if (status === null || status >= 500 || code.startsWith('PGRST0')) {
    return new AuditFailure('CONNECTION', `${phase}: fallo de conexión o del servicio.`, status);
  }
  return new AuditFailure('QUERY', `${phase}: respuesta inesperada de la API.`, status);
};

const authenticatePlayer = async (client, credentials) => {
  let response;
  try {
    response = await client.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    });
  } catch {
    throw new AuditFailure('CONNECTION', 'Autenticación: no se pudo contactar con Supabase Auth.');
  }

  if (response.error) {
    const status = statusOf(response.error);
    if (status === null || status >= 500) {
      throw new AuditFailure('CONNECTION', 'Autenticación: fallo de conexión o del servicio.', status);
    }
    throw new AuditFailure('AUTHENTICATION', 'Las credenciales PLAYER no fueron aceptadas.', status);
  }

  if (!response.data?.session?.access_token) {
    throw new AuditFailure('AUTHENTICATION', 'Supabase Auth no devolvió una sesión con JWT.');
  }

  return response.data.session;
};

const validateAuthenticatedUser = async (client) => {
  let response;
  try {
    response = await client.auth.getUser();
  } catch {
    throw new AuditFailure('CONNECTION', 'Validación JWT: no se pudo contactar con Supabase Auth.');
  }

  if (response.error) {
    const status = statusOf(response.error);
    if (status === null || status >= 500) {
      throw new AuditFailure('CONNECTION', 'Validación JWT: fallo de conexión o del servicio.', status);
    }
    throw new AuditFailure('AUTHENTICATION', 'El JWT de la sesión no pudo validarse.', status);
  }

  if (!response.data?.user) {
    throw new AuditFailure('AUTHENTICATION', 'La sesión no corresponde a un usuario autenticado.');
  }
};

const callBooleanIdentityRpc = async (client, rpcName) => {
  let response;
  try {
    response = await client.rpc(rpcName);
  } catch {
    throw new AuditFailure('CONNECTION', `${rpcName}(): no se pudo contactar con PostgREST.`);
  }

  if (response.error) {
    throw classifyApiFailure(response.error, response.status, `${rpcName}()`);
  }
  if (typeof response.data !== 'boolean') {
    throw new AuditFailure('COMPATIBILITY', `${rpcName}() no devolvió un booleano.`);
  }

  return response.data;
};

const verifyPlayerIdentity = async (client) => {
  const isPlayer = await callBooleanIdentityRpc(client, 'is_player');
  const isStaff = await callBooleanIdentityRpc(client, 'is_app_staff');

  if (isPlayer !== true || isStaff !== false) {
    throw new AuditFailure(
      'IDENTITY',
      'La sesión no cumple simultáneamente is_player=true e is_app_staff=false.',
    );
  }
};

const verifyRivalTeamIsolation = async (client) => {
  let response;
  try {
    response = await client
      .from('equipos_rivales')
      .select('id', { count: 'exact' })
      .limit(1);
  } catch {
    throw new AuditFailure('CONNECTION', 'SELECT: no se pudo contactar con PostgREST.');
  }

  if (response.error) {
    throw classifyApiFailure(response.error, response.status, 'SELECT equipos_rivales');
  }
  if (![200, 206].includes(response.status)) {
    throw new AuditFailure('INCONCLUSIVE', 'SELECT: código HTTP correcto pero no concluyente.', response.status);
  }
  if (!Array.isArray(response.data) || !Number.isInteger(response.count)) {
    throw new AuditFailure('INCONCLUSIVE', 'SELECT: respuesta o recuento exacto no verificable.');
  }
  if (response.data.length > 0 || response.count > 0) {
    throw new AuditFailure(
      'DATA_EXPOSURE',
      'El PLAYER puede ver una o más filas de equipos_rivales.',
      response.status,
    );
  }
  if (response.data.length !== 0 || response.count !== 0) {
    throw new AuditFailure('INCONCLUSIVE', 'SELECT: resultado distinto del aislamiento esperado.');
  }
};

const main = async () => {
  let credentials = null;
  let session = null;

  try {
    if (KNOWN_EQUIPOS_RIVALES_BASELINE <= 0) {
      throw new AuditFailure('INCONCLUSIVE', 'El baseline conocido no demuestra que la tabla contenga datos.');
    }

    const { url, anonKey } = readPublicSupabaseConfiguration();
    credentials = takePlayerCredentialsFromEnvironment();

    const client = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    session = await authenticatePlayer(client, credentials);
    credentials.email = '';
    credentials.password = '';

    await validateAuthenticatedUser(client);
    await verifyPlayerIdentity(client);
    await verifyRivalTeamIsolation(client);

    console.log('[PASS] Sesión PLAYER validada: is_player=true, is_app_staff=false.');
    console.log(
      `[PASS] Aislamiento RLS confirmado: baseline=${KNOWN_EQUIPOS_RIVALES_BASELINE}, filas visibles=0, count=0.`,
    );
  } catch (error) {
    const failure = error instanceof AuditFailure
      ? error
      : new AuditFailure('UNEXPECTED', 'Fallo inesperado; auditoría no concluyente.');
    const statusSuffix = failure.status === null ? '' : ` HTTP=${failure.status}`;
    console.error(`[FAIL][${failure.category}] ${failure.message}${statusSuffix}`);
    process.exitCode = 1;
  } finally {
    if (credentials) {
      credentials.email = '';
      credentials.password = '';
    }
    session = null;
  }
};

await main();
