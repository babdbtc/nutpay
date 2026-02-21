import { describe, it, expect } from 'vitest';
import { AsyncMutex } from './mutex';

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

describe('AsyncMutex', () => {
  it('runs a single task to completion', async () => {
    const mutex = new AsyncMutex();
    const result = await mutex.runExclusive(async () => 42);
    expect(result).toBe(42);
  });

  it('returns the value produced by the callback', async () => {
    const mutex = new AsyncMutex();
    const result = await mutex.runExclusive(async () => 'hello');
    expect(result).toBe('hello');
  });

  it('propagates errors from the callback', async () => {
    const mutex = new AsyncMutex();
    await expect(
      mutex.runExclusive(async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
  });

  it('releases the lock after an error so subsequent tasks can run', async () => {
    const mutex = new AsyncMutex();

    // First call throws
    await expect(
      mutex.runExclusive(async () => {
        throw new Error('fail');
      })
    ).rejects.toThrow('fail');

    // Second call should still succeed
    const result = await mutex.runExclusive(async () => 'recovered');
    expect(result).toBe('recovered');
  });

  it('serializes concurrent tasks (no interleaving)', async () => {
    const mutex = new AsyncMutex();
    const log: string[] = [];

    const task = (name: string, ms: number) =>
      mutex.runExclusive(async () => {
        log.push(`${name}:start`);
        await delay(ms);
        log.push(`${name}:end`);
      });

    await Promise.all([task('A', 30), task('B', 10), task('C', 10)]);

    // Tasks must execute sequentially: A starts and ends before B starts, etc.
    expect(log).toEqual([
      'A:start',
      'A:end',
      'B:start',
      'B:end',
      'C:start',
      'C:end',
    ]);
  });

  it('preserves FIFO order', async () => {
    const mutex = new AsyncMutex();
    const order: number[] = [];

    // Lock the mutex first
    const blocker = mutex.runExclusive(async () => {
      await delay(50);
    });

    // Queue tasks while mutex is held — they should execute in order
    const tasks = [1, 2, 3, 4, 5].map((n) =>
      mutex.runExclusive(async () => {
        order.push(n);
      })
    );

    await blocker;
    await Promise.all(tasks);

    expect(order).toEqual([1, 2, 3, 4, 5]);
  });

  it('handles high contention without deadlock', async () => {
    const mutex = new AsyncMutex();
    let counter = 0;

    const tasks = Array.from({ length: 100 }, () =>
      mutex.runExclusive(async () => {
        const current = counter;
        await delay(0); // Yield to event loop
        counter = current + 1;
      })
    );

    await Promise.all(tasks);

    // Without the mutex, counter would be < 100 due to race conditions.
    // With the mutex, it must be exactly 100.
    expect(counter).toBe(100);
  });

  it('separate mutex instances are independent', async () => {
    const mutexA = new AsyncMutex();
    const mutexB = new AsyncMutex();
    const log: string[] = [];

    const taskA = mutexA.runExclusive(async () => {
      log.push('A:start');
      await delay(30);
      log.push('A:end');
    });

    const taskB = mutexB.runExclusive(async () => {
      log.push('B:start');
      await delay(10);
      log.push('B:end');
    });

    await Promise.all([taskA, taskB]);

    // Both should start before either ends, since they're independent
    expect(log.indexOf('A:start')).toBeLessThan(log.indexOf('A:end'));
    expect(log.indexOf('B:start')).toBeLessThan(log.indexOf('B:end'));
    // B should finish before A since it's faster and they're independent
    expect(log.indexOf('B:end')).toBeLessThan(log.indexOf('A:end'));
  });
});
