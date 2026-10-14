import { describe, expect, it } from 'vitest';
import { Sha256, sha256Bytes, sha256Text } from './hash';

describe('empreinte SHA-256 locale', () => {
  it('correspond aux vecteurs de référence', () => {
    expect(sha256Text('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Text('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Text('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))
      .toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('produit le même résultat en un ou plusieurs blocs', () => {
    const message = new TextEncoder().encode('Noto conserve vos fichiers en local. '.repeat(40));
    const single = sha256Bytes(message);
    const streamed = new Sha256();
    for (let offset = 0; offset < message.length; offset += 17) {
      streamed.update(message.subarray(offset, Math.min(offset + 17, message.length)));
    }
    expect(streamed.digest()).toBe(single);
  });

  it('gère les blocs de taille exactement multiple de 64 octets', () => {
    const message = new Uint8Array(64 * 3).fill(97);
    const streamed = new Sha256();
    streamed.update(message.subarray(0, 64));
    streamed.update(message.subarray(64, 128));
    streamed.update(message.subarray(128));
    expect(streamed.digest()).toBe(sha256Bytes(message));
  });

  it('refuse une seconde finalisation silencieuse', () => {
    const hash = new Sha256();
    hash.digest();
    expect(() => hash.update(new Uint8Array([1]))).toThrow(/finalisée/u);
  });
});
