import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { deriveKeyFromCredential } from '../storage/crypto-utils';

/**
 * Generate a random salt for credential hashing.
 * Returns a hex-encoded 32-byte salt string.
 */
export function generateSalt(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash a credential (PIN or password) with PBKDF2.
 *
 * We derive an AES key via PBKDF2 and then export its raw bytes as the
 * hash. This ensures the same cost (100k iterations) as key derivation,
 * making brute-force of even a 4-digit PIN computationally expensive.
 *
 * The salt is the same one used for encryption key derivation, so
 * PBKDF2 only needs to run once during verification (derive key →
 * export → compare hash, then use key for decryption).
 */
export async function hashCredential(input: string, salt: string): Promise<string> {
  const saltBytes = Uint8Array.from(
    salt.match(/.{2}/g)!.map((b) => parseInt(b, 16))
  );
  const key = await deriveKeyFromCredential(input, saltBytes);
  const exported = await crypto.subtle.exportKey('raw', key);
  const hashArray = Array.from(new Uint8Array(exported));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify a credential against a stored hash and return the derived key
 * if valid. This avoids running PBKDF2 twice (once for hash, once for
 * key derivation).
 *
 * Returns { valid: true, key } on success, { valid: false } on failure.
 */
export async function verifyCredentialAndDeriveKey(
  input: string,
  storedHash: string,
  salt: string
): Promise<{ valid: boolean; key?: CryptoKey }> {
  const saltBytes = Uint8Array.from(
    salt.match(/.{2}/g)!.map((b) => parseInt(b, 16))
  );
  const key = await deriveKeyFromCredential(input, saltBytes);
  const exported = await crypto.subtle.exportKey('raw', key);
  const hashArray = Array.from(new Uint8Array(exported));
  const inputHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  // Constant-length comparison (not truly constant-time in JS, but
  // combined with the lockout mechanism this is sufficient).
  if (inputHash.length !== storedHash.length) return { valid: false };
  let mismatch = 0;
  for (let i = 0; i < inputHash.length; i++) {
    mismatch |= inputHash.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }

  if (mismatch !== 0) return { valid: false };
  return { valid: true, key };
}

/**
 * Verify a credential against a stored hash.
 * Convenience wrapper around verifyCredentialAndDeriveKey.
 */
export async function verifyCredential(
  input: string,
  storedHash: string,
  salt: string
): Promise<boolean> {
  const result = await verifyCredentialAndDeriveKey(input, storedHash, salt);
  return result.valid;
}

/**
 * Derive the encryption key from a credential and salt.
 * Convenience wrapper for use during initial setup.
 */
export async function deriveKey(credential: string, salt: string): Promise<CryptoKey> {
  const saltBytes = Uint8Array.from(
    salt.match(/.{2}/g)!.map((b) => parseInt(b, 16))
  );
  return deriveKeyFromCredential(credential, saltBytes);
}

/**
 * Generate a 12-word BIP39 mnemonic with proper entropy (128 bits)
 */
export function generateMnemonic(): string {
  return bip39.generateMnemonic(wordlist, 128);
}

/**
 * Alias for backward compatibility
 */
export function generateRecoveryPhrase(): string {
  return generateMnemonic();
}

/**
 * Convert mnemonic to seed bytes (for wallet derivation)
 */
export function mnemonicToSeed(mnemonic: string): Uint8Array {
  return bip39.mnemonicToSeedSync(mnemonic);
}

/**
 * Validate a BIP39 mnemonic phrase
 */
export function validateMnemonic(mnemonic: string): boolean {
  return bip39.validateMnemonic(mnemonic, wordlist);
}

/**
 * Hash a recovery phrase for storage verification
 */
export async function hashRecoveryPhrase(phrase: string): Promise<string> {
  const normalized = phrase.toLowerCase().trim().split(/\s+/).join(' ');
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify a recovery phrase against stored hash
 */
export async function verifyRecoveryPhrase(
  phrase: string,
  storedHash: string
): Promise<boolean> {
  const inputHash = await hashRecoveryPhrase(phrase);
  return inputHash === storedHash;
}

/**
 * Validate PIN format (4-6 digits)
 */
export function validatePin(pin: string): { valid: boolean; error?: string } {
  if (!/^\d+$/.test(pin)) {
    return { valid: false, error: 'PIN must contain only digits' };
  }
  if (pin.length < 4) {
    return { valid: false, error: 'PIN must be at least 4 digits' };
  }
  if (pin.length > 6) {
    return { valid: false, error: 'PIN must be at most 6 digits' };
  }
  return { valid: true };
}

/**
 * Validate password format (min 6 characters)
 */
export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < 6) {
    return { valid: false, error: 'Password must be at least 6 characters' };
  }
  return { valid: true };
}
