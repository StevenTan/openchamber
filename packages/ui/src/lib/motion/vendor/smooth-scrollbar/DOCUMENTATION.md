# Smooth Scrollbar overscroll dynamics

## Ownership

`overscroll.ts` adapts the vertical wheel state machine from smooth-scrollbar
8.8.4, `src/plugins/overscroll/index.ts`. The MIT license is preserved beside it.
Upstream: https://github.com/dolphin-wood/smooth-scrollbar/blob/66c67b85d35c14486bd25a73806c0ab13ffeb267/src/plugins/overscroll/index.ts

The adapter in `../../elasticScroll.ts` owns native scrollports and terminal
input. This module owns amplitude, displayed displacement, return and wheel lock.

## Invariants

- Once displacement starts returning, same-direction wheel input cannot keep
  increasing its amplitude. The inertial tail cannot restart a finished bounce.
- The completed return locks outward input until a 30 ms input gap.
- Rest has no scheduled work; the host calls `advance` while `moving`.

## Decisions

### Why retain native scrolling

OpenChamber's virtual lists depend on native scroll offsets and events. The
upstream scrollbar's transform renderer is replaced by our clipped visual
feedback, while the overscroll state machine stays independent of the DOM.

### Why elapsed time and fractional pixels

Upstream advances once per render and truncates amplitude to integer pixels.
Elapsed-time damping preserves comparable motion on 60/120 Hz displays, and
fractional displacement accepts terminal trackpad input before row quantization.
The fractional recurrence is the closed form of the upstream 60 Hz matrix,
so a half frame does not add an extra rounding or damping step.

`WHEEL_MULTIPLIER` is the local 0.8 input gain for native vertical wheel scrolling,
including its inertial tail. It also affects finger-drag distance; it does not
claim to identify momentum-only events. Terminal application input is unscaled.
