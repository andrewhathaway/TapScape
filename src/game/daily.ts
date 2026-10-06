import type { Location } from './types'

export const ROUNDS_PER_DAY = 5

/** Two gimmes, two mid, one hard — the run should open gently and close hard. */
const TIER_PATTERN = [1, 1, 2, 2, 3] as const
const PER_TIER: Record<number, number> = { 1: 2, 2: 2, 3: 1 }

const EPOCH_UTC = Date.UTC(2026, 0, 1)
const DAY_MS = 86_400_000

function hashString(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** YYYY-MM-DD in UTC, so everyone gets the same puzzle at the same moment. */
export function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export function dayIndex(dayKey: string): number {
  return Math.floor((Date.parse(`${dayKey}T00:00:00Z`) - EPOCH_UTC) / DAY_MS)
}

export function msUntilNextDay(now = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  return next - now.getTime()
}

/** Raw per-cycle ordering of one tier, before boundary conditioning. */
function rawDeck(bucket: readonly Location[], tier: number, cycle: number): Location[] {
  return shuffled(bucket, mulberry32(hashString(`tapscape:t${tier}:c${cycle}`)))
}

/**
 * Each tier is dealt from a shuffled deck rather than re-rolled daily, so a
 * location cannot reappear until its deck is exhausted. A fresh shuffle at the
 * cycle boundary would undo that — it can deal yesterday's location again — so
 * the new deck's opening entries are swapped clear of the old deck's tail.
 */
function cycleDeck(bucket: readonly Location[], tier: number, cycle: number, gap: number) {
  const deck = rawDeck(bucket, tier, cycle)
  if (cycle <= 0) return deck

  const recent = new Set(rawDeck(bucket, tier, cycle - 1).slice(-gap).map((l) => l.id))
  for (let i = 0; i < Math.min(gap, deck.length); i++) {
    if (!recent.has(deck[i].id)) continue
    const swap = deck.findIndex((l, k) => k >= gap && !recent.has(l.id))
    if (swap > -1) [deck[i], deck[swap]] = [deck[swap], deck[i]]
  }
  return deck
}

function dealFromTier(pool: readonly Location[], tier: number, day: number): Location[] {
  const bucket = pool.filter((l) => l.tier === tier)
  const perDay = PER_TIER[tier]
  if (bucket.length < perDay * 2) return bucket.slice(0, perDay)

  const cycleLength = Math.floor(bucket.length / perDay)
  const cycle = Math.floor(day / cycleLength)
  const offset = ((day % cycleLength) + cycleLength) % cycleLength

  const deck = cycleDeck(bucket, tier, cycle, perDay * 7)
  return deck.slice(offset * perDay, offset * perDay + perDay)
}

export function dailyRounds(pool: readonly Location[], dayKey: string): Location[] {
  const day = dayIndex(dayKey)
  const dealt = new Map<number, Location[]>()
  for (const tier of new Set(TIER_PATTERN)) dealt.set(tier, dealFromTier(pool, tier, day))
  return TIER_PATTERN.map((tier) => dealt.get(tier)!.shift()!).filter(Boolean)
}

/** Practice mode: a fresh set every time, same difficulty shape. */
export function endlessRounds(pool: readonly Location[]): Location[] {
  const rng = mulberry32((Math.random() * 2 ** 32) >>> 0)
  const byTier = new Map<number, Location[]>()
  for (const tier of new Set(TIER_PATTERN)) {
    byTier.set(tier, shuffled(pool.filter((l) => l.tier === tier), rng))
  }
  return TIER_PATTERN.map((tier) => byTier.get(tier)!.pop()!).filter(Boolean)
}
