import { GUEST_SCROLLBAR_CSS } from '@openchamber/sdk';
import { GUEST_UI_LOOK_CSS } from '@openchamber/sdk/ui';

// external: #4017 Declare the inherited color scheme before first paint to prevent a white iframe canvas.
const GUEST_COLOR_SCHEME_META = '<meta name="color-scheme" content="light dark">';
const LEADING_DOCTYPE = /^\s*<!doctype[^>]*>/i;

const declareColorScheme = (html) => {
  const doctype = LEADING_DOCTYPE.exec(html)?.[0] ?? '';
  return `${doctype}${GUEST_COLOR_SCHEME_META}${html.slice(doctype.length)}`;
};

/** Append instead of matching tags inside untrusted comments, scripts, or templates (the one
 * exception is the color-scheme meta, placed after a leading doctype; see above).
 * Browsers accept the style after the document; its doctype and authored CSP stay intact.
 * The UI kit's look (colours, radii, states) comes from this app's SDK: appended after the document, it follows the
 * kit's own style element in the head and wins over the copy an installed bundle was built with. Sizes stay the bundle's.
 */
export const injectGuestDocumentStyles = (html) => `${declareColorScheme(html)}\n<style data-openchamber-guest-styles>${GUEST_SCROLLBAR_CSS}${GUEST_UI_LOOK_CSS}</style>`;
