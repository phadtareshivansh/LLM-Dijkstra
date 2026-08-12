import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt'],
      manifest: {
        name: 'Dijkstra Navigator',
        short_name: 'DijkstraNav',
        description: 'Interactive 3D campus map with Dijkstra routing, AI parsing, and step-by-step visualization',
        theme_color: '#02080B',
        background_color: '#02080B',
        display: 'standalone',
        scope: './',
        start_url: './',
        icons: [
          {
            src: 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 64 64\'%3E%3Cpath d=\'M18 16 32 8l14 8v16L32 40 18 32V16Z\' stroke=\'%2354F6BA\' stroke-width=\'5\' stroke-linejoin=\'round\' fill=\'none\'/%3E%3Cpath d=\'M18 32 8 38v16l14 8 14-8V40M46 32l10 6v16l-14 8-14-8\' stroke=\'%2354F6BA\' stroke-width=\'5\' stroke-linejoin=\'round\' fill=\'none\'/%3E%3Ccircle cx=\'32\' cy=\'32\' r=\'4\' fill=\'%2354F6BA\'/%3E%3C/svg%3E',
            sizes: '64x64',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
        ],
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) {
            return 'three';
          }

          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
});
