import { chromium } from 'playwright'

const URL = 'http://localhost:5173/?mobile=1'
const OUT = 'C:/Users/Roberto/sorcery-simulator/tmp_shots'
import { mkdirSync } from 'node:fs'
mkdirSync(OUT, { recursive: true })

const rect = (el) => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  return { w: Math.round(r.width), h: Math.round(r.height), transform: cs.transform, position: cs.position }
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE ERR:', m.text().slice(0, 160)) })

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

// ---- Home / frame proportions + overflow check ----
await page.screenshot({ path: `${OUT}/1_home_top.png` })
const home = await page.evaluate(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { w: Math.round(b.width), left: Math.round(b.left), right: Math.round(b.right) } }
  const frame = document.querySelector('.app.mobile-sim').getBoundingClientRect()
  const overflow = []
  for (const el of document.querySelectorAll('.home select, .home input, .home .online-actions, .home .joincode, .home button, .home .panel')) {
    const b = el.getBoundingClientRect()
    if (b.width > 0 && (b.right > frame.right + 1 || b.left < frame.left - 1)) {
      overflow.push({ el: el.className || el.tagName, right: Math.round(b.right), frameRight: Math.round(frame.right), w: Math.round(b.width) })
    }
  }
  return { frame: { w: Math.round(frame.width), right: Math.round(frame.right) }, overflow }
})
console.log('FRAME:', JSON.stringify(home.frame))
console.log('OVERFLOW (elements past the frame edge):', JSON.stringify(home.overflow, null, 1))
// scroll to the online / deck section and shoot it
await page.locator('.online-actions').scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {})
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/1b_home_online.png` })

// ---- pick decks in every <select>, start vs Computer ----
const selects = await page.$$('select')
for (const s of selects) {
  const val = await s.evaluate((el) => {
    const opt = [...el.options].find((o) => o.value)
    if (opt) { el.value = opt.value; el.dispatchEvent(new Event('change', { bubbles: true })) }
    return opt?.value ?? null
  })
  void val
}
await page.waitForTimeout(400)
const startBtn = page.getByRole('button', { name: /Start game vs Computer/i })
await startBtn.click({ timeout: 5000 }).catch(() => console.log('start click failed'))

// ---- wait for the board, get past mulligan + first site, screenshot the game ----
await page.waitForSelector('.board', { timeout: 15000 }).catch(() => console.log('no .board'))
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/2_mulligan.png` })
// ---- POINTER-DRAG the mulligan modal (touch-drag parity) ----
const dragged = await page.evaluate(async () => {
  const modal = document.querySelector('.modal')
  const handle = document.querySelector('.modal .draghandle')
  if (!modal || !handle) return { ok: false, reason: 'no modal/handle' }
  const before = modal.getBoundingClientRect()
  const b = handle.getBoundingClientRect()
  const sx = b.left + b.width / 2, sy = b.top + b.height / 2
  const fire = (type, x, y, target) => target.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerId: 1 }))
  fire('pointerdown', sx, sy, handle)
  fire('pointermove', sx + 90, sy + 60, window)
  fire('pointerup', sx + 90, sy + 60, window)
  await new Promise((r) => setTimeout(r, 60))
  const after = modal.getBoundingClientRect()
  return { ok: true, dx: Math.round(after.left - before.left), dy: Math.round(after.top - before.top) }
})
console.log('MULLIGAN POINTER-DRAG:', JSON.stringify(dragged))
// keep hand
await page.getByRole('button', { name: /Keep hand/i }).click({ timeout: 4000 }).catch(() => console.log('no keep-hand'))
await page.waitForTimeout(1000)
// dismiss opponent-played popups + answer trivial prompts a few times to reach a board
for (let i = 0; i < 12; i++) {
  await page.locator('.oppplay-continue').first().click({ timeout: 400 }).catch(() => {})
  await page.getByRole('button', { name: /Spellbook \(spells\)/i }).click({ timeout: 300 }).catch(() => {})
  await page.locator('.modal .handcard').first().click({ timeout: 300 }).catch(() => {}) // play first site
  await page.waitForTimeout(400)
}
await page.waitForTimeout(800)
await page.screenshot({ path: `${OUT}/3_board.png` })

console.log('left menu buttons:', await page.locator('.m-leftmenu button').count())
console.log('bot FAST button (⏩):', await page.locator('.m-leftmenu button[title*="automatically"]').count())
console.log('bot SLOW button (step):', await page.locator('.m-leftmenu button[title*="Step through"], .m-leftmenu button[title*="Next computer"]').count())
console.log('topbar player bars:', await page.locator('.game.mobile .topbar .playerbar').count())
console.log('hand button:', await page.locator('.m-hand-btn').count())

// open the LOG overlay via the 📜 icon
await page.locator('.m-leftmenu button[title="Log"]').click({ timeout: 2000 }).catch(() => console.log('no log btn'))
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/7_logs.png` })
console.log('log overlay open?', await page.locator('.m-logs').count())
await page.locator('.m-logs-head button').click({ timeout: 1500 }).catch(() => {})

// open the EDITOR via the ✎ icon
await page.locator('.m-leftmenu button[title="Editor"]').click({ timeout: 2000 }).catch(() => console.log('no editor btn'))
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/8_editor.png` })
const jp = await page.evaluate(() => { const e = document.querySelector('.judgepanel'); if (!e) return null; const b = e.getBoundingClientRect(); const f = document.querySelector('.app.mobile-sim').getBoundingClientRect(); return { right: Math.round(b.right), frameRight: Math.round(f.right), inside: b.right <= f.right + 1 } })
console.log('editor inside frame?', JSON.stringify(jp))
// open the hand overlay
await page.locator('.handtoggle').click({ timeout: 3000 }).catch(() => console.log('no hand toggle'))
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/4_hand.png` })

const game = await page.evaluate(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); const c = getComputedStyle(el); return { w: Math.round(b.width), h: Math.round(b.height), transform: c.transform, position: c.position } }
  return {
    sim: r(document.querySelector('.app.mobile-sim')),
    gameMobile: r(document.querySelector('.game.mobile')),
    table: r(document.querySelector('.game.mobile .table')),
    board: r(document.querySelector('.board')),
    square: r(document.querySelector('.square')),
    sidebar: r(document.querySelector('.game.mobile .sidebar')),
    rail: r(document.querySelector('.game.mobile .playerbar')),
  }
})
console.log('GAME:', JSON.stringify(game, null, 2))

await browser.close()
console.log('screenshots →', OUT)
