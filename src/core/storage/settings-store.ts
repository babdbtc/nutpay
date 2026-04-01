import type { Settings, MintConfig } from '../../shared/types';
import { STORAGE_KEYS, DEFAULT_SETTINGS, PRESET_MINTS } from '../../shared/constants';
import { normalizeMintUrl } from '../../shared/format';

// Get current settings
export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  const settings = stored[STORAGE_KEYS.SETTINGS];

  if (!settings) {
    return { ...DEFAULT_SETTINGS };
  }

  return { ...DEFAULT_SETTINGS, ...settings };
}

// Update settings
export async function updateSettings(
  updates: Partial<Settings>
): Promise<Settings> {
  const current = await getSettings();
  const updated = { ...current, ...updates };

  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated });
  } catch (error) {
    if (error instanceof Error && error.message.includes('QUOTA_BYTES')) {
      throw new Error('Storage quota exceeded. Remove unused mints or reduce proof count.');
    }
    throw error;
  }
  return updated;
}

// Get all configured mints
export async function getMints(): Promise<MintConfig[]> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.MINTS);
  const mints = stored[STORAGE_KEYS.MINTS];

  if (!mints) {
    // Initialize with preset mints
    try {
      await chrome.storage.local.set({ [STORAGE_KEYS.MINTS]: PRESET_MINTS });
    } catch (error) {
      if (error instanceof Error && error.message.includes('QUOTA_BYTES')) {
        throw new Error('Storage quota exceeded. Remove unused mints or reduce proof count.');
      }
      throw error;
    }
    return [...PRESET_MINTS];
  }

  return mints;
}

// Add a new mint
export async function addMint(mint: MintConfig): Promise<MintConfig[]> {
  const mints = await getMints();
  const normalizedUrl = normalizeMintUrl(mint.url);

  // Check if already exists (normalize both for comparison)
  if (mints.some((m) => normalizeMintUrl(m.url) === normalizedUrl)) {
    return mints;
  }

  // Store with normalized URL
  const newMint = { ...mint, url: normalizedUrl };
  const updated = [...mints, newMint];
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.MINTS]: updated });
  } catch (error) {
    if (error instanceof Error && error.message.includes('QUOTA_BYTES')) {
      throw new Error('Storage quota exceeded. Remove unused mints or reduce proof count.');
    }
    throw error;
  }
  return updated;
}

// Update a mint
export async function updateMint(
  url: string,
  updates: Partial<MintConfig>
): Promise<MintConfig[]> {
  const mints = await getMints();
  const normalizedUrl = normalizeMintUrl(url);
  const updated = mints.map((m) =>
    normalizeMintUrl(m.url) === normalizedUrl ? { ...m, ...updates } : m
  );

  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.MINTS]: updated });
  } catch (error) {
    if (error instanceof Error && error.message.includes('QUOTA_BYTES')) {
      throw new Error('Storage quota exceeded. Remove unused mints or reduce proof count.');
    }
    throw error;
  }
  return updated;
}

// Remove a mint
export async function removeMint(url: string): Promise<MintConfig[]> {
  const mints = await getMints();
  const normalizedUrl = normalizeMintUrl(url);
  const updated = mints.filter((m) => normalizeMintUrl(m.url) !== normalizedUrl);

  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.MINTS]: updated });
  } catch (error) {
    if (error instanceof Error && error.message.includes('QUOTA_BYTES')) {
      throw new Error('Storage quota exceeded. Remove unused mints or reduce proof count.');
    }
    throw error;
  }
  return updated;
}

// Get enabled mints
export async function getEnabledMints(): Promise<MintConfig[]> {
  const mints = await getMints();
  return mints.filter((m) => m.enabled);
}

// Check if a mint is trusted
export async function isMintTrusted(url: string): Promise<boolean> {
  const mints = await getMints();
  const normalizedUrl = normalizeMintUrl(url);
  const mint = mints.find((m) => normalizeMintUrl(m.url) === normalizedUrl);
  return mint?.trusted ?? false;
}
