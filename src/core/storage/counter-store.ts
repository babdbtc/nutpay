import { STORAGE_KEYS } from '../../shared/constants';
import { AsyncMutex } from '../../shared/mutex';

// All counter mutations must go through this mutex to prevent
// concurrent read-modify-write races that cause counter reuse.
// Counter reuse in NUT-13 means duplicate blinded messages → token loss.
const counterMutex = new AsyncMutex();

/**
 * Keyset counters map keyset ID to the next unused counter value
 */
export interface KeysetCounters {
  [keysetId: string]: number;
}

/**
 * Get all keyset counters
 */
export async function getCounters(): Promise<KeysetCounters> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.KEYSET_COUNTERS);
  return result[STORAGE_KEYS.KEYSET_COUNTERS] || {};
}

/**
 * Get the counter for a specific keyset
 */
export async function getCounter(keysetId: string): Promise<number> {
  const counters = await getCounters();
  return counters[keysetId] || 0;
}

/**
 * Increment and return the counter for a keyset
 * This reserves a single counter value
 */
export async function incrementCounter(keysetId: string): Promise<number> {
  return counterMutex.runExclusive(async () => {
    const counters = await getCounters();
    const current = counters[keysetId] || 0;
    counters[keysetId] = current + 1;
    await chrome.storage.local.set({ [STORAGE_KEYS.KEYSET_COUNTERS]: counters });
    return current;
  });
}

/**
 * Set the counter for a specific keyset
 * Used when the wallet library reserves a range of counters
 */
export async function setCounter(keysetId: string, value: number): Promise<void> {
  await counterMutex.runExclusive(async () => {
    const counters = await getCounters();
    // Only update if the new value is higher (to prevent counter reuse)
    if (value > (counters[keysetId] || 0)) {
      counters[keysetId] = value;
      await chrome.storage.local.set({ [STORAGE_KEYS.KEYSET_COUNTERS]: counters });
    }
  });
}

/**
 * Reserve multiple counter values at once
 * Returns the starting counter value
 */
export async function reserveCounters(keysetId: string, count: number): Promise<number> {
  return counterMutex.runExclusive(async () => {
    const counters = await getCounters();
    const start = counters[keysetId] || 0;
    counters[keysetId] = start + count;
    await chrome.storage.local.set({ [STORAGE_KEYS.KEYSET_COUNTERS]: counters });
    return start;
  });
}

/**
 * Clear all counters (use with caution - only during recovery or reset)
 */
export async function clearCounters(): Promise<void> {
  await counterMutex.runExclusive(async () => {
    await chrome.storage.local.remove(STORAGE_KEYS.KEYSET_COUNTERS);
  });
}

/**
 * Update multiple counters at once
 */
export async function setCounters(newCounters: KeysetCounters): Promise<void> {
  await counterMutex.runExclusive(async () => {
    const existing = await getCounters();
    // Merge, taking the higher value for each keyset
    for (const [keysetId, value] of Object.entries(newCounters)) {
      if (value > (existing[keysetId] || 0)) {
        existing[keysetId] = value;
      }
    }
    await chrome.storage.local.set({ [STORAGE_KEYS.KEYSET_COUNTERS]: existing });
  });
}
