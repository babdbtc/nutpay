import type { AllowlistEntry } from '../../shared/types';
import { STORAGE_KEYS } from '../../shared/constants';

// Get all allowlist entries
export async function getAllowlist(): Promise<AllowlistEntry[]> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.ALLOWLIST);
  return stored[STORAGE_KEYS.ALLOWLIST] || [];
}

// Get allowlist entry for a specific origin
export async function getAllowlistEntry(
  origin: string
): Promise<AllowlistEntry | null> {
  const allowlist = await getAllowlist();
  return allowlist.find((e) => e.origin === origin) || null;
}

// Add or update an allowlist entry
export async function setAllowlistEntry(
  entry: AllowlistEntry
): Promise<AllowlistEntry[]> {
  const allowlist = await getAllowlist();
  const existingIndex = allowlist.findIndex((e) => e.origin === entry.origin);

  if (existingIndex >= 0) {
    allowlist[existingIndex] = entry;
  } else {
    allowlist.push(entry);
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.ALLOWLIST]: allowlist });
  return allowlist;
}

// Remove an allowlist entry
export async function removeAllowlistEntry(
  origin: string
): Promise<AllowlistEntry[]> {
  const allowlist = await getAllowlist();
  const updated = allowlist.filter((e) => e.origin !== origin);

  await chrome.storage.local.set({ [STORAGE_KEYS.ALLOWLIST]: updated });
  return updated;
}

// Check if an origin is allowed for auto-approval
export async function isAutoApproved(
  origin: string,
  amount: number
): Promise<boolean> {
  const entry = await getAllowlistEntry(origin);

  if (!entry || !entry.autoApprove) {
    return false;
  }

  // Check per-payment limit
  if (amount > entry.maxPerPayment) {
    return false;
  }

  // Check daily limit
  const today = new Date().toISOString().split('T')[0];

  if (entry.lastResetDate !== today) {
    // Reset daily counter for the new day
    await setAllowlistEntry({
      ...entry,
      dailySpent: 0,
      lastResetDate: today,
    });
    // After reset, only check the new payment against the daily limit
    return amount <= entry.maxPerDay;
  }

  return entry.dailySpent + amount <= entry.maxPerDay;
}

// Record a payment for an origin (updates daily spent)
export async function recordPayment(
  origin: string,
  amount: number
): Promise<void> {
  const entry = await getAllowlistEntry(origin);

  if (!entry) {
    return;
  }

  const today = new Date().toISOString().split('T')[0];

  await setAllowlistEntry({
    ...entry,
    dailySpent:
      entry.lastResetDate === today ? entry.dailySpent + amount : amount,
    lastResetDate: today,
  });
}

// Create a default allowlist entry for a new site
export function createDefaultAllowlistEntry(
  origin: string,
  autoApprove: boolean = false
): AllowlistEntry {
  return {
    origin,
    autoApprove,
    maxPerPayment: 100, // 100 sats default
    maxPerDay: 1000,    // 1000 sats default
    dailySpent: 0,
    lastResetDate: new Date().toISOString().split('T')[0],
  };
}
