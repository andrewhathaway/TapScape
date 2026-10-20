/**
 * Anonymous per-day statistics: how everyone did today, so a player can be
 * compared with the field. One ping per finished daily carries the five round
 * scores, which rounds landed inside, and whether it was hard mode. Nothing
 * identifies the player.
 */

import { MAX_ROUND_SCORE } from './scoring'

export const ROUNDS = 5
export const HIST_BUCKETS = 25
export const BUCKET_SIZE = 1000

export interface DayStats {
  plays: number
  total: number
  roundSums: number[]
  insideCounts: number[]
  hist: number[]
}

/** The field as seen by one player: everyone except them. */
export interface Others {
  plays: number
  avg: number
  roundAvgs: number[]
  insideRates: number[]
  hist: number[]
  /** Index of the round with the lowest average, or -1 if it isn't clear-cut. */
  hardest: number
}

export async function reportDailyStat(
  dayKey: string,
  scores: number[],
  inside: boolean[],
  hard: boolean,
): Promise<void> {
  const total = scores.reduce((a, b) => a + b, 0)
  try {
    await fetch('/api/stats/played', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dayKey, total, scores, inside, hard }),
      keepalive: true,
    })
  } catch {
    // The comparison just won't include this run.
  }
}

export async function fetchDayStats(dayKey: string, hard: boolean): Promise<DayStats | null> {
  try {
    const res = await fetch(`/api/stats/day?day=${dayKey}&hard=${hard ? 1 : 0}`)
    if (!res.ok) return null
    return (await res.json()) as DayStats
  } catch {
    return null
  }
}

/**
 * Everyone else today. If this player's run is already in the numbers, pass
 * it so it can be taken back out; comparing yourself with a field that
 * includes you flatters nobody.
 */
export function othersFrom(
  stats: DayStats,
  mine: { scores: number[]; inside: boolean[] } | null,
): Others | null {
  // Only runs that carried round detail can be compared with. `plays` and
  // `total` also count runs recorded before that detail existed, so the field
  // is sized from the histogram and summed from the round sums instead.
  let plays = stats.hist.reduce((a, b) => a + b, 0)
  let total = stats.roundSums.reduce((a, b) => a + b, 0)
  const roundSums = stats.roundSums.slice()
  const insideCounts = stats.insideCounts.slice()
  const hist = stats.hist.slice()
  if (mine) {
    const myTotal = mine.scores.reduce((a, b) => a + b, 0)
    plays -= 1
    total -= myTotal
    mine.scores.forEach((s, i) => (roundSums[i] -= s))
    mine.inside.forEach((b, i) => (insideCounts[i] -= b ? 1 : 0))
    const bucket = Math.min(HIST_BUCKETS - 1, Math.floor(myTotal / BUCKET_SIZE))
    hist[bucket] = Math.max(0, hist[bucket] - 1)
  }
  if (plays < 1) return null

  const roundAvgs = roundSums.map((s) => Math.round(s / plays))
  const sorted = roundAvgs.map((a, i) => [a, i] as const).sort((x, y) => x[0] - y[0])
  // "Hardest" only when it stands clear of the next one, else it's noise.
  const hardest = plays >= 3 && sorted[1][0] - sorted[0][0] >= MAX_ROUND_SCORE * 0.05 ? sorted[0][1] : -1

  return {
    plays,
    avg: Math.round(total / plays),
    roundAvgs,
    insideRates: insideCounts.map((c) => c / plays),
    hist,
    hardest,
  }
}

/** How many of the others this total beat. Within a bucket, assume half. */
export function beaten(others: Others, total: number): number {
  const bucket = Math.min(HIST_BUCKETS - 1, Math.floor(total / BUCKET_SIZE))
  let below = 0
  for (let i = 0; i < bucket; i++) below += others.hist[i]
  return Math.min(others.plays, below + Math.floor(others.hist[bucket] / 2))
}
