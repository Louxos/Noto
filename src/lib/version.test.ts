import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from './version';

const root = resolve(__dirname, '../..');

function versionOfNpmPackage(): string {
  const parsed = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version?: string };
  return parsed.version ?? '';
}

function versionOfTauriConfig(): string {
  const parsed = JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8')) as { version?: string };
  return parsed.version ?? '';
}

function versionOfCargoManifest(): string {
  const manifest = readFileSync(resolve(root, 'src-tauri/Cargo.toml'), 'utf8');
  const match = /^version\s*=\s*"([^"]+)"/mu.exec(manifest);
  return match?.[1] ?? '';
}

describe('version de l’application', () => {
  it('est au format SemVer attendu', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u);
  });

  it('reste identique dans le paquet npm, l’installeur et l’interface', () => {
    expect(versionOfNpmPackage()).toBe(APP_VERSION);
    expect(versionOfTauriConfig()).toBe(APP_VERSION);
    expect(versionOfCargoManifest()).toBe(APP_VERSION);
  });
});
