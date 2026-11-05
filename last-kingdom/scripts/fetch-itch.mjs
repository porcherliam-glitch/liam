// Downloads every file of a free ("pay what you want") itch.io project through its public download flow.
// Usage: node scripts/fetch-itch.mjs <project-url> <out-dir>   (e.g. https://quaternius.itch.io/lowpoly-animated-knight)
// Only use it for assets whose page states a licence that allows redistribution (CC0 etc.) and record the licence.
import { mkdirSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const [url, outDir] = [process.argv[2], process.argv[3] ?? "."]
if (!url) { console.error("usage: fetch-itch.mjs <project-url> <out-dir>"); process.exit(2) }
mkdirSync(outDir, { recursive: true })
let cookie = ""
const jar = (res) => { const c = res.headers.get("set-cookie"); if (c) cookie = c.split(",").map((s) => s.split(";")[0]).join("; ") }
const get = async (u) => { const r = await fetch(u, { headers: { cookie } }); jar(r); return r }
const page = await get(url)
const html = await page.text()
const csrf = (html.match(/csrf_token" value="([^"]+)"/) ?? [])[1]
if (!csrf) throw new Error("no csrf token on " + url)
const licence = (html.match(/creativecommons\.org\/[^"']+/) ?? [])[0] ?? "(no creative commons link found)"
const post = async (u) => {
  const r = await fetch(u, { method: "POST", headers: { cookie, accept: "application/json", "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrf_token: csrf }) })
  jar(r)
  return r.json()
}
const dl = await post(url.replace(/\/$/, "") + "/download_url")
if (!dl.url) throw new Error("download_url failed: " + JSON.stringify(dl))
const list = await (await get(dl.url)).text()
const ids = [...new Set([...list.matchAll(/data-upload_id="(\d+)"/g)].map((m) => m[1]))]
const names = [...list.matchAll(/<strong class="name" title="([^"]+)"/g)].map((m) => m[1])
const sizes = [...list.matchAll(/<span class="file_size">\s*<span>([^<]+)<\/span>/g)].map((m) => m[1])
console.log(`${url}\n  licence link: ${licence}\n  uploads: ${ids.length}`)
const manifest = { url, licence, files: [] }
for (let i = 0; i < ids.length; i++) {
  const name = names[i] ?? `upload-${ids[i]}`
  const target = join(outDir, name)
  console.log(`  [${i}] ${name} (${sizes[i] ?? "?"})`)
  if (existsSync(target)) { console.log("      already there"); manifest.files.push({ name, size: sizes[i] }); continue }
  const f = await post(`${url.replace(/\/$/, "")}/file/${ids[i]}?source=view_game&as_props=1`)
  if (!f.url) { console.log("      no url:", JSON.stringify(f)); continue }
  const r = await fetch(f.url)
  if (!r.ok) { console.log("      download failed", r.status); continue }
  writeFileSync(target, Buffer.from(await r.arrayBuffer()))
  console.log("      saved")
  manifest.files.push({ name, size: sizes[i] })
}
writeFileSync(join(outDir, "itch-manifest.json"), JSON.stringify(manifest, null, 2))
