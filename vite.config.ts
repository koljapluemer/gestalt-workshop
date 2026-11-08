/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { gestaltsPlugins } from '@gestalts/vite';

export default defineConfig({
  server: { port: 5175, strictPort: true },
  preview: { port: 4175 },
  plugins: [gestaltsPlugins(), react(), tailwindcss()],
  base: './',
  test: { include: ['src/**/*.test.ts'] },
});
