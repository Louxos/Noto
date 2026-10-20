import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Garde-fou de la documentation.
 *
 * Le dépôt compte une trentaine de fichiers Markdown qui se citent entre eux.
 * Renommer un document, déplacer un dossier ou citer un fichier inexistant
 * casse silencieusement des liens sans qu’aucun autre test ne s’en aperçoive :
 * ce fichier relit les documents réels, comme les autres tests relisent les
 * artefacts produits.
 *
 * Sont vérifiés ici :
 *  - chaque lien relatif pointe vers un fichier réellement présent ;
 *  - chaque ancre `#titre` d’un lien interne désigne un titre de la cible ;
 *  - chaque chemin de code entre accents graves qui ressemble à un fichier du
 *    dépôt (il commence par `src/`, `docs/`, `src-tauri/`, `.github/`…) existe ;
 *  - l’index `docs/README.md` liste chaque document de `docs/` et chaque
 *    document cité dans cet index existe.
 */

const ROOT = resolve(__dirname, '..', '..')

const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.git',
  'target',
  'gen',
  '.arena',
])

function markdownFiles(directory: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue
    if (IGNORED_DIRECTORIES.has(entry.name)) continue
    const full = join(directory, entry.name)
    if (entry.isDirectory()) found.push(...markdownFiles(full))
    else if (entry.name.endsWith('.md')) found.push(full)
  }
  return found
}

/** Titres de niveau 1 à 6 d’un document, convertis en identifiants de style GitHub. */
function headingSlugs(content: string): Set<string> {
  const slugs = new Set<string>()
  for (const line of content.split('\n')) {
    const match = /^#{1,6}\s+(.*)$/.exec(line)
    if (!match) continue
    const slug = match[1]
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-')
    slugs.add(slug)
  }
  return slugs
}

function read(path: string): string {
  return readFileSync(path, 'utf8')
}

