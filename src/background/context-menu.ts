// Context menu - right-click actions for cashu tokens, lightning invoices, and lightning addresses

import { receiveToken, getMeltQuote, payLightningInvoice } from '../core/wallet/cashu-wallet';
import { flashReceived, flashPaymentFailed, updateBadgeBalance } from './badge-manager';
import { getMints } from '../core/storage/settings-store';
import { getBalanceByMint } from '../core/wallet/proof-manager';
import { resolveLnurlPay, requestLnurlInvoice } from '../core/protocol/lnurl';

// Menu item IDs
const MENU_IDS = {
  CLAIM_TOKEN: 'nutpay-claim-token',
  PAY_INVOICE: 'nutpay-pay-invoice',
  PAY_ADDRESS: 'nutpay-pay-address',
} as const;

// Detect what kind of string the selection contains
interface DetectionResult {
  type: 'cashu_token' | 'lightning_invoice' | 'lightning_address' | 'lnurl' | null;
  value: string;
}

function detectSelection(text: string): DetectionResult {
  const trimmed = text.trim();

  // Cashu token (V3 or V4)
  if (/^cashu[AB][A-Za-z0-9_-]+/.test(trimmed)) {
    // Extract just the token part (may have trailing whitespace or punctuation)
    const match = trimmed.match(/^(cashu[AB][A-Za-z0-9_\-=+/]+)/);
    if (match) return { type: 'cashu_token', value: match[1] };
  }

  // Lightning invoice (BOLT11)
  if (/^(lnbc|lntb|lnbcrt)[a-z0-9]+/i.test(trimmed)) {
    const match = trimmed.match(/^((?:lnbc|lntb|lnbcrt)[a-z0-9]+)/i);
    if (match) return { type: 'lightning_invoice', value: match[1].toLowerCase() };
  }

  // LNURL
  if (/^lnurl[a-z0-9]+/i.test(trimmed)) {
    const match = trimmed.match(/^(lnurl[a-z0-9]+)/i);
    if (match) return { type: 'lnurl', value: match[1].toLowerCase() };
  }

  // Lightning address (user@domain.com)
  if (/^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed)) {
    return { type: 'lightning_address', value: trimmed };
  }

  return { type: null, value: '' };
}

// Setup context menus
export function setupContextMenus(): void {
  // Remove existing menus to avoid duplicates
  chrome.contextMenus.removeAll(() => {
    // Single menu item that appears on text selection
    // We'll dynamically show/hide based on selection content
    chrome.contextMenus.create({
      id: MENU_IDS.CLAIM_TOKEN,
      title: 'Claim Cashu token with Nutpay',
      contexts: ['selection'],
    });

    chrome.contextMenus.create({
      id: MENU_IDS.PAY_INVOICE,
      title: 'Pay Lightning invoice with Nutpay',
      contexts: ['selection'],
    });

    chrome.contextMenus.create({
      id: MENU_IDS.PAY_ADDRESS,
      title: 'Pay Lightning address with Nutpay',
      contexts: ['selection'],
    });
  });
}

// Handle context menu clicks
export function handleContextMenuClick(
  info: chrome.contextMenus.OnClickData,
  _tab?: chrome.tabs.Tab
): void {
  const selection = info.selectionText;
  if (!selection) return;

  const detected = detectSelection(selection);
  if (!detected.type) {
    // Show notification that nothing useful was detected
    showNotification(
      'Nothing detected',
      'Selected text is not a Cashu token, Lightning invoice, or Lightning address.',
      'error'
    );
    return;
  }

  switch (info.menuItemId) {
    case MENU_IDS.CLAIM_TOKEN:
      if (detected.type === 'cashu_token') {
        handleClaimToken(detected.value);
      } else {
        showNotification('Not a Cashu token', 'Selected text does not contain a valid Cashu token.', 'error');
      }
      break;
    case MENU_IDS.PAY_INVOICE:
      if (detected.type === 'lightning_invoice') {
        handlePayInvoice(detected.value);
      } else {
        showNotification('Not an invoice', 'Selected text does not contain a Lightning invoice.', 'error');
      }
      break;
    case MENU_IDS.PAY_ADDRESS:
      if (detected.type === 'lightning_address' || detected.type === 'lnurl') {
        handlePayAddress(detected.value, detected.type);
      } else {
        showNotification('Not an address', 'Selected text does not contain a Lightning address.', 'error');
      }
      break;
  }
}

