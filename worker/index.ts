/**
 * The dynamic side of TapScape:
 *
 *   /api/reminders/*   push reminder subscriptions (this file) and an hourly cron
 *   /api/groups/*      friend groups (groups.ts)
 *   /r/*, /c/*, /og/*  share pages and their preview images (pages.ts)
 *
 * Everything else on the domain is served straight from ./dist by Cloudflare;
 * `run_worker_first` in wrangler.jsonc routes only these paths here.
 */

import {
  buildPushPayload,
  type PushMessage,
  type PushSubscription,
  type VapidKeys,
} from '@block65/webcrypto-web-push'
import { dayKeyOf, nextSendAt } from './schedule'
import { handleGroups } from './groups'
import { handlePage } from './pages'

export interface Env {
  DB: D1Database
  /** The static site, so the Worker can read its own og.png for the live card. */
  ASSETS: Fetcher
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_KEY: string
  /** `mailto:` or `https:` URL the push services can use to reach the operator. */
  VAPID_SUBJECT: string
  /** Set to "1" in .dev.vars only. Enables POST /api/reminders/test. */
  ALLOW_TEST_SEND?: string
}

interface Row {
  endpoint: string
  p256dh: string
  auth: string
  tz: string
  hour: number
  next_send_at: number
  last_sent_day: string | null
  last_played_day: string | null
  created_at: number
  failures: number
}

/**
 * Free-plan Workers get 50 outbound requests per invocation, and D1 calls count.
 * One select, one push per row and one batched write leaves room for this many.
 * Rows left over are picked up by the next hourly run.
 */
const SEND_BATCH = 40

/** Pushes that fail this many times in a row are treated as dead. */
const MAX_FAILURES = 5

/** A subscriber who hasn't finished a daily in this long gets one goodbye, then silence. */
const LAPSE_DAYS = 14

const DAY_MS = 86_400_000
const DAY_MAX = 25_000

const DAILY_MESSAGE: PushMessage = {
  data: {
    title: "Today's TapScape is ready",
    body: 'Five new places to find.',
    url: '/?source=reminder',
    tag: 'tapscape-daily',
  },
  // Skip the message entirely if the device is unreachable for most of the
  // morning; a "today's puzzle" nudge arriving at 11pm is the spammy version.
  options: { ttl: 6 * 60 * 60, urgency: 'low', topic: 'daily' },
}

