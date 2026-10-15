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
    // Ces tests traitent de vrais documents (PDF, DOCX, XLSX, images) : la
    // première exécution initialise les moteurs, et un exécuteur d’intégration
    // continue est plus lent qu’un poste de développement. Le délai par défaut
    // de 5 s s’est révélé trop court sur Windows pour « divise un PDF en une
    // page par fichier », puis 20 s l’ont été à leur tour sur un exécuteur
    // chargé (les tests s’y exécutent désormais sur Node 24). Le délai est donc
    // explicite et généreux : un test réellement bloqué échoue toujours, mais
    // une machine lente ne fait plus échouer la vérification à tort.
    testTimeout: 60_000,
    hookTimeout: 60_000,
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
