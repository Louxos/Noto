/**
 * Version de l’application, en un seul endroit.
 *
 * `version.test.ts` vérifie que cette valeur correspond à `package.json`,
 * `src-tauri/tauri.conf.json` et `src-tauri/Cargo.toml` : impossible de publier
 * une version dont l’interface, le paquet npm et l’installeur divergeraient.
 */
export const APP_VERSION = '1.0.1';
