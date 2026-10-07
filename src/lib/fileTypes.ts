export type FileKind = 'markdown' | 'text' | 'code' | 'html' | 'csv' | 'pdf' | 'image' | 'presentation' | 'document' | 'ebook' | 'unknown';

const markdownExtensions = new Set(['md', 'markdown', 'mdown', 'mkd']);
const codeExtensions = new Set([
  'js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'json', 'jsonc', 'json5', 'xml',
  'yaml', 'yml', 'py', 'pyw', 'java', 'c', 'cc', 'cpp', 'cxx', 'h', 'hh', 'hpp', 'hxx', 'cs', 'php', 'sql', 'sh',
  'bash', 'zsh', 'fish', 'bat', 'cmd', 'ps1', 'psm1', 'psd1', 'ini', 'env', 'toml', 'conf', 'config', 'editorconfig',
  'gitignore', 'gitattributes', 'properties', 'rs', 'go', 'rb', 'swift', 'kt', 'kts', 'vue', 'svelte', 'astro', 'r', 'lua',
  'pl', 'scala', 'dart', 'ex', 'exs', 'erl', 'hs', 'elm', 'clj', 'cljs', 'groovy', 'gradle', 'vb', 'vbs', 'fs', 'fsx',
  'proto', 'graphql', 'gql', 'dockerfile', 'makefile', 'mk', 'cmake', 'tf', 'hcl', 'nix', 'sol', 'pkl', 'lock',
  'sln', 'csproj', 'fsproj', 'vbproj', 'ipynb', 'bashrc', 'zshrc', 'gemfile', 'rakefile', 'procfile', 'justfile', 'caddyfile',
]);
const textExtensions = new Set(['txt', 'text', 'log', 'readme', 'license', 'diff', 'patch', 'tex', 'rst', 'adoc', 'asciidoc']);
const imageExtensions = new Set(['png', 'apng', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tif', 'tiff', 'avif']);
const presentationExtensions = new Set(['pptx', 'odp']);
const officeExtensions = new Set(['docx', 'odt', 'rtf']);
const ebookExtensions = new Set(['epub']);

export function getExtension(name: string): string {
  const normalized = name.replaceAll('\\', '/').split('/').pop() ?? name;
  const dot = normalized.lastIndexOf('.');
  if (dot < 0) {
    const extensionless = normalized.toLowerCase();
    return ['dockerfile', 'makefile', 'gemfile', 'rakefile', 'procfile', 'justfile', 'caddyfile'].includes(extensionless) ? extensionless : '';
  }
  return normalized.slice(dot + 1).toLowerCase();
}

export function getFileKind(name: string): FileKind {
  const extension = getExtension(name);
  if (markdownExtensions.has(extension)) return 'markdown';
  if (textExtensions.has(extension)) return 'text';
  if (extension === 'pdf') return 'pdf';
  if (extension === 'csv' || extension === 'tsv') return 'csv';
  if (imageExtensions.has(extension)) return 'image';
  if (presentationExtensions.has(extension)) return 'presentation';
  if (officeExtensions.has(extension)) return 'document';
  if (ebookExtensions.has(extension)) return 'ebook';
  if (extension === 'html' || extension === 'htm') return 'html';
  if (codeExtensions.has(extension)) return 'code';
  return 'unknown';
}

export function getFormatLabel(kind: FileKind): string {
  const labels: Record<FileKind, string> = {
    markdown: 'Markdown',
    text: 'Texte',
    code: 'Code',
    html: 'HTML',
    csv: 'Tableur CSV',
    pdf: 'Document PDF',
    image: 'Image',
    presentation: 'Présentation',
    document: 'Document bureautique',
    ebook: 'Livre numérique',
    unknown: 'Format inconnu',
  };
  return labels[kind];
}

export function mimeTypeFor(name: string): string {
  const extension = getExtension(name);
  const known: Record<string, string> = {
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
    ico: 'image/x-icon', tif: 'image/tiff', tiff: 'image/tiff', apng: 'image/apng', html: 'text/html', htm: 'text/html',
    csv: 'text/csv', tsv: 'text/tab-separated-values', json: 'application/json', md: 'text/markdown', txt: 'text/plain',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    odp: 'application/vnd.oasis.opendocument.presentation',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    odt: 'application/vnd.oasis.opendocument.text', rtf: 'application/rtf', epub: 'application/epub+zip', avif: 'image/avif',
  };
  return known[extension] ?? 'application/octet-stream';
}

export function isProbablyText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return true;
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) return true;
  const sample = bytes.subarray(0, Math.min(bytes.length, 8_192));
  if (sample.includes(0)) return false;
  let suspicious = 0;
  for (const byte of sample) {
    const allowedControl = byte === 9 || byte === 10 || byte === 13 || byte === 12;
    if (!allowedControl && (byte < 32 || byte === 127)) suspicious += 1;
  }
  return suspicious / sample.length < 0.04;
}

export function decodeText(bytes: Uint8Array): string {
  let content: string;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    content = new TextDecoder('utf-16le').decode(bytes.subarray(2));
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    content = new TextDecoder('utf-16be').decode(bytes.subarray(2));
  } else {
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      // Windows ANSI text is commonly Windows-1252.
      content = new TextDecoder('windows-1252').decode(bytes);
    }
  }
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}


export function languageForExtension(extension: string): string | undefined {
  const aliases: Record<string, string> = {
    md: 'markdown', markdown: 'markdown', mdown: 'markdown', js: 'javascript', mjs: 'javascript',
    cjs: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript', html: 'xml', htm: 'xml',
    css: 'css', scss: 'scss', json: 'json', xml: 'xml', yaml: 'yaml', yml: 'yaml', py: 'python',
    java: 'java', c: 'c', cc: 'cpp', cpp: 'cpp', h: 'c', hpp: 'cpp', cs: 'csharp', php: 'php',
    sql: 'sql', sh: 'bash', bash: 'bash', bat: 'dos', cmd: 'dos', ps1: 'powershell', ini: 'ini', env: 'bash', editorconfig: 'ini', conf: 'ini',
    toml: 'toml', rs: 'rust', go: 'go', rb: 'ruby', swift: 'swift', kt: 'kotlin',
  };
  return aliases[extension.toLowerCase()];
}
