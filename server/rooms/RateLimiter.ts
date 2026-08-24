/**
 * A token bucket per key. Used to keep one client from flooding a room, and to
 * slow down password guessing against private rooms.
 */
export default class RateLimiter {
  private buckets = new Map<string, { tokens: number; updatedAt: number }>()

  /**
   * @param capacity how many actions are allowed back to back
   * @param refillPerSecond how quickly the allowance comes back
   */
  constructor(private capacity: number, private refillPerSecond: number) {}

  private refill(key: string, now: number) {
    const bucket = this.buckets.get(key)

    if (!bucket) {
      const fresh = { tokens: this.capacity, updatedAt: now }
      this.buckets.set(key, fresh)
      return fresh
    }

    const elapsedSeconds = Math.max(0, now - bucket.updatedAt) / 1000
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSeconds * this.refillPerSecond)
    bucket.updatedAt = now
    return bucket
  }

  /** true when the key has allowance left, without spending any of it */
  check(key: string, now = Date.now()) {
    return this.refill(key, now).tokens >= 1
  }

  /** spends one unit of allowance; false when there was none left */
  consume(key: string, now = Date.now()) {
    const bucket = this.refill(key, now)
    if (bucket.tokens < 1) return false

    bucket.tokens -= 1
    return true
  }

  forget(key: string) {
    this.buckets.delete(key)
  }
}
