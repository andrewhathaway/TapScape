/**
 * When to send the next reminder. Pure functions over unix-ms timestamps and
 * IANA zone names, so the cron needs no date library and DST just works.
 */

const DAY_MS = 86_400_000

/** YYYY-MM-DD in UTC: the same key the game uses to pick the day's puzzle. */
export function dayKeyOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

interface WallClock {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    })
    formatters.set(tz, f)
  }
  return f
}

/** The wall-clock reading in `tz` at instant `ms`. */
function wallClock(ms: number, tz: string): WallClock {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {}
  for (const p of formatter(tz).formatToParts(ms)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value)
  }
  return {
    year: parts.year!,
    month: parts.month!,
    day: parts.day!,
    hour: parts.hour!,
    minute: parts.minute!,
  }
}

/**
 * The instant at which `tz` reads `year-month-day hour:00`. Guess the instant
 * as if the zone were UTC, read the wall clock there to learn the offset, and
 * correct. A second pass catches a DST change between the guess and the answer.
 */
function instantOf(year: number, month: number, day: number, hour: number, tz: string): number {
  const target = Date.UTC(year, month - 1, day, hour)
  let guess = target
  for (let i = 0; i < 2; i++) {
    const w = wallClock(guess, tz)
    const offset = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute) - guess
    guess = target - offset
  }
  return guess
}

/** The next time `tz` strikes `hour:00`, strictly after `now`. */
export function nextLocalHour(now: number, tz: string, hour: number): number {
  const w = wallClock(now, tz)
  const today = instantOf(w.year, w.month, w.day, hour, tz)
  if (today > now) return today
  return instantOf(w.year, w.month, w.day + 1, hour, tz)
}

/**
 * The next reminder instant. Normally that is the next local `hour`, but the
 * puzzle rolls at midnight UTC, so east of about UTC+8 a morning reminder would
 * land before the new puzzle exists and point at one the player already saw.
 * If the puzzle current at the candidate time is one we have already handled,
 * the fresh one arrives at the following rollover. Send then if that is still
 * daytime for the player (Sydney's "8am" becomes 10 or 11am); otherwise wait
 * for their next chosen hour rather than buzz a phone at 1am.
 */
export function nextSendAt(
  now: number,
  tz: string,
  hour: number,
  handledDays: ReadonlyArray<string | null | undefined>,
): number {
  const candidate = nextLocalHour(now, tz, hour)
  if (!handledDays.includes(dayKeyOf(candidate))) return candidate

  const rollover = Math.floor(candidate / DAY_MS) * DAY_MS + DAY_MS
  const hoursAfterChosen = (wallClock(rollover, tz).hour - hour + 24) % 24
  return hoursAfterChosen < 12 ? rollover : nextLocalHour(rollover, tz, hour)
}
