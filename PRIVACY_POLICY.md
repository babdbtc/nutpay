# Nutpay Privacy Policy

**Last updated:** February 26, 2026

## Overview

Nutpay is a browser extension that provides a Cashu ecash wallet with automatic HTTP 402 micropayment support. This privacy policy explains what data Nutpay handles and how it is stored.

## Data Collection

**Nutpay does not collect, transmit, or store any personal data on external servers.** Nutpay has no analytics, telemetry, or tracking of any kind. There is no backend server operated by Nutpay.

## Data Stored Locally

All data is stored locally on your device using the Chrome extension storage API (`chrome.storage.local` and `chrome.storage.session`). This includes:

- **Wallet data:** Cashu ecash proofs (tokens), mint URLs, keyset information, and derivation counters. Proofs are encrypted at rest using AES-GCM-256 with a key derived from your PIN or password via PBKDF2.
- **Seed phrase:** A BIP39 mnemonic used for deterministic wallet recovery, encrypted at rest with the same credential-derived key.
- **Security configuration:** Hashed credentials (PIN/password) for wallet lock/unlock. Raw credentials are never stored.
- **Settings and preferences:** Theme, auto-approve rules, site allowlist with spending limits.
- **Transaction history:** A local log of send/receive transactions for your reference.

Session keys used to decrypt wallet data are stored in `chrome.storage.session` and are automatically cleared when the browser is closed.

## Network Communication

Nutpay communicates over the network only in the following cases:

- **Cashu mint servers:** To perform wallet operations (minting, melting, swapping ecash tokens, checking keyset info). Communication occurs only with mint URLs that you explicitly add to your wallet. These mints are third-party services not operated by Nutpay.
- **Website servers:** When an HTTP 402 payment is triggered, Nutpay sends a Cashu ecash token to the requesting website as payment. This only occurs with your explicit approval (or within auto-approve limits you configure).
- **LNURL/Lightning endpoints:** When sending to a Lightning address, Nutpay resolves the LNURL endpoint to obtain an invoice. These are third-party services.

All network communication uses HTTPS.

## Permissions

Nutpay requests the following browser permissions:

- **`storage`**: To persist wallet data locally.
- **`activeTab`**: To interact with the current tab for payment flows and ecash scanning.
- **`scripting`**: To inject the fetch interceptor that detects HTTP 402 responses.
- **`contextMenus`**: To provide right-click actions for claiming tokens and paying invoices.
- **`notifications`**: To notify you of payment events.
- **`sidePanel`**: To provide a persistent wallet panel alongside browsing.
- **Host permissions (`<all_urls>`)**: Required to intercept HTTP 402 responses on any website. Nutpay only activates on pages that return HTTP 402 status codes with Cashu payment headers.

## Third-Party Services

Nutpay does not share your data with any third parties. However, when you interact with Cashu mints or Lightning Network services, those third-party servers may have their own privacy policies. Nutpay does not control the data practices of these services.

## Data Deletion

All Nutpay data is stored locally in your browser. You can delete all data at any time by:

- Removing the Nutpay extension from Chrome (this deletes all extension storage).
- Clearing extension data via Chrome settings.

## Children's Privacy

Nutpay is not directed at children under 13 and does not knowingly collect information from children.

## Changes to This Policy

Any changes to this privacy policy will be reflected in an updated version of the extension. The "Last updated" date at the top of this document will be revised accordingly.

## Contact

If you have questions about this privacy policy, please open an issue on the [Nutpay GitHub repository](https://github.com/nicbudd/nutpay).
