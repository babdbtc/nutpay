# Nutpay Demo Shop

A mock webshop for demonstrating Nutpay's automatic 402 payment, paywalled content, and ecash token auto-claim features.

## Prerequisites

- Node.js 18+
- Nutpay Chrome extension installed and funded with some sats

## Quick Start

```bash
cd demo-shop
npm install
cp .env.example .env
npm run build
npm start
```

Open http://localhost:3000 in Chrome with Nutpay installed.

## Configuring Free Tokens

The Free Tokens page dispenses pre-generated ecash tokens. To populate them:

1. Open the Nutpay extension
2. Go to **Send**
3. Create small ecash tokens (1-2 sats each)
4. Copy the `cashuA...` or `cashuB...` strings
5. Paste them into the `freeTokens` array in `server/data/tokens.ts`
6. Rebuild and restart (`npm run build && npm start`)

Each token can only be claimed once. Once the array is exhausted, the page shows an "out of tokens" message.

## Demo Walkthrough

### Demo 1: Free Token Auto-Claim

1. Navigate to **Free Tokens**
2. Click **Claim Free Token**
3. The page renders a `cashuA...` token string in the DOM
4. Nutpay's page scanner detects it and shows a claim notification
5. Click **Claim** in the notification — token is added to wallet

### Demo 2: Product Purchase

1. Navigate to **Products**
2. Click any product to open its detail page
3. Click **Pay X sats**
4. The browser calls `fetch('/api/product/:id')` — server returns 402
5. Nutpay intercepts the 402, shows an approval popup with the amount and mint
6. Click **Approve** — Nutpay pays and retries the request automatically
7. Content unlocks and the download button becomes available

### Demo 3: Paywalled Article

1. Navigate to **Articles**
2. Click **Read More** on any article
3. Click **Unlock Full Article**
4. Nutpay approval popup appears with the article price
5. Approve — full article content is revealed inline

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MINT_URL` | `https://mint.minibits.cash/Bitcoin` | Cashu mint URL for generating payment requests |
| `PORT` | `3000` | Server port |

Copy `.env.example` to `.env` and adjust as needed. The mint you configure here must be one that your Nutpay wallet has funds on.

## Architecture

Express.js serves both the API endpoints and the compiled React SPA from `dist/`.

The extension intercepts `window.fetch()` globally. When a fetch returns a 402 with an `X-Cashu` header, Nutpay reads the NUT-18 payment request, prompts for approval, and retries the original request with the token attached. No frontend code changes are needed.

```
Browser → fetch('/api/product/1') → Server returns 402 + X-Cashu header
                                          ↓
                                   Nutpay detects 402
                                          ↓
                                   Shows approval popup
                                          ↓
                                   User approves
                                          ↓
Browser → fetch('/api/product/1', {X-Cashu: token}) → Server validates → 200 + content
```

Key server-side details:

- **Payment requests** - Generated with `cashu-ts` `PaymentRequest`, encoded as `creqA...` (NUT-18)
- **Token validation** - `CashuWallet.receive()` redeems proofs against the mint, preventing double-spend
- **Free tokens** - Pre-generated and stored in `server/data/tokens.ts`; dispensed one per request

## Products

| Product | Price |
|---------|-------|
| Pixel Grid Wallpaper Pack | 4 sats |
| Mono Icon Set | 2 sats |
| Code Snippet Collection | 1 sat |
| Terminal Font | 8 sats |

## Articles

| Article | Price |
|---------|-------|
| Why Ecash Matters for Internet Privacy | 2 sats |
| Building a 402-Enabled Web | 4 sats |
| The Case for Digital Bearer Instruments | 1 sat |
