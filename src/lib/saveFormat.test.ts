import { describe, expect, it } from 'vitest';
import { applyLineEnding, detectLineEnding, encodeTextForSave } from './saveFormat';

function decode(bytes: Uint8Array, encoding: string) {
  return new TextDecoder(encoding).decode(encoding === 'utf-16le' ? bytes.subarray(2) : bytes);
}

describe('save text format', () => {
  it('detects and preserves common newline styles', () => {
    expect(detectLineEnding('a\r\nb\r\n')).toBe('crlf');
    expect(applyLineEnding('a\r\nb\nc', 'preserve')).toBe('a\r\nb\r\nc');
    expect(applyLineEnding('a\r\nb\r\nc', 'lf')).toBe('a\nb\nc');
  });

  it('encodes UTF-8 and BOM-prefixed UTF-16LE', () => {
    expect(decode(encodeTextForSave('café', 'utf-8'), 'utf-8')).toBe('café');
    const utf16 = encodeTextForSave('notes', 'utf-16le');
    expect([...utf16.slice(0, 2)]).toEqual([0xff, 0xfe]);
    expect(decode(utf16, 'utf-16le')).toBe('notes');
  });

  it('supports Windows-1252 characters and rejects unrepresentable ones', () => {
    expect([...encodeTextForSave('prix €5', 'windows-1252')]).toEqual([112, 114, 105, 120, 32, 0x80, 53]);
    expect(() => encodeTextForSave('emoji 😀', 'windows-1252')).toThrow('n’existe pas en Windows-1252');
  });
});
