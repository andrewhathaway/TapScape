import { isInside } from './scoring'
import type { Guess } from './types'

const KEY = 'tapscape:v1'
const KEEP_DAYS = 60

export interface DayResult {
  total: number
  scores: number[]
  /** Played with the 30-second timer and the zoom cap. */
  hard?: boolean
}

interface Stored {
  introSeen?: boolean
  days?: Record<string, DayResult>
  streak?: { current: number; best: number; lastDay: string }
  /** Counters that outlive the 60-day window. */
  lifetime?: { found: number; best: number; days: number }
}

export type Milestone =
  | { kind: 'best'; total: number }
  | { kind: 'streak'; days: number }
  | { kind: 'found'; count: number }

const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 365]
const FOUND_MILESTONES = [10, 25, 50, 100, 250, 500, 1000]

function previousDay(dayKey: string): string {
  return new Date(Date.parse(`${dayKey}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
}

/** Private browsing and blocked site-data both make localStorage throw. */
function read(): Stored {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Stored
  } catch {
    return {}
  }
}

function write(next: Stored): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Nothing to do; the session just won't be remembered.
  }
}

export function hasSeenIntro(): boolean {
  return read().introSeen === true
}

export function markIntroSeen(): void {
  write({ ...read(), introSeen: true })
}

export function getDayResult(dayKey: string): DayResult | null {
  return read().days?.[dayKey] ?? null
}

/** One calendar day in the history window; `result` is null for a day not played. */
export interface HistoryDay {
  dayKey: string
  result: DayResult | null
}

/**
 * The last `days` calendar days ending on `dayKey`, oldest first. Unplayed days
 * come back as nulls rather than being dropped, so the heatmap shows the gaps —
 * which is what makes the streak number explain itself.
 */
export function getHistory(dayKey: string, days: number): HistoryDay[] {
  const stored = read().days ?? {}
  const out: HistoryDay[] = []
  let key = dayKey
  for (let i = 0; i < days; i++) {
    out.push({ dayKey: key, result: stored[key] ?? null })
    key = previousDay(key)
  }
  return out.reverse()
}

export function getStreak(): { current: number; best: number } {
  const { streak } = read()
  return { current: streak?.current ?? 0, best: streak?.best ?? 0 }
}

/**
 * Records a finished daily. Archive days (played after the fact) are kept so
 * the history grid fills in, but never move the streak: a streak is days
 * played *on* the day. Returns the one milestone worth a quiet mention, if any.
 */
export function saveDayResult(
  dayKey: string,
  results: Guess[],
  { countsForStreak = true, hard = false } = {},
): Milestone | null {
  const state = read()
  if (state.days?.[dayKey]) return null

  const total = results.reduce((sum, r) => sum + r.score, 0)
  const result: DayResult = { total, scores: results.map((r) => r.score) }
  if (hard) result.hard = true
  const days = { ...state.days, [dayKey]: result }

  // Drop anything older than the window so the entry can't grow without bound.
  const kept = Object.fromEntries(
    Object.entries(days)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, KEEP_DAYS),
  )

  const prior = state.streak
  let streak = prior
  if (countsForStreak) {
    const continuing = prior && prior.lastDay === previousDay(dayKey)
    const current = continuing ? prior.current + 1 : 1
    streak = { current, best: Math.max(current, prior?.best ?? 0), lastDay: dayKey }
  }

  const before = state.lifetime ?? { found: 0, best: 0, days: 0 }
  const found = results.filter((r) => isInside(r.distance, r.location.radius)).length
  const lifetime = {
    found: before.found + found,
    best: Math.max(before.best, total),
    days: before.days + 1,
  }

  write({ ...state, days: kept, streak, lifetime })

  // Most meaningful first; only one is ever shown.
  if (before.days > 0 && total > before.best) return { kind: 'best', total }
  if (countsForStreak && streak && STREAK_MILESTONES.includes(streak.current)) {
    return { kind: 'streak', days: streak.current }
  }
  const crossed = FOUND_MILESTONES.find((m) => before.found < m && lifetime.found >= m)
  if (crossed) return { kind: 'found', count: crossed }
  return null
}
