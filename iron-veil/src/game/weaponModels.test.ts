import * as THREE from "three"
import { describe, expect, it } from "vitest"
import { ITEM_IDS } from "./items"
import { ATTACHMENTS, ATTACHMENT_ORDER, WEAPONS, WEAPON_ORDER, canAttach, type AttachmentSlot, type WeaponMods } from "./weaponData"
import { buildHandItem, buildWeaponRig, weaponWorldModel } from "./weaponModels"
import { hasIcon } from "./icons"

const meshes = (o: THREE.Object3D) => { let n = 0; o.traverse(c => { if (c instanceof THREE.Mesh) n++ }); return n }
const world = (o: THREE.Object3D) => { o.updateWorldMatrix(true, false); return o.getWorldPosition(new THREE.Vector3()) }

/** No attachments, each fitting attachment on its own, and a full kit (first option per slot, then last). */
function combos(id: (typeof WEAPON_ORDER)[number]): WeaponMods[] {
  const out: WeaponMods[] = [{}], first: WeaponMods = {}, last: WeaponMods = {}
  for (const slot of WEAPONS[id].slots) {
    const opts = ATTACHMENT_ORDER.filter(a => ATTACHMENTS[a].slot === slot && canAttach(id, a))
    for (const a of opts) out.push({ [slot as AttachmentSlot]: a })
    if (opts.length) { (first as Record<string, string>)[slot] = opts[0]; (last as Record<string, string>)[slot] = opts[opts.length - 1] }
  }
  if (Object.keys(first).length) out.push(first, last)
  return out
}

describe("weapon rigs", () => {
  it("builds all 15 weapons with every attachment combination in Node", () => {
    for (const id of WEAPON_ORDER) {
      for (const mods of combos(id)) {
        const rig = buildWeaponRig(id, mods)
        expect(rig.anchors.grip, `${id} grip`).toBeTruthy()
        // modest mesh budget (arms add 10 in the viewmodel)
        expect(meshes(rig.group), `${id} ${JSON.stringify(mods)}`).toBeLessThan(30)
        if (WEAPONS[id].cls !== "melee") {
          expect(rig.anchors.support, `${id} support`).toBeTruthy()
          expect(rig.spec.action).not.toBe("melee")
        }
      }
    }
  }, 60000)

  it("puts the sight marks on the sight line (irons, optics, built-in scopes)", () => {
    for (const id of WEAPON_ORDER) {
      if (WEAPONS[id].cls === "melee") continue
      for (const mods of combos(id)) {
        const rig = buildWeaponRig(id, mods)
        const names = mods.optic ? ["reticle"] : rig.marks.reticle ? ["reticle", "objective"] : ["front", "rear"]
        for (const n of names) {
          const p = world(rig.marks[n])
          expect(Math.abs(p.x), `${id} ${n} x`).toBeLessThan(1e-6)
          expect(Math.abs(p.y - rig.sightY), `${id} ${JSON.stringify(mods)} ${n} y`).toBeLessThan(1e-6)
        }
      }
    }
  }, 60000)

  it("moves the muzzle forward with a suppressor or compensator", () => {
    for (const id of WEAPON_ORDER) {
      if (!canAttach(id, "att_suppressor")) continue
      const bare = world(buildWeaponRig(id, {}).muzzle).z
      const sup = buildWeaponRig(id, { muzzle: "att_suppressor" })
      expect(world(sup.muzzle).z, id).toBeLessThan(bare - 0.05)
      expect(sup.suppressed).toBe(true)
      if (canAttach(id, "att_comp")) expect(buildWeaponRig(id, { muzzle: "att_comp" }).brake).toBe(true)
    }
  })

  it("raises the sight line for optics and ignores attachments that do not fit", () => {
    const iron = buildWeaponRig("mk4", {}), dot = buildWeaponRig("mk4", { optic: "att_reddot" }), scope = buildWeaponRig("mk4", { optic: "att_scope4x" })
    expect(dot.sightY).toBeGreaterThan(iron.sightY); expect(dot.sight).toBe("reddot"); expect(scope.sight).toBe("scope")
    expect(buildWeaponRig("p9", { optic: "att_reddot" }).sight).toBe("iron")
    expect(buildWeaponRig("dr7", {}).marks.reticle).toBeTruthy()
  })

  it("world models are centred on the grip and real size", () => {
    for (const id of WEAPON_ORDER) {
      const m = weaponWorldModel(id)
      const box = new THREE.Box3().setFromObject(m)
      const len = box.max.z - box.min.z
      expect(box.containsPoint(new THREE.Vector3()), id).toBe(true)
      expect(len, id).toBeGreaterThan(id === "knife" ? 0.25 : 0.18)
      expect(len, id).toBeLessThan(1.5)
    }
  })

  it("has hand-held models for usable items and an icon for every item", () => {
    for (const id of ["bandage", "medkit", "painkiller", "antiviral", "stim", "canned", "mre", "water", "soda", "grenade", "molotov"]) expect(meshes(buildHandItem(id).group), id).toBeGreaterThan(0)
    for (const id of ITEM_IDS) expect(hasIcon(id), id).toBe(true)
  })
})
