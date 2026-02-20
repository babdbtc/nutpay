/**
 * Simple promise-based async mutex.
 *
 * Ensures only one async operation runs within a critical section at a time.
 * Uses a FIFO queue — callers acquire the lock in order.
 *
 * Usage:
 *   const mutex = new AsyncMutex();
 *   const result = await mutex.runExclusive(async () => {
 *     // critical section
 *     return value;
 *   });
 */
export class AsyncMutex {
  private queue: Array<() => void> = [];
  private locked = false;

  /**
   * Run a callback exclusively — no other `runExclusive` call on this
   * mutex will execute concurrently.
   */
  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  private release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      // Resolve the next waiter asynchronously to avoid stack buildup
      queueMicrotask(next);
    } else {
      this.locked = false;
    }
  }
}
