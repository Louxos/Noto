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

  it('signe l’installateur final uniquement dans le flux de release', () => {
    expect(readConfig('src-tauri/tauri.conf.json').bundle?.createUpdaterArtifacts).toBeUndefined();

    const workflow = readFileSync(resolve(root, '.github/workflows/release.yml'), 'utf8');
    const authenticodeStep = workflow.indexOf('      - name: Sign Windows installers when a certificate is configured');
    const updaterSigningStart = workflow.indexOf('      - name: Re-sign final installer for the Tauri updater');
    const updaterSigningStep = workflow.slice(updaterSigningStart).split('\n      - name: ')[0];
    expect(authenticodeStep).toBeGreaterThan(-1);
    expect(updaterSigningStart).toBeGreaterThan(authenticodeStep);
    expect(updaterSigningStep).toContain("if: startsWith(github.ref, 'refs/tags/v')");
    expect(updaterSigningStep).toContain('npx tauri signer sign --app-version $version $installer.FullName');
  });

  it('utilise le magasin de certificats et le proxy système de Windows pour joindre GitHub', () => {
    const cargo = readFileSync(resolve(root, 'src-tauri/Cargo.toml'), 'utf8');
    const updaterDependency = cargo.match(/^tauri-plugin-updater\s*=\s*\{([^}]+)\}/m)?.[1] ?? '';
    expect(updaterDependency).toContain('default-features = false');
    expect(updaterDependency).toContain('"native-tls"');
    expect(updaterDependency).toContain('"system-proxy"');
    expect(updaterDependency).not.toContain('"rustls-tls"');
  });

  it('autorise la commande de redémarrage utilisée par relaunch() du plugin process', () => {
    const capability = JSON.parse(readFileSync(resolve(root, 'src-tauri/capabilities/default.json'), 'utf8')) as {
      permissions?: string[];
    };
    expect(capability.permissions).toContain('process:allow-restart');
    expect(capability.permissions).not.toContain('process:allow-relaunch');
  });
});
