/**
 * sky.ts — sky dome, distant skyline ring and harbour water. The dome and ring follow the camera and are drawn first
 * without depth test (vertices pushed to the far plane), so they never clip, whatever camera.far is. Colours are
 * display-space hex values; the dome blends into the fog colour below the horizon so fogged geometry meets it seamlessly.
 */
import * as THREE from "three"
import { mulberry } from "./textures"
import { raw } from "./meshkit"

export interface SkySpec {
  zenith: number; mid: number; horizon: number; glow: number; fog: number
  /** Direction toward the sun or moon (need not be normalised). */
  sunDir: [number, number, number]
  sunColor: number; sunSize: number; sunVisible: number; glowStrength: number
  moon: boolean; stars: number; clouds: number; cloudColor: number; cloudLit: number
  /** Extra faint glow on the horizon (town light pollution / remnant), azimuth vector + colour. */
  glow2?: { dir: [number, number]; color: number; strength: number }
}

const v3 = (hex: number) => { const c = raw(hex); return new THREE.Vector3(c.r, c.g, c.b) }

export function createSky(spec: SkySpec, time: { value: number }): THREE.Mesh {
  const geo = new THREE.SphereGeometry(10, 32, 16)
  const g2 = spec.glow2 ?? { dir: [1, 0] as [number, number], color: 0, strength: 0 }
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      zenith: { value: v3(spec.zenith) }, mid: { value: v3(spec.mid) }, horizon: { value: v3(spec.horizon) }, glow: { value: v3(spec.glow) },
      fogColor: { value: v3(spec.fog) }, sunDir: { value: new THREE.Vector3(...spec.sunDir).normalize() }, sunColor: { value: v3(spec.sunColor) },
      sunSize: { value: spec.sunSize }, sunVisible: { value: spec.sunVisible }, glowStrength: { value: spec.glowStrength },
      moon: { value: spec.moon ? 1 : 0 }, stars: { value: spec.stars }, clouds: { value: spec.clouds }, cloudColor: { value: v3(spec.cloudColor) }, cloudLit: { value: v3(spec.cloudLit) },
      glow2Dir: { value: new THREE.Vector2(...g2.dir).normalize() }, glow2Color: { value: v3(g2.color) }, glow2Strength: { value: g2.strength },
      time,
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = vec4(p.xy, p.w * 0.99999, p.w); }`,
    fragmentShader: /* glsl */`
      uniform vec3 zenith, mid, horizon, glow, fogColor, sunDir, sunColor, cloudColor, cloudLit, glow2Color;
      uniform vec2 glow2Dir;
      uniform float sunSize, sunVisible, glowStrength, moon, stars, clouds, time, glow2Strength;
      varying vec3 vDir;
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float h31(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y, hp = max(h, 0.0);
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, hp));
        col = mix(col, zenith, smoothstep(0.16, 0.85, hp));
        vec3 sd = normalize(sunDir);
        float sdot = max(dot(d, sd), 0.0);
        float az = max(dot(normalize(d.xz + 1e-5), normalize(sd.xz + 1e-5)), 0.0);
        float band = exp(-hp * 6.0);
        col = mix(col, glow, clamp(pow(az, 3.0) * band * glowStrength, 0.0, 1.0));
        col += glow * pow(sdot, 10.0) * 0.3 * glowStrength;
        float az2 = max(dot(normalize(d.xz + 1e-5), glow2Dir), 0.0);
        col = mix(col, glow2Color, clamp(pow(az2, 6.0) * exp(-hp * 14.0) * glow2Strength, 0.0, 1.0));
        float cover = 0.0;
        if (clouds > 0.0 && h > 0.0) {
          vec2 uv = d.xz / (h + 0.1) * 1.4 + vec2(time * 0.003, time * 0.001);
          float n = fbm(uv * vec2(0.7, 1.8));
          cover = smoothstep(0.62 - clouds * 0.25, 0.9, n) * smoothstep(0.0, 0.1, h) * (1.0 - 0.5 * smoothstep(0.3, 0.9, h));
          vec3 cc = mix(cloudColor, cloudLit, clamp(pow(az, 2.0) * band * 1.4 + pow(sdot, 5.0) * 0.8, 0.0, 1.0));
          col = mix(col, cc, cover * 0.92);
        }
        float c = dot(d, sd);
        if (moon > 0.5) {
          float disc = smoothstep(cos(sunSize), cos(sunSize * 0.9), c);
          vec3 q = d - sd * c;
          float cr = n2(q.xy * 900.0 + q.z * 300.0) * 0.35 + n2(q.zy * 2400.0) * 0.12;
          col = mix(col, sunColor * (1.0 - cr), disc * (1.0 - cover * 0.7));
          col += sunColor * (0.22 * pow(max(c, 0.0), 300.0) + 0.07 * pow(max(c, 0.0), 12.0));
        } else {
          float disc = smoothstep(cos(sunSize), cos(sunSize * 0.8), c);
          col = mix(col, sunColor, disc * sunVisible);
          col += sunColor * pow(max(c, 0.0), 700.0) * 0.8 * sunVisible;
        }
        if (stars > 0.0 && h > 0.0) {
          vec3 p = d * 280.0;
          vec3 cell = floor(p); vec3 f = fract(p) - 0.5;
          float r = h31(cell);
          float star = step(0.9962, r) * smoothstep(0.45, 0.05, length(f));
          float tw = 0.65 + 0.35 * sin(time * (1.3 + r * 5.0) + r * 60.0);
          float big = step(0.9993, r) * 1.6 + 1.0;
          col += vec3(0.82, 0.88, 1.0) * star * tw * big * stars * smoothstep(0.03, 0.3, h) * (1.0 - cover);
        }
        col = mix(fogColor, col, smoothstep(-0.02, 0.07, h));
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: false,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.renderOrder = -1000; mesh.frustumCulled = false; mesh.name = "Himmel"
  return mesh
}

