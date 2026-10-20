/**
 * Shareable pages with their own preview images:
 *
 *   /r/<day>/<s1-s2-s3-s4-s5>   a finished daily — shows the score, offers today's puzzle
 *   /c/<seed>/<total>           a challenge — sends the visitor into the same endless run
 *   /og/r/… .png, /og/c/… .png  the 1200×630 cards those pages point at
 *
 * Discord, Reddit, Twitter and iMessage all fetch the HTML for its og: tags,
 * so a pasted link unfurls as a card instead of a bare URL.
 */

import { MAX_ROUND_SCORE } from '../src/game/scoring'
import { dayIndex } from '../src/game/daily'
import { cardSvg, renderPng, CARD_HEIGHT, CARD_WIDTH, type CardSpec } from './og'
import { dayKeyOf } from './schedule'
import type { Env } from './index'

const ROUNDS = 5
const DAY_MAX = MAX_ROUND_SCORE * ROUNDS

type Shared =
  | { kind: 'result'; dayKey: string; scores: number[]; total: number }
  | { kind: 'challenge'; seed: string; total: number }

function parseScores(input: string): number[] | null {
  const parts = input.split('-')
  if (parts.length !== ROUNDS) return null
  const scores = parts.map(Number)
  return scores.every((s) => Number.isInteger(s) && s >= 0 && s <= MAX_ROUND_SCORE) ? scores : null
}

function isDayKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false
  const ms = Date.parse(`${key}T00:00:00Z`)
  // Anything from launch until tomorrow; the future is not a result.
  return !Number.isNaN(ms) && ms >= Date.UTC(2026, 0, 1) && ms <= Date.now() + 86_400_000
}

/** Both the page path and its image path reduce to the same spec. */
function parse(parts: string[]): Shared | null {
  const [kind, a, b] = parts
  if (kind === 'r' && a && b && isDayKey(a)) {
    const scores = parseScores(b)
    return scores ? { kind: 'result', dayKey: a, scores, total: scores.reduce((x, y) => x + y, 0) } : null
  }
  if (kind === 'c' && a && b && /^[0-9a-z]{1,7}$/.test(a)) {
    const total = Number(b)
    if (!Number.isInteger(total) || total < 0 || total > DAY_MAX) return null
    return { kind: 'challenge', seed: a, total }
  }
  return null
}

const fmt = (n: number) => n.toLocaleString('en-GB')

function card(shared: Shared): CardSpec {
  if (shared.kind === 'result') {
    return {
      kicker: `Daily · ${shared.dayKey}`,
      big: fmt(shared.total),
      sub: `out of ${fmt(DAY_MAX)}`,
      scores: shared.scores,
      tagline: 'Five OSRS locations. Can you do better?',
    }
  }
  return {
    kicker: 'Challenge',
    big: fmt(shared.total),
    sub: `out of ${fmt(DAY_MAX)}`,
    scores: [],
    tagline: 'Same five places. Beat this score.',
  }
}

const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/**
 * The homepage's preview card: today's day number and yesterday's average,
 * over the map art. Cached for ten minutes. Never a player count.
 */
