import { describe, it, expect } from 'vitest';
import { wordlist } from '@scure/bip39/wordlists/english';
import {
  generateSalt,
  hashCredential,
  verifyCredential,
  generateMnemonic,
  validateMnemonic,
} from './auth';

describe('hashCredential', () => {
  it('produces the same hash for the same PIN and salt', async () => {
    const salt = generateSalt();
    const hash1 = await hashCredential('1234', salt);
    const hash2 = await hashCredential('1234', salt);
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different PINs with the same salt', async () => {
    const salt = generateSalt();
    const hash1 = await hashCredential('1234', salt);
    const hash2 = await hashCredential('5678', salt);
    expect(hash1).not.toBe(hash2);
  });

  it('produces a non-empty hex string', async () => {
    const salt = generateSalt();
    const hash = await hashCredential('0000', salt);
    expect(hash).toMatch(/^[0-9a-f]+$/);
    expect(hash.length).toBeGreaterThan(0);
  });
});

describe('verifyCredential', () => {
  it('returns true when the PIN matches the stored hash', async () => {
    const salt = generateSalt();
    const storedHash = await hashCredential('9876', salt);
    const valid = await verifyCredential('9876', storedHash, salt);
    expect(valid).toBe(true);
  });

  it('returns false when the PIN does not match the stored hash', async () => {
    const salt = generateSalt();
    const storedHash = await hashCredential('9876', salt);
    const valid = await verifyCredential('0000', storedHash, salt);
    expect(valid).toBe(false);
  });

  it('returns false when the salt is different', async () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();
    const storedHash = await hashCredential('1111', salt1);
    const valid = await verifyCredential('1111', storedHash, salt2);
    expect(valid).toBe(false);
  });
});

describe('generateMnemonic', () => {
  it('returns a 12-word string', () => {
    const mnemonic = generateMnemonic();
    const words = mnemonic.trim().split(/\s+/);
    expect(words).toHaveLength(12);
  });

  it('generates unique mnemonics on each call', () => {
    const m1 = generateMnemonic();
    const m2 = generateMnemonic();
    expect(m1).not.toBe(m2);
  });

  it('contains only valid BIP39 English words', () => {
    const mnemonic = generateMnemonic();
    const words = mnemonic.trim().split(/\s+/);
    for (const word of words) {
      expect(wordlist).toContain(word);
    }
  });
});

describe('validateMnemonic', () => {
  it('returns true for a freshly generated valid mnemonic', () => {
    const mnemonic = generateMnemonic();
    expect(validateMnemonic(mnemonic)).toBe(true);
  });

  it('returns false for a string of invalid words', () => {
    expect(validateMnemonic('not valid words at all just garbage input here abc def')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(validateMnemonic('')).toBe(false);
  });
});
