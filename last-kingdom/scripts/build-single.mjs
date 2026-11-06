// Inlines the Vite build (dist/index.html + JS + CSS) into one self-contained HTML file that opens by double-click.
import { readFile, writeFile, readdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("../", import.meta.url))
const DIST = join(ROOT, "dist")
const OUT = join(ROOT, "TheLastKingdom.html")

let html = await readFile(join(DIST, "index.html"), "utf8")
const scripts = [...html.matchAll(/<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/g)]
const styles = [...html.matchAll(/<link rel="stylesheet" crossorigin href="\.\/([^"]+)">/g)]
if (scripts.length !== 1) throw new Error(`build-single: expected 1 module script, found ${scripts.length}`)
for (const [tag, file] of styles) {
  const css = await readFile(join(DIST, file), "utf8")
  html = html.replace(tag, () => `<style>\n${css}\n</style>`)
}
for (const [tag, file] of scripts) {
  const js = (await readFile(join(DIST, file), "utf8")).replace(/<\/script/gi, "<\\/script")
  html = html.replace(tag, "")
  html = html.replace("</body>", () => `<script type="module">\n${js}\n</script>\n</body>`)
}
html = html.replace(/<link rel="modulepreload"[^>]*>/g, "")
// Models (public/models/*.glb) are embedded as base64 so the single file still finds them (see src/render/assets.ts).
const modelsDir = join(DIST, "models")
let embedded = 0
let embeddedBytes = 0
if (existsSync(modelsDir)) {
  const map = {}
  for (const file of (await readdir(modelsDir)).filter((f) => f.endsWith(".glb") || f.endsWith(".webp")).sort()) {
    const buf = await readFile(join(modelsDir, file))
    const mime = file.endsWith(".webp") ? "image/webp" : "model/gltf-binary"
    map[file.replace(/\.(glb|webp)$/, "")] = `data:${mime};base64,${buf.toString("base64")}`
    embedded++
    embeddedBytes += buf.length
  }
  if (embedded) html = html.replace("</head>", () => `<script>window.__LK_MODELS=${JSON.stringify(map)}</script>\n</head>`)
}
if (/(src|href)="\.\/assets\//.test(html)) throw new Error("build-single: unresolved asset reference left in HTML")
await writeFile(OUT, html)
console.log(`build-single: ${OUT} (${Math.round(html.length / 1024)} KB, ${embedded} Modelle / ${Math.round(embeddedBytes / 1024)} KB eingebettet)`)