async function todayCard(request: Request, env: Env): Promise<Response> {
  const cache = caches.default
  const hit = await cache.match(request)
  if (hit) return hit

  const now = Date.now()
  const today = dayKeyOf(now)
  const yesterday = dayKeyOf(now - 86_400_000)
  const [stats, art] = await Promise.all([
    env.DB.prepare('SELECT day_key, plays, total FROM daily_stats WHERE day_key IN (?, ?)')
      .bind(today, yesterday)
      .all<{ day_key: string; plays: number; total: number }>(),
    env.ASSETS.fetch(new URL('/card-bg.jpg', request.url)).then((r) => (r.ok ? r.arrayBuffer() : undefined)),
  ])
  const byDay = new Map(stats.results.map((r) => [r.day_key, r]))
  const prior = byDay.get(yesterday)
  const avg = prior && prior.plays > 0 ? Math.round(prior.total / prior.plays) : null

  // Never a player count: a small one reads as a reason not to bother.
  const parts = ['A fresh five places today']
  if (avg !== null) parts.push(`yesterday's average ${fmt(avg)}`)

  const png = await renderPng(
    cardSvg({
      kicker: `Daily puzzle · ${DATE.format(new Date(`${today}T00:00:00Z`))}`,
      big: `Day ${dayIndex(today) + 1}`,
      sub: parts.join(' · '),
      scores: [],
      tagline: 'Five OSRS locations a day.',
      backdrop: art,
    }),
  )
  const response = new Response(png as unknown as BodyInit, {
    headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=600' },
  })
  await cache.put(request, response.clone())
  return response
}

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function page(shared: Shared, origin: string, path: string): string {
  const spec = card(shared)
  const image = `${origin}/og${path}.png`
  const url = `${origin}${path}`
  const total = fmt(shared.total)
  const max = fmt(DAY_MAX)

  const title = shared.kind === 'result'
    ? `TapScape ${shared.dayKey} — ${total} / ${max}`
    : `Beat ${total} on TapScape`
  const description = shared.kind === 'result'
    ? 'Five Old School RuneScape locations a day. Click where you think each one is.'
    : 'Same five OSRS locations, same scoring. See if you can beat this run.'
  const play = shared.kind === 'result'
    ? { href: '/?source=share', label: "Play today's puzzle" }
    : { href: `/?challenge=${shared.seed}&score=${shared.total}&source=challenge`, label: 'Take the challenge' }

  // Challenge links exist to be clicked through; results are worth a look first.
  const redirect = shared.kind === 'challenge'
    ? `<script>location.replace(${JSON.stringify(play.href)})</script>`
    : ''

  const squares = spec.scores.length
    ? `<div class="bands">${spec.scores
        .map((s) => `<span class="b${Math.min(3, Math.floor((1 - s / MAX_ROUND_SCORE) / 0.25))}"></span>`)
        .join('')}</div>`
    : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="noindex">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:site_name" content="TapScape">
<meta property="og:url" content="${esc(url)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="${CARD_WIDTH}">
<meta property="og:image:height" content="${CARD_HEIGHT}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(image)}">
<meta name="theme-color" content="#0e0d0b">
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0e0d0b; color: #f0e6d2;
         font: 15px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif; padding: 16px; box-sizing: border-box; }
  .card { background: #17150f; border: 1px solid #3a3426; border-radius: 12px; padding: 22px 24px; width: min(420px, 100%); }
  .brand { color: #ffb833; font-weight: 800; letter-spacing: .08em; font-size: 13px; }
  .kicker { color: #a2977d; margin-top: 6px; }
  .total { font-size: 40px; font-weight: 800; color: #ffb833; line-height: 1.1; margin-top: 8px; }
  .muted { color: #a2977d; font-size: 13px; }
  .bands { display: flex; gap: 6px; margin: 14px 0 4px; }
  .bands span { width: 28px; height: 28px; border-radius: 6px; }
  .b0 { background: #63a844; } .b1 { background: #e0b43a; } .b2 { background: #cf7430; } .b3 { background: #4c4433; }
  a.play { display: block; margin-top: 18px; padding: 12px; text-align: center; background: #ffb833; color: #1a1403;
           font-weight: 700; border-radius: 8px; text-decoration: none; }
</style>
${redirect}
</head>
<body>
  <main class="card">
    <div class="brand">TAPSCAPE</div>
    <div class="kicker">${esc(spec.kicker)}</div>
    <div class="total">${total}</div>
    <div class="muted">out of ${max}</div>
    ${squares}
    <p class="muted">${esc(spec.tagline)}</p>
    <a class="play" href="${esc(play.href)}">${esc(play.label)}</a>
  </main>
</body>
</html>`
}

const IMMUTABLE = 'public, max-age=31536000, immutable'

export async function handlePage(request: Request, env: Env, path: string): Promise<Response | null> {
  const url = new URL(request.url)
  if (path === '/og/today.png') return todayCard(request, env)
  const isImage = path.startsWith('/og/') && path.endsWith('.png')
  const parts = (isImage ? path.slice(3, -4) : path).split('/').filter(Boolean)
  const shared = parse(parts)
  if (!shared) return null

  // Crawlers must get an https image URL; wrangler dev reports the route as http.
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  const origin = local ? url.origin : `https://${url.host}`

  if (!isImage) {
    return new Response(page(shared, origin, '/' + parts.join('/')), {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600' },
    })
  }

  // The card is a pure function of the URL, so cache it hard.
  const cache = caches.default
  const hit = await cache.match(request)
  if (hit) return hit

  const png = await renderPng(cardSvg(card(shared)))
  const response = new Response(png as unknown as BodyInit, {
    headers: { 'content-type': 'image/png', 'cache-control': IMMUTABLE },
  })
  await cache.put(request, response.clone())
  return response
}
