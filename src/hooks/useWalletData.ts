import { useState, useEffect, useCallback } from 'react';
import type { MintBalance, Transaction, Settings, MintConfig } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/constants';
import { applyTheme } from '../shared/theme';

interface UseWalletDataOptions {
  /** Only load data when true */
  enabled: boolean;
  /** Number of recent transactions to fetch (default: 5) */
  txLimit?: number;
  /** Auto-refresh interval in ms (0 = disabled) */
  autoRefreshMs?: number;
  /** Listen for background events like MINT_QUOTE_PAID */
  listenForEvents?: boolean;
}

interface UseWalletDataReturn {
  balances: MintBalance[];
  transactions: Transaction[];
  settings: Settings;
  mints: MintConfig[];
  loading: boolean;
  totalBalance: number;
  loadData: () => Promise<void>;
}

export function useWalletData(options: UseWalletDataOptions): UseWalletDataReturn {
  const { enabled, txLimit = 5, autoRefreshMs = 0, listenForEvents = false } = options;

  const [balances, setBalances] = useState<MintBalance[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [mints, setMints] = useState<MintConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [balanceData, txData, settingsData, mintsData] = await Promise.all([
        chrome.runtime.sendMessage({ type: 'GET_BALANCE' }),
        chrome.runtime.sendMessage({ type: 'GET_TRANSACTIONS', limit: txLimit }),
        chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }),
        chrome.runtime.sendMessage({ type: 'GET_MINTS' }),
      ]);
      setBalances(balanceData || []);
      setTransactions(txData || []);
      const loadedSettings = { ...DEFAULT_SETTINGS, ...settingsData };
      setSettings(loadedSettings);
      setMints(mintsData || []);
      applyTheme(loadedSettings.theme || 'midnight');
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }, [txLimit]);

  // Load data when enabled
  useEffect(() => {
    if (enabled) {
      loadData();
    }
  }, [enabled, loadData]);

  // Auto-refresh interval
  useEffect(() => {
    if (!enabled || autoRefreshMs <= 0) return;
    const interval = setInterval(loadData, autoRefreshMs);
    return () => clearInterval(interval);
  }, [enabled, autoRefreshMs, loadData]);

  // Listen for background events
  useEffect(() => {
    if (!enabled || !listenForEvents) return;
    const listener = (message: { type: string }) => {
      if (message.type === 'MINT_QUOTE_PAID' || message.type === 'SETTINGS_UPDATED') {
        loadData();
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [enabled, listenForEvents, loadData]);

  const totalBalance = balances.reduce((sum, b) => sum + b.balance, 0);

  return {
    balances,
    transactions,
    settings,
    mints,
    loading,
    totalBalance,
    loadData,
  };
}
