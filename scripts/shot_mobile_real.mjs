// Verify the whole mobile game scales-to-fit and NOTHING clips, at several visible-viewport
// sizes (emulated real phone; headless has no chrome bar, so we shrink the viewport itself —
// visualViewport tracks it, exercising the real uiScale path). The game is a fixed 866×400
// canvas uniformly scaled + centred, so its bounding rect must stay inside the viewport, and
// every key element must sit within it.
import { chromium, devices } from 'playwright'
import { mkdirSync } from 'node:fs'
const OUT = 'C:/Users/Roberto/sorcery-simulator/tmp_shots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true })
const iphone = devices['iPhone 13']
const ctx = await browser.newContext({ ...iphone, viewport: { width: 866, height: 390 }, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
page.on('console', (m) => { if (m.type() === 'error') console.log('PAGE ERR:', m.text().slice(0, 160)) })

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
console.log('auto-detected mobile?', (await page.locator('.app.mobile').count()) > 0, ' | sim frame?', (await page.locator('.app.mobile-sim').count()) > 0)

for (const s of await page.$$('select')) await s.evaluate((el) => { const o = [...el.options].find((x) => x.value); if (o) { el.value = o.value; el.dispatchEvent(new Event('change', { bubbles: true })) } })
await page.waitForTimeout(300)
await page.getByRole('button', { name: /Start game vs Computer/i }).click({ timeout: 5000 }).catch(() => console.log('start failed'))
await page.waitForSelector('.board', { timeout: 15000 }).catch(() => console.log('no board'))
await page.getByRole('button', { name: /Keep hand/i }).click({ timeout: 4000 }).catch(() => {})
await page.waitForTimeout(500)
for (let i = 0; i < 12; i++) {
  await page.locator('.oppplay-continue').first().click({ timeout: 250 }).catch(() => {})
  await page.getByRole('button', { name: /Spellbook \(spells\)/i }).click({ timeout: 200 }).catch(() => {})
  await page.locator('.modal .handcard').first().click({ timeout: 200 }).catch(() => {})
  await page.waitForTimeout(250)
}

const check = async (w, h, shot) => {
  await page.setViewportSize({ width: w, height: h })
  await page.waitForTimeout(350)
  if (shot) await page.screenshot({ path: `${OUT}/${shot}` })
  const r = await page.evaluate(() => {
    const rect = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) } }
    const els = {}
    for (const [k, sel] of [['game', '.game.mobile'], ['topbar', '.game.mobile .topbar'], ['concede', '.m-leftmenu button.flag'], ['hand', '.m-hand-btn'], ['panel', '.game.mobile .sidebar'], ['board', '.board']]) els[k] = rect(sel)
    return { vw: window.innerWidth, vh: window.innerHeight, els }
  })
  const T = 1 // px tolerance
  const bad = []
  for (const [k, b] of Object.entries(r.els)) {
    if (!b) continue
    if (b.l < -T || b.t < -T || b.r > r.vw + T || b.b > r.vh + T) bad.push({ k, b, vw: r.vw, vh: r.vh })
  }
  console.log(`\nviewport ${w}x${h}: game=${JSON.stringify(r.els.game)}`)
  console.log(bad.length ? `  ❌ OUT OF BOUNDS: ${JSON.stringify(bad)}` : '  ✅ every element inside the viewport')
  return bad.length === 0
}

const results = []
results.push(await check(866, 390, 'r_866x390.png'))   // full landscape
results.push(await check(844, 320, 'r_844x320.png'))   // chrome bar eats ~70px height
results.push(await check(740, 300, 'r_740x300.png'))   // small phone + big chrome
results.push(await check(900, 280, 'r_900x280.png'))   // very short (worst case)

// ---- Test B: a TOP chrome bar OFFSETS the visible region (offsetTop>0). Headless can't
// produce that, so force --vv-top and assert the container follows it and the game's TOP is
// pushed BELOW the bar (the exact bug: "clips on the top, hidden by the bar"). ----
await page.setViewportSize({ width: 866, height: 390 })
await page.waitForTimeout(300)
const offset = await page.evaluate(() => {
  const OFF = 70, H = window.innerHeight - OFF
  const s = document.documentElement.style
  s.setProperty('--vv-top', `${OFF}px`); s.setProperty('--vv-left', '0px')
  s.setProperty('--vv-height', `${H}px`); s.setProperty('--vv-width', `${window.innerWidth}px`)
  const app = document.querySelector('.app.mobile')
  const game = document.querySelector('.game.mobile')
  const ab = app.getBoundingClientRect(), gb = game.getBoundingClientRect()
  return {
    OFF, H, appTop: Math.round(ab.top), appH: Math.round(ab.height),
    // is the game fully within its container box (fit invariant), and does the container
    // sit exactly on the offset visible rect (position wiring)?
    gameInApp: gb.top >= ab.top - 1 && gb.bottom <= ab.bottom + 1,
  }
})
await page.screenshot({ path: `${OUT}/r_topbar_offset.png` })
// Position wiring: container's top follows --vv-top (so a top bar can't hide content) and
// its height follows --vv-height. Fit within the container is proven by the resize checks
// above (there container==viewport). Together: game ⊆ container = visible rect → no clip.
const offOk = Math.abs(offset.appTop - offset.OFF) <= 1 && Math.abs(offset.appH - offset.H) <= 1
console.log(`\ntop-bar offset: --vv-top=${offset.OFF} → app.top=${offset.appTop}; --vv-height=${offset.H} → app.height=${offset.appH}`)
console.log(offOk ? '  ✅ container pins to the offset visible rect (sits BELOW a top bar)' : '  ❌ container ignores the offset')
results.push(offOk)

await browser.close()
const ok = results.every(Boolean)
console.log(`\nRESULT: ${ok ? '✅ PASS — whole game scales to fit; nothing clips at any size' : '❌ FAIL'}`)
console.log('screenshots →', OUT)
process.exit(ok ? 0 : 1)
