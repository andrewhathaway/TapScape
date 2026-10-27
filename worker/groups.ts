/**
 * Friend-group routes under /api/groups. No auth: a player is whatever id the
 * device minted, and a group is reachable by anyone holding its code. That is
 * the right level for "compare scores with your clan"; the worst an abuser can
 * do is post a silly score to a group they were invited to.
 */

import { MAX_ROUND_SCORE } from '../src/game/scoring'
import { dayKeyOf } from './schedule'
import type { Env } from './index'

const MAX_GROUP_NAME = 24
const MAX_PLAYER_NAME = 16
/** One line beside a score. Long enough for a quip, short enough to stay one. */
const MAX_NOTE = 80

/** The handful of words a clan code shouldn't let through unasked. Not a filter, a tripwire. */
const BLOCKED = /\b(n[i1]gg|f[a@]gg|k[i1]ke|retard|rape|kys)\w*/i

function cleanNote(input: unknown): string | null | undefined {
  if (input === undefined) return undefined
  if (input === null || input === '') return null
  if (typeof input !== 'string') return undefined
  const note = input.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE)
  if (!note) return null
  return BLOCKED.test(note) ? undefined : note
}
const MAX_MEMBERS = 50
const ROUNDS = 5
const HISTORY_DAYS = 7

/** No 0/O or 1/I, so a code read out over voice chat survives the trip. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

interface Player {
  id: string
  name: string
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

const bad = (msg = 'bad request') => json({ error: msg }, 400)

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length])
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`
}

function isCode(code: string): boolean {
  return /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)
}

function cleanName(input: unknown, max: number): string | null {
  if (typeof input !== 'string') return null
  const name = input.replace(/\s+/g, ' ').trim()
  return name.length >= 1 && name.length <= max ? name : null
}

function parsePlayer(input: unknown): Player | null {
  if (!input || typeof input !== 'object') return null
  const { id, name } = input as { id?: unknown; name?: unknown }
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) return null
  const clean = cleanName(name, MAX_PLAYER_NAME)
  return clean ? { id, name: clean } : null
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  if (Number(request.headers.get('content-length') ?? 0) > 4096) return null
  try {
    const body = (await request.json()) as unknown
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

async function groupName(env: Env, code: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT name FROM groups WHERE code = ?').bind(code).first<{ name: string }>()
  return row?.name ?? null
}

async function createGroup(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request)
  const name = cleanName(body?.name, MAX_GROUP_NAME)
  const player = parsePlayer(body?.player)
  if (!name || !player) return bad()

  const now = Date.now()
  // Collisions are astronomically unlikely at this scale, but a retry is free.
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newCode()
    try {
      await env.DB.batch([
        env.DB.prepare('INSERT INTO groups (code, name, created_at, creator_id) VALUES (?, ?, ?, ?)').bind(code, name, now, player.id),
        env.DB.prepare('INSERT INTO group_members (code, player_id, name, joined_at) VALUES (?, ?, ?, ?)').bind(
          code,
          player.id,
          player.name,
          now,
        ),
      ])
      return json({ code, name })
    } catch {
      // Duplicate code; try again.
    }
  }
  return json({ error: 'could not allocate a code' }, 500)
}

async function joinGroup(request: Request, env: Env, code: string): Promise<Response> {
  const body = await readJson(request)
  const player = parsePlayer(body?.player)
  if (!player) return bad()

  const name = await groupName(env, code)
  if (!name) return json({ error: 'no such group' }, 404)

  const count = await env.DB.prepare('SELECT count(*) AS n FROM group_members WHERE code = ?')
    .bind(code)
    .first<{ n: number }>()
  const already = await env.DB.prepare('SELECT 1 FROM group_members WHERE code = ? AND player_id = ?')
    .bind(code, player.id)
    .first()
  if (!already && (count?.n ?? 0) >= MAX_MEMBERS) return json({ error: 'group is full' }, 409)

  await env.DB.prepare(
    `INSERT INTO group_members (code, player_id, name, joined_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (code, player_id) DO UPDATE SET name = excluded.name`,
  )
    .bind(code, player.id, player.name, Date.now())
    .run()
  return json({ name })
}

async function postScores(request: Request, env: Env, code: string): Promise<Response> {
  const body = await readJson(request)
  const player = parsePlayer(body?.player)
  const { dayKey, total, scores } = body ?? {}
  const note = cleanNote(body?.note)
  if (note === undefined && body?.note !== undefined) return bad('note')
  if (!player || typeof dayKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return bad()
  if (
    !Array.isArray(scores) ||
    scores.length !== ROUNDS ||
    !scores.every((s) => Number.isInteger(s) && s >= 0 && s <= MAX_ROUND_SCORE)
  ) {
    return bad('scores')
  }
  const sum = (scores as number[]).reduce((a, b) => a + b, 0)
  if (total !== sum) return bad('total')

  // Only the current puzzle, with a day of slack for anyone finishing at the rollover.
  const now = Date.now()
  if (dayKey !== dayKeyOf(now) && dayKey !== dayKeyOf(now - 86_400_000)) return bad('day')

  const member = await env.DB.prepare('SELECT 1 FROM group_members WHERE code = ? AND player_id = ?')
    .bind(code, player.id)
    .first()
  if (!member) return json({ error: 'not a member' }, 403)

  await env.DB.batch([
    env.DB.prepare('UPDATE group_members SET name = ? WHERE code = ? AND player_id = ?').bind(player.name, code, player.id),
    // First result for the day stands; the game only allows one run anyway.
    // The note may be set or changed any time that day.
    env.DB.prepare(
      `INSERT INTO group_scores (code, player_id, day_key, total, scores, note) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (code, player_id, day_key) DO UPDATE SET note = CASE WHEN ?7 THEN excluded.note ELSE note END`,
    ).bind(code, player.id, dayKey, sum, JSON.stringify(scores), note ?? null, body?.note !== undefined ? 1 : 0),
  ])
  return json({ ok: true })
}

/** The clan's creator can take down any note in it; a member can clear their own. */
async function removeNote(request: Request, env: Env, code: string, targetId: string): Promise<Response> {
  const body = await readJson(request)
  const player = parsePlayer(body?.player)
  if (!player) return bad()
  const group = await env.DB.prepare('SELECT creator_id FROM groups WHERE code = ?').bind(code).first<{ creator_id: string | null }>()
  if (!group) return json({ error: 'no such group' }, 404)
  if (player.id !== targetId && group.creator_id !== player.id) return json({ error: 'not allowed' }, 403)
  await env.DB.prepare('UPDATE group_scores SET note = NULL WHERE code = ? AND player_id = ? AND day_key = ?')
    .bind(code, targetId, dayKeyOf(Date.now()))
    .run()
  return json({ ok: true })
}

