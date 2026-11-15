# Motion

## Ownership

This module owns shared disclosure transitions.
Feature code owns state changes; virtualizers own row layout and measurements.

## Invariants

- Activity disclosures capture only the clicked chat viewport, clipped above
  the composer. State updates settle once; snapshots retain closing content
  without keeping hidden tools mounted. Replacement and completion clean up
  the viewport marker and clip.
- Reduced motion applies disclosure state immediately.
  Unmount and interrupted transitions release their listeners and effects.
- Native `details` content uses a 200 ms intrinsic block-size and opacity
  transition through `::details-content`. Discrete content visibility keeps
  closing content painted until the transition ends. Initial open state and
  content growth use their natural size. Engines without these CSS features
  retain native disclosure behavior.

## Decisions

### Why activity disclosures use snapshots

Activity disclosure rows settle immediately to preserve measurement and scroll
anchoring while tool content unmounts. Snapshots animate the outgoing picture
without retaining live tools. Native details and shared Collapsible panels use
live size transitions that their containing rows measure.
