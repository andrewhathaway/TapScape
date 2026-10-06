import { useCallback, useEffect, useMemo, useState } from 'react'
import OsrsMap from './map/OsrsMap'
import Modal from './ui/Modal'
import HowToPlay from './ui/HowToPlay'
import About from './ui/About'
import { LOCATIONS } from './data/locations'
import { dailyRounds, endlessRounds, todayKey } from './game/daily'
import { MAX_ROUND_SCORE, isInside, scoreForDistance, tileDistance } from './game/scoring'
import { copyText, shareText } from './game/share'
import {
  getDayResult,
  getStreak,
  hasSeenIntro,
  markIntroSeen,
  saveDayResult,
} from './game/storage'
import type { Guess, WorldPoint } from './game/types'

type Mode = 'daily' | 'endless'
type Sheet = 'intro' | 'how' | 'about' | null

interface Line {
  name: string
  score: number
  distance?: number
  inside?: boolean
}

export default function App() {
  const dayKey = useMemo(() => todayKey(), [])

  const [mode, setMode] = useState<Mode>('daily')
  const [sheet, setSheet] = useState<Sheet>(null)
  const [seed, setSeed] = useState(0)
  const [roundIndex, setRoundIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [pending, setPending] = useState<WorldPoint | null>(null)
  const [results, setResults] = useState<Guess[]>([])

  useEffect(() => {
    if (!hasSeenIntro()) setSheet('intro')
  }, [])

  const rounds = useMemo(
    () => (mode === 'daily' ? dailyRounds(LOCATIONS, dayKey) : endlessRounds(LOCATIONS)),
    // `seed` deliberately re-rolls an endless set without changing mode.
    [mode, dayKey, seed],
  )

  const archived = mode === 'daily' ? getDayResult(dayKey) : null
  const replaying = archived !== null && results.length === 0
  const target = rounds[roundIndex]
  const finished = roundIndex >= rounds.length
  const showSummary = finished || replaying
  const current = revealed ? results[roundIndex] : undefined

  const startSession = useCallback((next: Mode) => {
    setMode(next)
    setResults([])
    setPending(null)
    setRoundIndex(0)
    setRevealed(false)
    setSeed((s) => s + 1)
  }, [])

  const lockIn = useCallback(() => {
    if (!pending || !target || revealed) return
    const distance = tileDistance(pending, target)
    const next = [
      ...results,
      {
        location: target,
        guessed: pending,
        distance,
        score: scoreForDistance(distance, target.radius),
      },
    ]
    setResults(next)
    setRevealed(true)
    if (mode === 'daily' && next.length === rounds.length) saveDayResult(dayKey, next)
  }, [pending, target, revealed, results, mode, rounds.length, dayKey])

  const advance = useCallback(() => {
    setRevealed(false)
    setPending(null)
    setRoundIndex((i) => i + 1)
  }, [])

  // Enter advances whatever the current step is.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || sheet || showSummary) return
      if (revealed) advance()
      else if (pending) lockIn()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet, showSummary, revealed, pending, advance, lockIn])

  const lines: Line[] = replaying
    ? rounds.map((r, i) => ({ name: r.name, score: archived!.scores[i] ?? 0 }))
    : results.map((r) => ({
        name: r.location.name,
        score: r.score,
        distance: r.distance,
        inside: isInside(r.distance, r.location.radius),
      }))
  const total = lines.reduce((sum, l) => sum + l.score, 0)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">TapScape</div>

        <nav className="modes" aria-label="Game mode">
          {(['daily', 'endless'] as const).map((m) => (
            <button
              key={m}
              className={mode === m ? 'tab active' : 'tab'}
              onClick={() => startSession(m)}
            >
              {m === 'daily' ? 'Daily' : 'Endless'}
            </button>
          ))}
        </nav>

        <div className="prompt">
          {showSummary ? (
            <div className="prompt-name">Run complete</div>
          ) : (
            <>
              <div className="prompt-label">
                Round {roundIndex + 1} of {rounds.length}
                {mode === 'daily' && ` · ${dayKey}`}
              </div>
              <div className="prompt-name">{target?.name}</div>
            </>
          )}
        </div>

        <div className="rounds" aria-hidden>
          {rounds.map((r, i) => (
            <span
              key={r.id}
              className={`pip ${i < results.length ? 'done' : i === roundIndex ? 'current' : ''}`}
            />
          ))}
        </div>

        <div className="score">{total.toLocaleString()}</div>

        <button className="icon" onClick={() => setSheet('how')} aria-label="How to play">
          ?
        </button>
        <button className="icon" onClick={() => setSheet('about')} aria-label="About">
          i
        </button>
      </header>

      <div className="stage">
        <OsrsMap
          guess={pending}
          answer={current ? current.location : null}
          onPick={showSummary || revealed ? undefined : setPending}
        />

        {!showSummary && (
          <div className="hud">
            {current ? (
              <div className="readout">
                <div className="readout-score">{current.score.toLocaleString()} pts</div>
                <div className="readout-dist">
                  {isInside(current.distance, current.location.radius)
                    ? `Inside ${current.location.name}`
                    : `${Math.round(current.distance).toLocaleString()} tiles from ${current.location.name}`}
                </div>
              </div>
            ) : (
              <div className="hint">
                {pending ? 'Drag to adjust, or lock it in.' : 'Click the map to place your guess.'}
              </div>
            )}
            <button className="primary" disabled={!pending && !revealed} onClick={revealed ? advance : lockIn}>
              {revealed
                ? roundIndex === rounds.length - 1
                  ? 'See results'
                  : 'Next round'
                : 'Lock in guess'}
            </button>
          </div>
        )}

        {showSummary && (
          <Summary
            dayKey={dayKey}
            mode={mode}
            lines={lines}
            total={total}
            replaying={replaying}
            onPlayEndless={() => startSession('endless')}
          />
        )}
      </div>

      {sheet === 'intro' && (
        <Modal title="TapScape">
          <HowToPlay />
          <div className="sheet-actions">
            <button
              className="primary"
              onClick={() => {
                markIntroSeen()
                setSheet(null)
                startSession('daily')
              }}
            >
              Play today's
            </button>
            <button
              className="secondary"
              onClick={() => {
                markIntroSeen()
                setSheet(null)
                startSession('endless')
              }}
            >
              Endless mode
            </button>
          </div>
        </Modal>
      )}
      {sheet === 'how' && (
        <Modal title="How to play" onClose={() => setSheet(null)}>
          <HowToPlay />
        </Modal>
      )}
      {sheet === 'about' && (
        <Modal title="About" onClose={() => setSheet(null)}>
          <About />
        </Modal>
      )}
    </div>
  )
}

