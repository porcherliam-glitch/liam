// Packs selected CC0 props (Quaternius Fantasy Props MegaKit) into one GLB: one node per prop, shared textures once.
import { createRequire } from "node:module"
import { join } from "node:path"
const T = "/tmp/claude-0/-home-user-liam/b7f5794e-732f-50f1-abcb-653357a58dac/scratchpad/tools/node_modules/"
const require = createRequire(T)
const { NodeIO, Document } = require("@gltf-transform/core")
const { ALL_EXTENSIONS, EXTMeshoptCompression } = require("@gltf-transform/extensions")
const F = require("@gltf-transform/functions")
const { MeshoptEncoder, MeshoptDecoder } = require("meshoptimizer")
const sharp = require("sharp")
await MeshoptEncoder.ready
await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder })
const [srcDir, outFile, ...names] = process.argv.slice(2)
const target = new Document()
target.createBuffer()
const scene = target.createScene("props")
for (const name of names) {
  const doc = await io.read(join(srcDir, name + ".gltf"))
  // Wrap each source scene in one named node, then merge into the target
  const s = doc.getRoot().listScenes()[0]
  const wrap = doc.createNode(name)
  for (const child of s.listChildren()) { s.removeChild(child); wrap.addChild(child) }
  s.addChild(wrap)
  const map = F.mergeDocuments(target, doc)
  const merged = map.get(s)
  for (const c of merged.listChildren()) scene.addChild(c)
  merged.dispose()
}
// one buffer only
const buffer = target.getRoot().listBuffers()[0]
for (const a of target.getRoot().listAccessors()) a.setBuffer(buffer)
for (const b of target.getRoot().listBuffers()) if (b !== buffer) b.dispose()
await target.transform(
  F.dedup(),
  F.prune(),
  F.weld(),
  F.textureCompress({ encoder: sharp, targetFormat: "webp", resize: [512, 512], quality: 80 }),
)
target.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER })
await io.write(outFile, target)
let tris = 0
for (const m of target.getRoot().listMeshes()) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? 0) / 3
console.log(outFile, "nodes", scene.listChildren().map((n) => n.getName()).join(","), "tris", tris, "textures", target.getRoot().listTextures().length)
