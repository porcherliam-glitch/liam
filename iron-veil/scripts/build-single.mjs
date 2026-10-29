// Inlines the Vite build (dist/index.html + its JS and CSS) into one self-contained HTML file
// that can be opened by double-click (file://) without a web server.
import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = fileURLToPath(new URL("../", import.meta.url))
const DIST = join(ROOT, "dist")
const OUT = join(ROOT, "OperationIronVeil.html")

let html = await readFile(join(DIST, "index.html"), "utf8")
const scripts = [...html.matchAll(/<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/g)]
const styles = [...html.matchAll(/<link rel="stylesheet" crossorigin href="\.\/([^"]+)">/g)]
if (scripts.length !== 1) throw new Error(`build-single: expected 1 module script, found ${scripts.length}`)
for (const [tag, file] of styles) {
  const css = await readFile(join(DIST, file), "utf8")
  html = html.replace(tag, () => `<style>\n${css}\n</style>`)
}
for (const [tag, file] of scripts) {
  // "</script" inside the bundle would end the inline element early
  const js = (await readFile(join(DIST, file), "utf8")).replace(/<\/script/gi, "<\\/script")
  html = html.replace(tag, "")
  html = html.replace("</body>", () => `<script type="module">\n${js}\n</script>\n</body>`)
}
html = html.replace(/<link rel="modulepreload"[^>]*>/g, "")
if (/(src|href)="\.\/assets\//.test(html)) throw new Error("build-single: unresolved asset reference left in HTML")
await writeFile(OUT, html)
console.log(`build-single: ${OUT} (${Math.round(html.length / 1024)} KB)`)
