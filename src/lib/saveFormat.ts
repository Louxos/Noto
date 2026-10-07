export type TextEncoding = 'utf-8' | 'utf-16le' | 'windows-1252';
export type LineEndingChoice = 'preserve' | 'lf' | 'crlf' | 'cr';

const WINDOWS_1252_SPECIAL = new Map<string, number>([
  ['€', 0x80], ['‚', 0x82], ['ƒ', 0x83], ['„', 0x84], ['…', 0x85], ['†', 0x86], ['‡', 0x87],
  ['ˆ', 0x88], ['‰', 0x89], ['Š', 0x8a], ['‹', 0x8b], ['Œ', 0x8c], ['Ž', 0x8e], ['‘', 0x91],
  ['’', 0x92], ['“', 0x93], ['”', 0x94], ['•', 0x95], ['–', 0x96], ['—', 0x97], ['˜', 0x98],
  ['™', 0x99], ['š', 0x9a], ['›', 0x9b], ['œ', 0x9c], ['ž', 0x9e], ['Ÿ', 0x9f],
]);

export function detectLineEnding(content: string): Exclude<LineEndingChoice, 'preserve'> {
  const crlf = (content.match(/\r\n/g) ?? []).length;
  const withoutCrlf = content.replace(/\r\n/g, '');
  const cr = (withoutCrlf.match(/\r/g) ?? []).length;
  const lf = (withoutCrlf.match(/\n/g) ?? []).length;
  if (crlf >= cr && crlf >= lf && crlf > 0) return 'crlf';
  if (cr > lf && cr > 0) return 'cr';
  return 'lf';
}

export function applyLineEnding(content: string, choice: LineEndingChoice): string {
  const target = choice === 'preserve' ? detectLineEnding(content) : choice;
  const normalized = content.replace(/\r\n?/g, '\n');
  const lineBreak = target === 'crlf' ? '\r\n' : target === 'cr' ? '\r' : '\n';
  return lineBreak === '\n' ? normalized : normalized.replace(/\n/g, lineBreak);
}

export function encodeTextForSave(content: string, encoding: TextEncoding, lineEnding: LineEndingChoice = 'preserve'): Uint8Array {
  const text = applyLineEnding(content, lineEnding);
  if (encoding === 'utf-8') return new TextEncoder().encode(text);
  if (encoding === 'utf-16le') {
    const bytes = new Uint8Array(2 + text.length * 2);
    bytes[0] = 0xff;
    bytes[1] = 0xfe;
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      bytes[2 + index * 2] = code & 0xff;
      bytes[3 + index * 2] = code >>> 8;
    }
    return bytes;
  }

  const bytes: number[] = [];
  for (const character of text) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint <= 0x7f || (codePoint >= 0xa0 && codePoint <= 0xff)) bytes.push(codePoint);
    else {
      const mapped = WINDOWS_1252_SPECIAL.get(character);
      if (mapped === undefined) throw new Error(`Le caractère « ${character} » n’existe pas en Windows-1252. Choisissez UTF-8 ou UTF-16LE.`);
      bytes.push(mapped);
    }
  }
  return Uint8Array.from(bytes);
}
