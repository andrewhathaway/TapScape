// The wiki serves map tiles from a dated version folder with no "latest" alias.
// Each article page embeds the version its render was cached with, so one page
// can lag the real current version by weeks. We read several, take the newest,
// and confirm the tile server actually serves it before touching the pin.
import { readFile, writeFile } from 'node:fs/promises'
import { findLatestMapVersion } from '../worker/map-version.mjs'

const TILES = new URL('../src/map/tiles.ts', import.meta.url)

const latest = await findLatestMapVersion(fetch)
if (!latest) throw new Error('no servable map version found')

const source = await readFile(TILES, 'utf8')
const current = source.match(/MAP_VERSION = '([^']+)'/)?.[1]

if (current === latest) {
  console.log(`already current: ${latest}`)
} else {
  await writeFile(TILES, source.replace(/MAP_VERSION = '[^']+'/, `MAP_VERSION = '${latest}'`))
  console.log(`updated ${current} -> ${latest}`)
}
