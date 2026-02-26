# Nutpay

A Cashu ecash wallet for your browser — with automatic HTTP 402 micropayments.

https://github.com/user-attachments/assets/86028d18-6360-425d-be2d-f2008106695a

## Wallet Features

Nutpay is a full-featured [Cashu](https://cashu.space) wallet that runs as a Chrome extension:

- **Send & receive ecash** - Generate or redeem Cashu tokens with QR codes
- **Lightning support** - Receive via Lightning invoice, send to any Lightning address (`user@domain.com`) or bolt11 invoice (LNURL-pay / LUD-16)
- **Multi-mint** - Manage multiple mints, view per-mint balances and denominations
- **Deterministic recovery** - 12-word BIP39 seed phrase with full wallet restore (NUT-13)
- **DLEQ verification** - Cryptographic proof validation on all mint operations (NUT-12)
- **Transaction history** - Filterable, paginated log of all payments and receives
- **Encrypted storage** - Proofs and seed encrypted with AES-GCM-256
- **PIN / password lock** - Session timeout, lockout protection, credential recovery
- **Proof state checks** - Periodic reconciliation against mints (NUT-07)

## Browser-Native Features

Nutpay takes advantage of being a browser extension to provide features a standalone wallet can't:

- **Automatic 402 payments** - Transparent fetch interception for HTTP 402 + X-Cashu (NUT-24)
- **Page ecash scanning** - Detects `cashuA`/`cashuB` tokens on web pages and shows a one-click claim notification
- **Right-click context menu** - Select a Cashu token, Lightning invoice, or Lightning address on any page and act on it from the right-click menu
- **Badge notifications** - Extension icon shows your sat balance, flashes on 402 detection, successful payments, and errors
- **Side panel** - Open Nutpay as a persistent side panel that stays open while you browse, with auto-refresh and full wallet functionality

## Automatic 402 Payments

When a website returns an HTTP 402 (Payment Required) response with an `X-Cashu` header, Nutpay detects it, prompts you for approval, pays, and retries the request — all transparently.

- **One-click payments** - No forms, no accounts, just approve and pay
- **True micropayments** - Pay 1 sat (fraction of a cent) with zero fees
- **Privacy preserving** - Cashu tokens are bearer instruments with no identity attached
- **Seamless UX** - Payment happens in the background, content loads automatically
- **Auto-approve** - Set spending limits for trusted sites to skip the approval popup

### How 402 Payments Work

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Website   │     │   Nutpay    │     │    User     │
│   Server    │     │  Extension  │     │             │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │◄── GET /api ──────│                   │
       │                   │                   │
       │── 402 + payment ─►│                   │
       │   details         │                   │
       │                   │── Show approval ─►│
       │                   │   popup           │
       │                   │                   │
       │                   │◄─── Approve ──────│
       │                   │                   │
       │◄─ Retry with ─────│                   │
       │   X-Cashu token   │                   │
       │                   │                   │
       │── 200 OK ────────►│                   │
       │   + content       │                   │
       └───────────────────┴───────────────────┘
```

## Installation

### From Source

1. Clone and build:
   ```bash
   git clone https://github.com/babdbtc/nutpay
   cd nutpay
   npm install
   npm run build
   ```

2. Load in Chrome:
   - Go to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

### Initial Setup

1. Click the Nutpay extension icon
2. Choose **Create New Wallet** or **Import Existing Wallet**
   - **Create New Wallet**: Generates a 12-word BIP39 seed phrase - write it down safely!
   - **Import Existing Wallet**: Enter your existing seed phrase to restore your wallet
3. Set a PIN or password to protect your wallet
4. Go to Settings (gear icon) to add mints or customize preferences
5. Deposit tokens via Lightning or by pasting a Cashu token

## Usage

### As a Wallet

Click the Nutpay icon to open the wallet popup:

- **View balances** - Total and per-mint balances at a glance
- **Receive** - Paste a Cashu token or create a Lightning invoice (with QR code)
- **Send** - Generate an ecash token (with QR code), pay a Lightning invoice, or send to a Lightning address
- **History** - Browse, filter, and review all past transactions
- **Mint details** - Tap a mint to see info, proof counts, and denomination breakdown

### Side Panel

For a better experience, open Nutpay as a persistent side panel:

1. Click the Nutpay icon to open the popup
2. Click the **side panel icon** (top-right, next to lock/settings)
3. The wallet opens as a side panel that stays open while you browse

The side panel auto-refreshes your balance every 30 seconds and shows more transaction history than the popup. All wallet features (send, receive, Lightning) work identically.

### Automatic 402 Payments

Once configured with funds, Nutpay handles web payments automatically:

1. Visit a site that uses X-Cashu payments
2. When content requires payment, an approval popup appears
3. Review the amount, mint, and site
4. Click "Pay" to approve (or "Deny" to cancel)
5. The payment is sent and content loads automatically

For trusted sites, check "Auto-approve future payments from this site" to skip the approval popup. You can configure per-payment and daily spending limits in Settings.

### Page Ecash Scanning

Nutpay automatically scans web pages for Cashu ecash tokens (`cashuA...` or `cashuB...` strings). When tokens are found:

1. A toast notification appears at the bottom-right of the page
2. Click **Claim** to receive all detected tokens into your wallet
3. The toast shows success/failure status and auto-dismisses

The scanner also watches for dynamically added content (e.g., new posts loading in a feed).

### Right-Click Context Menu

Select text on any web page containing a Cashu token, Lightning invoice, or Lightning address, then right-click to see Nutpay actions:

- **Claim Cashu token with Nutpay** - Receive a selected `cashuA`/`cashuB` token
- **Pay Lightning invoice with Nutpay** - Pay a selected `lnbc...` BOLT11 invoice
- **Pay Lightning address with Nutpay** - Send to a selected `user@domain.com` address or `lnurl...`

Progress and results are shown via Chrome notifications.

### Badge Notifications

The Nutpay extension icon shows real-time status:

| Badge | Meaning |
|-------|---------|
| `1.2k` (purple) | Your wallet balance in sats |
| `402` (orange) | Payment request detected |
| `-100` (green) | Successful payment |
| `+50` (green) | Received ecash or Lightning |
| `✗` (red) | Payment failed |
| `🔒` (gray) | Wallet is locked |

### Wallet Backup & Recovery

Nutpay uses **BIP39 seed phrases** (12 words) for wallet backup, compatible with the [NUT-13](https://github.com/cashubtc/nuts/blob/main/13.md) deterministic secrets specification.

**Backup your seed phrase:**
1. Go to Settings → Security
2. View your 12-word recovery phrase
3. Write it down and store it safely offline

**Restore your wallet:**
1. Reinstall Nutpay or use on a new device
2. Select "Import Existing Wallet"
3. Enter your 12-word seed phrase
4. Select mints to scan for recoverable funds
5. Nutpay will scan and restore your ecash balance

> **Important**: Your seed phrase controls your funds. Anyone with access to it can restore and spend your ecash. Never share it or store it digitally.

---

# For Website Developers

## Implementing X-Cashu Payments (NUT-24)

Adding Cashu payments to your website is straightforward. Nutpay implements the [NUT-24](https://github.com/cashubtc/nuts/blob/main/24.md) HTTP payment protocol. When a user requests paid content, return a 402 response with an `X-Cashu` header containing a [NUT-18](https://github.com/cashubtc/nuts/blob/main/18.md) encoded payment request. Nutpay handles the rest.

### Step 1: Return 402 with X-Cashu Header

When a request needs payment, return a 402 response with the `X-Cashu` header containing a CBOR-encoded payment request (`creqA...` format):

```http
HTTP/1.1 402 Payment Required
X-Cashu: creqApGF0gaNhdGFzYWmBo...
Content-Type: application/json

{"status": 402, "message": "Payment Required"}
```

The `X-Cashu` header value is a NUT-18 payment request encoding the accepted mints, amount, and unit. The JSON body is optional and informational only — Nutpay reads payment details exclusively from the header.

Use `cashu-ts` to build the payment request:

```javascript
import { PaymentRequest } from '@cashu/cashu-ts';

function buildPaymentRequestHeader(mintUrl, amount, unit) {
  const pr = new PaymentRequest(
    [],          // transport: empty = in-band payment (NUT-24)
    undefined,   // id
    amount,      // required amount
    unit,        // e.g. 'sat'
    [mintUrl],   // accepted mints (can list multiple)
    undefined,   // description
    true         // singleUse
  );
  return pr.toEncodedRequest(); // returns "creqA..." string
}
```

### Step 2: Accept X-Cashu Request Header

When Nutpay retries the request after payment, it includes the ecash token:

```http
GET /api/content HTTP/1.1
X-Cashu: cashuBpGF0gaJhaUgA...
```

Validate this token on your server before returning content. Return HTTP 400 for invalid tokens (per NUT-24).

### Step 3: Validate and Redeem Token

```javascript
import { getDecodedToken } from '@cashu/cashu-ts';

function validatePayment(token, expectedMint, expectedAmount) {
  try {
    const decoded = getDecodedToken(token);

    if (decoded.mint !== expectedMint) {
      return { valid: false, error: 'Wrong mint' };
    }

    const total = decoded.proofs.reduce((sum, p) => sum + p.amount, 0);
    if (total < expectedAmount) {
      return { valid: false, error: 'Insufficient amount' };
    }

    // IMPORTANT: Redeem/swap the proofs with the mint to prevent double-spending

    return { valid: true, amount: total };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}
```

### Complete Server Example (Node.js)

```javascript
import http from 'http';
import { getDecodedToken, PaymentRequest } from '@cashu/cashu-ts';

const MINT_URL = 'https://mint.minibits.cash/Bitcoin';
const PRICE = 1; // 1 sat
const UNIT = 'sat';

function buildPaymentRequest(mintUrl, amount, unit) {
  const pr = new PaymentRequest([], undefined, amount, unit, [mintUrl], undefined, true);
  return pr.toEncodedRequest();
}

const server = http.createServer(async (req, res) => {
  // CORS — expose X-Cashu so the browser extension can read it
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Cashu');
  res.setHeader('Access-Control-Expose-Headers', 'X-Cashu');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/premium-content') {
    const token = req.headers['x-cashu'];

    // No token → request payment via NUT-24
    if (!token) {
      const paymentRequest = buildPaymentRequest(MINT_URL, PRICE, UNIT);
      res.writeHead(402, {
        'Content-Type': 'application/json',
        'X-Cashu': paymentRequest,
      });
      res.end(JSON.stringify({ status: 402, message: 'Payment Required' }));
      return;
    }

    // Validate the token
    try {
      const decoded = getDecodedToken(token);

      if (decoded.mint !== MINT_URL) {
        throw new Error('Wrong mint');
      }

      const paid = decoded.proofs.reduce((sum, p) => sum + p.amount, 0);
      if (paid < PRICE) {
        throw new Error('Insufficient payment');
      }

      // TODO: Redeem/swap proofs with the mint to prevent double-spend

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        content: 'Your premium content here!',
        paid,
      }));
    } catch (error) {
      // NUT-24: Return 400 for invalid tokens
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ detail: error.message, code: 0 }));
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(3000);
```

### Frontend Integration

No frontend changes needed! Nutpay intercepts `fetch()` requests automatically. Your existing code works as-is:

```javascript
// This just works — Nutpay handles the 402 → pay → retry flow
const response = await fetch('/premium-content');
const data = await response.json();
console.log(data.content); // "Your premium content here!"
```

### Use Cases

- **API metering** - Charge per API call instead of monthly subscriptions
- **Premium content** - Paywall articles, videos, or downloads
- **Anti-spam** - Require tiny payment to prevent abuse
- **Micropayments** - Tips, donations, pay-per-use services
- **Machine-to-machine** - AI agents paying for API access

### Best Practices

1. **Choose established mints** - Use well-known mints that users likely have tokens from
2. **Keep amounts small** - The power of Cashu is enabling true micropayments
3. **Provide fallbacks** - Consider offering traditional payment for users without Nutpay
4. **Redeem tokens** - Always swap proofs with the mint to prevent double-spending
5. **CORS headers** - Ensure `X-Cashu` is in `Access-Control-Allow-Headers` and `Access-Control-Expose-Headers`

## Supported Mints

Nutpay comes pre-configured with these mints:

- `https://mint.minibits.cash/Bitcoin` (Minibits)
- `https://mint.coinos.io` (Coinos)
- `https://mint.lnbits.com` (LNbits Demo)

