import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');

type TauriConfig = {
  plugins?: {
    updater?: {
      pubkey?: string;
      endpoints?: string[];
      requireSignedVersion?: boolean;
      windows?: { installMode?: string };
    };
  };
  bundle?: { createUpdaterArtifacts?: boolean };
};

function readConfig(path: string): TauriConfig {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8')) as TauriConfig;
}

describe('configuration de l’updater Tauri', () => {
  it('épingle la clé publique fournie et n’accepte que les versions dont la signature est liée au SemVer', () => {
    const updater = readConfig('src-tauri/tauri.conf.json').plugins?.updater;
    expect(updater?.pubkey).toContain('CE2B3D00FD2D39E4');
    expect(updater?.endpoints).toEqual(['https://github.com/Louxos/Noto/releases/latest/download/latest.json']);
    expect(updater?.requireSignedVersion).toBe(true);
    expect(updater?.windows?.installMode).toBe('passive');
  });

  it('ne demande la clé privée que pour construire les artefacts de release', () => {
    expect(readConfig('src-tauri/tauri.conf.json').bundle?.createUpdaterArtifacts).toBeUndefined();
    expect(readConfig('src-tauri/tauri.updater-release.conf.json').bundle?.createUpdaterArtifacts).toBe(true);
  });
});
