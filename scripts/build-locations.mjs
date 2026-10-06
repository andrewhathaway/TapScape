// Builds src/data/locations.json from the OSRS Wiki.
// Coordinates come from the {{Map|...|x=|y=}} template in each location's infobox.
import { writeFile } from 'node:fs/promises'

const API = 'https://oldschool.runescape.wiki/api.php'
const UA = 'TapScape/0.1 (https://github.com/andrewhathaway/TapScape; contact andrew@andrewhathaway.net)'

const SURFACE = { minX: 768, maxX: 4096, minY: 1792, maxY: 4352 }

async function api(params) {
  const url = `${API}?${new URLSearchParams({ ...params, format: 'json' })}`
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (res.ok) return res.json()
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
  }
  throw new Error(`failed: ${url}`)
}

async function categoryMembers(category) {
  const out = []
  let cont
  do {
    const data = await api({
      action: 'query',
      list: 'categorymembers',
      cmtitle: category,
      cmlimit: '500',
      cmnamespace: '0',
      ...(cont ? { cmcontinue: cont } : {}),
    })
    out.push(...data.query.categorymembers.map((m) => m.title))
    cont = data.continue?.cmcontinue
  } while (cont)
  return out
}

/** Bounding-box centre of a polygon outline, which cities use instead of x/y. */
function polygonCentre(raw) {
  const pts = polygonPoints(raw)
  if (!pts) return null
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const x = Math.round((Math.min(...xs) + Math.max(...xs)) / 2)
  const y = Math.round((Math.min(...ys) + Math.max(...ys)) / 2)
  // Circumscribed rather than inscribed: erring generous is the whole point.
  const radius = Math.round(Math.max(...pts.map(([px, py]) => Math.hypot(px - x, py - y))))
  return { x, y, radius }
}

function polygonPoints(raw) {
  const pts = [...raw.matchAll(/\|\s*(\d{3,4})\s*,\s*(\d{3,5})\s*(?=\||\}\})/g)].map((m) => [
    +m[1],
    +m[2],
  ])
  return pts.length >= 3 ? pts : null
}

/**
 * Only 11% of location articles carry a polygon, so everything else sizes its
 * region from the `zoom` the infobox map opens at — the wiki's own judgement of
 * how much of Gielinor you need on screen to see the place. 0 is an island, 3 is
 * one building. Articles with no zoom at all are mostly small interiors.
 *
 * Calibrated against the articles that have both a zoom and a real polygon, at
 * roughly the 75th percentile of each bucket: generous enough for the larger
 * members, since a zoom frames a lot of context around the place itself and
 * sizing off that directly came out 2-4x too big. Zoom 0 has no polygon anywhere
 * to check against — those nine are whole islands and regions.
 */
const ZOOM_RADIUS = { 0: 150, 1: 50, 2: 22, 3: 12, 4: 8 }
const DEFAULT_RADIUS = 12
const MAX_RADIUS = 150

/**
 * Finds the {{Map}} call describing the article's own subject. Pages often carry
 * several (quest routes, sub-locations); the infobox one is the one with a name.
 */