/** Retire les blocs de code et les extraits entre accents graves : ils citent du texte, ils ne portent pas de lien. */
function withoutCode(content: string): string {
  return content.replace(/^```[\s\S]*?^```/gm, '').replace(/`[^`\n]*`/g, '`extrait`')
}

const FILES = markdownFiles(ROOT)

describe('documentation du dépôt', () => {
  it('trouve bien les documents attendus', () => {
    expect(FILES.length).toBeGreaterThanOrEqual(25)
    const names = FILES.map((file) => relative(ROOT, file).replace(/\\/g, '/'))
    for (const expected of [
      'README.md',
      'CHANGELOG.md',
      'ROADMAP.md',
      'RAPPORT.md',
      'SECURITY.md',
      'CONTRIBUTING.md',
      'INSTALLATION.md',
      'docs/README.md',
      'docs/user-guide.md',
      'docs/architecture.md',
      'docs/tests.md',
      'docs/installation.md',
      'docs/atelier.md',
      'docs/icons-fichiers.md',
      'docs/security.md',
      'docs/adding-a-viewer.md',
      'docs/build-windows.md',
      'docs/contributing.md',
      'docs/inventaire-et-migration.md',
      'docs/cahier-des-charges.md',
    ]) {
      expect(names, `document manquant : ${expected}`).toContain(expected)
    }
  })

  it('ne contient aucun lien relatif mort', () => {
    const broken: string[] = []
    for (const file of FILES) {
      const content = withoutCode(read(file))
      for (const match of content.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
        const target = match[1]
        if (/^(https?:|mailto:|#)/.test(target)) continue
        const [pathPart] = target.split('#')
        if (!pathPart) continue
        const resolved = resolve(dirname(file), decodeURIComponent(pathPart))
        if (!existsSync(resolved)) {
          broken.push(`${relative(ROOT, file)} → ${target}`)
        }
      }
    }
    expect(broken).toEqual([])
  })

  it('ne contient aucune ancre interne morte', () => {
    const broken: string[] = []
    for (const file of FILES) {
      const content = withoutCode(read(file))
      for (const match of content.matchAll(/\[[^\]]*\]\(([^)\s]*#[^)\s]+)\)/g)) {
        const target = match[1]
        const [pathPart, rawAnchor] = target.split('#')
        if (/^https?:/.test(pathPart)) continue
        const targetFile = pathPart
          ? resolve(dirname(file), decodeURIComponent(pathPart))
          : file
        if (!targetFile.endsWith('.md') || !existsSync(targetFile)) continue
        const anchor = decodeURIComponent(rawAnchor ?? '').toLowerCase()
        if (!anchor) continue
        if (!headingSlugs(read(targetFile)).has(anchor)) {
          broken.push(`${relative(ROOT, file)} → ${target}`)
        }
      }
    }
    expect(broken).toEqual([])
  })

  it('ne cite aucun fichier de code inexistant', () => {
    // Seuls les chemins explicitement ancrés dans le dépôt sont contrôlés :
    // un simple nom de fichier (`notes.md`, `config.json`) peut désigner un
    // document d’exemple ou un fichier produit par l’utilisateur.
    const prefixes = ['src/', 'docs/', 'public/', 'examples/', '.github/', 'src-tauri/', 'assets/', 'screenshots/']
    const missing: string[] = []
    for (const file of FILES) {
      for (const line of read(file).split('\n')) {
        for (const span of line.matchAll(/`([^`\n]+)`/g)) {
          for (const token of span[1].split(/[\s,()]+/)) {
            const cleaned = token.replace(/[.,;:]+$/, '').replace(/:\d+$/, '').replace(/\\/g, '/')
            if (!prefixes.some((prefix) => cleaned.startsWith(prefix))) continue
            // Motifs, chemins abrégés et sorties de build : `*`, `{}`, `<version>`, `src/…`, `target/`, `dist/`.
            if (/[*{}<>…]/.test(cleaned)) continue
            if (/^(src-tauri\/target|dist|coverage)\//.test(cleaned)) continue
            const stat = statSafe(cleaned)
            if (!stat) missing.push(`${relative(ROOT, file)} → ${cleaned}`)
          }
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('indexe chaque document de docs/ dans docs/README.md', () => {
    const indexPath = join(ROOT, 'docs', 'README.md')
    const index = read(indexPath)
    const documents = readdirSync(join(ROOT, 'docs'))
      .filter((name) => name.endsWith('.md') && name !== 'README.md')
      .sort()
    const absent = documents.filter((name) => !index.includes(`(${name})`))
    expect(absent).toEqual([])
  })

  it('ne laisse aucun raccourci de la racine diverger', () => {
    // `INSTALLATION.md` est un raccourci : il doit pointer vers le guide réel.
    const shortcut = read(join(ROOT, 'INSTALLATION.md'))
    expect(shortcut).toContain('docs/installation.md')
    // Les autres documents de la racine portent leur propre contenu.
    expect(read(join(ROOT, 'CONTRIBUTING.md')).length).toBeGreaterThan(1000)
    expect(read(join(ROOT, 'SECURITY.md'))).toContain('Signaler une vulnérabilité')
  })

  it('décrit un installeur unique, conforme à la configuration réelle', () => {
    const config = JSON.parse(read(join(ROOT, 'src-tauri', 'tauri.conf.json'))) as {
      bundle?: { targets?: unknown; windows?: { wix?: unknown } }
    }
    const targets = JSON.stringify(config.bundle?.targets ?? '')
    expect(targets).toContain('nsis')
    expect(targets).not.toContain('msi')
    expect(config.bundle?.windows?.wix).toBeUndefined()

    // Les guides parlent du retrait du MSI : ils ne doivent jamais le présenter
    // comme un canal disponible.
    for (const document of ['README.md', 'INSTALLATION.md', 'docs/installation.md', 'docs/build-windows.md']) {
      const content = read(join(ROOT, document))
      for (const sentence of content.split(/(?<=[.!?])\s+/)) {
        if (!/\bMSI\b/.test(sentence)) continue
        const describesRemoval = /(plus produit|ne publie plus|n’est plus|retir|supprim|historique|antérieure|anciens|précédente version)/i.test(sentence)
        expect(describesRemoval, `mention du MSI à corriger dans ${document} : ${sentence.trim()}`).toBe(true)
      }
    }
  })
})

function statSafe(path: string) {
  try {
    return statSync(join(ROOT, path))
  } catch {
    return null
  }
}
