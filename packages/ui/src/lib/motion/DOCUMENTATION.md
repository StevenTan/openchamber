# Motion

## Ownership

This module owns shared disclosure transitions and the tab presence spring.
Feature code owns state changes; virtualizers own row layout and measurements.

## Invariants

- Activity disclosures use an element-scoped transition on the clicked chat
  viewport. Its overflow clips row snapshots; sibling fades, the composer and
  navigation controls retain their normal layers. State updates settle once;
  snapshots retain closing content without keeping hidden tools mounted.
  Each viewport owns its transition, including replacement on repeated toggles.
- Detached snapshot elements remain as empty, unnamed, inert, zero-size shells
  until both the update callback and snapshot preparation settle. Tool contents
  and navigation markers are discarded before reattachment; the shells do not
  extend the scroll range.
- Reduced motion applies disclosure state immediately.
  Unmount and interrupted transitions release their listeners and effects.
- Native `details` content uses a 200 ms intrinsic block-size and opacity
  transition through `::details-content`. Discrete content visibility keeps
  closing content painted until the transition ends. Initial open state and
  content growth use their natural size. Engines without these CSS features
  retain native disclosure behavior.
- Tab reveals use layout coordinates from the scroll track, so presence and
  drag transforms do not change the destination. Presence springs belong to
  `TabMotion`; state and scroll ownership stay with the tab strips.
- Tab scroll ranges and edge fades follow present slots. Retained exiting
  slots do not extend the range used by automatic tab reveal.

## Decisions

### Why activity disclosures use snapshots

Activity disclosure rows settle immediately to preserve measurement and scroll
anchoring while tool content unmounts. Snapshots animate the outgoing picture
without retaining live tools. Native details and shared Collapsible panels use
live size transitions that their containing rows measure. Element scoping keeps
snapshots inside the transcript's stacking context and overflow clip. Runtimes
without element-scoped transitions apply the disclosure state immediately.

### Why outgoing snapshot identities survive preparation

Chromium can abort an element-scoped transition during prepaint if the update
detaches a named descendant ([Chromium 576097103](https://issues.chromium.org/issues/576097103)).
Empty shells preserve the captured element identities through preparation without
keeping tool frames, scroll targets or content live. Retention is needed while
the supported runtime floor includes engines with this prepaint defect.