function parseMap(wikitext) {
  const templates = []
  for (const m of wikitext.matchAll(/\{\{Map\b/gi)) {
    let depth = 0
    let i = m.index
    while (i < wikitext.length) {
      if (wikitext.startsWith('{{', i)) { depth++; i += 2; continue }
      if (wikitext.startsWith('}}', i)) { depth--; i += 2; if (!depth) break; continue }
      i++
    }
    templates.push(wikitext.slice(m.index, i))
  }

  // Named templates describe the subject itself, so try those first.
  const named = templates.filter((t) => /\|\s*name\s*=/i.test(t))
  for (const raw of [...named, ...templates]) {
    if (/mtype\s*=\s*pin/i.test(raw)) continue
    const mapId = raw.match(/\|\s*mapID\s*=\s*(-?\d+)/i)
    if (mapId && mapId[1] !== '0') continue
    const plane = raw.match(/\|\s*plane\s*=\s*(\d+)/i)
    if (plane && plane[1] !== '0') continue

    const zoom = raw.match(/\|\s*zoom\s*=\s*(\d+)/i)
    const fromZoom = zoom ? ZOOM_RADIUS[+zoom[1]] : undefined

    const x = raw.match(/\|\s*x\s*=\s*(\d+)/i)
    const y = raw.match(/\|\s*y\s*=\s*(\d+)/i)
    if (x && y) return { x: +x[1], y: +y[1], plane: 0, radius: fromZoom ?? DEFAULT_RADIUS }

    if (/mtype\s*=\s*polygon/i.test(raw)) {
      const centre = polygonCentre(raw)
      if (centre) return { ...centre, plane: 0 }
    }
  }
  return null
}

const SKIP = /^(List of|Category:|Template:|Module:)|\(disambiguation\)|\/Quick guide/i

/** Open water, whole continents and abstractions: nothing a pin can be right about. */
const EXCLUDE = new Set([
  'Gielinor', 'Abyss', 'Abyssal Space', 'Tutorial Island', 'Menaphos',
  'Shrouded Ocean', 'Western Ocean', 'Ardent Ocean', 'Unquiet Ocean',
  'Northern Ocean', 'Sunset Ocean', 'Northern Tundras', 'Sanguinesti region',
  'Galarpos Mountains', 'Ruins (east)', 'Ruins (west)', 'Quarry', 'Outpost',
  'The Hollows', 'Gielinor Game', 'Gielinor (location)',
])

/** Places any player can pin from memory. Article length is a poor fame proxy. */
const TIER_ONE = [
  'Lumbridge', 'Varrock', 'Falador', 'Draynor Village', 'Al Kharid', 'Edgeville',
  'Barbarian Village', 'Port Sarim', 'Rimmington', 'Taverley', 'Burthorpe',
  'Catherby', "Seers' Village", 'Camelot', 'East Ardougne', 'West Ardougne',
  'Yanille', 'Grand Exchange', 'Varrock Square', "Wizards' Tower", 'Draynor Manor',
  'Lumbridge Swamp', 'Brimhaven', 'Canifis', 'Port Phasmatys', 'Barrows',
  'Burgh de Rott', 'Rellekka', 'Miscellania', 'Neitiznot', 'Jatizso', 'Lletya',
  'Tree Gnome Stronghold', 'Castle Wars', 'Duel Arena', 'Entrana', 'Crandor',
  'Musa Point', 'Tai Bwo Wannai', 'Nardah', 'Pollnivneach', 'Sophanem',
  'Shantay Pass', 'Mor Ul Rek', 'Kourend Castle', 'Hosidius', 'Shayzien',
  'Arceuus', 'Lovakengj', 'Port Piscarilius', 'Fishing Guild', 'Crafting Guild',
  'Mining Guild', "Champions' Guild", 'Ice Mountain', 'Mount Karuulm',
  'Fossil Island', "Mos Le'Harmless", 'Ape Atoll', 'Lunar Isle', 'Ferox Enclave',
  'Ectofuntus', 'Baxtorian Falls', 'Trollheim', 'Lava Maze', 'Grand Tree',
  'Ardougne Zoo', 'Digsite', 'Meiyerditch', 'Darkmeyer', 'Castle Drakan',
  'Varlamore', 'Aldarin', 'Port Khazard', 'Witchaven',
  "Void Knights' Outpost", 'Corsair Cove', 'Shilo Village (location)',
]

async function main() {
  console.log('fetching category members…')
  const titles = [...new Set(await categoryMembers('Category:Locations'))].filter(
    (t) => !SKIP.test(t) && !EXCLUDE.has(t),
  )
  console.log(`  ${titles.length} candidate pages`)

  const found = []
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50)
    const data = await api({
      action: 'query',
      prop: 'revisions|info',
      rvprop: 'content',
      rvslots: 'main',
      titles: batch.join('|'),
    })
    for (const page of Object.values(data.query.pages)) {
      const text = page?.revisions?.[0]?.slots?.main?.['*']
      if (!text) continue
      const coords = parseMap(text)
      if (!coords) continue
      const { x, y } = coords
      if (x < SURFACE.minX || x > SURFACE.maxX || y < SURFACE.minY || y > SURFACE.maxY) continue
      found.push({
        name: page.title,
        x,
        y,
        radius: Math.min(coords.radius ?? DEFAULT_RADIUS, MAX_RADIUS),
        weight: page.length ?? text.length,
      })
    }
    process.stdout.write(`\r  parsed ${Math.min(i + 50, titles.length)}/${titles.length} → ${found.length} located`)
  }
  console.log()

  const famous = new Set(TIER_ONE)
  const missing = TIER_ONE.filter((n) => !found.some((f) => f.name === n))
  if (missing.length) console.warn(`\n  !! tier-1 names with no coordinates: ${missing.join(', ')}\n`)

  found.sort((a, b) => b.weight - a.weight)
  const pool = found.slice(0, 450)
  const rest = pool.filter((l) => !famous.has(l.name))

  const locations = pool
    .map((loc) => {
      const tier = famous.has(loc.name) ? 1 : rest.indexOf(loc) < rest.length * 0.45 ? 2 : 3
      return {
        id: loc.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        name: loc.name.replace(/\s*\((location|mountain|dungeon)\)$/, ''),
        x: loc.x,
        y: loc.y,
        plane: 0,
        tier,
        radius: loc.radius,
      }
    })
    .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name))

  await writeFile(
    new URL('../src/data/locations.json', import.meta.url),
    JSON.stringify(locations, null, 2) + '\n',
  )
  console.log(`wrote ${locations.length} locations`)
  console.log('tiers:', [1, 2, 3].map((t) => `${t}=${locations.filter((l) => l.tier === t).length}`).join(' '))
  const radii = locations.map((l) => l.radius).sort((a, b) => a - b)
  console.log('radius tiles:', `min=${radii[0]}`, `median=${radii[radii.length >> 1]}`, `max=${radii.at(-1)}`)
}

main()
