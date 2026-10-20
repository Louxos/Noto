import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const sourcePath = path.join(repositoryRoot, 'docs/site/index.html');
const outputPath = path.join(repositoryRoot, 'docs/index.html');
const checkOnly = process.argv.includes('--check');

function assertLocalFilesExist(html, htmlDirectory, label) {
  const missing = [];
  for (const [, relativePath] of html.matchAll(/(?:href|src)="\.\/([^"#?]+)"/g)) {
    const resolvedPath = path.resolve(htmlDirectory, decodeURIComponent(relativePath));
    if (!resolvedPath.startsWith(`${htmlDirectory}${path.sep}`) && resolvedPath !== htmlDirectory) {
      missing.push(`${relativePath} (outside site directory)`);
      continue;
    }
    if (!existsSync(resolvedPath)) missing.push(relativePath);
  }
  if (missing.length) {
    throw new Error(`${label} references missing local files: ${missing.join(', ')}`);
  }
}

const source = await readFile(sourcePath, 'utf8');
const legacyPagesEntry = source
  .replace(/(href|src)="\.\/styles\.css"/g, '$1="./site/styles.css"')
  .replace(/(href|src)="\.\/premium\.css"/g, '$1="./site/premium.css"')
  .replace(/(href|src)="\.\/site\.js"/g, '$1="./site/site.js"')
  .replace(/(href|src)="\.\/assets\//g, '$1="./site/assets/')
  .replace(
    'https://louxos.github.io/Noto/assets/og-noto.svg',
    'https://louxos.github.io/Noto/site/assets/og-noto.svg',
  );

assertLocalFilesExist(source, path.dirname(sourcePath), 'docs/site/index.html');
assertLocalFilesExist(legacyPagesEntry, path.join(repositoryRoot, 'docs'), 'docs/index.html');

if (checkOnly) {
  let current = '';
  try {
    current = await readFile(outputPath, 'utf8');
  } catch {
    throw new Error('Missing docs/index.html; run `npm run pages:sync` to generate the GitHub Pages root entry.');
  }

  if (current !== legacyPagesEntry) {
    throw new Error('docs/index.html is out of sync with docs/site/index.html; run `npm run pages:sync`.');
  }
  console.log('GitHub Pages legacy entry is synchronized with docs/site/index.html.');
} else {
  await writeFile(outputPath, legacyPagesEntry, 'utf8');
  console.log('Generated docs/index.html for the repository’s current /docs Pages source.');
}
