// Shared by the Worker's cron and the local refresh script (hence plain JS).
// Finds the newest tileset version the wiki references and checks the tile
// server serves it, so a half-published version is never adopted.

const UA = 'TapScape/0.1 (https://github.com/andrewhathaway/TapScape; map version check)'
/** Pages whose infobox embeds a map; several, because each one's render cache lags differently. */
const PROBES = ['Lumbridge', 'Varrock', 'Falador', 'Prifddinas']
/** Varrock's zoom-0 tile: if a version can't serve this, it isn't usable. */
const CANARY = '0/0_11_13.png'

export async function findLatestMapVersion(fetchFn) {
  const found = new Set()
  await Promise.all(
    PROBES.map(async (page) => {
      try {
        const html = await fetchFn(`https://oldschool.runescape.wiki/w/${page}`, { headers: { 'User-Agent': UA } }).then((r) => r.text())
        for (const m of html.matchAll(/maps\.runescape\.wiki\/osrs\/versions\/(\d{4}-\d{2}-\d{2}_[a-z])\//g)) found.add(m[1])
      } catch {
        // One page failing shouldn't stop the others.
      }
    }),
  )
  const candidates = [...found].sort().reverse()
  for (const version of candidates) {
    const res = await fetchFn(`https://maps.runescape.wiki/osrs/versions/${version}/tiles/rendered/0/${CANARY}`, {
      method: 'HEAD',
      headers: { 'User-Agent': UA },
    }).catch(() => null)
    if (res && res.ok) return version
  }
  return null
}
