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

export function scoreForDistance(distance: number): number {
  if (distance <= 5) return MAX_ROUND_SCORE
  return Math.round(MAX_ROUND_SCORE * Math.exp(-distance / FALLOFF_TILES))
}
