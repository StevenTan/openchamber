import { spring } from 'motion';

const LIMIT = 56;
const RESISTANCE = 120;

/** A contact-owned pull: hold its displacement until AppKit ends the gesture. */
export class NativeOverscrollAxis {
  private raw = 0;
  private position = 0;
  private returning: { spring: ReturnType<typeof spring>; startedAt: number } | null = null;

  get moving(): boolean { return this.position !== 0; }

  input(delta: number, now: number): void {
    this.advance(now);
    if (this.returning) {
      this.raw = this.position * RESISTANCE / (LIMIT - Math.abs(this.position));
      this.returning = null;
    }
    const next = this.raw + delta;
    // Reverse input first consumes the pull; it cannot pull the opposite edge.
    this.raw = this.raw > 0 ? Math.max(0, next) : this.raw < 0 ? Math.min(0, next) : next;
    this.raw = Math.max(-360, Math.min(360, this.raw));
    this.position = LIMIT * this.raw / (RESISTANCE + Math.abs(this.raw));
  }

  release(now: number): void {
    if (!this.moving || this.returning) return;
    this.returning = {
      spring: spring({ keyframes: [this.position, 0], stiffness: 220, damping: 26, mass: 0.85 }),
      startedAt: now,
    };
  }

  advance(now: number): number {
    if (this.returning) {
      const sample = this.returning.spring.next(now - this.returning.startedAt);
      this.position = sample.done ? 0 : sample.value;
      if (sample.done) { this.raw = 0; this.returning = null; }
    }
    return this.position;
  }
}
