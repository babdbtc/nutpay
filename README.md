# Nutpay

A Chrome extension that enables automatic micropayments using Cashu ecash tokens. When a website returns an HTTP 402 (Payment Required) response with X-Cashu payment details, Nutpay prompts the user for approval, sends the payment, and automatically retries the request.

## Why Nutpay?

Traditional web payments have high friction: credit card forms, account creation, minimum amounts, and transaction fees that make micropayments impractical. Nutpay changes this by:

- **One-click payments** - No forms, no accounts, just approve and pay
- **True micropayments** - Pay 1 sat (fraction of a cent) with zero fees
- **Privacy preserving** - Cashu tokens are bearer instruments with no identity attached
- **Seamless UX** - Payment happens in the background, content loads automatically

## How It Works

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Website   │     │   Nutpay    │     │    User     │     │   Website   │
│   Server    │     │  Extension  │     │             │     │   Server    │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │                   │
       │◄── GET /api ──────│                   │                   │
       │                   │                   │                   │
       │── 402 + payment ─►│                   │                   │
       │   details         │                   │                   │
       │                   │── Show approval ─►│                   │
       │                   │   popup           │                   │
       │                   │                   │                   │
       │                   │◄─── Approve ──────│                   │
       │                   │                   │                   │
       │                   │── Retry with ────────────────────────►│
       │                   │   X-Cashu token                       │
       │                   │                                       │
       │                   │◄───────────── 200 OK ─────────────────│
       │                   │               + content               │
       └───────────────────┴───────────────────────────────────────┘
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

Once configured with funds, Nutpay works automatically:

1. Visit a site that uses X-Cashu payments
2. When content requires payment, an approval popup appears
3. Review the amount, mint, and site
4. Click "Pay" to approve (or "Deny" to cancel)
5. The payment is sent and content loads automatically

### Auto-Approve

For trusted sites, check "Auto-approve future payments from this site" to skip the approval popup for future payments.

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

## Implementing X-Cashu Payments

Adding Cashu payments to your website is straightforward. When a user requests paid content, return a 402 response with payment details. Nutpay handles the rest.

### Step 1: Return 402 Payment Required

When a request needs payment, return:

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "mint": "https://mint.minibits.cash/Bitcoin",
  "amount": 1,
  "unit": "sat"
}
```

**Fields:**
- `mint` - The Cashu mint URL you accept payments from
- `amount` - Payment amount required
- `unit` - Unit of payment (typically `"sat"` for satoshis)

### Step 2: Accept X-Cashu Header

When Nutpay retries the request, it includes the payment token:

```http
GET /api/content HTTP/1.1
X-Cashu: cashuBpGF0gaJhaUgA...
```

Validate this token on your server before returning content.

### Step 3: Validate and Redeem Token

```javascript
import { getDecodedToken } from '@cashu/cashu-ts';

async function validatePayment(token, expectedMint, expectedAmount) {
  try {
    const decoded = getDecodedToken(token);

    // Verify mint matches
    if (decoded.mint !== expectedMint) {
      return { valid: false, error: 'Wrong mint' };
    }

    // Verify amount
    const total = decoded.proofs.reduce((sum, p) => sum + p.amount, 0);
    if (total < expectedAmount) {
      return { valid: false, error: 'Insufficient amount' };
    }

    // IMPORTANT: Redeem the token with the mint to prevent double-spending
    // In production, swap the proofs before returning content

    return { valid: true, amount: total };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}
```

### Complete Server Example (Node.js)

```javascript
import http from 'http';
import { getDecodedToken } from '@cashu/cashu-ts';

const MINT_URL = 'https://mint.minibits.cash/Bitcoin';
const PRICE = 1; // 1 sat

const server = http.createServer(async (req, res) => {
  // Enable CORS for the X-Cashu header
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Cashu');
  res.setHeader('Access-Control-Expose-Headers', 'X-Cashu');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/premium-content') {
    const token = req.headers['x-cashu'];

    // No token? Request payment
    if (!token) {
      res.writeHead(402, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        mint: MINT_URL,
        amount: PRICE,
        unit: 'sat'
      }));
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

      // TODO: Redeem token with mint to prevent double-spend

      // Payment valid - return content
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        content: 'Your premium content here!',
        paid: paid
      }));

    } catch (error) {
      res.writeHead(402, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: error.message,
        mint: MINT_URL,
        amount: PRICE,
        unit: 'sat'
      }));
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(3000);
```

### Frontend Integration

No frontend changes needed! Nutpay intercepts fetch/XHR requests automatically. Your existing code works as-is:

```javascript
// This just works - Nutpay handles the 402 → pay → retry flow
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
- `https://mint.lnvoltz.com` (LNVoltz)

Users can add custom mints in the extension settings. During wallet recovery, these default mints are scanned for recoverable funds.

## Technical Details

- **Manifest V3** - Built for modern Chrome extension standards
- **NUT-13 Deterministic Secrets** - BIP39 seed-based wallet recovery
- **Encrypted storage** - Proofs and seed encrypted with AES-GCM
- **Proof selection** - Optimizes for minimal change using subset-sum algorithm
- **Counter persistence** - Keyset counters tracked for deterministic proof derivation
- **Auto-cleanup** - Expired pending payments cleaned automatically

## Credits

This extension implements the [X-Cashu](https://github.com/cashubtc/xcashu) protocol created by [Cashu](https://github.com/cashubtc). X-Cashu enables HTTP 402 Payment Required flows using Cashu ecash tokens.

Wallet recovery uses [NUT-13](https://github.com/cashubtc/nuts/blob/main/13.md) deterministic secrets for seed-based backup and restore.

Built with [cashu-ts](https://github.com/cashubtc/cashu-ts) v3, the TypeScript implementation of the Cashu protocol.

Learn more about Cashu at [cashu.space](https://cashu.space).

## License

MIT
