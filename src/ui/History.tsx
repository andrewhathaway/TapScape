import { useMemo } from 'react'
import { ROUNDS_PER_DAY } from '../game/daily'
import { MAX_ROUND_SCORE, bandForRatio } from '../game/scoring'
import { getHistory } from '../game/storage'

/** Four weeks and change: long enough to show a habit, short enough to stay legible. */
export const HISTORY_DAYS = 30

const DAY_MAX = MAX_ROUND_SCORE * ROUNDS_PER_DAY

/** Dates are UTC day keys, so read them back in UTC or they drift a day west. */
const DAY_LABEL = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

function label(dayKey: string): string {
  return DAY_LABEL.format(new Date(`${dayKey}T00:00:00Z`))
}

interface Props {
  dayKey: string
  streak: { current: number; best: number }
}

export default function History({ dayKey, streak }: Props) {
  const days = useMemo(() => getHistory(dayKey, HISTORY_DAYS), [dayKey])
  const played = days.filter((d) => d.result)

  if (played.length < 2) {
    return (
      <div className="prose">
        <p>
          Play a few more days and your scores show up here — a month at a glance, so you
          can see whether you're actually getting better at this.
        </p>
      </div>
    )
  }

  const totals = played.map((d) => d.result!.total)
  const average = Math.round(totals.reduce((a, b) => a + b, 0) / totals.length)
  const best = Math.max(...totals)

  return (
    <div className="history">
      <dl className="history-stats">
        <div>
          <dt>Played</dt>
          <dd>
            {played.length}
            <span className="muted"> / {HISTORY_DAYS}</span>
          </dd>
        </div>
        <div>
          <dt>Average</dt>
          <dd>{average.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Best</dt>
          <dd>{best.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Streak</dt>
          <dd>
            {streak.current}
            <span className="muted"> / {streak.best}</span>
          </dd>
        </div>
      </dl>

      <div className="history-grid">
        {days.map((d) => {
          const name = label(d.dayKey)
          if (!d.result) {
            return (
              <div key={d.dayKey} className="cell empty" title={`${name} — not played`}>
                <span className="sr-only">{name}, not played</span>
              </div>
            )
          }
          const band = bandForRatio(d.result.total / DAY_MAX)
          const score = d.result.total.toLocaleString()
          return (
            <div
              key={d.dayKey}
              className={`cell band-${band}${d.dayKey === dayKey ? ' today' : ''}`}
              title={`${name} — ${score}`}
            >
              <span className="sr-only">
                {name}, {score}
              </span>
            </div>
          )
        })}
      </div>

      <div className="history-axis muted">
        <span>{label(days[0].dayKey)}</span>
        <span>Today</span>
      </div>

      <div className="history-legend muted">
        <span>Lower</span>
        {[3, 2, 1, 0].map((b) => (
          <span key={b} className={`cell band-${b}`} aria-hidden />
        ))}
        <span>Higher</span>
      </div>

      <p className="muted history-note">
        Kept on this device only — clearing your browser data clears your history.
      </p>
    </div>
  )
}
