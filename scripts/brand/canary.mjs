import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { GLYPH_UNSEEN_OPACITY, MENU_BAR_GLYPH_ZOOM, appIconSvg, glyphBreathOpacity, glyphSvg } from './geometry.mjs';
import { encodeIco, svgToPng } from './raster.mjs';
import { TRAY_BREATH_FRAMES } from '../../packages/electron/tray-animation.mjs';

const MENU_BAR_BIRDS = {
  36: [
    '..KKK...........',
    'KKK.KK..........',
    '.KKKKKK.........',
    '..KKKKK.........',
    '..KKKK..........',
    '.KKKK.KK........',
    '.KKK.KKK........',
    '.KK.KKKKK.......',
    '.KK.KKKKKK......',
    '.KK..KKKKKK.....',
    '..KK..KKKKK.....',
    '..KKK..KKKKK....',
    '...KKKK..KKK....',
    '....KKKKK..KK...',
    '......KKKKK.....',
    '.......KKKKKK...',
    '......K.K...KK..',
    '.....K.K....KK..',
    '...KKKKK.....KK.',
    '.............KK.',
    '..............KK',
  ],
  18: [
    '.KK.....',
    'K.KK....',
    '.KK.....',
    'KK.K....',
    'K.KKK...',
    '.K.KKK..',
    '..KKKK..',
    '...KKK..',
    '..K.K.K.',
    '.KKKK.K.',
    '.......K',
  ],
};

const menuBarBird = (size) => {
  const rows = MENU_BAR_BIRDS[size];
  const width = rows[0].length;
  const data = Buffer.alloc(width * rows.length * 4);
  rows.forEach((row, y) => [...row].forEach((cell, x) => { if (cell === 'K') data[(y * width + x) * 4 + 3] = 255; }));
  return sharp(data, { raw: { width, height: rows.length, channels: 4 } }).png().toBuffer();
};

/**
 * A menu bar template: the glyph at `size` with the bird standing over its
 * lower right corner. The picture grows to the right to make room. Black on
 * the translucent rear panel overlaps the bird, so a clear gap separates
 * their silhouettes by `BIRD_GAP` of `size`.
 */
const BIRD_GAP = 0.05;
const menuBarTemplate = async (glyphOptions, size) => {
  const glyph = await svgToPng(glyphSvg({ color: '#000000', zoom: MENU_BAR_GLYPH_ZOOM, ...glyphOptions }), size);
  const bird = await menuBarBird(size);
  const { width: birdWidth, height: birdHeight } = await sharp(bird).metadata();
  const width = size + Math.round(birdWidth * 0.35);
  const left = width - birdWidth;
  const top = size - birdHeight;
  const birdAlpha = await sharp({ create: { width, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: bird, left, top }])
    .extractChannel(3)
    .raw()
    .toBuffer();
  const grown = await sharp(birdAlpha, { raw: { width, height: size, channels: 1 } })
    .blur(Math.max(0.3, size * BIRD_GAP))
    .extractChannel(0)
    .raw()
    .toBuffer();
  const gap = Buffer.alloc(width * size * 4);
  for (let i = 0; i < grown.length; i += 1) gap[i * 4 + 3] = Math.max(0, Math.min(255, (grown[i] - 24) * 16));
  return sharp({ create: { width, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: glyph, left: 0, top: 0 },
      { input: gap, raw: { width, height: size, channels: 4 }, blend: 'dest-out' },
      { input: bird, left, top },
    ])
    .png()
    .toBuffer();
};


export const canaryImageOutputs = async ({ iconsDir, releaseIconsDir }) => {
  const images = new Map();
  const icon = await sharp(await svgToPng(appIconSvg(), 1024)).composite([{ input: readFileSync(join(iconsDir, 'AppIcon.icon/Assets/canary-glyph.png')) }]).png().toBuffer();
  const resized = (size) => sharp(icon).resize(size, size).png().toBuffer();
  images.set(join(iconsDir, 'icon.png'), icon);
  images.set(join(iconsDir, 'app-icon.png'), await resized(512));
  images.set(join(iconsDir, 'icon.ico'), encodeIco(await Promise.all([16, 20, 24, 32, 40, 48, 64, 128, 256].map(async (size) => ({ size, png: await resized(size) })))));
  const states = [
    ['idle', {}],
    ['unseen', { rearOpacity: GLYPH_UNSEEN_OPACITY }],
    ...TRAY_BREATH_FRAMES.map((frame) => [`breath-${String(frame).padStart(2, '0')}`, glyphBreathOpacity(frame)]),
  ];
  for (const [name, options] of states) for (const size of [18, 36]) {
    images.set(join(iconsDir, 'tray', `trayTemplate-${name}${size === 36 ? '@2x' : ''}.png`), await menuBarTemplate(options, size));
  }
  const statusDir = join(releaseIconsDir, 'tray', 'status');
  for (const name of readdirSync(statusDir)) images.set(join(iconsDir, 'tray', 'status', name), readFileSync(join(statusDir, name)));
  return images;
};
