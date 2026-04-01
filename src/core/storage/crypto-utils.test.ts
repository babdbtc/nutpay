import { describe, it, expect } from 'vitest';
import {
  deriveKeyFromCredential,
  generateEncryptionSalt,
  generateRandomKey,
  encryptStringWithKey,
  decryptStringWithKey,
  encryptBytesWithKey,
  decryptBytesWithKey,
} from './crypto-utils';

describe('deriveKeyFromCredential', () => {
  it('derives a CryptoKey from a password and salt', async () => {
    const salt = generateEncryptionSalt();
    const key = await deriveKeyFromCredential('my-password', salt);
    expect(key.type).toBe('secret');
    expect(key.algorithm.name).toBe('AES-GCM');
    expect((key.algorithm as AesKeyAlgorithm).length).toBe(256);
  });

  it('produces the same key bytes for the same password + salt (deterministic)', async () => {
    const salt = generateEncryptionSalt();
    const key1 = await deriveKeyFromCredential('deterministic', salt);
    const key2 = await deriveKeyFromCredential('deterministic', salt);
    const raw1 = new Uint8Array(await crypto.subtle.exportKey('raw', key1));
    const raw2 = new Uint8Array(await crypto.subtle.exportKey('raw', key2));
    expect(raw1).toEqual(raw2);
  });

  it('produces different keys for different passwords', async () => {
    const salt = generateEncryptionSalt();
    const key1 = await deriveKeyFromCredential('password-A', salt);
    const key2 = await deriveKeyFromCredential('password-B', salt);
    const raw1 = new Uint8Array(await crypto.subtle.exportKey('raw', key1));
    const raw2 = new Uint8Array(await crypto.subtle.exportKey('raw', key2));
    expect(raw1).not.toEqual(raw2);
  });
});

describe('generateEncryptionSalt', () => {
  it('returns a 32-byte Uint8Array', () => {
    const salt = generateEncryptionSalt();
    expect(salt).toBeInstanceOf(Uint8Array);
    expect(salt.byteLength).toBe(32);
  });
});

describe('encryptStringWithKey / decryptStringWithKey', () => {
  it('round-trips a string through encrypt then decrypt', async () => {
    const key = await generateRandomKey();
    const plaintext = 'Hello, AES-GCM!';
    const ciphertext = await encryptStringWithKey(plaintext, key);
    const recovered = await decryptStringWithKey(ciphertext, key);
    expect(recovered).toBe(plaintext);
  });

  it('produces different ciphertext each call for the same plaintext (random IV)', async () => {
    const key = await generateRandomKey();
    const plaintext = 'same plaintext';
    const ct1 = await encryptStringWithKey(plaintext, key);
    const ct2 = await encryptStringWithKey(plaintext, key);
    expect(ct1).not.toBe(ct2);
  });

  it('throws when decrypting with the wrong key', async () => {
    const key1 = await generateRandomKey();
    const key2 = await generateRandomKey();
    const ciphertext = await encryptStringWithKey('secret', key1);
    await expect(decryptStringWithKey(ciphertext, key2)).rejects.toThrow();
  });
});

describe('encryptBytesWithKey / decryptBytesWithKey', () => {
  it('round-trips binary data through encrypt then decrypt', async () => {
    const key = await generateRandomKey();
    const original = new Uint8Array([0, 1, 2, 128, 200, 255, 42]);
    const ciphertext = await encryptBytesWithKey(original, key);
    const recovered = await decryptBytesWithKey(ciphertext, key);
    expect(recovered).toEqual(original);
  });
});

describe('generateRandomKey', () => {
  it('generates a 256-bit AES-GCM CryptoKey', async () => {
    const key = await generateRandomKey();
    expect(key.type).toBe('secret');
    expect(key.algorithm.name).toBe('AES-GCM');
    expect((key.algorithm as AesKeyAlgorithm).length).toBe(256);
  });

  it('exports and re-imports to the same raw key material', async () => {
    const key = await generateRandomKey();
    const exported = await crypto.subtle.exportKey('raw', key);
    const reimported = await crypto.subtle.importKey(
      'raw',
      exported,
      { name: 'AES-GCM' },
      true,
      ['encrypt', 'decrypt']
    );
    const reexported = await crypto.subtle.exportKey('raw', reimported);
    expect(new Uint8Array(exported)).toEqual(new Uint8Array(reexported));
  });

  it('encrypts and decrypts correctly after key export/import round-trip', async () => {
    const key = await generateRandomKey();
    const plaintext = 'persisted across export/import';
    const ciphertext = await encryptStringWithKey(plaintext, key);

    const raw = await crypto.subtle.exportKey('raw', key);
    const reimported = await crypto.subtle.importKey(
      'raw',
      raw,
      { name: 'AES-GCM' },
      true,
      ['encrypt', 'decrypt']
    );

    const recovered = await decryptStringWithKey(ciphertext, reimported);
    expect(recovered).toBe(plaintext);
  });
});
