// Rasterises public/favicon.svg into the PNG sizes the web manifest needs.
// iOS and Android ignore SVG icons for Home Screen installs, so these have to
// exist as real PNGs. Rerun after changing the favicon.

import { chromium } from 'playwright'
import { readFile, writeFile } from 'node:fs/promises'

const SIZES = [192, 512]
const svg = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8')

const browser = await chromium.launch()
try {
  for (const size of SIZES) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
    await page.setContent(
      `<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`,
    )
    const png = await page.screenshot({ omitBackground: true, type: 'png' })
    await writeFile(new URL(`../public/icons/icon-${size}.png`, import.meta.url), png)
    console.log(`icon-${size}.png`)
  }
} finally {
  await browser.close()
}
