// Measures wheel-zoom smoothness in WebKit (Safari's engine).
import { webkit } from 'playwright'

const BASE = process.argv[2] ?? 'http://localhost:5179/'
const b = await webkit.launch()
const p = await b.newPage({ viewport: { width: 1280, height: 800 } })
await p.goto(BASE, { waitUntil: 'networkidle' })
const play = p.getByRole('button', { name: "Play today's" })
if (await play.count()) await play.click()
await p.waitForTimeout(3500)

// Record frame intervals across a burst of zooms.
await p.evaluate(() => {
  window.__f = []
  let last = performance.now()
  const tick = (t) => { window.__f.push(t - last); last = t; requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
})

for (let i = 0; i < 6; i++) {
  await p.mouse.move(640, 400)
  await p.mouse.wheel(0, -260)
  await p.waitForTimeout(260)
}
for (let i = 0; i < 6; i++) {
  await p.mouse.wheel(0, 260)
  await p.waitForTimeout(260)
}

const f = await p.evaluate(() => window.__f.slice(2))
f.sort((a, b) => a - b)
const pct = (q) => f[Math.floor(f.length * q)].toFixed(1)
const long = f.filter((x) => x > 50).length
console.log(`frames=${f.length}  median=${pct(0.5)}ms  p90=${pct(0.9)}ms  p99=${pct(0.99)}ms  worst=${f.at(-1).toFixed(1)}ms  >50ms=${long}`)
await b.close()
