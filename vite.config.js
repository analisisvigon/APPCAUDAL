import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => ({
  build: {
    outDir: mode === 'libya' ? 'dist-libya' : 'dist',
    rollupOptions: {
      output: {
        manualChunks(moduleId) {
          if (moduleId.includes('/node_modules/jspdf/')) return 'pdf-generator';
          return undefined;
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      manifestFilename: 'manifest.json',
      includeAssets: [
        'branding/almadina-sc-crest.png',
        'branding/nexo-favicon-32.png',
        'branding/nexo-icon-48.png',
        'branding/nexo-icon-192.png',
        'branding/nexo-icon-512.png',
        'branding/nexo-maskable-512.png',
        'branding/nexo-lockup-dark.png',
        'branding/nexo-horizontal-dark.png',
        'branding/nexo-symbol-dark.png',
        'branding/nexo-symbol-light.png',
      ],
      manifest: {
        name: 'NEXO CLUB',
        short_name: 'NEXO CLUB',
        description: 'NEXO CLUB: análisis y gestión de fútbol para clubes.',
        lang: 'es',
        display: 'standalone',
        theme_color: '#d40000',
        background_color: '#111111',
        icons: [
          {
            src: '/branding/nexo-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/branding/nexo-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/branding/nexo-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        globIgnores: [
          '**/App-*.js',
          '**/App-*.css',
        ],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/App-.+\.(?:js|css)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: mode === 'libya' ? 'nexo-libya-staff-on-demand' : 'appcaudal-staff-on-demand',
              expiration: {
                maxEntries: 12,
                maxAgeSeconds: 30 * 24 * 60 * 60,
              },
            },
          },
        ],
      },
    }),
  ],
}));
