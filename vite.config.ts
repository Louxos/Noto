import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: '0.0.0.0',
    port: 1420,
    strictPort: true,
    allowedHosts: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1100,
  },
  test: {
    // Le rapport de couverture sert de repère, jamais de condition de réussite :
    // une fonction non testée doit être corrigée, pas masquée par un seuil.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/vite-env.d.ts', 'src/types.ts'],
      reportsDirectory: 'coverage',
    },
  },
});
