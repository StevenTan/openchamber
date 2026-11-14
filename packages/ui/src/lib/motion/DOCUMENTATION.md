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
closed tools active. `styles/disclosure-motion.css` names only turn rows; the
root does not crossfade and the overlay does not capture pointer input.

Snapshots belong only to the clicked transcript viewport. The transition overlay
is clipped to that viewport and the composer's top edge: top-layer snapshots
do not inherit the live rows' overflow clipping. Other chat columns do not
participate. The viewport marker and clip are released when the transition
finishes or is replaced.