// ---------------------------------------------------------------------------------------------------------------
// Skyline ring (unlit vertex colours, drawn right after the sky).
// ---------------------------------------------------------------------------------------------------------------
export type SkylineKind = "industrial" | "harbor" | "forest"
export interface SkylineSpec { kind: SkylineKind; fog: number; dark: number; lit: number; litChance: number; seed: number; waterFrom?: number; waterTo?: number }

export interface Skyline { mesh: THREE.Mesh; beacons: Array<[number, number, number]> }

export function createSkyline(spec: SkylineSpec): Skyline {
  const rng = mulberry(spec.seed)
  const pos: number[] = [], col: number[] = [], idx: number[] = []
  const fog = raw(spec.fog), dark = raw(spec.dark), lit = raw(spec.lit)
  const beacons: Array<[number, number, number]> = []
  const shade = (y: number, top: number, k = 1) => { const t = Math.min(1, Math.max(0, (y + 4) / (Math.max(top, 8) * 0.9))); const c = fog.clone().lerp(dark, Math.min(1, 0.35 + t * 0.65) * k); return c }
  const vert = (x: number, y: number, z: number, c: THREE.Color) => { pos.push(x, y, z); col.push(c.r, c.g, c.b); return pos.length / 3 - 1 }
  // vertical quad facing the centre between angles; z-up box built from 4 side quads + top
  const prism = (a: number, r: number, w: number, d: number, h: number, base = -6, k = 1) => {
    const cx = Math.sin(a) * r, cz = -Math.cos(a) * r, tx = Math.cos(a), tz = Math.sin(a), nx = -Math.sin(a), nz = Math.cos(a)
    const corners: Array<[number, number]> = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]
    const pts = corners.map(([u, v]) => [cx + tx * u + nx * v, cz + tz * u + nz * v])
    for (let i = 0; i < 4; i++) {
      const p = pts[i], q = pts[(i + 1) % 4]
      const i0 = vert(p[0], base, p[1], shade(base, h, k)), i1 = vert(q[0], base, q[1], shade(base, h, k)), i2 = vert(q[0], h, q[1], shade(h, h, k)), i3 = vert(p[0], h, p[1], shade(h, h, k))
      idx.push(i0, i1, i2, i0, i2, i3, i0, i2, i1, i0, i3, i2)
    }
    const t = shade(h, h, k), i0 = vert(pts[0][0], h, pts[0][1], t), i1 = vert(pts[1][0], h, pts[1][1], t), i2 = vert(pts[2][0], h, pts[2][1], t), i3 = vert(pts[3][0], h, pts[3][1], t)
    idx.push(i0, i1, i2, i0, i2, i3, i0, i2, i1, i0, i3, i2)
    return { cx, cz, tx, tz, nx, nz }
  }
  const windows = (a: number, r: number, w: number, h: number, chance: number) => {
    if (chance <= 0) return
    const cx = Math.sin(a) * (r - 0.6), cz = -Math.cos(a) * (r - 0.6), tx = Math.cos(a), tz = Math.sin(a)
    for (let y = 3; y < h - 2; y += 3.2) for (let u = -w / 2 + 2; u < w / 2 - 2; u += 3) {
      if (rng() > chance) continue
      const c = lit.clone().multiplyScalar(0.55 + rng() * 0.6)
      const x0 = cx + tx * u, z0 = cz + tz * u, x1 = x0 + tx * 1.6, z1 = z0 + tz * 1.6
      const i0 = vert(x0, y, z0, c), i1 = vert(x1, y, z1, c), i2 = vert(x1, y + 1.4, z1, c), i3 = vert(x0, y + 1.4, z0, c)
      idx.push(i0, i1, i2, i0, i2, i3, i0, i2, i1, i0, i3, i2)
    }
  }
  const tree = (a: number, r: number, h: number, w: number) => {
    const cx = Math.sin(a) * r, cz = -Math.cos(a) * r, c0 = shade(-4, h), c1 = shade(h, h)
    const seg = 6, top = vert(cx, h, cz, c1)
    const ring: number[] = []
    for (let i = 0; i < seg; i++) { const t = i / seg * Math.PI * 2; ring.push(vert(cx + Math.cos(t) * w, h * 0.25, cz + Math.sin(t) * w, c0)) }
    const bottom = vert(cx, -6, cz, c0)
    for (let i = 0; i < seg; i++) { const p = ring[i], q = ring[(i + 1) % seg]; idx.push(top, p, q, top, q, p, bottom, q, p, bottom, p, q) }
  }
  const water = (a: number) => spec.waterFrom !== undefined && spec.waterTo !== undefined && a > spec.waterFrom && a < spec.waterTo
  const TAU = Math.PI * 2

  if (spec.kind === "forest") {
    for (let a = 0; a < TAU; a += 0.011 + rng() * 0.02) tree(a, 190 + rng() * 60, 9 + rng() * 11, 3 + rng() * 4)
    for (let a = 0; a < TAU; a += 0.18 + rng() * 0.16) tree(a, 340, 14 + rng() * 22, 60 + rng() * 50)
    const m = 2.2; prism(m, 300, 1.4, 1.4, 70, -6, 0.9); beacons.push([Math.sin(m) * 299, 70, -Math.cos(m) * 299], [Math.sin(m) * 299, 46, -Math.cos(m) * 299])
    for (let a = 3.6; a < 4.2; a += 0.03 + rng() * 0.03) { const h = 6 + rng() * 12; prism(a, 310, 10 + rng() * 14, 8, h, -6, 0.7); windows(a, 310, 10, h, spec.litChance * 2.5) }
  } else {
    for (let a = 0; a < TAU; a += 0.02 + rng() * 0.05) {
      const w = water(a), r = w ? 300 + rng() * 40 : 210 + rng() * 70
      const big = rng() < (spec.kind === "harbor" && w ? 0.3 : 0.12)
      const h = big ? 24 + rng() * 34 : 5 + rng() * 16, bw = 10 + rng() * 26
      prism(a, r, bw, 10 + rng() * 14, h, -6, w ? 0.8 : 1)
      windows(a, r - 6, bw, h, spec.litChance * (w || big ? 1.6 : 0.8))
      if (rng() < 0.08) { const ch = 45 + rng() * 30; prism(a + 0.01, r + 4, 3, 3, ch); if (rng() < 0.6) beacons.push([Math.sin(a + 0.01) * (r + 3), ch + 1, -Math.cos(a + 0.01) * (r + 3)]) }
      if (!w && rng() < 0.18) tree(a + 0.005, r - 25 - rng() * 30, 7 + rng() * 6, 4 + rng() * 3)
    }
    if (spec.kind === "industrial") {
      for (let a = 1.2; a < 1.9; a += 0.09) { const r = 240; prism(a, r, 1.2, 1.2, 30, -6); prism(a, r, 9, 0.6, 1.2, 27); prism(a, r, 6, 0.6, 1, 22) }
      prism(4.3, 250, 26, 26, 22); prism(4.42, 250, 26, 26, 18)
    }
    if (spec.kind === "harbor") {
      for (let a = (spec.waterFrom ?? 0) + 0.15; a < (spec.waterTo ?? 0) - 0.1; a += 0.12 + rng() * 0.12) {
        const r = 290, s = 0.9 + rng() * 0.4
        prism(a - 0.025, r, 2.4 * s, 2.4, 42 * s); prism(a + 0.025, r, 2.4 * s, 2.4, 42 * s); prism(a, r, 26 * s, 3, 4 * s, 40 * s)
        const ba = a + 0.04; prism(ba, r - 20, 3, 60 * s, 3 * s, 46 * s)
        beacons.push([Math.sin(a) * (r - 2), 47 * s, -Math.cos(a) * (r - 2)])
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  const mat = new THREE.ShaderMaterial({
    vertexShader: /* glsl */`
      varying vec3 vCol;
      void main() { vCol = color; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = vec4(p.xy, p.w * 0.99998, p.w); }`,
    fragmentShader: /* glsl */`varying vec3 vCol; void main() { gl_FragColor = vec4(vCol, 1.0); }`,
    vertexColors: true, depthWrite: false, depthTest: false, toneMapped: false,
  })
  const mesh = new THREE.Mesh(g, mat); mesh.renderOrder = -999; mesh.frustumCulled = false; mesh.name = "Horizont"
  return { mesh, beacons }
}

// ---------------------------------------------------------------------------------------------------------------
// Water (harbor): animated normals, sky reflection with fresnel, sodium lamp glints, fog.
// ---------------------------------------------------------------------------------------------------------------
export interface WaterSpec { deep: number; skyLow: number; skyHigh: number; glow: number; glowDir: [number, number]; lampColor: number; lamps: Array<[number, number, number]> }

export function createWater(spec: WaterSpec, level: number, time: { value: number }, quality: "high" | "low"): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(2400, 2400, 1, 1); geo.rotateX(-Math.PI / 2)
  const lamps = spec.lamps.slice(0, 6)
  while (lamps.length < 6) lamps.push([0, -100, 0])
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      deep: { value: v3(spec.deep) }, skyLow: { value: v3(spec.skyLow) }, skyHigh: { value: v3(spec.skyHigh) }, glow: { value: v3(spec.glow) },
      glowDir: { value: new THREE.Vector2(...spec.glowDir).normalize() }, lampColor: { value: v3(spec.lampColor) },
      lamps: { value: lamps.map(l => new THREE.Vector3(...l)) }, time: { value: 0 },
    }]),
    vertexShader: /* glsl */`
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <fog_pars_fragment>
      uniform vec3 deep, skyLow, skyHigh, glow, lampColor; uniform vec2 glowDir; uniform vec3 lamps[6]; uniform float time;
      varying vec3 vWorld;
      vec2 wave(vec2 p, vec2 dir, float freq, float speed, float amp) { float ph = dot(p, dir) * freq + time * speed; return dir * cos(ph) * freq * amp; }
      void main() {
        vec2 p = vWorld.xz;
        vec2 g = wave(p, vec2(0.8, 0.6), 0.35, 1.1, 0.12) + wave(p, vec2(-0.5, 0.86), 0.62, 1.6, 0.07) + wave(p, vec2(0.98, -0.2), 1.3, 2.3, 0.035) + wave(p, vec2(-0.3, -0.95), 2.7, 3.1, 0.016)
          ${quality === "high" ? "+ wave(p, vec2(0.6, -0.8), 5.1, 4.0, 0.008) + wave(p, vec2(-0.9, 0.4), 8.3, 5.2, 0.004)" : ""};
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 v = normalize(cameraPosition - vWorld);
        float fres = 0.03 + 0.97 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
        vec3 r = reflect(-v, n);
        vec3 sky = mix(skyLow, skyHigh, smoothstep(0.0, 0.5, r.y));
        sky = mix(sky, glow, pow(max(dot(normalize(r.xz + 1e-5), glowDir), 0.0), 4.0) * exp(-max(r.y, 0.0) * 8.0) * 0.8);
        vec3 col = mix(deep, sky, clamp(fres, 0.0, 1.0));
        for (int i = 0; i < 6; i++) {
          vec3 l = lamps[i] - vWorld; float dist = length(l); l /= dist;
          vec3 hv = normalize(l + v);
          float s = pow(max(dot(n, hv), 0.0), 220.0) * 900.0 / (dist * dist + 40.0);
          col += lampColor * s;
        }
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
    fog: true, toneMapped: false,
  })
  mat.uniforms.time = time
  const mesh = new THREE.Mesh(geo, mat); mesh.position.y = level; mesh.name = "Wasser"; mesh.receiveShadow = false
  return mesh
}
