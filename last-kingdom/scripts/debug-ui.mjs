import { openGame } from "./browser-lib.mjs"
const g = await openGame()
try {
  await g.click("characters")
  await g.click("new")
  await g.click("create")
  await g.click("inventory")
  const info = await g.page.evaluate(() => {
    const el = document.querySelector(".screen-inventory")
    const r = el?.getBoundingClientRect()
    const lay = el?.querySelector(".inv-layout")
    const lr = lay?.getBoundingClientRect()
    return { exists: !!el, rect: r && [r.x, r.y, r.width, r.height], layout: lr && [lr.x, lr.y, lr.width, lr.height], html: el?.innerHTML.slice(0, 300), classes: document.body.className, display: el ? getComputedStyle(el).display : null, tiles: el?.querySelectorAll(".tile").length }
  })
  console.log(JSON.stringify(info, null, 1))
  await g.shot("dbg-inventory.png")
  await g.page.keyboard.press("Escape")
  await g.page.waitForTimeout(200)
  console.log("after esc:", (await g.snapshot()).screen)
} finally {
  await g.close()
}
