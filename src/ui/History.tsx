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
  /** Makes every cell a button: play a missed day, or look at a played one. */
  onPickDay?: (dayKey: string) => void
}

export default function History({ dayKey, streak, onPickDay }: Props) {
  const days = useMemo(() => getHistory(dayKey, HISTORY_DAYS), [dayKey])
  const played = days.filter((d) => d.result)

  if (played.length < 2 && !onPickDay) {
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
  const average = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0
  const best = totals.length ? Math.max(...totals) : 0

  return (
    <div className="history">
      {onPickDay && (
        <div className="history-callout">
          <strong>Missed a day? Tap any empty square to play that puzzle.</strong>
          <span className="muted">Every past day has its own five places. They fill in the grid but don't count toward your streak.</span>
        </div>
      )}
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
          const Cell = onPickDay ? 'button' : 'div'
          const pick = onPickDay ? () => onPickDay(d.dayKey) : undefined
          if (!d.result) {
            return (
              <Cell
                key={d.dayKey}
                className={`cell empty${onPickDay ? ' playable' : ''}`}
                title={onPickDay ? `${name} — tap to play` : `${name} — not played`}
                onClick={pick}
              >
                <span className="sr-only">{name}, not played{onPickDay ? ' — play it' : ''}</span>
              </Cell>
            )
          }
          const band = bandForRatio(d.result.total / DAY_MAX)
          const score = d.result.total.toLocaleString()
          return (
            <Cell
              key={d.dayKey}
              className={`cell band-${band}${d.dayKey === dayKey ? ' today' : ''}`}
              title={`${name} — ${score}`}
              onClick={pick}
            >
              <span className="sr-only">
                {name}, {score}
              </span>
            </Cell>
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
