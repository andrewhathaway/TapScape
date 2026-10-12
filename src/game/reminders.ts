/**
 * Client side of the daily push reminder. The browser holds the subscription,
 * the Worker holds the schedule, and localStorage remembers what the player
 * chose so the UI can render without a round trip.
 */

import { todayKey } from './daily'

const KEY = 'tapscape:reminders:v1'
const SW_URL = '/sw.js'

export const DEFAULT_HOUR = 8

/** How long "Not now" keeps the offer out of sight. */
const SNOOZE_DAYS = 7

export interface ReminderState {
  /** The player turned reminders on and the browser granted permission. */
  enabled: boolean
  hour: number
  /** Last UTC day the Worker was told about this subscription; limits re-sync to once a day. */
  syncedDay?: string
  /** Set when the player tapped "Not now" on the offer. */
  dismissedAt?: number
}

function read(): ReminderState {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null') as ReminderState | null
    if (stored && typeof stored === 'object') return { ...stored, hour: stored.hour ?? DEFAULT_HOUR }
  } catch {
    // Fall through to the default.
  }
  return { enabled: false, hour: DEFAULT_HOUR }
}

function write(next: ReminderState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Private browsing: the choice just won't be remembered.
  }
}

export function getReminderState(): ReminderState {
  return read()
}

/** Push needs a service worker, the Push API, and a secure context (localhost counts). */
export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    window.isSecureContext
  )
}

/**
 * iOS only delivers web push to sites on the Home Screen, and hides the Push
 * API entirely in the ordinary Safari tab. This is the case to explain rather
 * than silently offer nothing.
 */
export function needsHomeScreen(): boolean {
  if (typeof navigator === 'undefined') return false
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return ios && !standalone && !('PushManager' in window)
}

export function offerSnoozed(): boolean {
  const { dismissedAt } = read()
  return dismissedAt !== undefined && Date.now() - dismissedAt < SNOOZE_DAYS * 86_400_000
}

export function snoozeOffer(): void {
  write({ ...read(), dismissedAt: Date.now() })
}

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null
  try {
    await navigator.serviceWorker.register(SW_URL)
    return navigator.serviceWorker.ready
  } catch {
    return null
  }
}

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=')
  const raw = atob(padded)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export async function fetchServerKey(): Promise<string | null> {
  try {
    const res = await fetch('/api/reminders/key')
    if (!res.ok) return null
    const { publicKey } = (await res.json()) as { publicKey?: string }
    return publicKey ?? null
  } catch {
    return null
  }
}

async function api(method: string, path: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(`/api/reminders${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registerServiceWorker()
  return reg ? reg.pushManager.getSubscription() : null
}

async function upload(subscription: PushSubscription, hour: number): Promise<boolean> {
  const ok = await api('PUT', '', { subscription: subscription.toJSON(), tz: localTimeZone(), hour })
  if (ok) write({ ...read(), enabled: true, hour, syncedDay: todayKey(), dismissedAt: undefined })
  return ok
}

export type EnableResult = 'enabled' | 'denied' | 'failed'

/**
 * Must be called from a click handler with no awaits before the permission
 * request: Safari discards a prompt that isn't directly tied to a user gesture.
 * `serverKey` should therefore be fetched ahead of time.
 */
export async function enableReminders(serverKey: string, hour: number): Promise<EnableResult> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'

  const reg = await registerServiceWorker()
  if (!reg) return 'failed'

  try {
    const subscription =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(serverKey) as BufferSource,
      }))
    return (await upload(subscription, hour)) ? 'enabled' : 'failed'
  } catch {
    return 'failed'
  }
}

export async function changeReminderHour(hour: number): Promise<boolean> {
  const subscription = await currentSubscription()
  if (!subscription) return false
  return upload(subscription, hour)
}

export async function disableReminders(): Promise<void> {
  const subscription = await currentSubscription()
  if (subscription) {
    await api('DELETE', '', { endpoint: subscription.endpoint })
    try {
      await subscription.unsubscribe()
    } catch {
      // The server row is gone either way; a dangling browser subscription is harmless.
    }
  }
  write({ ...read(), enabled: false, syncedDay: undefined })
}

/**
 * Tell the Worker a daily run was completed, so today's reminder is skipped
 * if it hasn't gone yet. Fire-and-forget.
 */
export function reportPlayed(dayKey: string): void {
  if (!read().enabled) return
  void currentSubscription().then((subscription) => {
    if (subscription) void api('POST', '/played', { endpoint: subscription.endpoint, dayKey })
  })
}

/**
 * On app load, re-send the subscription once a day. This refreshes the
 * timezone if the player travelled, and it quietly resumes reminders for a
 * lapsed player who was sent the goodbye message and has now come back.
 */
export function syncReminders(): void {
  const state = read()
  if (!state.enabled || !pushSupported()) return
  if (Notification.permission !== 'granted') {
    write({ ...state, enabled: false })
    return
  }
  if (state.syncedDay === todayKey()) return
  void currentSubscription().then((subscription) => {
    if (subscription) void upload(subscription, state.hour)
  })
}

/** Local development only: the Worker refuses this unless ALLOW_TEST_SEND=1. */
export async function sendTestReminder(): Promise<string> {
  const subscription = await currentSubscription()
  if (!subscription) return 'Not subscribed'
  try {
    const res = await fetch('/api/reminders/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    })
    const body = (await res.json()) as { ok?: boolean; status?: number; error?: string; pushService?: string }
    if (body.ok) return 'Sent'
    const detail = (body.pushService || body.error || '').trim().slice(0, 120)
    return `Push service said ${body.status ?? ''}${detail ? `: ${detail}` : ''}`
  } catch {
    return 'Request failed'
  }
}
