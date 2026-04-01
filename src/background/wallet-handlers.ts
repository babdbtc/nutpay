import type { ExtensionMessage } from '../shared/types';
import {
  receiveToken,
  generateSendToken,
  payLightningInvoice,
} from '../core/wallet/cashu-wallet';
import { getFilteredTransactions } from '../core/storage/transaction-store';
import { updateSettings } from '../core/storage/settings-store';
import { getMintDetails, getMintBalanceDetails, clearWalletCache } from '../core/wallet/mint-manager';
import { storeSeed, hasSeed, getWalletVersion } from '../core/storage/seed-store';
import { getCounters } from '../core/storage/counter-store';
import { validateMnemonic, mnemonicToSeed } from '../core/security/auth';
import {
  recoverFromSeed,
  getRecoveryProgress,
  cancelRecovery,
  isRecoveryInProgress,
} from '../core/wallet/recovery-service';
import { updateBadgeBalance } from './badge-manager';

export async function handleAddProofs(msg: ExtensionMessage & { token: string }): Promise<unknown> {
  const addResult = await receiveToken(msg.token);
  if ((addResult as { success: boolean }).success) {
    setTimeout(() => updateBadgeBalance(), 500);
  }
  return addResult;
}

export async function handleGetFilteredTransactions(
  msg: ExtensionMessage & {
    filters?: {
      type?: 'payment' | 'receive';
      status?: 'pending' | 'completed' | 'failed';
      startDate?: number;
      endDate?: number;
    };
    limit?: number;
    offset?: number;
  }
): Promise<unknown> {
  return getFilteredTransactions(msg.filters, msg.limit, msg.offset);
}

export async function handleUpdateSettings(
  msg: ExtensionMessage & { settings: Parameters<typeof updateSettings>[0] }
): Promise<unknown> {
  const result = await updateSettings(msg.settings);
  // Refresh badge if the badge setting was changed
  if ('showBadgeBalance' in msg.settings) {
    setTimeout(() => updateBadgeBalance(), 100);
  }
  return result;
}

export async function handleGenerateSendToken(
  msg: ExtensionMessage & { mintUrl: string; amount: number }
): Promise<unknown> {
  const sendResult = await generateSendToken(msg.mintUrl, msg.amount);
  if ((sendResult as { success: boolean }).success) {
    setTimeout(() => updateBadgeBalance(), 500);
  }
  return sendResult;
}

export async function handleMeltProofs(
  msg: ExtensionMessage & {
    mintUrl: string;
    invoice: string;
    quoteId: string;
    amount: number;
    feeReserve: number;
  }
): Promise<unknown> {
  const meltResult = await payLightningInvoice(msg.mintUrl, msg.invoice, msg.quoteId, msg.amount, msg.feeReserve);
  if ((meltResult as { success: boolean }).success) {
    setTimeout(() => updateBadgeBalance(), 500);
  }
  return meltResult;
}

export async function handleGetMintInfo(msg: ExtensionMessage & { mintUrl: string }): Promise<unknown> {
  return getMintDetails(msg.mintUrl);
}

export async function handleGetMintBalanceDetails(msg: ExtensionMessage & { mintUrl: string }): Promise<unknown> {
  return getMintBalanceDetails(msg.mintUrl);
}

export async function handleGetWalletInfo(): Promise<unknown> {
  const seedExists = await hasSeed();
  const version = await getWalletVersion();
  const counters = await getCounters();
  return {
    hasSeed: seedExists,
    version,
    keysetCount: Object.keys(counters).length,
  };
}

export async function handleSetupWalletSeed(msg: ExtensionMessage & { mnemonic: string }): Promise<unknown> {
  if (!validateMnemonic(msg.mnemonic)) {
    return { success: false, error: 'Invalid mnemonic phrase' };
  }

  const seed = mnemonicToSeed(msg.mnemonic);
  await storeSeed(seed);
  clearWalletCache();

  return { success: true };
}

export async function handleStartSeedRecovery(
  msg: ExtensionMessage & { mnemonic: string; mintUrls: string[] }
): Promise<unknown> {
  if (!validateMnemonic(msg.mnemonic)) {
    return { success: false, error: 'Invalid mnemonic phrase' };
  }

  if (isRecoveryInProgress()) {
    return { success: false, error: 'Recovery already in progress' };
  }

  const seed = mnemonicToSeed(msg.mnemonic);

  // Start recovery (this runs in the background)
  recoverFromSeed(seed, msg.mintUrls)
    .then((result) => {
      console.log('[Nutpay] Recovery completed:', result);
    })
    .catch((error) => {
      console.error('[Nutpay] Recovery failed:', error);
    });

  return { success: true, message: 'Recovery started' };
}

export async function handleGetRecoveryProgress(): Promise<unknown> {
  const progress = getRecoveryProgress();
  const inProgress = isRecoveryInProgress();
  return { inProgress, progress };
}

export async function handleCancelRecovery(): Promise<unknown> {
  cancelRecovery();
  return { success: true };
}
