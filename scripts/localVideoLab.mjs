import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src/videoLab/', import.meta.url));
const outDir = fileURLToPath(new URL('../dist/video-lab/', import.meta.url));
const config = {
  configFile: false,
  root,
  envDir: root,
  publicDir: false,
  plugins: [react()],
  preview: { host: '127.0.0.1', port: 5178, strictPort: true },
  build: { outDir, emptyOutDir: true },
};

if (process.argv.includes('--build')) {
  await build(config);
} else {
  const watcher = await build({ ...config, build: { ...config.build, watch: {} } });
  await new Promise((resolve, reject) => {
    watcher.on('event', (event) => {
      if (event.code === 'END') resolve();
      if (event.code === 'ERROR') reject(event.error);
    });
  });
  const server = await preview(config);
  server.printUrls();
  console.log('Los cambios se recompilan automáticamente; actualiza el navegador para verlos.');
}
