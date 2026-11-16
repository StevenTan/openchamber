# Icon System

`Icon` renders interface glyphs from Lucide and product/brand marks through a
shared SVG sprite. Desktop, web, VS Code and mobile use the same sprite.
File-type icons have their own system in `components/icons/FileTypeIcon.tsx`.

## Usage

```tsx
import { Icon } from '@/components/icon/Icon';
import type { IconName } from '@/components/icon/icons';

const icon: IconName = 'search';
<Icon name={icon} className="size-4" />;
```

Size icons with classes; `Icon` has no `size` prop. Adjacent controls keep the
same icon box. Glyphs inherit `currentColor` from the control's theme tokens.
The owning button or label supplies the accessible name; decorative icons
default to `aria-hidden`.

## Names and generation

Application icon IDs are stable keys used by components, project settings and
provider descriptors. `scripts/icons/lucide.mjs` maps IDs whose names differ
from Lucide to the corresponding glyph. New icons can use Lucide's kebab-case
name directly.

1. Use `<Icon name="…" />` or a value typed as `IconName` in source.
2. Add a mapping in `scripts/icons/lucide.mjs` when the application ID differs.
3. Run `bun run icons:generate` and inspect the generated sprite.
4. Check the icon at its actual control size in light and dark themes.

Never edit `sprite.ts` manually or import individual icon components into
feature code. The generator reads the pinned `lucide-static` development
dependency; the application ships only the glyphs it uses, with no runtime
icon-library dependency or network lookup. Missing source assets fail generation.

Lucide glyphs retain their 24×24 coordinate system, 2-unit stroke, round caps
and joins, and explicit `fill="none"`. Filled status shapes are registered in
`filledIconNames`. Sprite groups carry their own drawing attributes so brand
marks and line icons can share one component without inheriting each other's
fill behavior.

## Product and brand marks

`preservedIconNames` identifies brand and PDF-format marks sourced from
Remixicon; custom product/provider marks are registered in
`scripts/generate-icon-sprite.mjs`. The applications in the Open In menu use
their official geometry from `scripts/icons/open-in-apps.mjs`.

These marks use a 24×24 viewbox and `currentColor`. Preserve their identity
instead of substituting a generic interface glyph. Lucide's license is
distributed at `packages/web/public/licenses/lucide.txt`.

## Runtime contract

- `sprite.ts` contains generated symbol contents; `icons.ts` derives `IconName`.
- `Icon.tsx` injects one hidden sprite and renders `<use href="#oc-ID"/>`.
- A newly requested symbol can join an injected sprite during development.
- `oc-icon` is the shared styling hook.
- `DIRECTIONAL_ICONS` identifies semantic arrows and panel sides that mirror
  in RTL. The `<use>` mirrors independently of the outer SVG's rotation.
