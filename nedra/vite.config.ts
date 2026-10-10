import { defineConfig } from 'vite';

// base './' - относительные пути: архив загружается в консоль Яндекс Игр как есть
export default defineConfig({
  base: './',
  build: { target: 'es2020', outDir: 'dist', assetsInlineLimit: 0 },
  server: { host: true },
});
