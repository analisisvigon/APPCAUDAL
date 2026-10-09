import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const BROKEN_ENCODING_PATTERN = /\u00c3|\u00c2|\u00e2\u20ac|\ufffd/;

const readLocalEnv = () => {
  if (!fs.existsSync('.env.local')) return {};
  return Object.fromEntries(
    fs.readFileSync('.env.local', 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
        return [key, value];
      })
  );
};

const env = { ...readLocalEnv(), ...process.env };
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;
const staffEmail = process.env.SUPABASE_QA_STAFF_EMAIL;
const staffPassword = process.env.SUPABASE_QA_STAFF_PASSWORD;

const checks = [
  'partidos',
  'equipos_rivales',
  'jugadores',
  'jugadores_rivales',
  'partido_eventos_post',
  'match_quick_events',
  'tipos_evento_post',
  'training_library',
];

const validateConfiguration = () => {
  const missing = [
    ['VITE_SUPABASE_URL', supabaseUrl],
    ['VITE_SUPABASE_ANON_KEY', supabaseAnonKey],
    ['SUPABASE_QA_STAFF_EMAIL', staffEmail],
    ['SUPABASE_QA_STAFF_PASSWORD', staffPassword],
  ].filter(([, value]) => !String(value || '').trim()).map(([name]) => name);

  if (missing.length) {
    throw new Error(`Faltan variables de entorno requeridas: ${missing.join(', ')}.`);
  }
};

const authenticateStaff = async (client) => {
  const { data, error } = await client.auth.signInWithPassword({
    email: staffEmail,
    password: staffPassword,
  });
  if (error || !data?.session) {
    throw new Error(`No se pudo autenticar la cuenta QA STAFF${error?.message ? `: ${error.message}` : '.'}`);
  }

  const { data: isStaff, error: staffError } = await client.rpc('is_app_staff');
  if (staffError) {
    throw new Error(`No se pudo verificar is_app_staff(): ${staffError.message}`);
  }
  if (isStaff !== true) {
    throw new Error('La cuenta QA autenticada no está autorizada como STAFF.');
  }
};

const runAudit = async (client) => {
  const tableErrors = [];
  const hits = [];

  for (const table of checks) {
    const { data, error } = await client.from(table).select('*').limit(1000);
    if (error) {
      tableErrors.push({ table, error: error.message });
      continue;
    }

    for (const row of data || []) {
      if (BROKEN_ENCODING_PATTERN.test(JSON.stringify(row))) {
        hits.push({ table, id: row.id });
      }
    }
  }

  if (tableErrors.length) {
    console.warn('Some tables could not be audited:');
    tableErrors.forEach(({ table, error }) => console.warn(`${table}: ${error}`));
    return 2;
  }

  if (hits.length) {
    console.error('Broken encoding patterns found in Supabase rows:');
    hits.forEach(({ table, id }) => console.error(`${table}:${id}`));
    return 1;
  }

  console.log(`Supabase encoding audit passed for ${checks.length} table checks.`);
  return 0;
};

const main = async () => {
  let client;
  let exitCode = 0;

  try {
    validateConfiguration();
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    await authenticateStaff(client);
    exitCode = await runAudit(client);
  } catch (error) {
    console.error(`Supabase encoding audit failed: ${error?.message || 'error desconocido'}`);
    exitCode = 1;
  } finally {
    if (client) {
      const { error: signOutError } = await client.auth.signOut();
      if (signOutError) {
        console.error(`No se pudo cerrar la sesión QA: ${signOutError.message}`);
        if (exitCode === 0) exitCode = 1;
      }
    }
  }

  process.exitCode = exitCode;
};

await main();
