import raw from './locations.json'
import type { Location } from '../game/types'

export const LOCATIONS = raw as Location[]

export function wikiUrl(loc: Location): string {
  return `https://oldschool.runescape.wiki/w/${encodeURIComponent((loc.wiki ?? loc.name).replace(/ /g, '_'))}`
}
