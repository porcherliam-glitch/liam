/**
 * extraction.ts — evac zone visuals for world.setExtraction: painted pad, animated ring (amber dashed = locked,
 * green pulse = ready, red = called), vertical light beam, red smoke flare (GPU particles) and a low-poly helicopter
 * that approaches/descends with the hold progress and lifts off when done. No per-frame allocations in update().
 */
import * as THREE from "three"
import type { ExtractionPoint, MapLayout } from "./maps"
import { GeoBatch, GlowBatch, coneMaterial, raw, type FxUniforms } from "./meshkit"

export type EvacState = "hidden" | "locked" | "ready" | "called" | "done"

interface Zone {
  e: ExtractionPoint
  group: THREE.Group
  pad: THREE.Mesh; padMat: THREE.MeshStandardMaterial
  ring: THREE.Mesh; ringU: Record<string, THREE.IUniform>
  beam: THREE.Mesh; beamU: Record<string, THREE.IUniform>
  beacons: THREE.Mesh
  smoke: THREE.Mesh; smokeU: Record<string, THREE.IUniform>
  flare: THREE.Mesh
  state: EvacState; progress: number; since: number; dirty: boolean
  out: THREE.Vector2
}

const COLORS: Record<EvacState, number> = { hidden: 0x000000, locked: 0xffa526, ready: 0x3dff9a, called: 0xff4030, done: 0x3dff9a }

export interface Extractions {
  group: THREE.Group
  set(id: string, state: EvacState, progress: number): void
  update(dt: number, time: number): void
  dispose(): void
}

