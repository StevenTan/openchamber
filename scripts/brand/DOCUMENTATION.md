# Brand assets

## Ownership

`scripts/brand/source.svg` owns the OpenChamber artwork: a blue front panel, a pale rear panel, and a light rounded tile. `geometry.mjs` derives the tiled app icon, transparent colour mark, and monochrome glyph from this source. `raster.mjs` handles rasterization, compositing, and ICO encoding; `generate.mjs` writes assets to their runtime locations.

Run `bun run brand:generate` after changing the artwork. `bun run brand:generate --check` verifies generated text assets. Canary shares the artwork and adds its retained bird layer in `packages/electron/resources/icons-canary/AppIcon.icon/Assets/canary-glyph.png`; `canary.mjs` also owns its small menu bar bird.

| Drawing | Consumers |
|---|---|
| Tiled app icon | macOS, Windows, Linux, mobile launchers, PWA, touch icons, VS Code Marketplace |
| Transparent colour mark | React UI, startup HTML, web favicon, documentation badges, iOS widgets |
| Monochrome glyph | macOS menu bar, VS Code activity and title bars, model picker sprite, Android notification and themed launcher, iOS Control Center |

The Electron tray owns frame timing. Its `tray-animation.mjs` frame sequence is shared by the native asset loader and both brand generators. `OpenChamberLogo.tsx` owns React loading opacity and uses the shared duration ticker; the VS Code startup page owns its panel animation.

## Invariants

- Shape and colour changes start in `source.svg`. Its panel paths use absolute `M`, `L`, and `C` coordinates; the glyph and SF Symbol transforms depend on alternating x/y coordinate pairs.
- The source's `app-mark` transform controls the panel size inside the tile and is shared by portable app icons and native panel layers. Transparent marks and monochrome glyphs use the panel paths directly.
- Generated assets are never edited individually. The release and Canary Icon Composer documents and their panel PNGs are generated together. The Canary bird and `symbol-template.svg` are source assets.
- The four HTML startup surfaces carry the colour mark between `brand:flat-logo` markers. The generator changes only those regions. React embeds a generated SVG image so repeated logos have isolated gradient IDs.
- Colour marks retain their blue gradients in every UI theme. Monochrome SVG glyphs inherit `currentColor` where their consumer supplies it; native template images encode panel contrast in alpha.
- iOS widgets use the generated `BrandLogo` image asset. The app uses the desktop Icon Composer document, and Control Center uses the generated symbol in the widget asset catalog.
- On macOS, generation requires full Xcode with Icon Composer. `actool` compiles both native `Assets.car` and `icon.icns`; the renderer inside Icon Composer exports the development Dock icon. Other platforms generate portable assets without compiling native macOS resources.
- Text consistency and ICO directory structure are tested. Raster bytes depend on the installed SVG renderer and are verified through consumer builds and visual inspection.

## Decisions

### Why derive variants from one SVG

The app icon, colour mark, and monochrome glyph need different backgrounds and colour handling, but share one silhouette. Extracting their paths from the source keeps small native assets and larger UI artwork consistent.

### Why use separate native panel layers

Icon Composer needs separate artwork and background layers to render system appearances. Its layer list runs from front to back. Native icon documents preserve the panel positions and use the source tile gradient as their background fill.

### Why render the development Dock icon with Icon Composer

The development icon uses the same native rendering as the release app, with a construction ribbon composited over it. The renderer is selected from the active Xcode installation's Icon Composer bundle; the developer tool named `ictool` serves the asset compiler interface.

### Why keep the SF Symbol template

Control Center requires symbol metadata, guides, and weight groups. The template retains that format while generation supplies the same panel paths used by other monochrome consumers.
