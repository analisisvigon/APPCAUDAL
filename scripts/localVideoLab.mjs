import { build, createServer } from 'vite';
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
  server: { host: '127.0.0.1', port: 5178, strictPort: true },
  build: { outDir, emptyOutDir: true },
};

if (process.argv.includes('--build')) {
  await build(config);
} else {
  const server = await createServer(config);
  await server.listen();
  server.printUrls();
}