export function createExtractions(layout: MapLayout, fx: FxUniforms, padTexture: THREE.Texture, smokeTex: THREE.Texture, night: number, quality: "high" | "low"): Extractions {
  const group = new THREE.Group(); group.name = "Evakuierung"
  const disposables: Array<{ dispose(): void }> = []
  const b = layout.bounds, cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2
  const ringGeo = new THREE.CircleGeometry(1, 72); ringGeo.rotateX(-Math.PI / 2); disposables.push(ringGeo)
  const beamGeo = new THREE.CylinderGeometry(0.75, 0.75, 1, 20, 1, true); beamGeo.translate(0, 0.5, 0); disposables.push(beamGeo)
  const smokeCount = quality === "high" ? 44 : 22
  const smokeGeo = particleGeometry(smokeCount); disposables.push(smokeGeo)
  const zones = new Map<string, Zone>()
  const heli = createHelicopter(fx, night, disposables)
  group.add(heli.group)
  let heliZone: Zone | null = null
  let now = 0

  for (const e of layout.extractions) {
    const g = new THREE.Group(); g.position.set(e.x, 0, e.z); group.add(g)
    const padMat = new THREE.MeshStandardMaterial({ map: padTexture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, roughness: 0.9, opacity: 0.3 })
    const padGeo = new THREE.PlaneGeometry(e.radius * 2, e.radius * 2); padGeo.rotateX(-Math.PI / 2); disposables.push(padMat, padGeo)
    const pad = new THREE.Mesh(padGeo, padMat); pad.position.y = 0.02; pad.receiveShadow = true; g.add(pad)
    const ringU = { color: { value: new THREE.Color() }, radius: { value: e.radius }, dashed: { value: 0 }, pulse: { value: 0 }, alpha: { value: 1 }, time: fx.time }
    const ringMat = new THREE.ShaderMaterial({ uniforms: ringU, vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })
    disposables.push(ringMat)
    const ring = new THREE.Mesh(ringGeo, ringMat); ring.scale.setScalar(e.radius + 0.8); ring.position.y = 0.05; ring.renderOrder = 3; g.add(ring)
    const beamU = { color: { value: new THREE.Color() }, intensity: { value: 1 }, time: fx.time, fogFar: fx.fogFar }
    const beamMat = new THREE.ShaderMaterial({ uniforms: beamU, vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false })
    disposables.push(beamMat)
    const beam = new THREE.Mesh(beamGeo, beamMat); beam.renderOrder = 6; beam.frustumCulled = false; g.add(beam)
    const gb = new GlowBatch()
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; gb.add(Math.cos(a) * (e.radius + 0.5), 0.75, Math.sin(a) * (e.radius + 0.5), 0.45, 0xffffff, 1.2, [3, 1.2, i * 0.25]) }
    const beacons = gb.build(fx, { fog: false })!; disposables.push(beacons.geometry, beacons.material as THREE.Material); g.add(beacons)
    const post = new GeoBatch()
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4, px = Math.cos(a) * (e.radius + 0.5), pz = Math.sin(a) * (e.radius + 0.5); post.box(px - 0.06, 0, pz - 0.06, px + 0.06, 0.7, pz + 0.06, { color: 0x30302c, local: true }); post.box(px - 0.1, 0.62, pz - 0.1, px + 0.1, 0.8, pz + 0.1, { color: 0xd8d0b0, local: true }) }
    const postGeo = post.build()!, postMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }); disposables.push(postGeo, postMat)
    const posts = new THREE.Mesh(postGeo, postMat); posts.castShadow = true; beacons.add(posts)
    const smokeU = { map: { value: smokeTex }, time: fx.time, start: { value: 0 }, strength: { value: 0 }, night: { value: night }, wind: { value: new THREE.Vector2(0.9, 0.35) } }
    const smokeMat = new THREE.ShaderMaterial({ uniforms: smokeU, vertexShader: SMOKE_VS, fragmentShader: SMOKE_FS, transparent: true, depthWrite: false, toneMapped: false })
    disposables.push(smokeMat)
    const smoke = new THREE.Mesh(smokeGeo, smokeMat); smoke.frustumCulled = false; smoke.renderOrder = 7; g.add(smoke)
    const fb = new GlowBatch(); fb.add(0, 0.35, 0, 1.6, 0xff3a22, 2.2, [0.6, 23, 0]); fb.add(0, 0.3, 0, 4.5, 0xff2a10, 0.6, [0.3, 11, 1])
    const flare = fb.build(fx, { fog: false })!; disposables.push(flare.geometry, flare.material as THREE.Material); g.add(flare)
    const o = new THREE.Vector2(e.x - cx, e.z - cz); if (o.lengthSq() < 1) o.set(1, 0); o.normalize()
    const z: Zone = { e, group: g, pad, padMat, ring, ringU, beam, beamU, beacons, smoke, smokeU, flare, state: "hidden", progress: 0, since: 0, dirty: true, out: o }
    zones.set(e.id, z)
    apply(z)
  }

  function apply(z: Zone): void {
    const s = z.state
    z.padMat.opacity = s === "hidden" ? 0.28 : 0.85
    z.ring.visible = s !== "hidden"
    ;(z.ringU.color.value as THREE.Color).copy(raw(COLORS[s]))
    z.ringU.dashed.value = s === "locked" ? 1 : 0
    z.ringU.pulse.value = s === "ready" ? 1 : s === "called" ? 0.6 : 0
    z.beam.visible = s === "ready" || s === "locked" || s === "called"
    ;(z.beamU.color.value as THREE.Color).copy(raw(COLORS[s]))
    z.beam.scale.set(1, s === "locked" ? 9 : s === "called" ? 34 : 80, 1)
    z.beamU.intensity.value = s === "locked" ? 0.55 : s === "called" ? 0.5 : 1
    z.beacons.visible = s !== "hidden"
    ;((z.beacons.material as THREE.ShaderMaterial).uniforms.tint.value as THREE.Color).copy(raw(COLORS[s]))
    z.smoke.visible = s === "called" || s === "done"
    z.flare.visible = s === "called"
    z.dirty = false
  }

  return {
    group,
    set(id, state, progress) {
      const z = zones.get(id); if (!z) return
      if (z.state !== state) {
        z.state = state; z.since = now; z.dirty = true
        if (state === "called") { z.smokeU.start.value = now; heliZone = z }
        if (state === "done") heliZone = z
        if ((state === "hidden" || state === "locked" || state === "ready") && heliZone === z) heliZone = null
      }
      z.progress = Math.min(1, Math.max(0, progress))
    },
    update(dt, time) {
      now = time
      for (const z of zones.values()) {
        if (z.dirty) apply(z)
        if (z.state === "ready") z.beamU.intensity.value = 0.8 + 0.25 * Math.sin(time * 2.4)
        if (z.state === "called") z.smokeU.strength.value = Math.min(1, (time - z.smokeU.start.value) * 0.6)
        if (z.state === "done") z.smokeU.strength.value = Math.max(0, 1 - (time - z.since) * 0.15)
        z.ringU.alpha.value = z.state === "done" ? Math.max(0, 1 - (time - z.since) * 0.3) : 1
      }
      heli.update(heliZone, time, dt)
    },
    dispose() { for (const d of disposables) d.dispose() },
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Helicopter
// ---------------------------------------------------------------------------------------------------------------
function createHelicopter(fx: FxUniforms, night: number, disposables: Array<{ dispose(): void }>) {
  const group = new THREE.Group(); group.name = "Hubschrauber"; group.visible = false
  const body = new GeoBatch()
  const m = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3()
  const olive = 0x3c4237, dark = 0x22262a, glass = 0x1b2633, stripe = 0xc9a227
  const tilted = (w: number, h: number, d: number, x: number, y: number, z: number, rx: number, color: number) => {
    const g = new THREE.BoxGeometry(w, h, d); m.compose(p.set(x, y, z), q.setFromEuler(e.set(rx, 0, 0)), s.set(1, 1, 1)); body.add(g, m, color); g.dispose()
  }
  const shape = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx: number, sx: number, sy: number, sz: number, color: number) => {
    m.compose(p.set(x, y, z), q.setFromEuler(e.set(rx, 0, 0)), s.set(sx, sy, sz)); body.add(g, m, color); g.dispose()
  }
  shape(new THREE.CapsuleGeometry(1.15, 3.4, 6, 14).rotateX(Math.PI / 2), 0, 1.65, -0.9, 0, 0.95, 0.88, 1, olive)
  shape(new THREE.SphereGeometry(1, 16, 10), 0, 1.95, -2.7, 0, 0.93, 0.72, 1.05, glass)
  for (const x of [-1.07, 1.07]) { body.box(x - 0.04, 1.6, -1.5, x + 0.04, 2.2, 0.9, { color: glass, local: true, ao: 0 }); body.box(x - 0.05, 0.95, -1.0, x + 0.05, 2.3, 0.6, { color: 0x30352e, local: true, ao: 0 }) }
  body.box(-0.8, 2.45, -1.2, 0.8, 3.1, 2.2, { color: 0x34392f, local: true, ao: 0 })
  shape(new THREE.CylinderGeometry(0.45, 0.45, 1.2, 10).rotateX(Math.PI / 2), 0, 2.75, 2.3, 0, 1, 1, 1, dark)
  shape(new THREE.CylinderGeometry(0.2, 0.55, 7, 10).rotateX(Math.PI / 2), 0, 2.05, 5.3, 0.05, 1, 1, 1, olive)
  body.box(-0.4, 1.85, 4.0, 0.4, 2.45, 4.6, { color: stripe, local: true, ao: 0 })
  tilted(0.16, 2.2, 1.3, 0, 3.0, 9.0, -0.35, olive)
  body.box(-1.7, 1.95, 8.2, 1.7, 2.05, 8.9, { color: olive, local: true, ao: 0 })
  for (const x of [-1.25, 1.25]) {
    body.box(x - 0.07, 0, -3.1, x + 0.07, 0.12, 2.8, { color: dark, local: true, ao: 0 })
    for (const z of [-1.8, 1.4]) body.box(x * 0.85 - 0.05, 0.1, z - 0.05, x * 0.85 + 0.05, 0.7, z + 0.05, { color: dark, local: true, ao: 0 })
  }
  const mast = new THREE.CylinderGeometry(0.14, 0.18, 0.55, 8); m.makeTranslation(0, 3.4, 0.6); body.add(mast, m, dark); mast.dispose()
  const bodyGeo = body.build()!, bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 })
  disposables.push(bodyGeo, bodyMat)
  const hull = new THREE.Mesh(bodyGeo, bodyMat); hull.castShadow = true; group.add(hull)

  const rotor = new GeoBatch()
  for (let i = 0; i < 4; i++) rotor.box(-0.22, -0.03, 0.2, 0.22, 0.03, 7.2, { color: 0x1d2024, rotY: i * Math.PI / 2, ao: 0 })
  rotor.box(-0.35, -0.08, -0.35, 0.35, 0.08, 0.35, { color: dark, ao: 0 })
  const rotorGeo = rotor.build()!; disposables.push(rotorGeo)
  const rotorMesh = new THREE.Mesh(rotorGeo, bodyMat); rotorMesh.position.set(0, 3.72, 0.6); rotorMesh.castShadow = true; group.add(rotorMesh)
  const discGeo = new THREE.CircleGeometry(7.3, 40); discGeo.rotateX(-Math.PI / 2)
  const discMat = new THREE.MeshBasicMaterial({ color: 0x15181c, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide })
  disposables.push(discGeo, discMat)
  const disc = new THREE.Mesh(discGeo, discMat); disc.position.set(0, 3.72, 0.6); group.add(disc)
  const tail = new GeoBatch()
  for (let i = 0; i < 2; i++) tail.box(-0.03, -0.1, -1.1, 0.03, 0.1, 1.1, { color: 0x1d2024, ao: 0 })
  const tailGeo = tail.build()!; tailGeo.rotateX(Math.PI / 2); disposables.push(tailGeo)
  const tailRotor = new THREE.Mesh(tailGeo, bodyMat); tailRotor.position.set(0.22, 3.1, 9.2); group.add(tailRotor)
  const tailDiscGeo = new THREE.CircleGeometry(1.15, 20); tailDiscGeo.rotateY(Math.PI / 2); disposables.push(tailDiscGeo)
  const tailDisc = new THREE.Mesh(tailDiscGeo, discMat); tailDisc.position.copy(tailRotor.position); group.add(tailDisc)

  const lights = new GlowBatch()
  lights.add(-1.2, 1.9, -1.9, 0.35, 0xff2a20, 1.6); lights.add(1.2, 1.9, -1.9, 0.35, 0x30ff70, 1.6)
  lights.add(0, 3.25, 1.2, 0.6, 0xff3020, 2.2, [2, 1.1, 0]); lights.add(0, 4.05, 9.4, 0.55, 0xffffff, 2.5, [2, 0.8, 0.4])
  lights.add(0, 0.75, -4.5, 0.6, 0xfff1d0, 1.4 + night)
  const glowMesh = lights.build(fx, { fog: false })!; disposables.push(glowMesh.geometry, glowMesh.material as THREE.Material); group.add(glowMesh)
  const coneGeo = new THREE.CylinderGeometry(0.2, 5.5, 26, 16, 1, true)
  coneGeo.translate(0, -13, 0); coneGeo.rotateX(0.45)
  const cc = new Float32Array(coneGeo.attributes.position.count * 3).fill(0.22 + night * 0.25)
  coneGeo.setAttribute("color", new THREE.BufferAttribute(cc, 3))
  const coneMat = coneMaterial(fx); disposables.push(coneGeo, coneMat)
  const cone = new THREE.Mesh(coneGeo, coneMat); cone.position.set(0, 0.7, -4.4); cone.renderOrder = 6; cone.frustumCulled = false; group.add(cone)

  const dustU = { time: fx.time, strength: { value: 0 }, night: { value: night } }
  const dustGeo = new THREE.CircleGeometry(14, 48); dustGeo.rotateX(-Math.PI / 2)
  const dustMat = new THREE.ShaderMaterial({ uniforms: dustU, vertexShader: RING_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 })
  disposables.push(dustGeo, dustMat)
  const dust = new THREE.Mesh(dustGeo, dustMat); dust.renderOrder = 3; dust.visible = false

  const start = new THREE.Vector3(), hover = new THREE.Vector3()
  let attached: Zone | null = null
  let rotorAngle = 0
  const ease = (t: number) => t * t * (3 - 2 * t)
  return {
    group,
    update(z: Zone | null, time: number, dt: number) {
      if (z !== attached) {
        if (dust.parent) dust.parent.remove(dust)
        attached = z
        if (z) z.group.add(dust)
      }
      if (!z) { group.visible = false; dust.visible = false; return }
      const e = z.e
      start.set(e.x + z.out.x * 190, 60, e.z + z.out.y * 190)
      hover.set(e.x + z.out.x * 3, 15, e.z + z.out.y * 3)
      let alt = 0, pitch = 0, roll = 0
      if (z.state === "called") {
        const pr = z.progress
        if (pr < 0.68) {
          const t = ease(pr / 0.68)
          group.position.lerpVectors(start, hover, t)
          group.position.y += Math.sin(t * Math.PI) * 6
          pitch = 0.16 * (1 - t) * Math.min(1, pr * 8)
        } else {
          const t = ease((pr - 0.68) / 0.32)
          group.position.set(hover.x + (e.x - hover.x) * t, 15 + (0.05 - 15) * (1 - (1 - t) * (1 - t)), hover.z + (e.z - hover.z) * t)
          roll = Math.sin(time * 0.9) * 0.03 * (1 - t); pitch = -0.04 * Math.sin(time * 0.7) * (1 - t)
        }
        group.rotation.set(0, Math.atan2(z.out.x, z.out.y), 0)
        alt = group.position.y
      } else {
        const td = time - z.since
        const t = Math.min(1, td / 9)
        group.position.set(e.x - z.out.x * (td * td * 1.4), 0.05 + Math.min(60, td * td * 1.6 + td * 1.5), e.z - z.out.y * (td * td * 1.4))
        group.rotation.set(0, Math.atan2(z.out.x, z.out.y), 0)
        pitch = -0.18 * Math.min(1, td * 0.6)
        alt = group.position.y
        if (t >= 1) { group.visible = false; dust.visible = false; return }
      }
      group.rotation.x = pitch; group.rotation.z = roll
      group.visible = true
      rotorAngle += dt * 8.5
      rotorMesh.rotation.y = rotorAngle; tailRotor.rotation.x = rotorAngle * 2.3
      cone.visible = night > 0.2 && alt > 1.5
      dust.visible = alt < 16
      dust.position.set(group.position.x - e.x, 0.06, group.position.z - e.z)
      dustU.strength.value = Math.max(0, 1 - alt / 16)
    },
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------------------------------------------
const RING_VS = /* glsl */`
varying vec2 vP;
void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const RING_FS = /* glsl */`
uniform vec3 color; uniform float radius, dashed, pulse, alpha, time;
varying vec2 vP;
void main() {
  float r = length(vP) * (radius + 0.8);
  float band = smoothstep(radius - 0.55, radius - 0.35, r) * (1.0 - smoothstep(radius - 0.05, radius + 0.08, r));
  float ang = atan(vP.y, vP.x) / 6.2831853;
  float dash = dashed > 0.5 ? step(0.45, fract(ang * 28.0 + time * 0.35)) : 1.0;
  float fill = smoothstep(radius * 0.3, radius, r) * (1.0 - step(radius, r)) * 0.14;
  float wave = pulse * exp(-pow((r - fract(time * 0.5) * radius) * 1.3, 2.0)) * 0.6 * (1.0 - step(radius, r));
  float outer = (1.0 - smoothstep(radius, radius + 0.8, r)) * step(radius, r) * 0.35;
  float a = (band * dash * 1.3 + fill + wave + outer) * alpha;
  gl_FragColor = vec4(color * a, 1.0);
}`
const DUST_FS = /* glsl */`
uniform float time, strength, night;
varying vec2 vP;
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float r = length(vP) / 14.0;
  float ang = atan(vP.y, vP.x);
  float n = h(floor(vec2(ang * 9.0, r * 6.0 - time * 3.0)));
  float ringA = smoothstep(0.15, 0.55, r) * (1.0 - smoothstep(0.6, 1.0, r)) * (0.5 + 0.5 * n);
  vec3 c = mix(vec3(0.55, 0.48, 0.38), vec3(0.12, 0.13, 0.15), night);
  gl_FragColor = vec4(c, ringA * strength * 0.55);
}`
const BEAM_VS = /* glsl */`
uniform float fogFar;
varying float vH; varying float vEdge; varying float vFog;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vEdge = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
  vH = uv.y;
  vFog = 1.0 - 0.6 * smoothstep(fogFar * 0.5, fogFar * 2.0, -mv.z);
}`
const BEAM_FS = /* glsl */`
uniform vec3 color; uniform float intensity, time;
varying float vH; varying float vEdge; varying float vFog;
void main() {
  float fall = pow(1.0 - vH, 1.4);
  float bands = 0.85 + 0.15 * sin(vH * 40.0 - time * 3.0);
  float a = fall * pow(vEdge, 1.2) * intensity * bands * vFog;
  gl_FragColor = vec4(color * a * 0.9, 1.0);
}`

function particleGeometry(n: number): THREE.BufferGeometry {
  const corner: number[] = [], seed: number[] = [], pos: number[] = [], idx: number[] = []
  let s = 1234567
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
  for (let i = 0; i < n; i++) {
    const a = rnd(), b = rnd(), c = rnd(), d = rnd()
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { corner.push(u, v); seed.push(i / n, a, b, c * 0.5 + d * 0.5); pos.push(0, 0, 0) }
    const k = i * 4; idx.push(k, k + 1, k + 2, k, k + 2, k + 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute("corner", new THREE.Float32BufferAttribute(corner, 2))
  g.setAttribute("seed", new THREE.Float32BufferAttribute(seed, 4))
  g.setIndex(idx)
  return g
}
const SMOKE_VS = /* glsl */`
attribute vec2 corner; attribute vec4 seed;
uniform float time, start; uniform vec2 wind;
varying vec2 vUv; varying float vAge; varying float vRot;
void main() {
  float life = 8.0;
  float age = fract((time - start) / life + seed.x);
  float t = age * life;
  vec3 c = vec3(0.0, 0.25, 0.0);
  c.y += t * (3.4 - age * 1.2);
  c.xz += wind * t * t * 0.07 + (seed.yz - 0.5) * (0.3 + t * 0.28);
  float size = 0.35 + t * 0.32;
  vec4 mv = modelViewMatrix * vec4(c, 1.0);
  float r = seed.w * 6.28 + t * (seed.y - 0.5);
  mat2 rot = mat2(cos(r), -sin(r), sin(r), cos(r));
  mv.xy += rot * corner * size;
  gl_Position = projectionMatrix * mv;
  vUv = corner * 0.5 + 0.5; vAge = age;
}`
const SMOKE_FS = /* glsl */`
uniform sampler2D map; uniform float strength, night;
varying vec2 vUv; varying float vAge;
void main() {
  float a = texture2D(map, vUv).a * smoothstep(0.0, 0.04, vAge) * (1.0 - smoothstep(0.5, 1.0, vAge)) * strength;
  vec3 hot = vec3(1.0, 0.22, 0.14), cold = mix(vec3(0.72, 0.2, 0.17), vec3(0.36, 0.1, 0.09), night);
  vec3 col = mix(hot, cold, smoothstep(0.0, 0.2, vAge));
  gl_FragColor = vec4(col, min(1.0, a * 1.15));
}`
