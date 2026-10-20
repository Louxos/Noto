import { describe, expect, it, vi } from 'vitest';
import { checkForUpdate, compareVersions, getUpdateErrorDetail } from './updater';

describe('version comparison', () => {
  it('compares stable versions and optional v prefixes', () => {
    expect(compareVersions('v1.0.2', '1.0.1')).toBeGreaterThan(0);
    expect(compareVersions('1.1.0', '1.0.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', 'v1.0.0')).toBe(0);
  });
});

describe('updater error details', () => {
  it('keeps the string rejection reason returned by Tauri IPC', () => {
    expect(getUpdateErrorDetail('failed to send request')).toBe('failed to send request');
  });

  it('redacts query parameters from signed release URLs', () => {
    expect(getUpdateErrorDetail('failed: https://example.test/latest.json?token=secret'))
      .toBe('failed: https://example.test/latest.json');
  });

  it('returns null when an error has no useful message', () => {
    expect(getUpdateErrorDetail({})).toBeNull();
  });
});

describe('release update check', () => {
  it('compares the installed version with GitHub latest stable release', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      tag_name: 'v1.1.0',
      html_url: 'https://github.com/Louxos/Noto/releases/tag/v1.1.0',
      body: 'Notes',
      published_at: '2026-10-18T08:00:00Z',
      draft: false,
      prerelease: false,
    }), { status: 200 }));
    const result = await checkForUpdate('1.0.1', fetcher as typeof fetch);
    expect(result.isNewer).toBe(true);
    expect(result.latestVersion).toBe('1.1.0');
    expect(fetcher).toHaveBeenCalledWith('https://api.github.com/repos/Louxos/Noto/releases/latest', expect.any(Object));
  });

  it('does not advertise the installed version again', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      tag_name: 'v1.0.1', html_url: 'https://github.com/Louxos/Noto/releases/tag/v1.0.1', draft: false, prerelease: false,
    }), { status: 200 }));
    await expect(checkForUpdate('1.0.1', fetcher as typeof fetch)).resolves.toMatchObject({ isNewer: false });
  });

  it('rejects API failures and draft/prerelease-only releases', async () => {
    const failed = vi.fn().mockResolvedValue(new Response('', { status: 503 }));
    await expect(checkForUpdate('1.0.1', failed as typeof fetch)).rejects.toThrow('GitHub a répondu 503');
    const prerelease = vi.fn().mockResolvedValue(new Response(JSON.stringify({ tag_name: 'v2.0.0-rc.1', html_url: 'https://github.com/Louxos/Noto/releases/tag/v2.0.0-rc.1', prerelease: true }), { status: 200 }));
    await expect(checkForUpdate('1.0.1', prerelease as typeof fetch)).rejects.toThrow('Aucune version stable');
  });
});
