// Procedural weapon and shield meshes. Grip at the origin; blades extend along -Y (the hand's forward).

import * as THREE from "three"
import { M, mat } from "./materials"

function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  m.position.set(x, y, z)
  m.castShadow = true
  return m
}

function cyl(rt: number, rb: number, h: number, material: THREE.Material, x = 0, y = 0, z = 0, seg = 8): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material)
  m.position.set(x, y, z)
  m.castShadow = true
  return m
}

const steel = () => M.metal()
const darkSteel = () => M.metalDark()
const wood = () => mat("timber", { color: 0xaa8866 })
const leatherWrap = () => mat(null, { color: 0x4a2e1c, roughness: 0.95 })
const goldTrim = () => M.gold()

function blade(length: number, width: number, thick: number, material: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape()
  shape.moveTo(-width / 2, 0)
  shape.lineTo(width / 2, 0)
  shape.lineTo(width * 0.4, -length * 0.85)
  shape.lineTo(0, -length)
  shape.lineTo(-width * 0.4, -length * 0.85)
  shape.closePath()
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false })
  geo.translate(0, 0, -thick / 2)
  const m = new THREE.Mesh(geo, material)
  m.castShadow = true
  return m
}

export function buildWeapon(model: string): THREE.Group {
  const g = new THREE.Group()
  const [cls, tierStr] = model.split("_")
  const tier = parseInt(tierStr ?? "1", 10) || 1
  const fancy = tier >= 3
  const guardMat = fancy ? goldTrim() : darkSteel()
  switch (cls) {
    case "longsword": {
      g.add(cyl(0.016, 0.018, 0.22, leatherWrap(), 0, 0.09, 0))
      g.add(box(0.2, 0.03, 0.03, guardMat, 0, -0.02, 0))
      g.add(cyl(0.025, 0.025, 0.03, guardMat, 0, 0.21, 0))
      g.add(blade(0.95 + tier * 0.03, 0.06, 0.012, steel()))
      g.children[3].position.y = -0.03
      break
    }
    case "shortsword": {
      g.add(cyl(0.015, 0.017, 0.16, leatherWrap(), 0, 0.07, 0))
      g.add(box(0.14, 0.025, 0.03, guardMat, 0, -0.015, 0))
      g.add(cyl(0.022, 0.022, 0.025, guardMat, 0, 0.16, 0))
      const b = blade(0.6, 0.065, 0.012, steel())
      b.position.y = -0.025
      g.add(b)
      break
    }
    case "greatsword": {
      g.add(cyl(0.02, 0.022, 0.4, leatherWrap(), 0, 0.18, 0))
      g.add(box(0.32, 0.035, 0.035, guardMat, 0, -0.03, 0))
      g.add(cyl(0.035, 0.035, 0.04, guardMat, 0, 0.4, 0))
      const b = blade(1.35, 0.09, 0.015, steel())
      b.position.y = -0.04
      g.add(b)
      break
    }
    case "battleaxe": {
      g.add(cyl(0.018, 0.02, 0.95, wood(), 0, -0.3, 0))
      const headMat = steel()
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.03, 16, 1, false, 0, Math.PI), headMat)
      head.rotation.z = Math.PI / 2
      head.rotation.y = Math.PI / 2
      head.position.set(0.06, -0.62, 0)
      head.castShadow = true
      g.add(head)
      g.add(box(0.1, 0.12, 0.05, darkSteel(), 0.02, -0.62, 0))
      if (tier >= 2) {
        const head2 = head.clone()
        head2.rotation.y = -Math.PI / 2
        head2.position.x = -0.06
        g.add(head2)
      }
      break
    }
    case "mace": {
      g.add(cyl(0.018, 0.02, 0.7, tier >= 3 ? darkSteel() : wood(), 0, -0.2, 0))
      if (tier === 2) {
        const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 1), darkSteel())
        ball.position.y = -0.6
        g.add(ball)
        for (let i = 0; i < 8; i++) {
          const spike = cyl(0.005, 0.02, 0.08, steel())
          const a = (i / 8) * Math.PI * 2
          spike.position.set(Math.cos(a) * 0.1, -0.6, Math.sin(a) * 0.1)
          spike.rotation.z = -a - Math.PI / 2
          spike.rotation.x = Math.PI / 2
          g.add(spike)
        }
      } else {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2
          const flange = box(0.03, 0.18, 0.07, fancy ? goldTrim() : steel(), Math.cos(a) * 0.05, -0.6, Math.sin(a) * 0.05)
          flange.rotation.y = -a
          g.add(flange)
        }
        g.add(cyl(0.03, 0.03, 0.2, darkSteel(), 0, -0.6, 0))
      }
      break
    }
    case "spear": {
      g.add(cyl(0.014, 0.016, 2.0, wood(), 0, -0.7, 0))
      const tip = blade(0.32, 0.06, 0.01, steel())
      tip.position.y = -1.68
      g.add(tip)
      if (tier >= 3) g.add(box(0.16, 0.04, 0.02, darkSteel(), 0, -1.7, 0))
      g.add(cyl(0.02, 0.02, 0.06, darkSteel(), 0, -1.66, 0))
      break
    }
    case "dagger": {
      g.add(cyl(0.013, 0.015, 0.11, leatherWrap(), 0, 0.05, 0))
      g.add(box(0.08, 0.02, 0.025, guardMat, 0, -0.01, 0))
      const b = blade(0.32, 0.04, 0.008, fancy ? darkSteel() : steel())
      b.position.y = -0.02
      g.add(b)
      break
    }
    case "bow": {
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.75, 0), new THREE.Vector3(0, 0, 0.16), new THREE.Vector3(0, -0.75, 0))
      const limb = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.016, 6, false), wood())
      limb.castShadow = true
      g.add(limb)
      const string = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 1.46, 4), mat(null, { color: 0xdddddd }))
      string.position.set(0, 0, -0.02)
      g.add(string)
      g.add(cyl(0.02, 0.02, 0.16, leatherWrap(), 0, 0, 0.08))
      g.rotation.z = Math.PI / 2
      g.rotation.y = Math.PI / 2
      const wrap = new THREE.Group()
      wrap.add(g)
      // Re-orient: the bow stands vertically in the left hand.
      g.rotation.set(0, 0, 0)
      g.position.set(0, 0, 0.05)
      return wrap
    }
    case "crossbow": {
      g.add(box(0.05, 0.08, 0.7, wood(), 0, 0, -0.25))
      g.add(box(0.76, 0.03, 0.04, tier >= 3 ? darkSteel() : wood(), 0, 0.02, -0.5))
      const string = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.004, 0.004), mat(null, { color: 0xdddddd }))
      string.position.set(0, 0.03, -0.44)
      g.add(string)
      g.add(box(0.04, 0.1, 0.12, darkSteel(), 0, 0.0, 0.0))
      g.add(box(0.03, 0.04, 0.02, steel(), 0, 0.06, -0.62))
      // Held horizontally: rotate so the stock lies along the forearm.
      g.rotation.x = -Math.PI / 2
      g.position.set(0, -0.1, 0.1)
      const wrap = new THREE.Group()
      wrap.add(g)
      return wrap
    }
    case "shield": {
      return buildShield(tierStr ?? "round")
    }
    default: {
      g.add(box(0.05, 0.6, 0.05, wood(), 0, -0.25, 0))
    }
  }
  return g
}