const FAREWELL_MESSAGE: PushMessage = {
  data: {
    title: 'Pausing your TapScape reminders',
    body: "You haven't played in a while, so this is the last one. Tap if you'd like them back.",
    url: '/?source=farewell',
    tag: 'tapscape-daily',
  },
  options: { ttl: 24 * 60 * 60, urgency: 'low', topic: 'daily' },
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function vapid(env: Env): VapidKeys {
  return { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }
}

function isValidTz(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

function isValidHour(hour: unknown): hour is number {
  return typeof hour === 'number' && Number.isInteger(hour) && hour >= 0 && hour <= 23
}

function parseSubscription(input: unknown): PushSubscription | null {
  if (!input || typeof input !== 'object') return null
  const { endpoint, keys } = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  if (typeof endpoint !== 'string' || endpoint.length > 2048 || !endpoint.startsWith('https://')) return null
  if (typeof keys?.p256dh !== 'string' || typeof keys.auth !== 'string') return null
  if (keys.p256dh.length > 200 || keys.auth.length > 100) return null
  return { endpoint, expirationTime: null, keys: { p256dh: keys.p256dh, auth: keys.auth } }
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > 8192) return null
  try {
    const body = (await request.json()) as unknown
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

async function getRow(env: Env, endpoint: string): Promise<Row | null> {
  return env.DB.prepare('SELECT * FROM subscriptions WHERE endpoint = ?').bind(endpoint).first<Row>()
}

/**
 * Apple's push service answers any request carrying a Topic header with
 * 400 BadWebPushTopic, whatever the value. Chrome and Firefox honour it (a
 * newer undelivered message replaces the older one), so it is dropped only for
 * Apple endpoints; the notification's own tag still collapses duplicates on
 * the device.
 */
function forPushService(message: PushMessage, endpoint: string): PushMessage {
  if (!new URL(endpoint).hostname.endsWith('.push.apple.com')) return message
  if (!message.options?.topic) return message
  const { topic: _topic, ...options } = message.options
  return { ...message, options: options as PushMessage['options'] }
}

async function send(env: Env, row: Row, message: PushMessage): Promise<Response> {
  const subscription: PushSubscription = {
    endpoint: row.endpoint,
    expirationTime: null,
    keys: { p256dh: row.p256dh, auth: row.auth },
  }
  const payload = await buildPushPayload(forPushService(message, row.endpoint), subscription, vapid(env))
  return fetch(row.endpoint, payload)
}

/** 404 and 410 from a push service mean the browser unsubscribed; drop the row. */
function isGone(status: number): boolean {
  return status === 404 || status === 410
}

function lapsed(row: Row, now: number): boolean {
  const lastActive = row.last_played_day
    ? Date.parse(`${row.last_played_day}T00:00:00Z`)
    : row.created_at
  return now - lastActive >= LAPSE_DAYS * DAY_MS
}

async function sendDue(env: Env, now: number): Promise<void> {
  const today = dayKeyOf(now)
  const { results: rows } = await env.DB.prepare(
    'SELECT * FROM subscriptions WHERE next_send_at <= ? ORDER BY next_send_at LIMIT ?',
  )
    .bind(now, SEND_BATCH)
    .all<Row>()

  const writes: D1PreparedStatement[] = []
  const reschedule = env.DB.prepare('UPDATE subscriptions SET next_send_at = ?, last_sent_day = ?, failures = ? WHERE endpoint = ?')
  const remove = env.DB.prepare('DELETE FROM subscriptions WHERE endpoint = ?')

  for (const row of rows) {
    // Already nudged about this puzzle, or they beat the reminder to it.
    if (row.last_sent_day === today || row.last_played_day === today) {
      const next = nextSendAt(now, row.tz, row.hour, [row.last_sent_day, row.last_played_day])
      writes.push(reschedule.bind(next, row.last_sent_day, row.failures, row.endpoint))
      continue
    }

    const goodbye = lapsed(row, now)
    let status = 0
    try {
      status = (await send(env, row, goodbye ? FAREWELL_MESSAGE : DAILY_MESSAGE)).status
    } catch {
      // Network failure to the push service: counted below like any other miss.
    }

    if (isGone(status) || goodbye) {
      writes.push(remove.bind(row.endpoint))
      continue
    }

    const ok = status >= 200 && status < 300
    const failures = ok ? 0 : row.failures + 1
    if (failures >= MAX_FAILURES) {
      writes.push(remove.bind(row.endpoint))
      continue
    }

    const sentDay = ok ? today : row.last_sent_day
    const next = nextSendAt(now, row.tz, row.hour, [sentDay, row.last_played_day])
    writes.push(reschedule.bind(next, sentDay, failures, row.endpoint))
  }

  if (writes.length) await env.DB.batch(writes)
}

async function handleApi(request: Request, env: Env, path: string): Promise<Response> {
  const now = Date.now()

  if (request.method === 'POST' && path === '/api/stats/played') {
    const body = await readJson(request)
    const { dayKey, total } = body ?? {}
    const yesterday = dayKeyOf(now - 86_400_000)
    if (
      typeof dayKey !== 'string' || (dayKey !== dayKeyOf(now) && dayKey !== yesterday) ||
      typeof total !== 'number' || !Number.isInteger(total) || total < 0 || total > DAY_MAX
    ) {
      return json({ error: 'bad request' }, 400)
    }
    await env.DB.prepare(
      `INSERT INTO daily_stats (day_key, plays, total) VALUES (?, 1, ?)
       ON CONFLICT (day_key) DO UPDATE SET plays = plays + 1, total = total + excluded.total`,
    )
      .bind(dayKey, total)
      .run()
    return json({ ok: true })
  }

  if (request.method === 'GET' && path === '/api/reminders/key') {
    return json({ publicKey: env.VAPID_PUBLIC_KEY })
  }

  if (request.method === 'PUT' && path === '/api/reminders') {
    const body = await readJson(request)
    const subscription = parseSubscription(body?.subscription)
    if (!body || !subscription || !isValidTz(body.tz) || !isValidHour(body.hour)) {
      return json({ error: 'bad request' }, 400)
    }
    const existing = await getRow(env, subscription.endpoint)
    const next = nextSendAt(now, body.tz, body.hour, [existing?.last_sent_day, existing?.last_played_day])
    await env.DB.prepare(
      `INSERT INTO subscriptions (endpoint, p256dh, auth, tz, hour, next_send_at, last_sent_day, last_played_day, created_at, failures)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT (endpoint) DO UPDATE SET
         p256dh = excluded.p256dh, auth = excluded.auth, tz = excluded.tz, hour = excluded.hour,
         next_send_at = excluded.next_send_at, failures = 0`,
    )
      .bind(
        subscription.endpoint,
        subscription.keys.p256dh,
        subscription.keys.auth,
        body.tz,
        body.hour,
        next,
        existing?.last_sent_day ?? null,
        existing?.last_played_day ?? null,
        existing?.created_at ?? now,
      )
      .run()
    return json({ ok: true, nextSendAt: next })
  }

  if (request.method === 'DELETE' && path === '/api/reminders') {
    const body = await readJson(request)
    if (typeof body?.endpoint !== 'string') return json({ error: 'bad request' }, 400)
    await env.DB.prepare('DELETE FROM subscriptions WHERE endpoint = ?').bind(body.endpoint).run()
    return json({ ok: true })
  }

  if (request.method === 'POST' && path === '/api/reminders/played') {
    const body = await readJson(request)
    if (typeof body?.endpoint !== 'string' || typeof body.dayKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.dayKey)) {
      return json({ error: 'bad request' }, 400)
    }
    const row = await getRow(env, body.endpoint)
    if (!row) return json({ ok: false }, 404)
    const next = nextSendAt(now, row.tz, row.hour, [row.last_sent_day, body.dayKey])
    await env.DB.prepare('UPDATE subscriptions SET last_played_day = ?, next_send_at = ? WHERE endpoint = ?')
      .bind(body.dayKey, next, row.endpoint)
      .run()
    return json({ ok: true, nextSendAt: next })
  }

  if (request.method === 'POST' && path === '/api/reminders/rotate') {
    const body = await readJson(request)
    const subscription = parseSubscription(body?.subscription)
    if (typeof body?.oldEndpoint !== 'string' || !subscription) return json({ error: 'bad request' }, 400)
    await env.DB.prepare('UPDATE subscriptions SET endpoint = ?, p256dh = ?, auth = ? WHERE endpoint = ?')
      .bind(subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, body.oldEndpoint)
      .run()
    return json({ ok: true })
  }

  // Local development only: fire the daily message at one subscription right now.
  if (request.method === 'POST' && path === '/api/reminders/test' && env.ALLOW_TEST_SEND === '1') {
    const body = await readJson(request)
    if (typeof body?.endpoint !== 'string') return json({ error: 'bad request' }, 400)
    const row = await getRow(env, body.endpoint)
    if (!row) return json({ error: 'not subscribed' }, 404)
    try {
      const res = await send(env, row, DAILY_MESSAGE)
      const pushService = await res.text()
      console.log(`test send → ${new URL(row.endpoint).host} ${res.status} ${pushService}`)
      return json({ ok: res.ok, status: res.status, pushService })
    } catch (err) {
      return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 502)
    }
  }

  return json({ error: 'not found' }, 404)
}

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname.startsWith('/api/groups')) return handleGroups(request, env, pathname)
    if (pathname.startsWith('/api/')) return handleApi(request, env, pathname)
    if (request.method === 'GET') {
      const page = await handlePage(request, env, pathname)
      if (page) return page
    }
    return new Response('Not found', { status: 404 })
  },

  async scheduled(event, env, ctx): Promise<void> {
    ctx.waitUntil(sendDue(env, event.scheduledTime))
  },
} satisfies ExportedHandler<Env>
