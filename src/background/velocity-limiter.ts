/**
 * In-memory sliding window rate limiter for payment velocity.
 * Tracks payment timestamps per origin and enforces a 10 payments per 60-second limit.
 */

const velocityMap = new Map<string, number[]>();

const MAX_PAYMENTS_PER_WINDOW = 10;
const WINDOW_SIZE_MS = 60 * 1000;

/**
 * Check if origin has exceeded the velocity limit.
 * Prunes old timestamps on each call, then checks count.
 */
export function checkVelocityLimit(origin: string): {
  allowed: boolean;
  reason?: string;
} {
  const now = Date.now();
  const timestamps = velocityMap.get(origin) || [];
  const recentTimestamps = timestamps.filter(
    (ts) => now - ts < WINDOW_SIZE_MS
  );

  if (recentTimestamps.length > 0) {
    velocityMap.set(origin, recentTimestamps);
  } else {
    velocityMap.delete(origin);
  }

  if (recentTimestamps.length >= MAX_PAYMENTS_PER_WINDOW) {
    let hostname = 'unknown';
    try {
      hostname = new URL(origin).hostname;
    } catch {
      hostname = origin;
    }

    return {
      allowed: false,
      reason: `Rate limit exceeded: too many payments to ${hostname} in the last minute. Try again shortly.`,
    };
  }

  return { allowed: true };
}

/**
 * Record a payment timestamp for this origin.
 */
export function recordPaymentTimestamp(origin: string): void {
  const timestamps = velocityMap.get(origin) || [];
  timestamps.push(Date.now());
  velocityMap.set(origin, timestamps);
}

/**
 * Clean up all entries with timestamps older than 60 seconds.
 * Can be called periodically to prevent unbounded memory growth.
 */
export function cleanupOldTimestamps(): void {
  const now = Date.now();

  for (const [origin, timestamps] of velocityMap.entries()) {
    const recentTimestamps = timestamps.filter(
      (ts) => now - ts < WINDOW_SIZE_MS
    );

    if (recentTimestamps.length > 0) {
      velocityMap.set(origin, recentTimestamps);
    } else {
      velocityMap.delete(origin);
    }
  }
}
