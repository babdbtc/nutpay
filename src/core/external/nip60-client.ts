// NIP-60 Client
// NIP-60 defines a standard for storing Cashu wallet data on Nostr relays

import type { Proof } from '@cashu/cashu-ts';

interface NIP60WalletEvent {
  kind: 17375; // NIP-60 wallet event kind
  pubkey: string;
  content: string; // Encrypted JSON containing proofs
  tags: string[][];
}

interface NIP60Config {
  pubkey: string;
  relays: string[];
  privateKey?: string; // For signing/decryption
}

// NIP-60 Wallet Client
export class NIP60Client {
  private config: NIP60Config;
  private ws: WebSocket | null = null;

  constructor(config: NIP60Config) {
    this.config = config;
  }

  // Connect to relays
  async connect(): Promise<void> {
    // Connect to first available relay
    for (const relay of this.config.relays) {
      try {
        await this.connectToRelay(relay);
        return;
      } catch {
        console.warn(`[NIP-60] Failed to connect to ${relay}`);
      }
    }
    throw new Error('Failed to connect to any relay');
  }

  private connectToRelay(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[NIP-60] Connected to relay:', url);
        resolve();
      };

      this.ws.onerror = () => {
        reject(new Error(`Failed to connect to ${url}`));
      };
    });
  }

  // Disconnect
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // Fetch wallet proofs from Nostr
  async fetchProofs(): Promise<{ proofs: Proof[]; mintUrl: string }[]> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      const results: { proofs: Proof[]; mintUrl: string }[] = [];
      const subscriptionId = `nutpay-${Date.now()}`;

      const timeout = setTimeout(() => {
        reject(new Error('Timeout fetching proofs'));
      }, 10000);

      this.ws!.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message[0] === 'EVENT' && message[1] === subscriptionId) {
            const walletEvent = message[2] as NIP60WalletEvent;
            const parsed = this.parseWalletEvent(walletEvent);
            if (parsed) {
              results.push(parsed);
            }
          } else if (message[0] === 'EOSE' && message[1] === subscriptionId) {
            clearTimeout(timeout);
            resolve(results);
          }
        } catch (error) {
          console.error('[NIP-60] Parse error:', error);
        }
      };

      // Subscribe to wallet events
      const filter = {
        kinds: [17375],
        authors: [this.config.pubkey],
      };

      this.ws!.send(JSON.stringify(['REQ', subscriptionId, filter]));
    });
  }

  // Parse a wallet event
  private parseWalletEvent(
    event: NIP60WalletEvent
  ): { proofs: Proof[]; mintUrl: string } | null {
    try {
      // In a real implementation, we would:
      // 1. Decrypt the content using the private key
      // 2. Parse the JSON to extract proofs and mint URL

      // Placeholder - content would be encrypted
      const decrypted = event.content;
      const data = JSON.parse(decrypted);

      return {
        proofs: data.proofs || [],
        mintUrl: data.mint || '',
      };
    } catch {
      return null;
    }
  }

  // Sync proofs to Nostr
  async syncProofs(
    _proofs: Proof[],
    _mintUrl: string
  ): Promise<boolean> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    // In a real implementation:
    // 1. Encrypt the proofs with the private key
    // 2. Create a kind 17375 event
    // 3. Sign the event
    // 4. Publish to relays

    console.warn('[NIP-60] Sync not yet implemented');
    return false;
  }

  // Delete spent proofs from Nostr
  async deleteProof(_proofSecret: string): Promise<boolean> {
    // In a real implementation:
    // 1. Find the event containing this proof
    // 2. Publish a delete event (kind 5)
    // 3. Re-publish updated wallet event without the spent proof

    console.warn('[NIP-60] Delete not yet implemented');
    return false;
  }
}

// Default relays for NIP-60
export const DEFAULT_NIP60_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
];

// Singleton instance
let nip60Client: NIP60Client | null = null;

// Get or create NIP-60 client
export function getNIP60Client(pubkey: string, relays?: string[]): NIP60Client {
  if (!nip60Client) {
    nip60Client = new NIP60Client({
      pubkey,
      relays: relays || DEFAULT_NIP60_RELAYS,
    });
  }
  return nip60Client;
}

// Clear NIP-60 client
export function clearNIP60Client(): void {
  if (nip60Client) {
    nip60Client.disconnect();
    nip60Client = null;
  }
}
