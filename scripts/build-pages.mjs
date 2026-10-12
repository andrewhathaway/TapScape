// Generates one static page per location under dist/where/, an index, and the
// sitemap. Runs after `vite build`, so it writes into the finished dist/.
//
// These exist for search: "where is <place> osrs" is a real query, and each
// page answers it with a map, the coordinates, and what's nearby — then
// offers the game. They share the site's look but none of its JavaScript;
// Leaflet comes from a CDN so the pages stay independent of the app bundle.

import { mkdir, readFile, writeFile } from 'node:fs/promises'

const SITE = 'https://tapscape.andrewhathaway.net'
const DIST = new URL('../dist/', import.meta.url)
const NEARBY = 5

const locations = JSON.parse(await readFile(new URL('../src/data/locations.json', import.meta.url), 'utf8'))
const tilesSource = await readFile(new URL('../src/map/tiles.ts', import.meta.url), 'utf8')
const MAP_VERSION = tilesSource.match(/MAP_VERSION = '([^']+)'/)[1]
const TILE_URL = `https://maps.runescape.wiki/osrs/versions/${MAP_VERSION}/tiles/rendered/0/{z}/0_{x}_{y}.png`

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const wikiUrl = (name) => `https://oldschool.runescape.wiki/w/${encodeURIComponent(name.replace(/ /g, '_'))}`
const pageUrl = (loc) => `${SITE}/where/${loc.id}/`

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']
function direction(from, to) {
  // World y grows northward, so the angle is measured from north clockwise.
  const angle = Math.atan2(to.x - from.x, to.y - from.y)
  return COMPASS[Math.round((angle < 0 ? angle + 2 * Math.PI : angle) / (Math.PI / 4)) % 8]
}

function nearby(loc) {
  return locations
    .filter((o) => o.id !== loc.id)
    .map((o) => ({ loc: o, distance: Math.hypot(o.x - loc.x, o.y - loc.y) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, NEARBY)
}

const tierWord = { 1: 'one of the better-known places on the map', 2: 'a place most players will have passed through', 3: 'one of the more obscure corners of the map' }

const CSS = `
  :root { color-scheme: dark; --bg:#0e0d0b; --panel:#17150f; --edge:#3a3426; --ink:#f0e6d2; --dim:#a2977d; --gold:#ffb833; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.6 system-ui, -apple-system, 'Segoe UI', sans-serif; }
  a { color: var(--gold); }
  header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--edge); }
  .brand { color: var(--gold); font-weight: 800; letter-spacing: .06em; text-decoration: none; }
  .play { background: var(--gold); color: #1a1403; font-weight: 700; padding: 8px 14px; border-radius: 8px; text-decoration: none; }
  main { max-width: 720px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 28px; margin: 0 0 6px; }
  .lede { color: var(--dim); margin: 0 0 18px; }
  #map { height: 340px; border: 1px solid var(--edge); border-radius: 12px; background: #000; }
  .leaflet-container { background: #000; }
  .cta { background: var(--panel); border: 1px solid var(--edge); border-radius: 12px; padding: 18px 20px; margin: 24px 0; }
  .cta h2 { margin: 0 0 6px; font-size: 18px; }
  .cta p { margin: 0 0 12px; color: var(--dim); }
  ul.near { padding-left: 18px; }
  footer { color: var(--dim); font-size: 12px; margin-top: 32px; }
  .index { columns: 2; column-gap: 24px; list-style: none; padding: 0; }
  .index li { break-inside: avoid; padding: 3px 0; }
  .letter { font-size: 13px; color: var(--dim); margin: 18px 0 4px; font-weight: 700; }
`

function breadcrumbs(canonical, name) {
  const items = [
    { '@type': 'ListItem', position: 1, name: 'TapScape', item: `${SITE}/` },
    { '@type': 'ListItem', position: 2, name: 'All locations', item: `${SITE}/where/` },
  ]
  if (name) items.push({ '@type': 'ListItem', position: 3, name, item: canonical })
  return JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items })
}

