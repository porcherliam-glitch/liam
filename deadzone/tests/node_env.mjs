// Loads the game sources into a Node `vm` context with minimal browser stubs so pure logic
// (RNG, Inventory, Loot, Economy, WorldGenerator, SaveSystem.validate, ...) can be unit-tested
// without a browser. 25_main.js (boot) is skipped.
//
//   import { loadGameEnv } from './node_env.mjs';
//   const env = loadGameEnv();            // { ctx, get(name), run(code) }
//   const RNG = env.get('RNG');
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(here, '..', 'src');

function makeStubElement(tag = 'div') {
  const el = {
    tagName: String(tag).toUpperCase(), children: [], childNodes: [], style: {}, dataset: {}, attributes: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    innerHTML: '', textContent: '', hidden: false, width: 300, height: 150, id: '', className: '',
    appendChild(c) { this.children.push(c); return c; }, append() {}, prepend() {}, removeChild() {}, remove() {},
    insertBefore(c) { this.children.push(c); return c; }, replaceChildren() { this.children = []; },
    setAttribute(k, v) { this.attributes[k] = v; }, getAttribute(k) { return this.attributes[k] ?? null; }, removeAttribute() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; },
    getContext() { return makeStubContext2d(); }, getBoundingClientRect() { return { left: 0, top: 0, width: 300, height: 150, right: 300, bottom: 150 }; },
    focus() {}, blur() {}, click() {}, scrollIntoView() {}, toDataURL() { return ''; }, contains() { return false; },
    get firstChild() { return this.children[0] || null; }, get lastChild() { return this.children[this.children.length - 1] || null; },
    get parentElement() { return null; }, get parentNode() { return null; }, offsetWidth: 300, offsetHeight: 150, clientWidth: 300, clientHeight: 150,
    value: '', checked: false, disabled: false, title: '',
  };
  return el;
}

function makeStubContext2d() {
  const noop = () => {};
  const ctx = {
    canvas: null, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, globalCompositeOperation: 'source-over',
    font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic', shadowBlur: 0, shadowColor: '#000', lineCap: 'butt', lineJoin: 'miter', imageSmoothingEnabled: true,
    save: noop, restore: noop, translate: noop, rotate: noop, scale: noop, setTransform: noop, resetTransform: noop, transform: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop, arcTo: noop, ellipse: noop, rect: noop, roundRect: noop,
    quadraticCurveTo: noop, bezierCurveTo: noop, fill: noop, stroke: noop, clip: noop, fillRect: noop, strokeRect: noop, clearRect: noop,
    fillText: noop, strokeText: noop, drawImage: noop, setLineDash: noop, getLineDash() { return []; },
    measureText(t) { return { width: String(t).length * 6 }; },
    createLinearGradient() { return { addColorStop: noop }; }, createRadialGradient() { return { addColorStop: noop }; },
    createPattern() { return {}; }, getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
    putImageData: noop, createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
    isPointInPath() { return false; },
  };
  return ctx;
}

export function loadGameEnv(opts = {}) {
  const storage = new Map();
  const localStorage = {
    getItem: k => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => { storage.set(k, String(v)); },
    removeItem: k => { storage.delete(k); },
    clear: () => storage.clear(),
    key: i => Array.from(storage.keys())[i] ?? null,
    get length() { return storage.size; },
  };
  const document = {
    body: makeStubElement('body'), documentElement: makeStubElement('html'), head: makeStubElement('head'),
    createElement: tag => makeStubElement(tag), createTextNode: t => ({ textContent: t }), createDocumentFragment: () => makeStubElement('fragment'),
    getElementById: () => makeStubElement('div'), querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {}, hidden: false, visibilityState: 'visible', activeElement: null,
    exitPointerLock() {}, fonts: { ready: Promise.resolve() }, title: '',
  };
  const window = {
    document, localStorage, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    requestAnimationFrame: () => 0, cancelAnimationFrame() {}, setTimeout, clearTimeout, setInterval, clearInterval,
    performance: { now: () => Number(process.hrtime.bigint() / 1000000n) },
    navigator: { userAgent: 'node', maxTouchPoints: 0, language: 'de-DE', clipboard: { writeText: async () => {} } },
    AudioContext: undefined, webkitAudioContext: undefined, location: { href: 'file:///index.html', reload() {} },
    console, Math, JSON, Date, Number, String, Object, Array, Promise, Map, Set, Error, Uint8Array, Uint8ClampedArray,
    Float32Array, Int32Array, Uint16Array, Uint32Array, Int16Array, Int8Array, Float64Array, isNaN, isFinite, parseInt, parseFloat,
    encodeURIComponent, decodeURIComponent, btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary'),
    structuredClone: v => JSON.parse(JSON.stringify(v)), TextEncoder, TextDecoder, Blob: class {}, URL: { createObjectURL() { return ''; }, revokeObjectURL() {} },
    ontouchstart: undefined, screen: { width: 1280, height: 720, orientation: { type: 'landscape-primary' } },
    getComputedStyle: () => ({ getPropertyValue: () => '' }), scrollTo() {}, focus() {}, alert() {}, confirm() { return true; }, prompt() { return null; },
    CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } }, Event: class { constructor(t) { this.type = t; } },
    KeyboardEvent: class {}, MouseEvent: class {}, PointerEvent: class {}, TouchEvent: class {}, HTMLElement: class {}, HTMLCanvasElement: class {},
    OffscreenCanvas: undefined, ResizeObserver: class { observe() {} disconnect() {} unobserve() {} },
  };
  window.window = window; window.self = window; window.globalThis = window;
  document.defaultView = window;
  const ctx = vm.createContext(window);

  const files = fs.readdirSync(srcDir).filter(f => /^\d{2}_.*\.js$/.test(f) && f !== '25_main.js').sort((a, b) => a.localeCompare(b, 'en'));
  const skip = new Set(opts.skip || []);
  for (const f of files) {
    if (skip.has(f)) continue;
    const code = fs.readFileSync(path.join(srcDir, f), 'utf8');
    try {
      vm.runInContext(code, ctx, { filename: f });
    } catch (e) {
      e.message = `${f}: ${e.message}`;
      throw e;
    }
  }
  return {
    ctx,
    files,
    // Returns a top-level binding (class/const/function) by name.
    get(name) { return vm.runInContext(name, ctx); },
    run(code) { return vm.runInContext(code, ctx); },
    window,
  };
}
