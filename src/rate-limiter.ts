/**
 * Rate Limiter for Clay API
 *
 * Prevents hitting Clay's rate limits by:
 * 1. Tracking requests in a sliding window
 * 2. Delaying requests when approaching limits
 * 3. Providing backoff on 429 errors
 */

export interface RateLimiterConfig {
  /** Max requests per minute (default: 60) */
  maxRequestsPerMinute?: number;
  /** Min delay between requests in ms (default: 100) */
  minDelayMs?: number;
  /** Initial backoff on 429 in ms (default: 1000) */
  backoffMs?: number;
  /** Max backoff in ms (default: 30000) */
  maxBackoffMs?: number;
  /** Enable debug logging */
  debug?: boolean;
}

export class RateLimiter {
  private requestTimestamps: number[] = [];
  private maxRequestsPerMinute: number;
  private minDelayMs: number;
  private backoffMs: number;
  private maxBackoffMs: number;
  private currentBackoff: number = 0;
  private lastRequestTime: number = 0;
  private debug: boolean;

  constructor(config: RateLimiterConfig = {}) {
    this.maxRequestsPerMinute = config.maxRequestsPerMinute ?? 60;
    this.minDelayMs = config.minDelayMs ?? 100;
    this.backoffMs = config.backoffMs ?? 1000;
    this.maxBackoffMs = config.maxBackoffMs ?? 30000;
    this.debug = config.debug ?? false;
  }

  /**
   * Wait before making a request (call this before each API call)
   */
  async waitForSlot(): Promise<void> {
    // Clean old timestamps (older than 1 minute)
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    this.requestTimestamps = this.requestTimestamps.filter(t => t > oneMinuteAgo);

    // If we're in backoff mode, wait
    if (this.currentBackoff > 0) {
      if (this.debug) {
        console.error(`[RateLimit] Backoff: waiting ${this.currentBackoff}ms`);
      }
      await this.sleep(this.currentBackoff);
      this.currentBackoff = 0;
    }

    // Check if we're at the limit
    if (this.requestTimestamps.length >= this.maxRequestsPerMinute) {
      // Wait until the oldest request falls out of the window
      const oldestRequest = this.requestTimestamps[0];
      const waitTime = oldestRequest + 60000 - now + 100; // +100ms buffer
      if (this.debug) {
        console.error(`[RateLimit] At limit (${this.requestTimestamps.length}/${this.maxRequestsPerMinute}), waiting ${waitTime}ms`);
      }
      await this.sleep(waitTime);
    }

    // Enforce minimum delay between requests
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minDelayMs) {
      const waitTime = this.minDelayMs - timeSinceLastRequest;
      await this.sleep(waitTime);
    }

    // Record this request
    this.requestTimestamps.push(Date.now());
    this.lastRequestTime = Date.now();
  }

  /**
   * Call this when you get a 429 response
   */
  recordRateLimitHit(): void {
    if (this.currentBackoff === 0) {
      this.currentBackoff = this.backoffMs;
    } else {
      // Exponential backoff
      this.currentBackoff = Math.min(this.currentBackoff * 2, this.maxBackoffMs);
    }
    if (this.debug) {
      console.error(`[RateLimit] 429 received, backoff set to ${this.currentBackoff}ms`);
    }
  }

  /**
   * Call this on successful request to reset backoff
   */
  recordSuccess(): void {
    this.currentBackoff = 0;
  }

  /**
   * Get current stats
   */
  getStats(): { requestsInLastMinute: number; currentBackoff: number } {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    this.requestTimestamps = this.requestTimestamps.filter(t => t > oneMinuteAgo);

    return {
      requestsInLastMinute: this.requestTimestamps.length,
      currentBackoff: this.currentBackoff,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance for shared rate limiting across all clients
let sharedRateLimiter: RateLimiter | null = null;

export function getSharedRateLimiter(config?: RateLimiterConfig): RateLimiter {
  if (!sharedRateLimiter) {
    sharedRateLimiter = new RateLimiter(config);
  }
  return sharedRateLimiter;
}

export function resetSharedRateLimiter(): void {
  sharedRateLimiter = null;
}
