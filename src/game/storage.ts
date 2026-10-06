import type { Guess } from './types'

const KEY = 'tapscape:v1'
const KEEP_DAYS = 60

export interface DayResult {
  total: number
  scores: number[]
}

interface Stored {
  introSeen?: boolean
  days?: Record<string, DayResult>
  streak?: { current: number; best: number; lastDay: string }
}

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

export function saveDayResult(dayKey: string, results: Guess[]): void {
  const state = read()
  if (state.days?.[dayKey]) return

  const days = { ...state.days, [dayKey]: {
    total: results.reduce((sum, r) => sum + r.score, 0),
    scores: results.map((r) => r.score),
  } }

  // Drop anything older than the window so the entry can't grow without bound.
  const kept = Object.fromEntries(
    Object.entries(days)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, KEEP_DAYS),
  )

  const prior = state.streak
  const continuing = prior && prior.lastDay === previousDay(dayKey)
  const current = continuing ? prior.current + 1 : 1

  write({
    ...state,
    days: kept,
    streak: { current, best: Math.max(current, prior?.best ?? 0), lastDay: dayKey },
  })
}
