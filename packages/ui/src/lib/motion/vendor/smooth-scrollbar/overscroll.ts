/*! @license
The MIT License (MIT)

Copyright (c) 2015-present Daofeng Wu (aka. Dolphin Wood)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

// Adapted from smooth-scrollbar 8.8.4, src/plugins/overscroll/index.ts (MIT).
// Copyright (c) 2015-present Daofeng Wu (aka. Dolphin Wood). See LICENSE.

const DAMPING = 0.2;
const MAX_OVERSCROLL = 56;
const RELEASE_WHEEL_MS = 30;
const FRAME_MS = 1000 / 60;
const REST = 0.1;

/** Local input tuning: reduce native wheel travel, including its inertial tail. */
export const WHEEL_MULTIPLIER = 0.8;

/** Vertical wheel dynamics; the host owns scrolling, clipping and frame scheduling. */
export class OverscrollAxis {
  private amplitude = 0;
  private position = 0;
  private wheelScrollBack = false;
  private lockWheel = false;
  private lastInputAt = Number.NEGATIVE_INFINITY;
  private frameAt = 0;

  get moving(): boolean {
    return this.amplitude !== 0 || this.position !== 0;
  }

  input(delta: number, now: number): void {
    this.advance(now);
    // Upstream releases its wheel lock after a quiet input gap. Keeping the
    // timestamp here avoids a timer surviving a detached scrollport.
    if (now - this.lastInputAt >= RELEASE_WHEEL_MS) this.lockWheel = false;
    this.lastInputAt = now;
    if (this.lockWheel) return;

    const currentAmp = this.amplitude;
    const isOpposite = delta * currentAmp < 0;
    const friction = isOpposite ? 0 : this.wheelScrollBack ? 1 : Math.abs(currentAmp / MAX_OVERSCROLL);
    const amp = currentAmp + delta * (1 - friction);
    this.amplitude = Math.max(-MAX_OVERSCROLL, Math.min(MAX_OVERSCROLL, amp));
    if (isOpposite) this.position = this.amplitude;
  }

  advance(now: number): number {
    const frames = (now - this.frameAt) / FRAME_MS;
    this.frameAt = now;
    if (!this.moving) return 0;

    // The upstream 60 Hz recurrence, sampled at elapsed time without integer
    // truncation so high-refresh displays and subpixel trackpads stay smooth.
    const t = Math.pow(1 - DAMPING, frames);
    const nextAmp = this.amplitude * t;
    const nextPos = t * (this.position + frames * DAMPING * this.amplitude);
    if (Math.abs(nextPos) < Math.abs(this.position)) this.wheelScrollBack = true;
    this.amplitude = nextAmp;
    this.position = nextPos;

    if (this.wheelScrollBack && Math.abs(nextPos) <= REST) {
      this.amplitude = 0;
      this.position = 0;
      this.wheelScrollBack = false;
      this.lockWheel = true;
    }
    return this.position;
  }
}