Users can add custom mints in the extension settings. During wallet recovery, these default mints are scanned for recoverable funds.

## Supported NUTs

| NUT | Description | Details |
|-----|-------------|---------|
| [NUT-02](https://github.com/cashubtc/nuts/blob/main/02.md) | Keysets & fees | Real fee schedule from mint keysets |
| [NUT-07](https://github.com/cashubtc/nuts/blob/main/07.md) | Proof state check | Periodic + startup reconciliation against mints |
| [NUT-12](https://github.com/cashubtc/nuts/blob/main/12.md) | DLEQ proofs | Verification on all mint-returned proofs |
| [NUT-13](https://github.com/cashubtc/nuts/blob/main/13.md) | Deterministic secrets | BIP39 seed-based backup & recovery |
| [NUT-17](https://github.com/cashubtc/nuts/blob/main/17.md) | WebSocket subscriptions | Real-time mint quote payment notifications |
| [NUT-18](https://github.com/cashubtc/nuts/blob/main/18.md) | Payment requests | CBOR-encoded payment request decoding |
| [NUT-24](https://github.com/cashubtc/nuts/blob/main/24.md) | HTTP 402 payments | Automatic detect, pay, and retry flow |

## Technical Details

- **Manifest V3** - Built for modern Chrome extension standards
- **Side Panel API** - `chrome.sidePanel` for persistent wallet UI alongside browsing
- **Context Menus API** - `chrome.contextMenus` for right-click actions on tokens, invoices, and addresses
- **Notifications API** - `chrome.notifications` for payment progress and results
- **Badge API** - `chrome.action.setBadgeText` for real-time balance and payment status on the icon
- **DOM scanning** - Content script scans pages for ecash tokens using regex + MutationObserver for dynamic content
- **Atomic proof lifecycle** - Proofs marked `PENDING_SPEND` before mint operations; recovered on service worker restart
- **Encrypted storage** - Proofs and seed encrypted with AES-GCM-256
- **Proof selection** - Optimizes for minimal change using subset-sum algorithm
- **Counter persistence** - Keyset counters tracked for deterministic proof derivation
- **Auto-cleanup** - Expired pending payments cleaned automatically

## Credits

Built with [cashu-ts](https://github.com/cashubtc/cashu-ts) v3.5, the TypeScript implementation of the [Cashu](https://github.com/cashubtc) ecash protocol.

Learn more about Cashu at [cashu.space](https://cashu.space).

## License

MIT
