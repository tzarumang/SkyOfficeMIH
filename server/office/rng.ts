/**
 * A small seeded generator, so an office is a pure function of its seed. The
 * same seed has to rebuild the same office on every process that draws it.
 */
export class Rng {
  private state: number

  constructor(seed: number) {
    // 0 would stick mulberry32 at a fixed point
    this.state = seed >>> 0 || 0x9e3779b9
  }

  /** mulberry32 - small, fast and good enough for laying out furniture */
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** inclusive on both ends */
  int(min: number, max: number) {
    if (max < min) return min
    return min + Math.floor(this.next() * (max - min + 1))
  }

  pick<T>(values: readonly T[]): T {
    return values[this.int(0, values.length - 1)]
  }

  chance(probability: number) {
    return this.next() < probability
  }

  shuffle<T>(values: T[]): T[] {
    const out = [...values]
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i)
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }
}
