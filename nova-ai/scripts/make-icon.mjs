// Generates the NOVA AI application icon without any dependency (pure Node + node:zlib):
//   build/icon.png  – 512×512 RGBA PNG (electron-builder Linux icon, tray icon fallback)
//   build/icon.ico  – Windows icon container with PNG-embedded images 16, 32, 48 and 256 px
// Usage: node scripts/make-icon.mjs [--out <dir>]
//
// Key decisions:
// - The artwork is described as a vector function (violet→blue gradient rounded square with a white "N" built from
//   two bars and a diagonal) and rasterised separately for every size with 4×4 supersampling, so small sizes stay
//   crisp instead of being blurry downscales of the 512 px image.
// - PNG: own encoder (IHDR/IDAT/IEND, CRC-32, zlib deflate, per-row "Sub"/"None" filter choice).
// - ICO: header written by hand (ICONDIR + ICONDIRENTRY[]), images stored as PNG (supported since Windows Vista);
//   a width/height byte of 0 means 256 px.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outDir = args.includes('--out') ? resolve(args[args.indexOf('--out') + 1]) : join(root, 'build');

const VIOLET = [0x8b, 0x5c, 0xf6];
const BLUE = [0x3b, 0x82, 0xf6];

// --- vector artwork (normalised coordinates 0..1) ---------------------------------------------------------------

const MARGIN = 0.035;
const RADIUS = 0.21;

/** Inside test of the rounded square. */
function inRoundedSquare(x, y) {
  const lo = MARGIN;
  const hi = 1 - MARGIN;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + RADIUS), hi - RADIUS);
  const cy = Math.min(Math.max(y, lo + RADIUS), hi - RADIUS);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= RADIUS * RADIUS;
}

// The "N": left bar, right bar and a diagonal parallelogram from the top of the left bar to the bottom of the right.
const N_TOP = 0.255;
const N_BOTTOM = 0.745;
const BAR_W = 0.115;
const LEFT_X = 0.285;
const RIGHT_X = 1 - 0.285 - BAR_W;
const DIAG_W = 0.15;

function inLetterN(x, y) {
  if (y < N_TOP || y > N_BOTTOM) return false;
  if (x >= LEFT_X && x <= LEFT_X + BAR_W) return true;
  if (x >= RIGHT_X && x <= RIGHT_X + BAR_W) return true;
  const t = (y - N_TOP) / (N_BOTTOM - N_TOP);
  const start = LEFT_X + t * (RIGHT_X + BAR_W - DIAG_W - LEFT_X);
  return x >= start && x <= start + DIAG_W;
}

function gradientAt(x, y) {
  const t = Math.min(1, Math.max(0, (x + y) / 2));
  // Soft light from the top-left corner (adds depth without decoration).
  const light = Math.max(0, 1 - Math.hypot(x - 0.2, y - 0.15) / 0.9) * 0.12;
  return VIOLET.map((v, i) => {
    const c = v + (BLUE[i] - v) * t;
    return Math.min(255, c + (255 - c) * light);
  });
}

/** Rasterises the icon at `size`×`size` pixels → RGBA buffer (straight alpha). */
export function renderIcon(size) {
  const SS = 4; // supersampling grid per axis
  const out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let shape = 0;
      let letter = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          if (inRoundedSquare(x, y)) {
            shape++;
            if (inLetterN(x, y)) letter++;
          }
        }
      }
      const i = (py * size + px) * 4;
      if (shape === 0) continue; // fully transparent
      const cx = (px + 0.5) / size;
      const cy = (py + 0.5) / size;
      const base = gradientAt(cx, cy);
      const w = letter / shape; // share of the covered area that is white
      out[i] = Math.round(base[0] * (1 - w) + 255 * w);
      out[i + 1] = Math.round(base[1] * (1 - w) + 255 * w);
      out[i + 2] = Math.round(base[2] * (1 - w) + 255 * w);
      out[i + 3] = Math.round((shape / (SS * SS)) * 255);
    }
  }
  return out;
}

// --- PNG encoder ------------------------------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

/** Encodes an RGBA buffer as PNG (8 bit, colour type 6). */
export function encodePng(rgba, width, height) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = rgba.subarray(y * stride, (y + 1) * stride);
    // Choose between filter 0 (None) and 1 (Sub) by the smaller sum of absolute values (standard heuristic).
    const sub = Buffer.alloc(stride);
    let sumNone = 0;
    let sumSub = 0;
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? row[x - 4] : 0;
      sub[x] = (row[x] - left) & 0xff;
      sumNone += row[x] < 128 ? row[x] : 256 - row[x];
      sumSub += sub[x] < 128 ? sub[x] : 256 - sub[x];
    }
    const off = y * (stride + 1);
    if (sumSub < sumNone) {
      raw[off] = 1;
      sub.copy(raw, off + 1);
    } else {
      raw[off] = 0;
      row.copy(raw, off + 1);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- ICO container ----------------------------------------------------------------------------------------------

/** Builds an ICO file from PNG images: [{ size, png }]. */
export function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  for (const { size, png } of images) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size; // width (0 = 256)
    e[1] = size >= 256 ? 0 : size; // height
    e[2] = 0; // palette colours
    e[3] = 0; // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8); // image size
    e.writeUInt32LE(offset, 12); // image offset
    entries.push(e);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

// --- main -------------------------------------------------------------------------------------------------------

function main() {
  mkdirSync(outDir, { recursive: true });
  const png512 = encodePng(renderIcon(512), 512, 512);
  writeFileSync(join(outDir, 'icon.png'), png512);
  const icoImages = [16, 32, 48, 256].map((size) => ({ size, png: encodePng(renderIcon(size), size, size) }));
  writeFileSync(join(outDir, 'icon.ico'), encodeIco(icoImages));
  console.log(`[make-icon] ${join(outDir, 'icon.png')} (${png512.length} Bytes)`);
  console.log(`[make-icon] ${join(outDir, 'icon.ico')} (${icoImages.map((i) => i.size).join('/')} px)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
