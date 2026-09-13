import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/prayer-time/',
  build: { outDir: 'docs', emptyOutDir: true },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/prayer-time/',
        name: 'ميقاتي | مواقيت الصلاة',
        short_name: 'ميقاتي',
        description: 'مواقيت الصلاة من موقعك، مع أذان أثناء استخدام التطبيق.',
        lang: 'ar',
        dir: 'rtl',
        theme_color: '#102c37',
        background_color: '#f6f5f0',
        display: 'standalone',
        start_url: '/prayer-time/',
        scope: '/prayer-time/',
        icons: [
          { src: '/prayer-time/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/prayer-time/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,mp3,json}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: '/prayer-time/index.html'
      }
    })
  ],
  test: { environment: 'jsdom', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] }
});
