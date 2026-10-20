import { useEffect, useState } from 'react'
import {
  changeReminderHour,
  disableReminders,
  enableReminders,
  fetchServerKey,
  getReminderState,
  needsHomeScreen,
  offerSnoozed,
  pushSupported,
  sendTestReminder,
  snoozeOffer,
} from '../game/reminders'
import { track } from '../game/analytics'
import IosGuide from './IosGuide'

const BASE_HOURS = [6, 7, 8, 9, 10, 12, 18, 20]

function hourLabel(hour: number): string {
  if (hour === 0) return 'midnight'
  if (hour === 12) return 'noon'
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`
}

/** Shown only when the page is served locally, so the Worker's test route can be exercised. */
const LOCAL = typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname)

/**
 * The reminder offer on the daily result card. Deliberately quiet: one line of
 * copy, an hour picker, and a "Not now" that hides it for a week. The browser's
 * own permission prompt only appears after the player taps "Remind me".
 */
interface Props {
  /** `sheet`: its own settings page, so it never hides itself and has no "Not now". */
  context?: 'card' | 'sheet'
  /** Pre-selected hour for a player who hasn't chosen one yet (from their playing habit). */
  suggestedHour?: number
}

export default function Reminder({ context = 'card', suggestedHour }: Props) {
  const inSheet = context === 'sheet'
  const [state, setState] = useState(getReminderState)
  const [hour, setHour] = useState(state.enabled ? state.hour : (suggestedHour ?? state.hour))
  const [serverKey, setServerKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [hidden, setHidden] = useState(() => !inSheet && offerSnoozed())

  // Fetch the key up front so the click handler can prompt without awaiting first.
  useEffect(() => {
    if (!state.enabled && pushSupported()) void fetchServerKey().then(setServerKey)
  }, [state.enabled])

  if (needsHomeScreen()) {
    return inSheet ? (
      <IosGuide />
    ) : (
      <p className="reminder muted">
        Add TapScape to your Home Screen and it can nudge you each morning when the new
        puzzle is ready.
      </p>
    )
  }
  if (!pushSupported()) {
    return inSheet ? (
      <p className="muted">
        This browser can't receive notifications. On iPhone that means iOS 16.4 or later is
        needed; on Android, Chrome, Firefox or Samsung Internet all work.
      </p>
    ) : null
  }
  if (hidden) return null
  if (Notification.permission === 'denied') {
    return inSheet ? (
      <p className="muted">
        Notifications are blocked for this site in your browser settings. Allow them there and
        come back.
      </p>
    ) : null
  }

  const flash = (text: string) => {
    setNote(text)
    setTimeout(() => setNote(null), 8000)
  }

  const enable = async () => {
    if (!serverKey) return flash("Couldn't reach the reminder service")
    setBusy(true)
    const result = await enableReminders(serverKey, hour)
    setBusy(false)
    track('reminder', { result, hour })
    if (result === 'enabled') setState(getReminderState())
    else if (result === 'denied') setHidden(true)
    else flash("Couldn't set that up, sorry")
  }

  const change = async (next: number) => {
    setHour(next)
    if (await changeReminderHour(next)) setState(getReminderState())
    else flash("Couldn't save that")
  }

  const disable = async () => {
    setBusy(true)
    track('reminder', { result: 'off' })
    await disableReminders()
    setBusy(false)
    setState(getReminderState())
  }

  const dismiss = () => {
    track('reminder', { result: 'not_now' })
    snoozeOffer()
    setHidden(true)
  }

  const hours = BASE_HOURS.includes(hour) ? BASE_HOURS : [...BASE_HOURS, hour].sort((a, b) => a - b)
  const picker = (
    <select
      className="reminder-hour"
      value={hour}
      disabled={busy}
      aria-label="Reminder time"
      onChange={(e) => (state.enabled ? void change(Number(e.target.value)) : setHour(Number(e.target.value)))}
    >
      {hours.map((h) => (
        <option key={h} value={h}>
          {hourLabel(h)}
        </option>
      ))}
    </select>
  )

  if (state.enabled) {
    return (
      <div className="reminder">
        <span className="muted">{note ?? 'Morning reminder is on.'}</span>
        <div className="reminder-row">
          {picker}
          <span className="reminder-actions">
            {LOCAL && (
              <button className="link" onClick={() => void sendTestReminder().then(flash)}>
                Send test
              </button>
            )}
            <button className="link" disabled={busy} onClick={() => void disable()}>
              Turn off
            </button>
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="reminder">
      <span className="muted">
        {note ?? (inSheet
          ? 'One quiet notification a day when the new five is ready. Nothing else, ever, and it stops on its own if you stop playing.'
          : 'Want a quiet nudge each morning when the new puzzle is ready?')}
      </span>
      <div className="reminder-row">
        {picker}
        <span className="reminder-actions">
          {!inSheet && (
            <button className="link" onClick={dismiss}>
              Not now
            </button>
          )}
          <button className="link strong" disabled={busy || !serverKey} onClick={() => void enable()}>
            Remind me
          </button>
        </span>
      </div>
    </div>
  )
}
