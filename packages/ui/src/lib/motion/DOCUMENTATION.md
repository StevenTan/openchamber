# Motion

This module owns shared timing, row disclosure keyframes and layout morphs.
Feature code owns which state change counts as an explicit disclosure.

`activityDisclosure.ts` captures the transcript's virtual rows for a 200 ms
View Transition on explicit Activity clicks. The actual row projection and
scroll measurements settle once; the compositor moves and fades snapshots.
Streaming updates and programmatic navigation do not start these transitions.
Replacing a transition skips its animation, while every state update still
runs. Reduced motion and browsers without transition types or automatic names
apply the state immediately. No hidden live tool views are retained.

### Why snapshots instead of animating transcript row heights

Activity steps are separate virtual rows. Animating their live height on every
frame would repeatedly change list measurements and scroll anchoring. Snapshots
retain the outgoing picture without mounting a second transcript or keeping
closed tools active. `styles/disclosure-motion.css` names turn rows and the
answer siblings after folded work. When thinking and the answer share one
message, that row's top stays put; capturing the answer separately makes its
position glide instead of crossfading its two positions inside the row.
The root does not crossfade and the overlay does not capture pointer input.

Snapshots belong only to the clicked transcript viewport. The transition overlay
is clipped to that viewport and the composer's top edge: top-layer snapshots
do not inherit the live rows' overflow clipping. Other chat columns do not
participate. The viewport marker and clip are released when the transition
finishes or is replaced.

`elasticScroll.ts` owns desktop wheel boundary feedback. `RuntimeAPIProvider`
binds it once per UI document, after the host's capabilities are available.
Native readiness is checked before binding; a failed native initialization is
logged by the host and retains the wheel-only driver. Closing the provider
during that check cannot install a late listener.
Normal scrolling uses native scroll offsets and events,
with vertical wheel travel scaled by 0.8 (drag and inertial input alike). Only
outward input at a vertical edge pulls the scrollport.
Content that fits its scrollport can pull at either edge too. Wheel routing
prefers the nearest ancestor with vertical travel; when none has travel, it
pulls the outer scrollport so a short horizontal code/table scroller does not
capture the document's vertical gesture.
On a trusted macOS Electron page, `nativeScroll` supplies AppKit contact and
momentum phases. `NativeOverscrollAxis` holds the resisted displacement while
contact is active and samples Motion's spring only after release or cancellation.
Momentum cannot extend that pull. Reversing first consumes the displacement
before normal content scrolling resumes.
Other hosts retain the vendored smooth-scrollbar overscroll state machine
(`vendor/smooth-scrollbar/DOCUMENTATION.md`), including its wheel-tail lock.
The frame scheduler stops once the displacement returns to zero.
Switching targets discards a native held axis so it cannot revive on a later pull.
Horizontal and zoom gestures and reduced motion skip the effect.
Ghostty supplies a cancelable pixel wheel event for ordinary terminal scrollback;
the binding consumes boundary input and held-pull reversal before row quantization.
Application
mouse reporting and alternate-screen wheel input stay with the terminal.

### Why the scrollport moves instead of its content

Moving children changes native overflow measurements and interferes with virtual
list ranges. An additive transform on the scrollport preserves those measurements;
an inset clip follows the current displacement to hold its drawing inside the
original viewport. While pulled, input in the exposed gap remains with that
scrollport, including its first reversed wheel event. Scroll, pointer/key input,
window blur/resize, visibility or motion-preference changes and unmount release
the effect and its wheel lock.
