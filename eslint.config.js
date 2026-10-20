import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * Configuration ESLint (format « flat ») de Noto.
 *
 * Objectif : attraper les erreurs réelles (variables oubliées, promesses non
 * attendues, dépendances de hooks) sans imposer de reformatage massif. Les
 * règles de style sont volontairement absentes : le formatage est celui du
 * dépôt, dense et lisible, et n’est pas l’objet de cette vérification.
 *
 * `npm run lint` doit rester vert sur `main` : une règle n’est ajoutée que si
 * le code la respecte déjà, ou après correction.
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'src-tauri/target/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.worker },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Le code du projet n’utilise pas `any` (exigence de la spécification) :
      // la règle le vérifie, les paramètres inutilisés restent tolérés quand
      // ils documentent une signature.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    // Scripts chargés par la page avant l’application (écran de démarrage).
    files: ['public/**/*.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['*.config.ts', '*.config.js', 'eslint.config.js', 'vite.config.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
);
