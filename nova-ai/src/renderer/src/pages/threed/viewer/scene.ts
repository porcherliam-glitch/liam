// three.js part of the 3D preview. Loaded lazily (dynamic import) so three.js is only downloaded when a result is
// shown and stays out of the jsdom test path. Everything GPU related is created in createModelViewer() and released
// again by controller.dispose().
//
// CSP note: GLTFLoader turns textures embedded in a GLB into blob: URLs. Its default ImageBitmapLoader fetch()es them,
// which `connect-src 'self'` blocks. The plugin below switches to TextureLoader (an <img> element), which the existing
// `img-src 'self' data: blob:` allows – so no CSP change is needed.
import {
  Box3,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  MathUtils,
  NeutralToneMapping,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Sphere,
  Spherical,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  WebGLRenderer,
  type Material,
  type Mesh,
  type Object3D,
  type Texture,
} from 'three';
import { GLTFLoader, type GLTF, type GLTFLoaderPlugin, type GLTFParser } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/** German, user-presentable error of the preview (technical details separately). */
export class ModelLoadError extends Error {
  readonly details: string | null;
  constructor(message: string, details: string | null = null) {
    super(message);
    this.name = 'ModelLoadError';
    this.details = details;
  }
}

export interface ModelStats {
  meshes: number;
  triangles: number;
  vertices: number;
  materials: number;
  textures: number;
  /** Bounding box size in model units (glTF: meters). */
  size: { x: number; y: number; z: number };
}

export interface Framing {
  center: Vector3;
  radius: number;
  /** Camera distance that fits the bounding sphere into the view. */
  distance: number;
  near: number;
  far: number;
}

export interface ModelViewerController {
  readonly stats: ModelStats;
  setWireframe(on: boolean): void;
  setAutoRotate(on: boolean): void;
  /** Back to the initial camera position (re-framed for the current size). */
  resetView(): void;
  /** Orbit by angles in radians (keyboard control). */
  rotate(deltaAzimuth: number, deltaPolar: number): void;
  /** factor < 1 moves closer, > 1 further away. */
  zoom(factor: number): void;
  dispose(): void;
}

export interface CreateViewerOptions {
  /** The GPU dropped the WebGL context (e.g. graphics memory full while ComfyUI is busy). */
  onContextLost?: () => void;
  /** Extra GLTFLoader plugins (tests). */
  plugins?: Array<(parser: GLTFParser) => GLTFLoaderPlugin>;
}

/** glTF extensions that need decoders this preview does not ship. */
const UNSUPPORTED_EXTENSIONS: Record<string, string> = {
  KHR_draco_mesh_compression: 'Draco',
  EXT_meshopt_compression: 'Meshopt',
  KHR_texture_basisu: 'Basis Universal',
};

const FOV = 40;
const GLB_MAGIC = 0x46546c67; // "glTF"
const JSON_CHUNK = 0x4e4f534a; // "JSON"

/** Reads the JSON chunk of a GLB (no parsing of buffers) – used to reject unsupported files with a clear message. */
export function readGlbJson(data: ArrayBuffer): { extensionsRequired?: string[]; extensionsUsed?: string[] } {
  if (data.byteLength < 20) throw new ModelLoadError('Die 3D-Datei ist leer oder beschädigt.', `${data.byteLength} Bytes`);
  const view = new DataView(data);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new ModelLoadError('Die Datei ist keine GLB-Datei (glTF binär).', 'GLB magic mismatch');
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== JSON_CHUNK || 20 + jsonLength > data.byteLength) throw new ModelLoadError('Die 3D-Datei ist beschädigt.', 'invalid JSON chunk');
  try {
    return JSON.parse(new TextDecoder().decode(new Uint8Array(data, 20, jsonLength))) as { extensionsRequired?: string[]; extensionsUsed?: string[] };
  } catch (e) {
    throw new ModelLoadError('Die 3D-Datei ist beschädigt.', e instanceof Error ? e.message : String(e));
  }
}

