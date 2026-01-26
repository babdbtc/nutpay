import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

/**
 * Generate a random salt for hashing
 */
export function generateSalt(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash a credential (PIN or password) with salt using SHA-256
 */
export async function hashCredential(input: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify a credential against a stored hash
 */
export async function verifyCredential(
  input: string,
  storedHash: string,
  salt: string
): Promise<boolean> {
  const inputHash = await hashCredential(input, salt);
  return inputHash === storedHash;
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
