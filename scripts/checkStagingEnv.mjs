import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { loadEnv } from 'vite';

const readLocalUrl = () => {
  if (!fs.existsSync('.env.local')) return '';
  const line = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .find((row) => /^VITE_SUPABASE_URL\s*=/.test(row));
  return line?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '') || '';
};
const env = loadEnv('staging', process.cwd(), 'VITE_');
const ref = env.VITE_STAGING_PROJECT_REF?.trim();
const productionRef = env.VITE_PRODUCTION_PROJECT_REF?.trim();
const url = env.VITE_SUPABASE_URL?.trim();
const localUrl = readLocalUrl();
if (!ref || !productionRef || !/^[a-z0-9]{20}$/.test(ref)
  || !/^[a-z0-9]{20}$/.test(productionRef) || ref === productionRef
  || url !== `https://${ref}.supabase.co`
  || !env.VITE_SUPABASE_ANON_KEY
  || env.VITE_MULTICLUB_03_CTS_ENABLED !== 'true'
  || (localUrl && localUrl === url)) {
  console.error('Ensayo bloqueado: revise referencia, URL, clave publica, bandera CTS y separacion respecto a .env.local.');
  process.exit(1);
}
console.log('Configuracion de ensayo verificada localmente. Confirme el proyecto en el panel de Supabase antes de crear datos.');
const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'staging'], {
  stdio: 'inherit', env: { ...process.env, VITE_SUPABASE_URL: url,
    VITE_SUPABASE_ANON_KEY: env.VITE_SUPABASE_ANON_KEY,
    VITE_MULTICLUB_03_CTS_ENABLED: 'true' },
});
process.exit(result.status ?? 1);
