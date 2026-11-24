import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Tesoro — Compra y venta de oro',
        short_name: 'Tesoro',
        description: 'Registro de compra y venta de oro',
        lang: 'es',
        start_url: '/',
        display: 'standalone',
        background_color: '#12100e',
        theme_color: '#b8860b',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
  // En desarrollo /api va al backend local; en producción la misma imagen sirve ambos.
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
});
