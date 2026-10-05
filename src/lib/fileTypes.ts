export type FileKind = 'markdown' | 'text' | 'code' | 'html' | 'csv' | 'pdf' | 'image' | 'unknown';

const markdownExtensions = new Set(['md', 'markdown', 'mdown', 'mkd']);
const codeExtensions = new Set([
  'js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx', 'html', 'htm', 'css', 'scss', 'json', 'xml',
  'yaml', 'yml', 'py', 'java', 'c', 'cc', 'cpp', 'h', 'hpp', 'cs', 'php', 'sql', 'sh',
  'bash', 'bat', 'cmd', 'ps1', 'ini', 'env', 'toml', 'conf', 'config', 'editorconfig',
  'gitignore', 'gitattributes', 'properties', 'rs', 'go', 'rb', 'swift', 'kt', 'vue', 'svelte',
]);
const textExtensions = new Set(['txt', 'text', 'log', 'readme', 'license', 'diff', 'patch']);
const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tif', 'tiff']);

export function getExtension(name: string): string {
  const normalized = name.replaceAll('\\', '/').split('/').pop() ?? name;
  const dot = normalized.lastIndexOf('.');
  if (dot < 0) return normalized.toLowerCase() === 'dockerfile' ? 'dockerfile' : '';
  return normalized.slice(dot + 1).toLowerCase();
}

export function getFileKind(name: string): FileKind {
  const extension = getExtension(name);
  if (markdownExtensions.has(extension)) return 'markdown';
  if (textExtensions.has(extension)) return 'text';
  if (extension === 'pdf') return 'pdf';
  if (extension === 'csv') return 'csv';
  if (imageExtensions.has(extension)) return 'image';
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
    unknown: 'Format inconnu',
  };
  return labels[kind];
}

export function mimeTypeFor(name: string): string {
  const extension = getExtension(name);
  const known: Record<string, string> = {
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
    ico: 'image/x-icon', tif: 'image/tiff', tiff: 'image/tiff', html: 'text/html', htm: 'text/html',
    csv: 'text/csv', json: 'application/json', md: 'text/markdown', txt: 'text/plain',
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
