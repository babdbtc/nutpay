import type { ExtensionMessage } from '../shared/types';
import { mintProofsFromQuote, subscribeMintQuote } from '../core/wallet/cashu-wallet';
import { resolveLnurlPay, requestLnurlInvoice } from '../core/protocol/lnurl';
import { updateBadgeBalance } from './badge-manager';

export async function handleMintProofs(
  msg: ExtensionMessage & { mintUrl: string; amount: number; quoteId: string }
): Promise<unknown> {
  const mintResult = await mintProofsFromQuote(msg.mintUrl, msg.amount, msg.quoteId);
  if ((mintResult as { success: boolean }).success) {
    setTimeout(() => updateBadgeBalance(), 500);
  }
  return mintResult;
}

export async function handleSubscribeMintQuote(
  msg: ExtensionMessage & { mintUrl: string; quoteId: string }
): Promise<unknown> {
  subscribeMintQuote(msg.mintUrl, msg.quoteId, () => {
    chrome.runtime.sendMessage({
      type: 'MINT_QUOTE_PAID',
      quoteId: msg.quoteId,
      mintUrl: msg.mintUrl,
    }).catch(() => {
      // No listeners — popup may be closed, that's fine
    });
  });
  return { success: true };
}

export async function handleResolveLnurl(
  msg: ExtensionMessage & { input: string }
): Promise<unknown> {
  try {
    const params = await resolveLnurlPay(msg.input);
    return { success: true, params };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to resolve Lightning address',
    };
  }
}

export async function handleRequestLnurlInvoice(
  msg: ExtensionMessage & { callback: string; amountMsat: number; comment?: string }
): Promise<unknown> {
  try {
    const result = await requestLnurlInvoice(msg.callback, msg.amountMsat, msg.comment);
    return { success: true, ...result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get invoice from LNURL service',
    };
  }
}
