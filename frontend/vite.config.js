import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'logo.jpeg', 'globalmindlogo.png', 'cachet.png', 'loging.mp4'],
      manifest: {
        name: 'Pharmacie Le Frasah',
        short_name: 'Le Frasah',
        description: 'Logiciel de gestion de pharmacie — Ventes, stocks, caisse, rapports.',
        theme_color: '#065f46',
        background_color: '#065f46',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'fr',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
          },
        ],
        shortcuts: [
          {
            name: 'Nouvelle vente',
            short_name: 'Vente',
            url: '/sorties',
            icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }],
          },
          {
            name: 'Gestion du stock',
            short_name: 'Stock',
            url: '/stocks',
            icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }],
          },
          {
            name: 'Caisse',
            short_name: 'Caisse',
            url: '/caisse',
            icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff,woff2,mp4}'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10 MB (pour inclure loging.mp4)
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/zttwpquljuenobdnqyam\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24,
              },
              networkTimeoutSeconds: 5,
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  server: {
    port: 5173,
    host: true, // Accessible depuis le réseau local (pour tester sur téléphone)
  },
  build: {
    outDir: 'dist',
  },
});