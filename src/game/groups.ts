/**
 * Friend groups: a shareable code, a display name, and each member's daily
 * scores. Membership lives in localStorage; scores live in the Worker's D1 so
 * the whole group can see them. There are no accounts — the player id is a
 * random string minted on this device.
 */

import { todayKey } from './daily'
import { getDayResult } from './storage'

const KEY = 'tapscape:groups:v1'

export interface Player {
  id: string
  name: string
}

export interface Membership {
  code: string
  name: string
}

export interface GroupEntry {
  playerId: string
  name: string
  total: number
  scores: number[]
}

export interface GroupDay {
  dayKey: string
  entries: GroupEntry[]
}

export interface GroupView {
  code: string
  name: string
  members: Player[]
  /** Most recent first, at most a week. */
  days: GroupDay[]
}

interface Stored {
  player?: Player
  groups?: Membership[]
  /** The clan the header badge shows: the one looked at last. */
  primary?: string
}

export const MAX_GROUP_NAME = 24
export const MAX_PLAYER_NAME = 16

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
    // Private browsing: membership won't survive the tab.
  }
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join('-')
}

export function getPlayer(): Player | null {
  return read().player ?? null
}

function ensurePlayer(name: string): Player {
  const state = read()
  const player = { id: state.player?.id ?? randomId(), name: name.trim().slice(0, MAX_PLAYER_NAME) }
  write({ ...state, player })
  return player
}

export function getMemberships(): Membership[] {
  return read().groups ?? []
}

function remember(membership: Membership): void {
  const state = read()
  const groups = (state.groups ?? []).filter((g) => g.code !== membership.code)
  write({ ...state, groups: [...groups, membership] })
}

function forget(code: string): void {
  const state = read()
  write({
    ...state,
    groups: (state.groups ?? []).filter((g) => g.code !== code),
    primary: state.primary === code ? undefined : state.primary,
  })
}

/** The clan whose rank the header shows: last one opened, else the first joined. */
export function getPrimaryClan(): string | null {
  const { primary, groups = [] } = read()
  if (primary && groups.some((g) => g.code === primary)) return primary
  return groups[0]?.code ?? null
}

export function setPrimaryClan(code: string): void {
  write({ ...read(), primary: code })
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T | null> {
  try {
    const res = await fetch(`/api/groups${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

export function normaliseCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(.{4})(.{4})$/, '$1-$2')
}

/**
 * People mostly create or join a group straight after finishing a run, so a
 * result already on this device for today goes in immediately rather than
 * waiting for tomorrow.
 */
async function postToday(code: string, player: Player): Promise<void> {
  const today = todayKey()
  const result = getDayResult(today)
  if (!result) return
  await api('POST', `/${code}/scores`, { player, dayKey: today, total: result.total, scores: result.scores })
}

export async function createGroup(groupName: string, playerName: string): Promise<Membership | null> {
  const player = ensurePlayer(playerName)
  const name = groupName.trim().slice(0, MAX_GROUP_NAME)
  const created = await api<{ code: string }>('POST', '', { name, player })
  if (!created) return null
  const membership = { code: created.code, name }
  remember(membership)
  await postToday(membership.code, player)
  invalidateClans()
  return membership
}

export async function joinGroup(code: string, playerName: string): Promise<Membership | null> {
  const player = ensurePlayer(playerName)
  const joined = await api<{ name: string }>('POST', `/${normaliseCode(code)}/join`, { player })
  if (!joined) return null
  const membership = { code: normaliseCode(code), name: joined.name }
  remember(membership)
  await postToday(membership.code, player)
  invalidateClans()
  return membership
}

export async function leaveGroup(code: string): Promise<void> {
  const player = getPlayer()
  if (player) await api('DELETE', `/${code}/members/${encodeURIComponent(player.id)}`)
  forget(code)
  invalidateClans()
}

export async function fetchGroup(code: string): Promise<GroupView | null> {
  return api<GroupView>('GET', `/${code}`)
}

/** Just the name, for the join prompt — no membership needed. */
export async function peekGroup(code: string): Promise<{ name: string } | null> {
  return api<{ name: string }>('GET', `/${normaliseCode(code)}/peek`)
}

/** Push a finished daily to every clan this player is in; resolves when all are posted. */
export async function postScores(dayKey: string, scores: number[]): Promise<void> {
  const player = getPlayer()
  if (!player) return
  const total = scores.reduce((a, b) => a + b, 0)
  await Promise.all(
    getMemberships().map(({ code }) => api('POST', `/${code}/scores`, { player, dayKey, total, scores })),
  )
  invalidateClans()
}

// ---- today's boards, fetched once per visit and again after a score lands ----

let boards = new Map<string, Promise<GroupView | null>>()

export function invalidateClans(): void {
  boards = new Map()
}

/** Every clan this player is in, with today's and the week's scores. Cached for the visit. */
export async function loadClans(): Promise<GroupView[]> {
  const results = await Promise.all(
    getMemberships().map(({ code }) => {
      let p = boards.get(code)
      if (!p) {
        p = fetchGroup(code)
        boards.set(code, p)
      }
      return p
    }),
  )
  return results.filter((g): g is GroupView => g !== null)
}

export interface Standing {
  code: string
  name: string
  /** 1-based position among today's entries, or null if this player hasn't posted yet. */
  rank: number | null
  played: number
  members: number
  entries: GroupEntry[]
  notYet: string[]
}

export function standing(view: GroupView, today: string, me: string | null): Standing {
  const entries = view.days.find((d) => d.dayKey === today)?.entries ?? []
  const index = me ? entries.findIndex((e) => e.playerId === me) : -1
  const played = new Set(entries.map((e) => e.playerId))
  return {
    code: view.code,
    name: view.name,
    rank: index === -1 ? null : index + 1,
    played: entries.length,
    members: view.members.length,
    entries,
    notYet: view.members.filter((m) => !played.has(m.id)).map((m) => m.name),
  }
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
