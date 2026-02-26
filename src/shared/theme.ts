import type { ThemeId } from './types';

/**
 * Apply a theme to the document
 */
export function applyTheme(themeId: ThemeId): void {
  document.documentElement.setAttribute('data-theme', themeId);
  // Also ensure dark class is present for base dark styles
  document.documentElement.classList.add('dark');
}

/**
 * Get current theme from document
 */
export function getCurrentTheme(): ThemeId {
  return (document.documentElement.getAttribute('data-theme') as ThemeId) || 'midnight';
}

/**
 * Load and apply theme from settings
 */
export async function loadAndApplyTheme(): Promise<void> {
  try {
    const result = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    if (result?.theme) {
      applyTheme(result.theme);
    } else {
      applyTheme('midnight');
    }
  } catch {
    applyTheme('midnight');
  }
}