export function buildShield(kind: string): THREE.Group {
  const g = new THREE.Group()
  const planks = mat("planks", { color: 0xc8b090 })
  const rim = M.metalDark()
  if (kind === "round" || kind === "shield_round") {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 20), planks)
    disc.rotation.x = Math.PI / 2
    g.add(disc)
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), rim)
    boss.position.z = 0.03
    g.add(boss)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.015, 6, 24), rim)
    g.add(ring)
  } else if (kind === "kite" || kind === "shield_kite") {
    const shape = new THREE.Shape()
    shape.moveTo(-0.28, 0.3)
    shape.quadraticCurveTo(0, 0.42, 0.28, 0.3)
    shape.lineTo(0.22, -0.1)
    shape.quadraticCurveTo(0.05, -0.5, 0, -0.56)
    shape.quadraticCurveTo(-0.05, -0.5, -0.22, -0.1)
    shape.closePath()
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01 })
    const body = new THREE.Mesh(geo, mat("planks", { color: 0x8a4a3a }))
    g.add(body)
    g.add(box(0.06, 0.5, 0.05, rim, 0, -0.05, 0.03))
    g.add(box(0.5, 0.06, 0.05, rim, 0, 0.1, 0.03))
  } else if (kind === "heater" || kind === "shield_heater") {
    const shape = new THREE.Shape()
    shape.moveTo(-0.3, 0.32)
    shape.lineTo(0.3, 0.32)
    shape.lineTo(0.3, 0.05)
    shape.quadraticCurveTo(0.25, -0.35, 0, -0.5)
    shape.quadraticCurveTo(-0.25, -0.35, -0.3, 0.05)
    shape.closePath()
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01 })
    g.add(new THREE.Mesh(geo, mat("metal", { color: 0x3a4a8a, metalness: 0.5, roughness: 0.5 })))
    const emblem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 12), M.gold())
    emblem.rotation.x = Math.PI / 2
    emblem.position.set(0, 0, 0.05)
    g.add(emblem)
  } else {
    // tower
    g.add(box(0.6, 1.0, 0.05, mat("metal", { color: 0x6a6a72, metalness: 0.6, roughness: 0.5 })))
    g.add(box(0.64, 0.06, 0.07, rim, 0, 0.5, 0))
    g.add(box(0.64, 0.06, 0.07, rim, 0, -0.5, 0))
    g.add(box(0.06, 1.0, 0.07, rim, -0.3, 0, 0))
    g.add(box(0.06, 1.0, 0.07, rim, 0.3, 0, 0))
    g.add(box(0.08, 0.5, 0.03, M.gold(), 0, 0, 0.04))
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true
  })
  return g
}

/** Arrow / bolt projectile mesh. */
export function buildProjectile(kind: "arrow" | "bolt"): THREE.Group {
  const g = new THREE.Group()
  const len = kind === "arrow" ? 0.75 : 0.45
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, len, 5), mat(null, { color: 0x8a6a40 }))
  shaft.rotation.x = Math.PI / 2
  g.add(shaft)
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.06, 5), M.metalDark())
  tip.rotation.x = Math.PI / 2
  tip.position.z = len / 2 + 0.03
  g.add(tip)
  const fl = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.002, 0.08), mat(null, { color: 0xdddddd, side: THREE.DoubleSide }))
  fl.position.z = -len / 2 + 0.05
  g.add(fl)
  const fl2 = fl.clone()
  fl2.rotation.z = Math.PI / 2
  g.add(fl2)
  return g
}
