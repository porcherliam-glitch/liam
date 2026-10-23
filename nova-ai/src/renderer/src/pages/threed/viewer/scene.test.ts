// three.js scene helpers in Node (no WebGL): GLB parsing with the CSP-safe texture loader, framing and statistics.
import { describe, expect, it } from 'vitest';
import { Box3, Texture, TextureLoader, Vector3 } from 'three';
import type { GLTFLoaderPlugin, GLTFParser } from 'three/addons/loaders/GLTFLoader.js';
import { DEMO_CRATE_GLB_BASE64 } from '../../../lib/mock-threed-assets';
import { base64ToArrayBuffer } from '../threedUtils';
import { collectStats, computeFraming, ModelLoadError, parseGlb, readGlbJson } from './scene';

/** Node has no <img>: textures resolve to empty Texture objects (only the decoding is replaced). */
const stubTextures = (): GLTFLoaderPlugin => ({ name: 'TEST_stub_textures', loadTexture: () => Promise.resolve(new Texture()) });

/** Minimal GLB with the given JSON (no binary chunk). */
function glbWithJson(json: object): ArrayBuffer {
  let text = JSON.stringify(json);
  while (text.length % 4) text += ' ';
  const body = new TextEncoder().encode(text);
  const buf = new ArrayBuffer(20 + body.length);
  const view = new DataView(buf);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, buf.byteLength, true);
  view.setUint32(12, body.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buf, 20).set(body);
  return buf;
}

describe('parseGlb', () => {
  it('parses the demo crate and switches embedded textures to the <img> based TextureLoader (CSP)', async () => {
    let loaderSeen: unknown = null;
    const spy = (parser: GLTFParser): GLTFLoaderPlugin => {
      loaderSeen = parser.textureLoader;
      return stubTextures();
    };
    const gltf = await parseGlb(base64ToArrayBuffer(DEMO_CRATE_GLB_BASE64), [spy]);
    expect(loaderSeen).toBeInstanceOf(TextureLoader);
    const stats = collectStats(gltf.scene);
    expect(stats).toMatchObject({ meshes: 2, triangles: 60, vertices: 120, materials: 2, textures: 1 });
    expect(stats.size.x).toBeCloseTo(1.024, 3);
    expect(stats.size.y).toBeCloseTo(0.74, 3);
  });

  it('rejects files that are not GLB and compressed models with a German message', async () => {
    expect(() => readGlbJson(new TextEncoder().encode('{"asset":{"version":"2.0"}}   ').buffer)).toThrow('keine GLB-Datei');
    expect(() => readGlbJson(new ArrayBuffer(4))).toThrow(ModelLoadError);
    const draco = glbWithJson({ asset: { version: '2.0' }, extensionsUsed: ['KHR_draco_mesh_compression'], extensionsRequired: ['KHR_draco_mesh_compression'] });
    await expect(async () => parseGlb(draco)).rejects.toThrow('mit Draco komprimiert');
  });

  it('turns loader failures into a German error with technical details', async () => {
    const broken = glbWithJson({ asset: { version: '1.0' } });
    const err = await parseGlb(broken).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ModelLoadError);
    expect((err as ModelLoadError).message).toBe('Die 3D-Datei konnte nicht gelesen werden.');
    expect((err as ModelLoadError).details).toBeTruthy();
  });
});

describe('computeFraming', () => {
  it('fits the bounding sphere for the narrower field of view', () => {
    const box = new Box3(new Vector3(-1, 0, -1), new Vector3(1, 2, 1));
    const wide = computeFraming(box, 40, 2);
    const narrow = computeFraming(box, 40, 0.5);
    expect(wide.center.toArray()).toEqual([0, 1, 0]);
    expect(wide.radius).toBeCloseTo(Math.sqrt(3), 5);
    // Portrait views are limited by the horizontal angle → the camera has to move further away.
    expect(narrow.distance).toBeGreaterThan(wide.distance);
    expect(wide.distance).toBeCloseTo((Math.sqrt(3) / Math.sin((40 * Math.PI) / 360)) * 1.1, 5);
    expect(wide.near).toBeLessThan(wide.distance - wide.radius);
    expect(wide.far).toBeGreaterThan(wide.distance * 6 + wide.radius);
  });
});
