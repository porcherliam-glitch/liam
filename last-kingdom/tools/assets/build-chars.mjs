// Builds the character model set for the game from the CC0 Quaternius packs (outfits, base characters, animation library).
import { createRequire } from "node:module"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
const T = "/tmp/claude-0/-home-user-liam/b7f5794e-732f-50f1-abcb-653357a58dac/scratchpad/tools/node_modules/"
const require = createRequire(T)
const { NodeIO } = require("@gltf-transform/core")
const { ALL_EXTENSIONS, EXTMeshoptCompression } = require("@gltf-transform/extensions")
const F = require("@gltf-transform/functions")
const { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } = require("meshoptimizer")
const sharp = require("sharp")

const ST = "/tmp/claude-0/-home-user-liam/b7f5794e-732f-50f1-abcb-653357a58dac/scratchpad/assets-staging/"
const OUTFITS = ST + "outfits/x/Modular Character Outfits - Fantasy[Standard]/Exports/glTF (Godot-Unreal)/Outfits/"
const OUTFIT_TEX = ST + "outfits/x/Modular Character Outfits - Fantasy[Standard]/Textures/"
const BASE = ST + "base-characters/raw/extracted/Universal Base Characters[Standard]/"
const OUT = process.argv[2] ?? "/home/user/liam/last-kingdom/public/models/"
mkdirSync(OUT, { recursive: true })

await MeshoptEncoder.ready
await MeshoptDecoder.ready
await MeshoptSimplifier.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder })

const report = []
async function finish(doc, name, opts = {}) {
  const tex = opts.textureSize ?? 512
  await doc.transform(
    F.dedup(),
    F.prune({ keepAttributes: false }),
    F.weld(),
    ...(opts.simplify ? [F.simplify({ simplifier: MeshoptSimplifier, ratio: opts.simplify, error: opts.error ?? 0.006, lockBorder: false })] : []),
    F.textureCompress({ encoder: sharp, targetFormat: "webp", resize: [tex, tex], quality: 82 }),
    // Positions stay float: quantising them gives every skinned mesh its own skin (compensated bind matrices),
    // which breaks skeleton sharing and merging at runtime
    F.quantize({ pattern: /^(NORMAL|TEXCOORD_\d|TANGENT)$/, quantizeNormal: 10, quantizeTexcoord: 12 }),
  )
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })
  const file = join(OUT, name + ".glb")
  await io.write(file, doc)
  const bytes = (await io.writeBinary(doc)).byteLength
  let tris = 0
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3
  report.push({ name, kb: Math.round(bytes / 1024), tris, anims: doc.getRoot().listAnimations().length })
}

// --- outfits: one file per outfit, all parts as separate meshes on one skeleton
for (const o of ["Male_Peasant", "Female_Peasant", "Male_Ranger", "Female_Ranger"]) {
  const doc = await io.read(OUTFITS + o + ".gltf")
  await finish(doc, "outfit_" + o.toLowerCase(), { simplify: 0.4, error: 0.008, textureSize: 512 })
}

// --- heads: keep triangles whose vertices belong mostly to the neck/head bones (plus eyes and brows)
for (const [src, name] of [["Superhero_Male_FullBody", "head_male"], ["Superhero_Female_FullBody", "head_female"]]) {
  const doc = await io.read(BASE + "Base Characters/Godot - UE/" + src + ".gltf")
  const skin = doc.getRoot().listSkins()[0]
  const joints = skin.listJoints().map((j) => j.getName())
  const keep = new Set(["neck_01", "Head"].map((n) => joints.indexOf(n)))
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION")
      if (pos.getCount() < 2000) continue // eyes and brows stay whole
      const J = prim.getAttribute("JOINTS_0")
      const W = prim.getAttribute("WEIGHTS_0")
      const idx = prim.getIndices()
      const headVert = new Uint8Array(pos.getCount())
      const j = [0, 0, 0, 0]
      const w = [0, 0, 0, 0]
      for (let v = 0; v < pos.getCount(); v++) {
        J.getElement(v, j)
        W.getElement(v, w)
        let hw = 0
        for (let k = 0; k < 4; k++) if (keep.has(j[k])) hw += w[k]
        headVert[v] = hw > 0.5 ? 1 : 0
      }
      const out = []
      for (let t = 0; t < idx.getCount(); t += 3) {
        const a = idx.getScalar(t), b = idx.getScalar(t + 1), c = idx.getScalar(t + 2)
        if (headVert[a] && headVert[b] && headVert[c]) out.push(a, b, c)
      }
      idx.setArray(new Uint32Array(out))
      mesh.setName(name)
    }
  }
  await doc.transform(F.compactPrimitive ? ((d) => { for (const m of d.getRoot().listMeshes()) for (const p of m.listPrimitives()) F.compactPrimitive(p) }) : (() => {}))
  await finish(doc, name, { textureSize: 512, simplify: 0.55, error: 0.004 })
}

// --- hair rigged to the head bone
for (const h of ["Hair_Beard", "Hair_Buzzed", "Hair_SimpleParted", "Hair_Long", "Hair_Buns", "Eyebrows_Regular", "Eyebrows_Female"]) {
  const doc = await io.read(BASE + "Hairstyles/Rigged to Head Bone/glTF (Godot -Unreal)/" + h + ".gltf")
  await finish(doc, "hair_" + h.toLowerCase().replace(/^hair_/, ""), { textureSize: 256 })
}

// --- animation library: skeleton + clips only, rotations for all bones, translation only for root and pelvis
{
  const { readdirSync } = await import("node:fs")
  const findUal = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) { const r = findUal(p); if (r) return r }
      else if (e.name === "UAL1_Standard.glb" && /Unreal|Godot/i.test(p)) return p
    }
    return null
  }
  const ual = findUal(ST + "animation-library/raw")
  const doc = await io.read(ual)
  // Swim_Fwd_Loop stays: flat on the ground it is the crawl of legless zombies
  const drop = /^(Driving|Swim_Idle|Dance|Sitting_Talking|Idle_Talking|A_TPose|Push_Loop|Fixing)/
  for (const anim of doc.getRoot().listAnimations()) {
    if (drop.test(anim.getName())) { anim.dispose(); continue }
    for (const ch of anim.listChannels()) {
      const path = ch.getTargetPath()
      const node = ch.getTargetNode()?.getName() ?? ""
      if (path === "scale" || (path === "translation" && node !== "pelvis" && node !== "root")) {
        const s = ch.getSampler()
        ch.dispose()
        s?.dispose()
      }
    }
  }
  for (const node of doc.getRoot().listNodes()) if (node.getMesh()) { node.getMesh().dispose(); node.setMesh(null); node.setSkin(null) }
  await doc.transform(F.resample(), F.prune())
  await finish(doc, "anims_ual", { textureSize: 64 })
}

// --- extra outfit colour variants as standalone textures
for (const [file, name] of [["Peasant/T_Peasant_2_BaseColor.png", "tex_peasant_2"], ["Ranger/T_Ranger_3_BaseColor.png", "tex_ranger_3"]]) {
  await sharp(OUTFIT_TEX + file).resize(512, 512).webp({ quality: 82 }).toFile(join(OUT, name + ".webp"))
  report.push({ name, kb: Math.round((await import("node:fs")).statSync(join(OUT, name + ".webp")).size / 1024) })
}
console.table(report)
writeFileSync(join(OUT, "..", "..", "..", "models-report.json"), JSON.stringify(report, null, 1))
