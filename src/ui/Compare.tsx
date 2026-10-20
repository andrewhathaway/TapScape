import { MAX_ROUND_SCORE } from '../game/scoring'
import { BUCKET_SIZE, HIST_BUCKETS, beaten, ordinal, type Others } from '../game/stats'

const DAY_MAX = MAX_ROUND_SCORE * 5
/** Below this many other players a histogram is just noise; a single bar is shown instead. */
const HIST_MIN = 10

const fmt = (n: number) => n.toLocaleString()
const signed = (n: number) => (n >= 0 ? `+${fmt(n)}` : `−${fmt(-n)}`)

/**
 * After a reveal: this place's average today, the gap, and a line of context.
 * How many have played is never shown anywhere; a small number reads as "nobody
 * plays this", which is the wrong thing to tell a new player.
 */
export function RoundCompare({ others, round, score }: { others: Others; round: number; score: number }) {
  const avg = others.roundAvgs[round]
  const delta = score - avg
  const inside = Math.round(others.insideRates[round] * 100)
  const bits: string[] = []
  if (others.hardest === round) bits.push('Hardest place today')
  if (others.plays >= 5) bits.push(`${inside}% got inside`)
  if (bits.length === 0) bits.push(delta >= 0 ? 'Above today\'s average' : 'Below today\'s average')

  return (
    <div className="cmp-round">
      <div className="cmp-line">
        <span>
          Today's average here <b>{fmt(avg)}</b>
        </span>
        <b className={delta >= 0 ? 'up' : 'down'}>{signed(delta)}</b>
      </div>
      <div className="cmp-bar">
        <span className="cmp-you" style={{ width: `${(score / MAX_ROUND_SCORE) * 100}%` }} />
        <span className="cmp-mark" style={{ left: `${(avg / MAX_ROUND_SCORE) * 100}%` }} />
      </div>
      <div className="cmp-context">{bits.join(' · ')}</div>
    </div>
  )
}

/** On the result card: the whole field today, with this run placed in it. */
export function RunCompare({ others, total }: { others: Others; total: number }) {
  const n = others.plays
  const better = beaten(others, total)
  // A percentage once there are enough to make one; before that, a place in
  // the running order, which says where you stand without saying how many stood.
  const headline = n >= HIST_MIN
    ? `Better than ${Math.round((better / n) * 100)}%`
    : `${ordinal(n - better + 1)} today`
  const myBucket = Math.min(HIST_BUCKETS - 1, Math.floor(total / BUCKET_SIZE))
  const avgBucket = Math.min(HIST_BUCKETS - 1, Math.floor(others.avg / BUCKET_SIZE))
  const peak = Math.max(1, ...others.hist)

  return (
    <div className="cmp-run">
      <div className="cmp-head">
        <span className="cmp-k">Everyone today</span>
        <span className="cmp-v">{headline}</span>
      </div>

      {n >= HIST_MIN ? (
        <>
          <div className="cmp-hist" aria-hidden>
            {others.hist.map((count, i) => (
              <i
                key={i}
                className={i === myBucket ? 'me' : i === avgBucket ? 'avg' : undefined}
                style={{ height: `${Math.max(count > 0 ? 6 : 2, (count / peak) * 100)}%` }}
              />
            ))}
          </div>
          <div className="cmp-axis">
            <span>0</span>
            <span>{fmt(DAY_MAX / 2)}</span>
            <span>{fmt(DAY_MAX)}</span>
          </div>
          <div className="cmp-legend">
            <span className="l-me">You, {fmt(total)}</span>
            <span className="l-avg">Average, {fmt(others.avg)}</span>
            <span>Everyone else</span>
          </div>
        </>
      ) : (
        <>
          <div className="cmp-bar tall">
            <span className="cmp-you" style={{ width: `${(total / DAY_MAX) * 100}%` }} />
            <span className="cmp-mark" style={{ left: `${(others.avg / DAY_MAX) * 100}%` }} />
          </div>
          <div className="cmp-axis">
            <span>Average so far {fmt(others.avg)}</span>
            <span>You {fmt(total)}</span>
          </div>
          <div className="cmp-note">
            Early days. The full spread appears later on; reopen this tonight to see where you really landed.
          </div>
        </>
      )}
    </div>
  )
}