interface SummaryProps {
  dayKey: string
  mode: Mode
  lines: Line[]
  total: number
  replaying: boolean
  onPlayEndless: () => void
}

function Summary({ dayKey, mode, lines, total, replaying, onPlayEndless }: SummaryProps) {
  const [copied, setCopied] = useState(false)
  const streak = useMemo(() => getStreak(), [])
  const max = MAX_ROUND_SCORE * lines.length

  const share = async () => {
    const ok = await copyText(shareText(dayKey, lines.map((l) => l.score)))
    setCopied(ok)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="summary">
      <div className="summary-card">
        <h2>{mode === 'daily' ? dayKey : 'Practice run'}</h2>
        {replaying && <p className="muted">You've already played today — back at midnight UTC.</p>}

        <div className="summary-total">{total.toLocaleString()}</div>
        <div className="muted">out of {max.toLocaleString()}</div>

        <ul className="summary-list">
          {lines.map((l) => (
            <li key={l.name}>
              <span>{l.name}</span>
              <span>
                {l.distance !== undefined &&
                  (l.inside ? 'inside · ' : `${Math.round(l.distance).toLocaleString()} tiles · `)}
                {l.score.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>

        {mode === 'daily' && streak.current > 0 && (
          <p className="muted streak">
            Streak {streak.current} · best {streak.best}
          </p>
        )}

        <div className="sheet-actions">
          {mode === 'daily' ? (
            <>
              <button className="primary" onClick={share}>
                {copied ? 'Copied' : 'Share result'}
              </button>
              <button className="secondary" onClick={onPlayEndless}>
                Keep playing
              </button>
            </>
          ) : (
            <button className="primary" onClick={onPlayEndless}>
              Play again
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
