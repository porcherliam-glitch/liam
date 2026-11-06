// Fire: three crossed quads with a procedural, flickering flame shader (additive). Used for torches, the camp fire
// and the torch in the player's hand. One shared geometry and material; every flame gets its own flicker from its
// world position.

import * as THREE from "three"
import { windUniforms } from "./materials"

let geometry: THREE.BufferGeometry | null = null
let material: THREE.ShaderMaterial | null = null

function flameGeometry(): THREE.BufferGeometry {
  if (geometry) return geometry
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 3; i++) {
    const p = new THREE.PlaneGeometry(1, 1, 1, 4)
    p.translate(0, 0.5, 0)
    p.rotateY((i / 3) * Math.PI)
    parts.push(p)
  }
  // Merge by hand (positions, uvs, indices): avoids pulling BufferGeometryUtils into this small module
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  let base = 0
  for (const p of parts) {
    const a = p.getAttribute("position")
    const u = p.getAttribute("uv")
    for (let i = 0; i < a.count; i++) {
      pos.push(a.getX(i), a.getY(i), a.getZ(i))
      uv.push(u.getX(i), u.getY(i))
    }
    const ix = p.getIndex()!
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + base)
    base += a.count
    p.dispose()
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeBoundingSphere()
  geometry = g
  return g
}

function flameMaterial(): THREE.ShaderMaterial {
  if (material) return material
  material = new THREE.ShaderMaterial({
    uniforms: { uTime: windUniforms.uTime },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vSeed;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vSeed = fract(sin(dot(wp.xz, vec2(12.9898, 78.233))) * 43758.5453) * 40.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying float vSeed;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        float t = uTime + vSeed;
        float y = vUv.y;
        // Rising turbulence bends the flame and tears its tip apart
        float n = noise(vec2(vUv.x * 4.0, y * 3.0 - t * 3.2)) * 0.6 + noise(vec2(vUv.x * 9.0, y * 6.0 - t * 5.0)) * 0.4;
        float sway = (sin(t * 7.0 + y * 5.0) * 0.05 + (n - 0.5) * 0.18) * y;
        float x = abs(vUv.x - 0.5 - sway);
        // Teardrop: widest a quarter up, pointed at the top
        // (smoothstep needs edge0 < edge1, so falling edges are written as 1 - smoothstep)
        float width = 0.42 * pow(max(0.0, 1.0 - y), 0.75) * smoothstep(0.0, 0.18, y + 0.06) + 0.001;
        float body = (1.0 - smoothstep(width * 0.25, width, x)) * (1.0 - smoothstep(0.55, 1.0, y + n * 0.35));
        if (body < 0.02) discard;
        float core = (1.0 - smoothstep(0.0, width * 0.55, x)) * (1.0 - smoothstep(0.1, 0.65, y));
        vec3 red = vec3(0.9, 0.18, 0.02);
        vec3 orange = vec3(1.0, 0.48, 0.08);
        vec3 yellow = vec3(1.0, 0.85, 0.45);
        vec3 col = mix(red, orange, smoothstep(0.0, 0.6, body));
        col = mix(col, yellow, core);
        // Kept below the bloom threshold (bloom turns small bright spots into blocky halos); the glow comes from
        // the soft sprite around the flame instead
        gl_FragColor = vec4(min(col * body * (0.62 + core * 0.22), vec3(0.86)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    // Additive light that leaves the target's alpha alone (the bloom pass reads alpha; stray alpha bloomed into
    // square halos around every flame)
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    side: THREE.DoubleSide,
  })
  return material
}

let glowMaterial: THREE.SpriteMaterial | null = null

/** Soft orange halo (radial gradient), additive, below the bloom threshold. */
function flameGlow(): THREE.SpriteMaterial {
  if (glowMaterial) return glowMaterial
  let map: THREE.Texture | null = null
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas")
    c.width = c.height = 64
    const ctx = c.getContext("2d")!
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    g.addColorStop(0, "rgba(255,255,255,1)")
    g.addColorStop(0.35, "rgba(255,255,255,0.35)")
    g.addColorStop(1, "rgba(255,255,255,0)")
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 64, 64)
    map = new THREE.CanvasTexture(c)
  }
  glowMaterial = new THREE.SpriteMaterial({ map, color: 0xff7a24, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
  return glowMaterial
}

/** A flame of the given width and height (m) with its glow, its base at the origin. */
export function flameMesh(width: number, height: number): THREE.Group {
  const g = new THREE.Group()
  const m = new THREE.Mesh(flameGeometry(), flameMaterial())
  m.scale.set(width, height, width)
  m.castShadow = false
  m.receiveShadow = false
  m.renderOrder = 3
  g.add(m)
  const glow = new THREE.Sprite(flameGlow())
  glow.position.y = height * 0.4
  glow.scale.setScalar(height * 2.2)
  glow.renderOrder = 2
  g.add(glow)
  g.userData.dynamic = true
  return g
}
