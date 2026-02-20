import type { Transaction } from '../../shared/types';
import { STORAGE_KEYS } from '../../shared/constants';

const MAX_TRANSACTIONS = 500;

// Get all transactions
export async function getTransactions(): Promise<Transaction[]> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.TRANSACTIONS);
  return stored[STORAGE_KEYS.TRANSACTIONS] || [];
}

// Add a transaction
export async function addTransaction(
  transaction: Omit<Transaction, 'id' | 'timestamp'>
): Promise<Transaction> {
  const transactions = await getTransactions();

  const newTx: Transaction = {
    ...transaction,
    id: `tx-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
    timestamp: Date.now(),
  };

  // Add to front, keep only last MAX_TRANSACTIONS
  const updated = [newTx, ...transactions].slice(0, MAX_TRANSACTIONS);

  await chrome.storage.local.set({ [STORAGE_KEYS.TRANSACTIONS]: updated });
  return newTx;
}

// Update transaction status
export async function updateTransactionStatus(
  id: string,
  status: Transaction['status']
): Promise<void> {
  const transactions = await getTransactions();
  const updated = transactions.map((tx) =>
    tx.id === id ? { ...tx, status } : tx
  );

  await chrome.storage.local.set({ [STORAGE_KEYS.TRANSACTIONS]: updated });
}

// Get recent transactions
export async function getRecentTransactions(
  limit: number = 10
): Promise<Transaction[]> {
  const transactions = await getTransactions();
  return transactions.slice(0, limit);
}

// Get transactions for a specific origin
export async function getTransactionsForOrigin(
  origin: string
): Promise<Transaction[]> {
  const transactions = await getTransactions();
  return transactions.filter((tx) => tx.origin === origin);
}

// Get total spent today
export async function getTodaySpent(): Promise<number> {
  const transactions = await getTransactions();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();

  return transactions
    .filter(
      (tx) =>
        tx.type === 'payment' &&
        tx.status === 'completed' &&
        tx.timestamp >= todayStart
    )
    .reduce((sum, tx) => sum + tx.amount, 0);
}

// Filter interface for transactions
export interface TransactionFilters {
  type?: 'payment' | 'receive';
  status?: 'pending' | 'completed' | 'failed';
  startDate?: number;
  endDate?: number;
  mintUrl?: string;
}

// Get filtered transactions with pagination
export async function getFilteredTransactions(
  filters?: TransactionFilters,
  limit: number = 50,
  offset: number = 0
): Promise<{
  transactions: Transaction[];
  total: number;
  hasMore: boolean;
}> {
  let transactions = await getTransactions();

  // Apply filters
  if (filters) {
    if (filters.type) {
      transactions = transactions.filter((tx) => tx.type === filters.type);
    }
    if (filters.status) {
      transactions = transactions.filter((tx) => tx.status === filters.status);
    }
    if (filters.startDate) {
      transactions = transactions.filter((tx) => tx.timestamp >= filters.startDate!);
    }
    if (filters.endDate) {
      transactions = transactions.filter((tx) => tx.timestamp <= filters.endDate!);
    }
    if (filters.mintUrl) {
      transactions = transactions.filter((tx) => tx.mintUrl === filters.mintUrl);
    }
  }

  const total = transactions.length;
  const paginated = transactions.slice(offset, offset + limit);

  return {
    transactions: paginated,
    total,
    hasMore: offset + limit < total,
  };
}
