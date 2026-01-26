// Nostr Wallet Connect client
// NWC allows connecting to external Lightning wallets that support the NWC protocol

import type { XCashuPaymentRequest } from '../../shared/types';

interface NWCConfig {
  pubkey: string;
  relay: string;
  secret: string;
}

// For future use
// interface NWCPaymentResult {
//   success: boolean;
//   preimage?: string;
//   error?: string;
// }

// Parse a NWC connection string
// Format: nostr+walletconnect://pubkey?relay=wss://...&secret=hex
export function parseNWCConnectionString(connectionString: string): NWCConfig | null {
  try {
    const url = new URL(connectionString);

    if (url.protocol !== 'nostr+walletconnect:') {
      return null;
    }

    const pubkey = url.pathname.replace('//', '');
    const relay = url.searchParams.get('relay');
    const secret = url.searchParams.get('secret');

    if (!pubkey || !relay || !secret) {
      return null;
    }

    return { pubkey, relay, secret };
  } catch {
    return null;
  }
}

// NWC Client class
export class NWCClient {
  private config: NWCConfig;
  private ws: WebSocket | null = null;
  // For future use when implementing full NWC flow
  // private pendingRequests = new Map<
  //   string,
  //   { resolve: (result: NWCPaymentResult) => void; reject: (error: Error) => void }
  // >();

  constructor(connectionString: string) {
    const config = parseNWCConnectionString(connectionString);
    if (!config) {
      throw new Error('Invalid NWC connection string');
    }
    this.config = config;
  }

  // Connect to the relay
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.config.relay);

      this.ws.onopen = () => {
        console.log('[NWC] Connected to relay');
        resolve();
      };

      this.ws.onerror = (error) => {
        console.error('[NWC] Connection error:', error);
        reject(new Error('Failed to connect to NWC relay'));
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onclose = () => {
        console.log('[NWC] Disconnected from relay');
      };
    });
  }

  // Disconnect from the relay
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // Handle incoming messages
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      // NWC responses come as Nostr events
      if (message[0] === 'EVENT' && message[2]) {
        const event = message[2];
        this.handleEvent(event);
      }
    } catch (error) {
      console.error('[NWC] Failed to parse message:', error);
    }
  }

  // Handle a Nostr event (NWC response)
  private handleEvent(event: { id: string; content: string; kind: number }): void {
    // NWC responses are kind 23195
    if (event.kind !== 23195) {
      return;
    }

    // In a real implementation, we would:
    // 1. Decrypt the content using the shared secret
    // 2. Parse the JSON response
    // 3. Resolve the pending request

    // For now, this is a placeholder
    console.log('[NWC] Received response:', event.id);
  }

  // Request a payment (get tokens from the wallet)
  async requestPayment(
    _paymentRequest: XCashuPaymentRequest
  ): Promise<{ token: string } | null> {
    // NWC is primarily for Lightning, not Cashu
    // This would need a custom NWC extension or use make_invoice + pay_invoice
    // to convert Lightning to Cashu through a swap service

    console.warn('[NWC] Cashu payment via NWC not yet implemented');
    return null;
  }

  // Get wallet balance
  async getBalance(): Promise<number | null> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    // In a real implementation:
    // 1. Create a NWC get_balance request event
    // 2. Sign it with the secret
    // 3. Send to relay
    // 4. Wait for response

    console.warn('[NWC] Balance check not yet implemented');
    return null;
  }
}

// Singleton instance
let nwcClient: NWCClient | null = null;

// Get or create NWC client
export function getNWCClient(connectionString: string): NWCClient {
  if (!nwcClient) {
    nwcClient = new NWCClient(connectionString);
  }
  return nwcClient;
}

// Clear NWC client
export function clearNWCClient(): void {
  if (nwcClient) {
    nwcClient.disconnect();
    nwcClient = null;
  }
}
