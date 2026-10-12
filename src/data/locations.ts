import raw from './locations.json'
import poolV1 from './pool-v1.json'
import { dayIndex } from '../game/daily'
import type { Location } from '../game/types'

export const LOCATIONS = raw as Location[]

/**
 * The daily dealer shuffles each tier's bucket, so changing the pool changes
 * every day's five, past and future. Days dealt before the pool grew keep the
 * original 450 with the tiers they had then, looked up by id in the current
 * data so coordinates and blurbs stay fresh.
 */
const POOL_GROWN_DAY = dayIndex('2026-10-14')

const byId = new Map(LOCATIONS.map((l) => [l.id, l]))
const V1: Location[] = (poolV1 as Array<{ id: string; tier: 1 | 2 | 3 }>).flatMap(({ id, tier }) => {
  const loc = byId.get(id)
  return loc ? [{ ...loc, tier }] : []
})

export function poolForDay(dayKey: string): Location[] {
  return dayIndex(dayKey) >= POOL_GROWN_DAY ? LOCATIONS : V1
}

export function wikiUrl(loc: Location): string {
  return `https://oldschool.runescape.wiki/w/${encodeURIComponent((loc.wiki ?? loc.name).replace(/ /g, '_'))}`
}
