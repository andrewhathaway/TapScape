/**
 * The landing nudge: a one-line offer of the morning reminder, shown above
 * the hint when a returning player arrives, folding into a small sun badge.
 *
 * Rules, all enforced here so the UI can't drift from them:
 *  - never on a player's first day; they must have finished a daily before
 *  - only while the reminder is undecided (not on, not blocked)
 *  - at most once a day; "Not now" buys a week; two "Not now"s retire it
 *  - never alongside the clan race line (the caller checks that)
 */

import { DEFAULT_HOUR, getReminderState, needsHomeScreen, pushSupported } from './reminders'
import { getLifetime } from './storage'

const KEY = 'tapscape:nudge:v1'
const SNOOZE_DAYS = 7
const MAX_DISMISSALS = 2
/** How many recent finishing hours to remember for the suggested time. */
const KEEP_FINISHES = 10

interface Stored {
  lastShownDay?: string
  lastDismissedAt?: number
  dismissals?: number
  /** Local hour of day at which recent dailies were finished. */
  finishHours?: number[]
}

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
    // Not remembered; worst case the nudge shows again tomorrow.
  }
}

/** Can this device receive reminders at all, and has the player not already decided? */
function undecided(): boolean {
  if (!(pushSupported() || needsHomeScreen())) return false
  if (getReminderState().enabled) return false
  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return false
  return true
}

/** Whether to show the pill on this landing. */
export function shouldNudge(today: string): boolean {
  if (!undecided()) return false
  if (getLifetime().days < 1) return false
  const s = read()
  if (s.lastShownDay === today) return false
  if ((s.dismissals ?? 0) >= MAX_DISMISSALS) return false
  if (s.lastDismissedAt && Date.now() - s.lastDismissedAt < SNOOZE_DAYS * 86_400_000) return false
  return true
}

/** Whether the resting sun badge may show: same gates, minus the once-a-day rule. */
export function shouldShowBadge(): boolean {
  return undecided() && getLifetime().days >= 1
}

export function markNudgeShown(today: string): void {
  write({ ...read(), lastShownDay: today })
}

export function dismissNudge(): void {
  const s = read()
  write({ ...s, dismissals: (s.dismissals ?? 0) + 1, lastDismissedAt: Date.now() })
}

/** Remember when a daily was finished, so the offered hour can match habit. */
export function recordFinish(date = new Date()): void {
  const s = read()
  const hours = [...(s.finishHours ?? []), date.getHours()].slice(-KEEP_FINISHES)
  write({ ...s, finishHours: hours })
}

/**
 * The hour to suggest. Someone who always plays at 9pm is better served by a
 * 7am nudge than an 8am one? No: by whatever they'd actually act on. We use
 * the median finishing hour when it falls in waking hours, else the default.
 */
export function suggestedHour(): number {
  const hours = (read().finishHours ?? []).slice().sort((a, b) => a - b)
  if (hours.length < 2) return DEFAULT_HOUR
  const median = hours[Math.floor(hours.length / 2)]
  return median >= 6 && median <= 22 ? median : DEFAULT_HOUR
}

export function hourLabel(hour: number): string {
  if (hour === 0) return 'midnight'
  if (hour === 12) return 'noon'
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`
}

/** Copy follows the clock and the suggested hour. */
export function nudgeCopy(now = new Date()): string {
  const h = now.getHours()
  const suggested = suggestedHour()
  const at = hourLabel(suggested)
  // An evening player being offered a morning hour gets the "instead"; everyone
  // else is offered the hour they already tend to play at.
  if (h >= 18 && suggested < 12) return `Late one? Want tomorrow's five at ${at} instead?`
  return `Want tomorrow's five brought to you at ${at}?`
}
