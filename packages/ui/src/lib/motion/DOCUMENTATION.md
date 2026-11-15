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

## Decisions

### Why snapshots instead of live row-height animation

Virtual row heights must settle immediately to preserve measurement and scroll
anchoring. Snapshots animate the outgoing picture without retaining live tools.
