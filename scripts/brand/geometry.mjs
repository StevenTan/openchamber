import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(new URL('./source.svg', import.meta.url), 'utf8').trim();
const DEFS = SOURCE.match(/<defs>([\s\S]*?)<\/defs>/)[1];
const MARK_DEFS = DEFS.replace(/<linearGradient id="tile"[\s\S]*?<\/linearGradient>\s*/, '');
const FRONT = SOURCE.match(/<path id="front-shape" d="([^"]+)"/)[1];
const REAR = SOURCE.match(/<path id="rear-shape" d="([^"]+)"/)[1];
const APP_MARK_TRANSFORM = SOURCE.match(/<g id="app-mark" transform="([^"]+)"/)[1];
const MARK_TRANSFORM = 'translate(-75.285714 -73.142857) scale(0.142857142857)';

export const LOGO_PANEL_REST = 0.72;
export const LOGO_PANEL_LIT = 1;

const svg = (size, viewBox, inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}">${inner}</svg>\n`;
const prefixIds = (markup, prefix) => markup
  .replace(/id="([^"]+)"/g, (_, id) => `id="${prefix}${id}"`)
  .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${prefix}${id})`)
  .replace(/href="#([^"]+)"/g, (_, id) => `href="#${prefix}${id}"`);

export const flatLogoInner = ({ idPrefix = 'oc-logo-' } = {}) => prefixIds(
  `<defs>${MARK_DEFS}</defs><g transform="${MARK_TRANSFORM}">`
  + `<g data-brand-panel="rear" data-rest="${LOGO_PANEL_REST}" data-lit="${LOGO_PANEL_LIT}"><use href="#rear-shape" fill="url(#rear)" fill-rule="evenodd"/></g>`
  + `<g data-brand-panel="front" data-rest="${LOGO_PANEL_REST}" data-lit="${LOGO_PANEL_LIT}"><use href="#front-shape" fill="url(#front)"/><use href="#front-shape" fill="url(#frontLift)"/></g></g>`, idPrefix,
);

export const flatLogoSvg = ({ size = 512 } = {}) => svg(size, '-50 -50 100 100', flatLogoInner());

export const devTapeSvg = ({ size = 1024 } = {}) => svg(size, '0 0 1024 1024',
  '<defs><pattern id="tape" width="48" height="48" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><rect width="24" height="48" fill="#d6a23c"/><rect x="24" width="24" height="48" fill="#1b1b1b"/></pattern></defs><path d="M80 660H944V820H80Z" fill="url(#tape)"/>',
);

export const appIconSvg = ({ size = 1024, tape = false } = {}) => {
  const content = SOURCE.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  const ribbon = tape ? devTapeSvg().replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '') : '';
  return svg(size, '0 0 1024 1024', content + ribbon);
};

// Source paths use absolute M/L/C coordinates in alternating x/y pairs.
const glyphPath = (path) => {
  let coordinate = 0;
  return path.replace(/-?\d+(?:\.\d+)?/g, (value) => {
    const centre = coordinate++ % 2 === 0 ? 527 : 512;
    return Number((16 + (Number(value) - centre) * 0.04).toFixed(4));
  });
};

export const GLYPH_PATHS = { rear: glyphPath(REAR), front: glyphPath(FRONT) };
export const MENU_BAR_GLYPH_ZOOM = 1.15;
export const GLYPH_UNSEEN_OPACITY = 1;

export const glyphInner = ({ color = 'currentColor', rearOpacity = 0.55 } = {}) => (
  `<path d="${GLYPH_PATHS.rear}" fill="${color}" fill-rule="evenodd" fill-opacity="${rearOpacity}"/>`
  + `<path d="${GLYPH_PATHS.front}" fill="${color}"/>`
);

export const glyphSvg = ({ size = 32, style = '', zoom = 1, ...options } = {}) => {
  const side = 32 / zoom;
  const start = (32 - side) / 2;
  return svg(size, `${start} ${start} ${side} ${side}`, style + glyphInner(options));
};

export const glyphBreathOpacity = (frame) => ({
  rearOpacity: Number((0.55 + 0.45 * (1 - Math.cos(Math.PI * frame / 15)) / 2).toFixed(3)),
});

export const appIconLayerSvgs = () => ({
  'rear.png': svg(1024, '0 0 1024 1024', `<defs>${MARK_DEFS}</defs><g transform="${APP_MARK_TRANSFORM}"><use href="#rear-shape" fill="url(#rear)" fill-rule="evenodd"/></g>`),
  'front.png': svg(1024, '0 0 1024 1024', `<defs>${MARK_DEFS}</defs><g transform="${APP_MARK_TRANSFORM}"><use href="#front-shape" fill="url(#front)"/><use href="#front-shape" fill="url(#frontLift)"/></g>`),
});

export const appIconDocument = ({ canary = false } = {}) => ({
  'fill-specializations': [{ value: {
    'linear-gradient': ['srgb:0.97647,0.98824,1.00000,1.00000', 'srgb:0.93333,0.95686,0.99216,1.00000'],
    orientation: { start: { x: 0, y: 0 }, stop: { x: 0.9, y: 1 } },
  } }],
  groups: [{
    layers: [...(canary ? ['canary-glyph'] : []), 'front', 'rear'].map((name) => ({
      'image-name': `${name}.png`, name,
      'glass-specializations': [{ value: false }],
      'position-specializations': [{ idiom: 'square', value: { scale: 1, 'translation-in-points': [0, 0] } }],
    })),
    shadow: { kind: 'neutral', opacity: 0 },
    translucency: { enabled: false, value: 0 },
  }],
  'supported-platforms': { circles: ['watchOS'], squares: 'shared' },
});
