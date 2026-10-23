import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const previewRoot = fileURLToPath(new URL('../src/preview/', import.meta.url));
const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));
const outputRoot = fileURLToPath(new URL('../dist-preview/', import.meta.url));
const config = {
  configFile: false,
  root: previewRoot,
  envDir: previewRoot,
  publicDir: publicRoot,
  plugins: [react()],
  build: { outDir: outputRoot, emptyOutDir: true },
  preview: { host: '127.0.0.1', port: 5179, strictPort: true },
};

await build(config);
if (!process.argv.includes('--build')) {
  const server = await preview(config);
  server.printUrls();
}
