// The wiki serves map tiles from a dated version folder with no "latest" alias,
// so we read the current one off a rendered page that embeds a map.
import { readFile, writeFile } from 'node:fs/promises'

const PROBE = 'https://oldschool.runescape.wiki/w/Varrock'
const TILES = new URL('../src/map/tiles.ts', import.meta.url)

const html = await fetch(PROBE, {
  headers: { 'User-Agent': 'TapScape/0.1 (https://github.com/andrewhathaway/TapScape; map version check)' },
}).then((r) => r.text())

const versions = [...html.matchAll(/maps\.runescape\.wiki\/osrs\/versions\/([^/]+)\//g)].map(
  (m) => m[1],
)
if (!versions.length) throw new Error('no map version found on probe page')

const latest = [...new Set(versions)].sort().pop()
const source = await readFile(TILES, 'utf8')
const current = source.match(/MAP_VERSION = '([^']+)'/)?.[1]

if (current === latest) {
  console.log(`already current: ${latest}`)
} else {
  await writeFile(TILES, source.replace(/MAP_VERSION = '[^']+'/, `MAP_VERSION = '${latest}'`))
  console.log(`updated ${current} -> ${latest}`)
}
