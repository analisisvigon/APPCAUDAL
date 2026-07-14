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

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

const tableErrors = [];
const hits = [];

for (const table of checks) {
  const { data, error } = await supabase.from(table).select('*').limit(1000);
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
  process.exit(2);
}

if (hits.length) {
  console.error('Broken encoding patterns found in Supabase rows:');
  hits.forEach(({ table, id }) => console.error(`${table}:${id}`));
  process.exit(1);
}

console.log(`Supabase encoding audit passed for ${checks.length - tableErrors.length}/${checks.length} table checks.`);
