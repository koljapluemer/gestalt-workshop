/// <reference types="vitest/config" />
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { gestaltsPlugins } from '@gestalts/vite';

export default defineConfig({
  server: { port: 5175, strictPort: true },
  preview: { port: 4175 },
  plugins: [gestaltsPlugins(), react(), tailwindcss()],
  base: './',
  build: {
    // the frame carries React, the sdk, learning, d3 and lucide whole: plugins may use any of it
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      // the shell, and the page each workshop plugin runs in
      input: { main: resolve(import.meta.dirname, 'index.html'), frame: resolve(import.meta.dirname, 'frame.html') },
    },
  },
  test: { include: ['src/**/*.test.ts'] },
});