/** Forces <img>-based texture loading (CSP-safe for blob: URLs, see the file header). */
function cspSafeTextures(parser: GLTFParser): GLTFLoaderPlugin {
  const loader = new TextureLoader(parser.options.manager);
  loader.setCrossOrigin(parser.options.crossOrigin);
  parser.textureLoader = loader;
  return { name: 'NOVA_csp_safe_textures' };
}

/** Parses GLB bytes into a three.js scene graph (no GPU needed). */
export function parseGlb(data: ArrayBuffer, plugins: CreateViewerOptions['plugins'] = []): Promise<GLTF> {
  const json = readGlbJson(data);
  const blocked = (json.extensionsRequired ?? []).filter((e) => e in UNSUPPORTED_EXTENSIONS);
  if (blocked.length > 0) {
    throw new ModelLoadError(
      `Das Modell ist mit ${blocked.map((e) => UNSUPPORTED_EXTENSIONS[e]).join(', ')} komprimiert. Diese Vorschau kann es nicht anzeigen – die Datei selbst ist in Ordnung und lässt sich im Explorer öffnen.`,
      blocked.join(', '),
    );
  }
  const loader = new GLTFLoader();
  loader.register(cspSafeTextures);
  for (const p of plugins) loader.register(p);
  return new Promise((resolve, reject) => {
    loader.parse(data, '', resolve, (err: unknown) => {
      reject(new ModelLoadError('Die 3D-Datei konnte nicht gelesen werden.', err instanceof Error ? err.message : String(err)));
    });
  });
}

/** Camera distance/near/far that fit `box` into a view with the given vertical field of view and aspect ratio. */
export function computeFraming(box: Box3, fovDeg: number, aspect: number): Framing {
  const sphere = box.getBoundingSphere(new Sphere());
  const radius = Math.max(sphere.radius, 1e-3);
  const vFov = MathUtils.degToRad(fovDeg);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(aspect, 1e-3));
  const distance = (radius / Math.sin(Math.min(vFov, hFov) / 2)) * 1.1;
  return { center: sphere.center.clone(), radius, distance, near: radius / 100, far: distance * 20 };
}

function materialsOf(mesh: Mesh): Material[] {
  return Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
}

function texturesOf(material: Material): Texture[] {
  return Object.values(material).filter((v): v is Texture => !!v && typeof v === 'object' && (v as Texture).isTexture === true);
}

/** Counts for the text alternative ("245.312 Dreiecke, 2 Materialien …"). */
export function collectStats(root: Object3D): ModelStats {
  let meshes = 0;
  let triangles = 0;
  let vertices = 0;
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    meshes++;
    const pos = mesh.geometry.getAttribute('position');
    const count = pos?.count ?? 0;
    vertices += count;
    triangles += mesh.geometry.index ? mesh.geometry.index.count / 3 : count / 3;
    for (const m of materialsOf(mesh)) {
      materials.add(m);
      for (const t of texturesOf(m)) textures.add(t);
    }
  });
  const size = new Box3().setFromObject(root).getSize(new Vector3());
  return { meshes, triangles: Math.round(triangles), vertices, materials: materials.size, textures: textures.size, size: { x: size.x, y: size.y, z: size.z } };
}

/** Releases geometries, materials and textures of a scene graph. */
export function disposeObject(root: Object3D): void {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    for (const m of materialsOf(mesh)) {
      for (const t of texturesOf(m)) t.dispose();
      m.dispose();
    }
  });
}

/**
 * Creates the interactive preview inside `host` (canvas fills the host): PBR lighting with a procedural room
 * environment, auto-framing, orbit controls (drag = rotate, right drag = pan, wheel = zoom) and a floor grid.
 */
