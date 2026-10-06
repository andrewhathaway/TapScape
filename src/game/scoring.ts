import type { WorldPoint } from './types'

export const MAX_ROUND_SCORE = 5000

/** Chebyshev-free straight-line distance, in OSRS tiles. Plane is ignored. */
export function tileDistance(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * Falls off such that ~50 tiles still scores well and ~1000 tiles scores near
 * nothing, which matches how dense the OSRS surface map actually is.
 */
const FALLOFF_TILES = 300

/** Even a doorway-sized target gets this much slack, for fat fingers on mobile. */
export const MIN_RADIUS_TILES = 5

/**
 * Only the distance *outside* the location's own area is penalised, so landing
 * anywhere within it scores full marks. The curve is continuous at the edge:
 * a tile outside still scores ~4,983, not a cliff down from 5,000.
 */
export function scoreForDistance(distance: number, radius = 0): number {
  const outside = distance - Math.max(radius, MIN_RADIUS_TILES)
  if (outside <= 0) return MAX_ROUND_SCORE
  return Math.round(MAX_ROUND_SCORE * Math.exp(-outside / FALLOFF_TILES))
}

/** True when the guess landed inside the place itself rather than near it. */
export function isInside(distance: number, radius = 0): boolean {
  return distance <= Math.max(radius, MIN_RADIUS_TILES)
}
