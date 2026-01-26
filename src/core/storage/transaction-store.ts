import type { Transaction } from '../../shared/types';
import { STORAGE_KEYS } from '../../shared/constants';

const MAX_TRANSACTIONS = 100;

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
    id: `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
