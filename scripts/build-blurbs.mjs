// Adds a one-sentence `blurb` (and, where the article title differs from the
// display name, `wiki`) to every entry in src/data/locations.json, from the
// wiki's TextExtracts API. Shown under the distance readout after each guess,
// with a link to the article. Rerun after `npm run data:locations`.

import { readFile, writeFile } from 'node:fs/promises'

const API = 'https://oldschool.runescape.wiki/api.php'
const UA = 'TapScape/0.1 (https://github.com/andrewhathaway/TapScape; contact andrew@andrewhathaway.net)'
const MAX_CHARS = 200
const FILE = new URL('../src/data/locations.json', import.meta.url)

const locations = JSON.parse(await readFile(FILE, 'utf8'))

async function extracts(titles) {
  const url = `${API}?${new URLSearchParams({
    action: 'query',
    prop: 'extracts',
    exintro: '1',
    explaintext: '1',
    exsentences: '1',
    exlimit: '20',
    redirects: '1',
    titles: titles.join('|'),
    format: 'json',
  })}`
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (res.ok) return res.json()
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
  }
  throw new Error(`failed: ${url}`)
}

/** Trim to a sentence that fits the readout; drop pronunciation asides. */
function tidy(text) {
  let t = text.replace(/\s*\(pronounced[^)]*\)/i, '').replace(/\s+/g, ' ').trim()
  if (t.length > MAX_CHARS) {
    const cut = t.slice(0, MAX_CHARS)
    t = cut.slice(0, Math.max(cut.lastIndexOf(' '), 0)).replace(/[,;:]$/, '') + '…'
  }
  return t
}

/** Names had "(location)"-style suffixes stripped; the article may still need one. */
const candidates = (name) => [`${name} (location)`, name]

const byTitle = new Map()
const wanted = [...new Set(locations.flatMap((l) => candidates(l.name)))]
for (let i = 0; i < wanted.length; i += 20) {
  const batch = wanted.slice(i, i + 20)
  const data = await extracts(batch)
  // Map normalised/redirected titles back to what we asked for.
  const asked = new Map(batch.map((t) => [t, t]))
  for (const n of data.query.normalized ?? []) asked.set(n.to, asked.get(n.from) ?? n.from)
  for (const r of data.query.redirects ?? []) asked.set(r.to, asked.get(r.from) ?? r.from)
  for (const page of Object.values(data.query.pages)) {
    if (page.missing !== undefined || !page.extract) continue
    const original = asked.get(page.title) ?? page.title
    byTitle.set(original, { title: page.title, extract: page.extract })
  }
  process.stdout.write(`\r  fetched ${Math.min(i + 20, wanted.length)}/${wanted.length}`)
}
console.log()

let hits = 0
for (const loc of locations) {
  const found = candidates(loc.name).map((t) => byTitle.get(t)).find(Boolean)
  delete loc.blurb
  delete loc.wiki
  if (!found) continue
  // A disambiguation page is not a fact about the place.
  if (/may refer to:?$/i.test(found.extract.trim())) continue
  loc.blurb = tidy(found.extract)
  if (found.title !== loc.name) loc.wiki = found.title
  hits++
}

await writeFile(FILE, JSON.stringify(locations, null, 2) + '\n')
console.log(`blurbs for ${hits} of ${locations.length} locations`)
const missing = locations.filter((l) => !l.blurb).map((l) => l.name)
if (missing.length) console.log('no blurb:', missing.join(', '))
