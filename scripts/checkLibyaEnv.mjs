import fs from 'node:fs';
import { build as viteBuild, createServer, loadEnv } from 'vite';
import { validateLibyaConfiguration } from '../src/lib/libyaConfiguration.js';

const env = loadEnv('libya', process.cwd(), 'VITE_');
const readLocalUrl = () => {
  if (!fs.existsSync('.env.local')) return '';
  const line = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .find((row) => /^VITE_SUPABASE_URL\s*=/.test(row));
  return line?.split('=').slice(1).join('=').trim().replace(/^['"]|['"]$/g, '') || '';
};

try {
  validateLibyaConfiguration({ ...env, MODE: 'libya' });
  if (env.VITE_DEPLOYMENT_ID !== 'libya'
    || !fs.existsSync('.env.libya.local')
    || (readLocalUrl() && readLocalUrl() === env.VITE_SUPABASE_URL)) {
    throw new Error('Falta el archivo local de Libia o su URL coincide con la instalación actual.');
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const shouldBuild = process.argv.includes('--build');
console.log('Proyecto Libia verificado localmente. Confirmar también el project ref en Supabase.');
for (const [key, value] of Object.entries(env)) {
  if (key.startsWith('VITE_')) process.env[key] = value;
}
// Cargar el config directamente evita que esbuild intente resolverlo fuera
// del workspace en algunos Windows; no se usan argumentos de shell.
const { default: makeConfig } = await import('../vite.config.js');
const config = makeConfig({ mode: 'libya' });
const options = { ...config, configFile: false, mode: 'libya' };
if (shouldBuild) {
  await viteBuild({ ...options, build: { ...config.build, outDir: 'dist-libya' } });
} else {
  const server = await createServer({ ...options, server: { host: '127.0.0.1' } });
  await server.listen();
  server.printUrls();
}