function shell({ title, description, canonical, body, name }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta name="theme-color" content="#0e0d0b">
<meta property="og:type" content="website">
<meta property="og:site_name" content="TapScape">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${SITE}/og.png">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${breadcrumbs(canonical, name)}</script>
<style>${CSS}</style>
</head>
<body>
<header>
  <a class="brand" href="/">TAPSCAPE</a>
  <a class="play" href="/?source=where">Play today's</a>
</header>
<main>
${body}
<footer>
  Map tiles and location data from the <a href="https://oldschool.runescape.wiki">OSRS Wiki</a>, used under the
  <a href="https://meta.weirdgloop.org/w/Meta:Copyrights">Weird Gloop licence</a> (CC BY-NC-SA).
  RuneScape and Old School RuneScape are trademarks of Jagex Limited. TapScape is an unofficial fan project.
  <a href="/where/">All locations</a>
</footer>
</main>
</body>
</html>`
}

function locationPage(loc) {
  const near = nearby(loc)
  const radius = Math.max(loc.radius ?? 0, 5)
  const title = `Where is ${loc.name} in OSRS?`
  const description = `${loc.name} is at ${loc.x}, ${loc.y} on the Old School RuneScape world map, ${Math.round(near[0].distance)} tiles ${direction(near[0].loc, loc)} of ${near[0].loc.name}. See it on the map, then find it from memory in TapScape.`

  const body = `
<h1>${esc(title)}</h1>
<p class="lede">${esc(loc.name)} sits at world coordinates <strong>${loc.x}, ${loc.y}</strong> — ${tierWord[loc.tier]}.</p>
<div id="map" role="img" aria-label="Map of Gielinor centred on ${esc(loc.name)}"></div>
<p>The nearest places with their own TapScape pages:</p>
<ul class="near">
${near
  .map(
    ({ loc: o, distance }) =>
      `  <li><a href="/where/${o.id}/">${esc(o.name)}</a> — about ${Math.round(distance)} tiles ${direction(loc, o)}</li>`,
  )
  .join('\n')}
</ul>
<div class="cta">
  <h2>Could you find it from memory?</h2>
  <p>TapScape gives you five OSRS locations a day. Click where you think each one is and score by how close you land.</p>
  <a class="play" href="/?source=where">Play today's puzzle</a>
</div>
${loc.blurb ? `<p>${esc(loc.blurb)}</p>` : ''}
<p>Read more about <a href="${wikiUrl(loc.wiki ?? loc.name)}" rel="noreferrer">${esc(loc.name)} on the OSRS Wiki</a>.</p>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css">
<script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function () {
  var map = L.map('map', { crs: L.CRS.Simple, minZoom: -1, maxZoom: 3, zoomControl: true, attributionControl: true })
  var Tiles = L.TileLayer.extend({
    // Server rows count northward, Leaflet's count southward.
    getTileUrl: function (c) { return L.Util.template(this._url, { z: this._getZoomForUrl(), x: c.x, y: -c.y - 1 }) }
  })
  new Tiles(${JSON.stringify(TILE_URL)}, { tileSize: 256, maxNativeZoom: 3, minNativeZoom: -3, noWrap: true,
    attribution: 'Map data &copy; <a href="https://meta.weirdgloop.org/w/Meta:Copyrights">Weird Gloop</a> &middot; assets &copy; Jagex' }).addTo(map)
  var at = [${loc.y}, ${loc.x}]
  L.circle(at, { radius: ${radius}, color: '#ffb833', weight: 2, fillOpacity: 0.12 }).addTo(map)
  L.circleMarker(at, { radius: 5, color: '#ffb833', fillColor: '#ffb833', fillOpacity: 1 }).addTo(map)
  map.setView(at, 1)
})()
</script>`

  return shell({ title, description, canonical: pageUrl(loc), body, name: loc.name })
}

function indexPage() {
  const sorted = [...locations].sort((a, b) => a.name.localeCompare(b.name))
  let letter = ''
  const items = sorted
    .map((loc) => {
      const first = loc.name[0].toUpperCase()
      const head = first !== letter ? `<li class="letter">${(letter = first)}</li>` : ''
      return `${head}<li><a href="/where/${loc.id}/">${esc(loc.name)}</a></li>`
    })
    .join('\n')
  const body = `
<h1>Every location in TapScape</h1>
<p class="lede">${locations.length} places on the Old School RuneScape surface map, each with a page showing where it is and what's nearby.</p>
<ul class="index">
${items}
</ul>`
  return shell({
    title: 'Where is it in OSRS? Every TapScape location',
    description: `Where ${locations.length} Old School RuneScape places are on the world map, with coordinates and what's nearby.`,
    canonical: `${SITE}/where/`,
    body,
  })
}

function sitemap() {
  const urls = [
    `  <url><loc>${SITE}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    `  <url><loc>${SITE}/where/</loc><changefreq>monthly</changefreq></url>`,
    ...locations.map((loc) => `  <url><loc>${pageUrl(loc)}</loc><changefreq>monthly</changefreq></url>`),
  ]
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
}

await mkdir(new URL('where/', DIST), { recursive: true })
await writeFile(new URL('where/index.html', DIST), indexPage())
for (const loc of locations) {
  const dir = new URL(`where/${loc.id}/`, DIST)
  await mkdir(dir, { recursive: true })
  await writeFile(new URL('index.html', dir), locationPage(loc))
}
await writeFile(new URL('sitemap.xml', DIST), sitemap())
console.log(`wrote ${locations.length} location pages, index and sitemap`)
