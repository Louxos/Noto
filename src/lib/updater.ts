export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  latestTag: string;
  latestUrl: string;
  body: string | null;
  publishedAt: string | null;
  isNewer: boolean;
}

export function compareVersions(left: string, right: string): number {
  const parse = (version: string) => version.replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * Vérification déclenchée explicitement par la personne dans Paramètres.
 * Seules les métadonnées publiques de release sont demandées à GitHub ; aucun
 * nom de fichier, chemin, document ou identifiant d’usage n’est transmis.
 */
export async function checkForUpdate(currentVersion: string, fetcher: typeof fetch = fetch): Promise<UpdateInfo> {
  const response = await fetcher('https://api.github.com/repos/Louxos/Noto/releases/latest', {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) throw new Error(`GitHub a répondu ${response.status}.`);
  const release = await response.json() as {
    tag_name?: string;
    html_url?: string;
    body?: string | null;
    published_at?: string | null;
    draft?: boolean;
    prerelease?: boolean;
  };
  if (release.draft || release.prerelease || !release.tag_name || !release.html_url) {
    throw new Error('Aucune version stable disponible pour le moment.');
  }
  const latestVersion = release.tag_name.replace(/^v/i, '');
  const current = currentVersion.replace(/^v/i, '');
  return {
    currentVersion: current,
    latestVersion,
    latestTag: release.tag_name,
    latestUrl: release.html_url,
    body: release.body ?? null,
    publishedAt: release.published_at ?? null,
    isNewer: compareVersions(latestVersion, current) > 0,
  };
}
