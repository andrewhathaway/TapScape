import { chromium } from 'playwright'
const OUT = process.argv[2]
const BASE = process.argv[3] ?? 'http://localhost:5179/'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

const tiles = { ok: 0, fail: 0 }
page.on('response', (r) => {
  if (!r.url().includes('/tiles/rendered/')) return
  r.status() === 200 ? tiles.ok++ : tiles.fail++
})

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.screenshot({ path: `${OUT}/01-intro.png` })
console.log('intro modal visible:', await page.locator('.sheet').isVisible())

await page.getByRole('button', { name: "Play today's" }).click()
await page.waitForTimeout(3500)
await page.screenshot({ path: `${OUT}/02-map.png` })
console.log('prompt:', await page.locator('.prompt-name').innerText())
console.log('tiles:', JSON.stringify(tiles))

// place a guess
await page.mouse.click(640, 420)
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/03-pinned.png` })
await page.getByRole('button', { name: 'Lock in guess' }).click()
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/04-revealed.png` })
console.log('readout:', await page.locator('.readout-dist').innerText())

// play out the rest
for (let i = 0; i < 4; i++) {
  await page.getByRole('button', { name: /Next round|See results/ }).click()
  await page.waitForTimeout(500)
  await page.mouse.click(500 + i * 60, 350 + i * 30)
  await page.waitForTimeout(250)
  await page.getByRole('button', { name: 'Lock in guess' }).click()
  await page.waitForTimeout(700)
}
await page.getByRole('button', { name: /See results|Next round/ }).click()
await page.waitForTimeout(900)
await page.screenshot({ path: `${OUT}/05-summary.png` })
console.log('summary visible:', await page.locator('.summary-card').isVisible())
console.log('total:', await page.locator('.summary-total').innerText())

// reload: should be locked for the day
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/06-reload.png` })
const introAgain = await page.locator('.sheet').count()
console.log('intro shown again after first visit:', introAgain > 0)
console.log('locked message:', await page.locator('.summary-card .muted').first().innerText())

console.log('\nconsole errors:', errors.length ? errors.slice(0,5) : 'none')
await browser.close()