export async function createModelViewer(host: HTMLElement, data: ArrayBuffer, options: CreateViewerOptions = {}): Promise<ModelViewerController> {
  const gltf = await parseGlb(data, options.plugins);
  const model = gltf.scene;
  const box = new Box3().setFromObject(model);
  if (box.isEmpty()) {
    disposeObject(model);
    throw new ModelLoadError('Die 3D-Datei enthält kein sichtbares Modell.');
  }
  const stats = collectStats(model);

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    disposeObject(model);
    throw new ModelLoadError('WebGL konnte nicht gestartet werden. Die 3D-Vorschau ist auf diesem PC gerade nicht möglich.', e instanceof Error ? e.message : String(e));
  }
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  const canvas = renderer.domElement;
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.setAttribute('aria-hidden', 'true'); // the host element carries the accessible name and description
  host.appendChild(canvas);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envTexture = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  scene.environment = envTexture;
  scene.add(new HemisphereLight(0xffffff, 0x3a3f55, 0.45));
  const keyLight = new DirectionalLight(0xffffff, 1.3);
  scene.add(keyLight);

  const width = Math.max(1, host.clientWidth);
  const height = Math.max(1, host.clientHeight);
  const camera = new PerspectiveCamera(FOV, width / height, 0.01, 1000);
  let framing = computeFraming(box, FOV, width / height);
  model.position.sub(framing.center);
  scene.add(model);
  keyLight.position.set(1, 2, 1.4).multiplyScalar(framing.radius * 3);

  const grid = new GridHelper(Math.max(framing.radius * 4, 0.01), 16, 0x55597a, 0x2b2f42);
  grid.position.y = box.min.y - framing.center.y;
  const gridMaterial = grid.material as Material;
  gridMaterial.transparent = true;
  gridMaterial.opacity = 0.55;
  scene.add(grid);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotateSpeed = 1.5;

  const HOME_DIRECTION = new Vector3(0.9, 0.55, 1.3).normalize();
  const applyFraming = () => {
    framing = computeFraming(box, FOV, camera.aspect);
    camera.near = framing.near;
    camera.far = framing.far;
    camera.position.copy(HOME_DIRECTION).multiplyScalar(framing.distance);
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    controls.minDistance = framing.radius * 0.3;
    controls.maxDistance = framing.distance * 6;
    controls.update();
  };
  applyFraming();

  let needsRender = true;
  let raf = 0;
  let disposed = false;
  controls.addEventListener('change', () => {
    needsRender = true;
  });
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const moved = controls.update();
    if (moved || needsRender) {
      renderer.render(scene, camera);
      needsRender = false;
    }
  };

  const resize = () => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    needsRender = true;
  };
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  observer?.observe(host);
  resize();

  const onContextLost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(raf);
    options.onContextLost?.();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);
  loop();

  const offset = new Vector3();
  const spherical = new Spherical();

  return {
    stats,
    setWireframe(on) {
      model.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        for (const m of materialsOf(mesh)) (m as Material & { wireframe?: boolean }).wireframe = on;
      });
      needsRender = true;
    },
    setAutoRotate(on) {
      controls.autoRotate = on;
      needsRender = true;
    },
    resetView() {
      applyFraming();
      needsRender = true;
    },
    rotate(deltaAzimuth, deltaPolar) {
      offset.copy(camera.position).sub(controls.target);
      spherical.setFromVector3(offset);
      spherical.theta += deltaAzimuth;
      spherical.phi = MathUtils.clamp(spherical.phi + deltaPolar, 0.05, Math.PI - 0.05);
      offset.setFromSpherical(spherical);
      camera.position.copy(controls.target).add(offset);
      camera.lookAt(controls.target);
      controls.update();
      needsRender = true;
    },
    zoom(factor) {
      offset.copy(camera.position).sub(controls.target);
      const distance = MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance);
      offset.setLength(distance);
      camera.position.copy(controls.target).add(offset);
      controls.update();
      needsRender = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      observer?.disconnect();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      controls.dispose();
      disposeObject(model);
      grid.geometry.dispose();
      gridMaterial.dispose();
      envTexture.dispose();
      pmrem.dispose();
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