async function getGroup(env: Env, code: string): Promise<Response> {
  const name = await groupName(env, code)
  if (!name) return json({ error: 'no such group' }, 404)

  const since = dayKeyOf(Date.now() - (HISTORY_DAYS - 1) * 86_400_000)
  const [members, scores] = await env.DB.batch([
    env.DB.prepare('SELECT player_id AS id, name FROM group_members WHERE code = ? ORDER BY joined_at').bind(code),
    env.DB.prepare(
      `SELECT s.player_id, m.name, s.day_key, s.total, s.scores, s.note
       FROM group_scores s JOIN group_members m ON m.code = s.code AND m.player_id = s.player_id
       WHERE s.code = ? AND s.day_key >= ?
       ORDER BY s.day_key DESC, s.total DESC`,
    ).bind(code, since),
  ])

  const days = new Map<string, { dayKey: string; entries: unknown[] }>()
  const today = dayKeyOf(Date.now())
  for (const r of scores.results as Array<{ player_id: string; name: string; day_key: string; total: number; scores: string; note: string | null }>) {
    let day = days.get(r.day_key)
    if (!day) days.set(r.day_key, (day = { dayKey: r.day_key, entries: [] }))
    // Notes are a today thing; yesterday's quip beside yesterday's score is noise.
    const note = r.day_key === today && r.note ? r.note : undefined
    day.entries.push({ playerId: r.player_id, name: r.name, total: r.total, scores: JSON.parse(r.scores), ...(note ? { note } : {}) })
  }
  const meta = await env.DB.prepare('SELECT creator_id FROM groups WHERE code = ?').bind(code).first<{ creator_id: string | null }>()

  return json({ code, name, creatorId: meta?.creator_id ?? null, members: members.results, days: [...days.values()] })
}

async function leaveGroup(env: Env, code: string, playerId: string): Promise<Response> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM group_scores WHERE code = ? AND player_id = ?').bind(code, playerId),
    env.DB.prepare('DELETE FROM group_members WHERE code = ? AND player_id = ?').bind(code, playerId),
  ])
  // An empty group is just a dangling code; tidy it.
  await env.DB.prepare(
    'DELETE FROM groups WHERE code = ? AND NOT EXISTS (SELECT 1 FROM group_members WHERE code = ?)',
  )
    .bind(code, code)
    .run()
  return json({ ok: true })
}

export async function handleGroups(request: Request, env: Env, path: string): Promise<Response> {
  const parts = path.replace(/^\/api\/groups\/?/, '').split('/').filter(Boolean)

  if (parts.length === 0) {
    return request.method === 'POST' ? createGroup(request, env) : json({ error: 'not found' }, 404)
  }

  const code = parts[0].toUpperCase()
  if (!isCode(code)) return bad('code')
  const action = parts[1]

  if (request.method === 'GET' && !action) return getGroup(env, code)
  if (request.method === 'GET' && action === 'peek') {
    const name = await groupName(env, code)
    return name ? json({ name }) : json({ error: 'no such group' }, 404)
  }
  if (request.method === 'POST' && action === 'join') return joinGroup(request, env, code)
  if (request.method === 'POST' && action === 'scores') return postScores(request, env, code)
  if (request.method === 'DELETE' && action === 'members' && parts[2]) {
    return leaveGroup(env, code, decodeURIComponent(parts[2]))
  }
  if (request.method === 'DELETE' && action === 'notes' && parts[2]) {
    return removeNote(request, env, code, decodeURIComponent(parts[2]))
  }
  return json({ error: 'not found' }, 404)
}
