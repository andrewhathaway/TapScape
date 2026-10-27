import { useEffect, useRef, useState } from 'react'
import { MAX_ROUND_SCORE, bandForRatio } from '../game/scoring'
import { ordinal, type Standing } from '../game/groups'

const BAND_EMOJI = ['🟩', '🟨', '🟧', '⬛']

function bands(scores: number[]): string {
  return scores.map((s) => BAND_EMOJI[bandForRatio(s / MAX_ROUND_SCORE)]).join('')
}

/** How many rows to show: the top three, plus your own if you're lower. */
const TOP = 3

interface Props {
  standings: Standing[]
  me: string | null
  onOpen: (code: string) => void
}

/**
 * Today's table for each clan, on the result card. One clan is a block; more
 * than one is a swipeable row with dots, one clan per screen.
 */
export default function ClanBoard({ standings, me, onOpen }: Props) {
  const [page, setPage] = useState(0)
  const track = useRef<HTMLDivElement>(null)

  // Follow the swipe with the dots.
  useEffect(() => {
    const el = track.current
    if (!el) return
    const onScroll = () => setPage(Math.round(el.scrollLeft / el.clientWidth))
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  if (standings.length === 0) return null
  const many = standings.length > 1

  return (
    <div className="clanboard">
      <div className={many ? 'clan-track many' : 'clan-track'} ref={track}>
        {standings.map((s) => {
          const shown = s.entries.slice(0, TOP)
          const mine = s.entries.findIndex((e) => e.playerId === me)
          if (mine >= TOP) shown.push(s.entries[mine])
          const everyone = s.played === s.members
          const status =
            s.rank === null
              ? `${s.played} of ${s.members} played`
              : `${ordinal(s.rank)} of ${s.played}${everyone ? '' : ' so far'}`
          return (
            <button key={s.code} className="clan-block" onClick={() => onOpen(s.code)}>
              <div className="clan-head">
                <span>{s.name}</span>
                <b>{status}</b>
              </div>
              {shown.length === 0 ? (
                <p className="clan-empty">Nobody's played yet today. You could be first.</p>
              ) : (
                <ol className="clan-rows">
                  {shown.map((e) => {
                    const place = s.entries.indexOf(e) + 1
                    return (
                      <li key={e.playerId} className={e.playerId === me ? 'me' : undefined}>
                        <em>{place}.</em>
                        <span className="clan-name">
                          {e.name}
                          <span className="clan-bands" aria-hidden>
                            {bands(e.scores)}
                          </span>
                          {e.note && <span className="clan-note">{e.note}</span>}
                        </span>
                        <strong>{e.total.toLocaleString()}</strong>
                      </li>
                    )
                  })}
                </ol>
              )}
              {s.notYet.length > 0 && (
                <div className="clan-notyet">
                  Not yet: {s.notYet.slice(0, 4).join(', ')}
                  {s.notYet.length > 4 ? ` +${s.notYet.length - 4}` : ''}
                </div>
              )}
            </button>
          )
        })}
      </div>
      {many && (
        <div className="clan-dots" aria-hidden>
          {standings.map((s, i) => (
            <span key={s.code} className={i === page ? 'on' : undefined} />
          ))}
        </div>
      )}
    </div>
  )
}