// Claim a cashu token
async function handleClaimToken(token: string): Promise<void> {
  try {
    showNotification('Claiming token...', 'Receiving ecash token into your wallet.', 'info');
    const result = await receiveToken(token);
    if ((result as { success: boolean; amount?: number }).success) {
      const amount = (result as { amount?: number }).amount || 0;
      showNotification(
        'Token claimed!',
        `Received ${amount} sats into your wallet.`,
        'success'
      );
      if (amount > 0) flashReceived(amount);
      else updateBadgeBalance();
    } else {
      const error = (result as { error?: string }).error || 'Failed to claim token';
      showNotification('Claim failed', error, 'error');
      flashPaymentFailed();
    }
  } catch (error) {
    showNotification(
      'Claim failed',
      error instanceof Error ? error.message : 'Unknown error',
      'error'
    );
    flashPaymentFailed();
  }
}

// Pay a lightning invoice
async function handlePayInvoice(invoice: string): Promise<void> {
  try {
    // Find a mint with sufficient balance
    const mints = await getMints();
    const balances = await getBalanceByMint();
    const enabledMints = mints.filter((m) => m.enabled);

    // Get a melt quote from the first mint with balance
    let selectedMint: string | null = null;
    let quote: { quote: string; amount: number; fee_reserve: number } | null = null;

    for (const mint of enabledMints) {
      const balance = balances.get(mint.url) || 0;
      if (balance === 0) continue;

      try {
        const quoteResult = await getMeltQuote(mint.url, invoice);
        const q = quoteResult as { success: boolean; quote?: string; amount?: number; fee?: number };
        if (q.success && q.quote) {
          const totalNeeded = (q.amount || 0) + (q.fee || 0);
          if (balance >= totalNeeded) {
            selectedMint = mint.url;
            quote = { quote: q.quote, amount: q.amount || 0, fee_reserve: q.fee || 0 };
            break;
          }
        }
      } catch {
        continue;
      }
    }

    if (!selectedMint || !quote) {
      showNotification('Cannot pay', 'Insufficient funds or no available mint.', 'error');
      return;
    }

    // Show notification with amount
    showNotification(
      'Paying invoice...',
      `Sending ${quote.amount} sats (+ ${quote.fee_reserve} sat fee) via Lightning.`,
      'info'
    );

    const result = await payLightningInvoice(
      selectedMint,
      invoice,
      quote.quote,
      quote.amount,
      quote.fee_reserve
    );

    if ((result as { success: boolean }).success) {
      showNotification('Payment sent!', `Paid ${quote.amount} sats via Lightning.`, 'success');
      updateBadgeBalance();
    } else {
      const error = (result as { error?: string }).error || 'Payment failed';
      showNotification('Payment failed', error, 'error');
      flashPaymentFailed();
    }
  } catch (error) {
    showNotification(
      'Payment failed',
      error instanceof Error ? error.message : 'Unknown error',
      'error'
    );
    flashPaymentFailed();
  }
}

// Pay a lightning address or LNURL
async function handlePayAddress(
  address: string,
  _type: 'lightning_address' | 'lnurl'
): Promise<void> {
  try {
    showNotification('Resolving address...', `Looking up ${address}`, 'info');

    const params = await resolveLnurlPay(address);

    if (!params) {
      showNotification('Resolution failed', `Could not resolve ${address}`, 'error');
      return;
    }

    // For now, pay the minimum amount
    const amountMsat = params.minSendable;
    const amountSats = Math.ceil(amountMsat / 1000);

    // Request invoice
    const invoiceResult = await requestLnurlInvoice(
      params.callback,
      amountMsat
    );

    if (!invoiceResult || !(invoiceResult as { pr?: string }).pr) {
      showNotification('Failed', 'Could not get invoice from Lightning address.', 'error');
      return;
    }

    const invoice = (invoiceResult as { pr: string }).pr;

    // Now pay the invoice
    showNotification(
      'Paying...',
      `Sending ${amountSats} sats to ${address}`,
      'info'
    );

    await handlePayInvoice(invoice);
  } catch (error) {
    showNotification(
      'Payment failed',
      error instanceof Error ? error.message : 'Unknown error',
      'error'
    );
    flashPaymentFailed();
  }
}

// Show a Chrome notification
function showNotification(
  title: string,
  message: string,
  type: 'success' | 'error' | 'info'
): void {
  const iconPath = 'assets/icons/icon-128.png';
  chrome.notifications.create({
    type: 'basic',
    iconUrl: iconPath,
    title: `Nutpay: ${title}`,
    message,
    priority: type === 'error' ? 2 : 1,
  });
}
