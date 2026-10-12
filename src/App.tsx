import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import OsrsMap from './map/OsrsMap'
import Modal from './ui/Modal'
import HowToPlay from './ui/HowToPlay'
import About from './ui/About'
import Intro from './ui/Intro'
import Menu, { type MenuTarget } from './ui/Menu'
import History from './ui/History'
import Reminder from './ui/Reminder'
import Groups from './ui/Groups'
import { LOCATIONS, wikiUrl } from './data/locations'
import { MAP_VIEW } from './map/tiles'
import { dailyRounds, dayIndex, endlessRounds, msUntilNextDay, randomSeed, todayKey } from './game/daily'
import { MAX_ROUND_SCORE, bandForRatio, isInside, scoreForDistance, tileDistance } from './game/scoring'
import { challengeText, copyText, shareText } from './game/share'
import { reportPlayed, syncReminders } from './game/reminders'
import { postScores } from './game/groups'
import { reportDailyStat } from './game/stats'
import { markTipSeen, tipPending } from './game/tips'
import {
  getDayResult,
  getStreak,
  hasSeenIntro,
  markIntroSeen,
  saveDayResult,
  type Milestone,
} from './game/storage'
import type { Guess, WorldPoint } from './game/types'

type Mode = 'daily' | 'endless'
type Sheet = 'intro' | 'menu' | 'how' | 'about' | 'history' | 'clan' | 'reminders' | null

interface Line {
  name: string
  score: number
  distance?: number
  inside?: boolean
}

/** A friend's endless run, arriving via a /c/ link: same seed, their score to beat. */
interface Challenge {
  seed: number
  theirScore: number | null
}

/** Hard mode: seconds per round, and how far in the map will zoom while guessing. */
const HARD_SECONDS = 30
const HARD_MAX_ZOOM = 1
const HARD_KEY = 'tapscape:hard'

/** Where an unanswered hard-mode round is scored from: the middle of the map. */
const PLAY_CENTRE: WorldPoint = {
  x: Math.round((MAP_VIEW.playSw.x + MAP_VIEW.playNe.x) / 2),
  y: Math.round((MAP_VIEW.playSw.y + MAP_VIEW.playNe.y) / 2),
  plane: 0,
}

const DATE_LONG = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })

function readHard(): boolean {
  try {
    return localStorage.getItem(HARD_KEY) === '1'
  } catch {
    return false
  }
}

function writeHard(on: boolean): void {
  try {
    localStorage.setItem(HARD_KEY, on ? '1' : '0')
  } catch {
    // Not remembered; the toggle still works for this visit.
  }
}

/** Streamer mode lives in the URL so a bookmark or an OBS browser source keeps it. */
function readStream(): boolean {
  return new URLSearchParams(window.location.search).get('stream') === '1'
}

function writeStream(on: boolean): void {
  const params = new URLSearchParams(window.location.search)
  if (on) params.set('stream', '1')
  else params.delete('stream')
  const rest = params.toString()
  window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''))
}

/**
 * Deep links are read once and scrubbed from the address bar, so a reload
 * doesn't re-trigger them. `?source=` and `?stream=` are left alone.
 */
function readLaunch(): { challenge: Challenge | null; invite: string | null } {
  const params = new URLSearchParams(window.location.search)
  const seed = params.get('challenge')
  const invite = params.get('group')
  if (!seed && !invite) return { challenge: null, invite: null }

  const score = Number(params.get('score'))
  params.delete('challenge')
  params.delete('score')
  params.delete('group')
  const rest = params.toString()
  window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''))

  return {
    challenge: seed ? { seed: parseInt(seed, 36) >>> 0, theirScore: score > 0 ? score : null } : null,
    invite: invite ? invite.toUpperCase() : null,
  }
}

/** A word for one round, from how close the pin landed. */
function roundVerdict(score: number, inside: boolean): string {
  if (inside) return 'Spot on'
  const r = score / MAX_ROUND_SCORE
  if (r >= 0.8) return 'So close'
  if (r >= 0.5) return 'Not bad'
  if (r >= 0.25) return 'Warm-ish'
  if (r >= 0.1) return 'Cold'
  return 'Wrong continent'
}

/** A word for the whole run. */
function runVerdict(total: number, max: number): string {
  const r = total / max
  if (r >= 0.9) return 'Cartographer'
  if (r >= 0.75) return 'Sharp'
  if (r >= 0.55) return 'Solid'
  if (r >= 0.35) return 'Getting warmer'
  if (r >= 0.15) return 'Lost in the Wilderness'
  return 'Back to Tutorial Island'
}

export default function App() {
  const today = useMemo(() => todayKey(), [])
  const [launch] = useState(readLaunch)
  /** An invite code from the URL, cleared once the join form has been answered. */
  const [invite, setInvite] = useState(launch.invite)

  const [mode, setMode] = useState<Mode>(launch.challenge ? 'endless' : 'daily')
  /** The daily being played; differs from `today` for an archive day from the history grid. */
  const [dayKey, setDayKey] = useState(today)
  const [seed, setSeed] = useState(() => launch.challenge?.seed ?? randomSeed())
  const [challenge, setChallenge] = useState<Challenge | null>(launch.challenge)
  const [sheet, setSheet] = useState<Sheet>(() =>
    !hasSeenIntro() ? 'intro' : launch.invite ? 'clan' : null,
  )
  const [roundIndex, setRoundIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [pending, setPending] = useState<WorldPoint | null>(null)
  const [results, setResults] = useState<Guess[]>([])
  const [milestone, setMilestone] = useState<Milestone | null>(null)
  const [hard, setHard] = useState(readHard)
  const [secondsLeft, setSecondsLeft] = useState(HARD_SECONDS)
  const [stream, setStream] = useState(readStream)
  const [pinTip, setPinTip] = useState(() => tipPending('placePin'))
  const [revealTip, setRevealTip] = useState(() => tipPending('firstReveal'))

  useEffect(() => {
    syncReminders()
  }, [])

  const rounds = useMemo(
    () => (mode === 'daily' ? dailyRounds(LOCATIONS, dayKey) : endlessRounds(LOCATIONS, seed)),
    [mode, dayKey, seed],
  )

  const archived = mode === 'daily' ? getDayResult(dayKey) : null
  const replaying = archived !== null && results.length === 0
  const target = rounds[roundIndex]
  const finished = roundIndex >= rounds.length
  const showSummary = finished || replaying
  const current = revealed ? results[roundIndex] : undefined

  const startSession = useCallback(
    (next: Mode, opts: { dayKey?: string; seed?: number; challenge?: Challenge | null } = {}) => {
      setMode(next)
      setDayKey(opts.dayKey ?? today)
      setSeed(opts.seed ?? randomSeed())
      setChallenge(opts.challenge ?? null)
      setResults([])
      setPending(null)
      setRoundIndex(0)
      setRevealed(false)
      setMilestone(null)
    },
    [today],
  )

  const pick = useCallback(
    (point: WorldPoint) => {
      setPending(point)
      if (pinTip) {
        markTipSeen('placePin')
        setPinTip(false)
      }
    },
    [pinTip],
  )

  /** `fallback` is only used when the hard-mode clock runs out with no pin placed. */
  const lockIn = useCallback(
    (fallback?: WorldPoint) => {
      const point = pending ?? fallback
      if (!point || !target || revealed) return
      const distance = tileDistance(point, target)
      const next = [
        ...results,
        {
          location: target,
          guessed: point,
          distance,
          score: scoreForDistance(distance, target.radius),
        },
      ]
      setResults(next)
      setRevealed(true)
      if (mode === 'daily' && next.length === rounds.length) {
        const isToday = dayKey === today
        setMilestone(saveDayResult(dayKey, next, { countsForStreak: isToday, hard }))
        if (isToday) {
          const scores = next.map((r) => r.score)
          reportPlayed(dayKey)
          postScores(dayKey, scores)
          reportDailyStat(dayKey, scores.reduce((a, b) => a + b, 0))
        }
      }
    },
    [pending, target, revealed, results, mode, rounds.length, dayKey, today, hard],
  )

  // The hard-mode clock. Kept off the lockIn identity so a dragged pin doesn't
  // restart the countdown.
  const lockInRef = useRef(lockIn)
  lockInRef.current = lockIn
  const guessing = !showSummary && !revealed && !sheet && !!target
  useEffect(() => {
    if (!hard || !guessing) return
    setSecondsLeft(HARD_SECONDS)
    const started = Date.now()
    const id = setInterval(() => {
      const left = HARD_SECONDS - Math.floor((Date.now() - started) / 1000)
      setSecondsLeft(Math.max(0, left))
      if (left <= 0) {
        clearInterval(id)
        lockInRef.current(PLAY_CENTRE)
      }
    }, 250)
    return () => clearInterval(id)
  }, [hard, guessing, roundIndex, mode, dayKey, seed])

  const midRun = results.length > 0 && !showSummary
  const toggleHard = () => {
    if (midRun) return
    const next = !hard
    setHard(next)
    writeHard(next)
  }
  const toggleStream = () => {
    const next = !stream
    setStream(next)
    writeStream(next)
  }

  const advance = useCallback(() => {
    if (revealTip) {
      markTipSeen('firstReveal')
      setRevealTip(false)
    }
    setRevealed(false)
    setPending(null)
    setRoundIndex((i) => i + 1)
  }, [revealTip])

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

  const closeIntro = (then: () => void) => {
    markIntroSeen()
    setSheet(launch.invite ? 'clan' : null)
    then()
  }

  const openFromMenu = (target: MenuTarget) => setSheet(target)

  const hardRun = replaying ? archived?.hard === true : hard
  const isToday = mode === 'daily' && dayKey === today
  const isArchive = mode === 'daily' && !isToday

  const promptHeading = mode === 'endless'
    ? challenge ? 'Challenge' : 'Endless'
    : isToday ? "Today's five" : DATE_LONG.format(new Date(`${dayKey}T00:00:00Z`))

  return (
    <div className={stream ? 'app stream' : 'app'}>
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
            <div className="prompt-name">{promptHeading}</div>
          ) : (
            <>
              <div className="prompt-label">
                <span className="rounds in-prompt" aria-hidden>
                  {rounds.map((r, i) => (
                    <span
                      key={r.id}
                      className={`pip ${i < results.length ? 'done' : i === roundIndex ? 'current' : ''}`}
                    />
                  ))}
                </span>
                <span>Round {roundIndex + 1} of {rounds.length}</span>
                {isArchive && <span className="chip">{DATE_LONG.format(new Date(`${dayKey}T00:00:00Z`))}</span>}
                {challenge && <span className="chip">Challenge</span>}
                {hard && <span className="chip chip-hard">Hard</span>}
              </div>
              <div className="prompt-name">{target?.name}</div>
            </>
          )}
        </div>

        <div className="topbar-right">
          <div className="rounds" aria-hidden>
            {rounds.map((r, i) => (
              <span
                key={r.id}
                className={`pip ${i < results.length ? 'done' : i === roundIndex ? 'current' : ''}`}
              />
            ))}
          </div>
          {total > 0 && <div className="score">{total.toLocaleString()}</div>}
          <button className="icon menu-btn" onClick={() => setSheet('menu')} aria-label="Menu">
            <span />
            <span />
            <span />
          </button>
        </div>
      </header>

      <div className="stage">
        <OsrsMap
          guess={pending}
          answer={current ? current.location : null}
          onPick={showSummary || revealed ? undefined : pick}
          maxZoom={hard && guessing ? HARD_MAX_ZOOM : undefined}
        />

        {!showSummary && (
          <div className="hud">
            {hard && !revealed && (
              <div className={secondsLeft <= 5 ? 'timer urgent' : 'timer'} aria-live="off">
                {secondsLeft}s
              </div>
            )}
            {current ? (
              <div className={`readout band-${bandForRatio(current.score / MAX_ROUND_SCORE)}`}>
                <div className="readout-verdict">
                  {roundVerdict(current.score, isInside(current.distance, current.location.radius))}
                </div>
                <div className="readout-score">{current.score.toLocaleString()} pts</div>
                <div className="readout-dist">
                  {isInside(current.distance, current.location.radius)
                    ? `Inside ${current.location.name}`
                    : `${Math.round(current.distance).toLocaleString()} tiles from ${current.location.name}`}
                </div>
                {revealTip && (
                  <div className="readout-tip">
                    Anywhere inside the gold circle scores the full 5,000. The further out, the fewer.
                  </div>
                )}
                {current.location.blurb && (
                  <div className="readout-fact">
                    {current.location.blurb}{' '}
                    <a href={wikiUrl(current.location)} target="_blank" rel="noreferrer">
                      Wiki ›
                    </a>
                  </div>
                )}
              </div>
            ) : pinTip && !pending ? (
              <div className="hint callout">
                Tap the map where you think <strong>{target?.name}</strong> is
              </div>
            ) : (
              <div className="hint">
                {pending ? 'Drag to adjust, or lock it in.' : 'Tap the map to place your pin.'}
              </div>
            )}
            <button
              className="primary"
              disabled={!pending && !revealed}
              onClick={() => (revealed ? advance() : lockIn())}
            >
              {revealed
                ? roundIndex === rounds.length - 1
                  ? 'See results'
                  : 'Next round'
                : 'Lock it in'}
            </button>
          </div>
        )}

        {showSummary && (
          <Summary
            dayKey={dayKey}
            today={today}
            mode={mode}
            seed={seed}
            challenge={challenge}
            lines={lines}
            total={total}
            replaying={replaying}
            milestone={milestone}
            hard={hardRun}
            onPlayEndless={() => startSession('endless')}
            onBackToToday={() => startSession('daily')}
            onOpen={(target) => setSheet(target)}
          />
        )}
      </div>

      {sheet === 'intro' && (
        <Modal title="TapScape">
          <Intro
            challenge={launch.challenge !== null}
            onPlayDaily={() => closeIntro(() => startSession('daily'))}
            onPlayEndless={() => closeIntro(() => startSession('endless'))}
            onPlayChallenge={() => closeIntro(() => {})}
          />
        </Modal>
      )}
      {sheet === 'menu' && (
        <Modal title="Menu" onClose={() => setSheet(null)}>
          <Menu
            hard={hard}
            hardLocked={midRun}
            onToggleHard={toggleHard}
            stream={stream}
            onToggleStream={toggleStream}
            onOpen={openFromMenu}
          />
        </Modal>
      )}
      {sheet === 'how' && (
        <Modal title="How to play" onClose={() => setSheet(null)}>
          <HowToPlay />
        </Modal>
      )}
      {sheet === 'history' && (
        <Modal title="Your 30 days" onClose={() => setSheet(null)}>
          <History
            dayKey={today}
            streak={getStreak()}
            onPickDay={(day) => {
              setSheet(null)
              startSession('daily', { dayKey: day })
            }}
          />
        </Modal>
      )}
      {sheet === 'clan' && (
        <Modal title="Clan" onClose={() => setSheet(null)}>
          <Groups today={today} inviteCode={invite} onInviteDone={() => setInvite(null)} />
        </Modal>
      )}
      {sheet === 'reminders' && (
        <Modal title="Morning reminder" onClose={() => setSheet(null)}>
          <Reminder context="sheet" />
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

/** "4h 20m 13s" until the next daily, ticking every second. */
function Countdown() {
  const [ms, setMs] = useState(msUntilNextDay)
  useEffect(() => {
    const id = setInterval(() => setMs(msUntilNextDay()), 1000)
    return () => clearInterval(id)
  }, [])
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const sec = Math.floor((ms % 60_000) / 1000)
  return (
    <span className="countdown">
      {h}h {m}m {sec}s
    </span>
  )
}

/** Counts the score up from zero when the card appears, unless motion is reduced. */
function useCountUp(target: number, ms = 900): number {
  const [value, setValue] = useState(() =>
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? target : 0,
  )
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return
    }
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
      const eased = 1 - (1 - t) * (1 - t)
      setValue(Math.round(target * eased))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, ms])
  return value
}

function milestoneText(m: Milestone): string {
  switch (m.kind) {
    case 'best':
      return 'New personal best'
    case 'streak':
      return `${m.days}-day streak`
    case 'found':
      return `${m.count} places found`
  }
}

interface SummaryProps {
  dayKey: string
  today: string
  mode: Mode
  seed: number
  challenge: Challenge | null
  lines: Line[]
  total: number
  replaying: boolean
  milestone: Milestone | null
  hard: boolean
  onPlayEndless: () => void
  onBackToToday: () => void
  onOpen: (sheet: 'history' | 'clan' | 'reminders') => void
}

function Summary({
  dayKey,
  today,
  mode,
  seed,
  challenge,
  lines,
  total,
  replaying,
  milestone,
  hard,
  onPlayEndless,
  onBackToToday,
  onOpen,
}: SummaryProps) {
  const [copied, setCopied] = useState<'result' | 'challenge' | null>(null)
  const streak = useMemo(() => getStreak(), [])
  const shown = useCountUp(total)
  const max = MAX_ROUND_SCORE * lines.length
  const isToday = mode === 'daily' && dayKey === today
  const isArchive = mode === 'daily' && !isToday
  const scores = lines.map((l) => l.score)
  const puzzleNumber = dayIndex(dayKey) + 1
  const dateWords = DATE_LONG.format(new Date(`${dayKey}T00:00:00Z`))

  const copy = async (kind: 'result' | 'challenge', text: string) => {
    setCopied((await copyText(text)) ? kind : null)
    setTimeout(() => setCopied(null), 2000)
  }

  const heading = mode === 'endless'
    ? challenge ? 'Challenge' : 'Endless'
    : isToday ? "Today's five" : dateWords
  const subheading = mode === 'endless'
    ? challenge ? 'Same five places as your friend' : 'Five random places, nothing recorded'
    : isToday ? `Puzzle #${puzzleNumber} · ${dateWords}` : `Puzzle #${puzzleNumber}, played from your history`

  return (
    <div className="summary">
      <div className="summary-card">
        <h2>{heading}</h2>
        <p className="muted summary-sub">{subheading}</p>

        <div className="summary-score">
          <div className="summary-total">{shown.toLocaleString()}</div>
          <div className="summary-verdict">{runVerdict(total, max)}</div>
        </div>
        <div className="muted">
          out of {max.toLocaleString()}
          {isToday && (
            <>
              {' '}· next five in <Countdown />
            </>
          )}
        </div>
        <div className="pills">
          {hard && <span className="pill">Hard mode</span>}
          {milestone && <span className="pill milestone">{milestoneText(milestone)}</span>}
        </div>
        {challenge?.theirScore != null && (
          <p className="muted">
            Your friend scored {challenge.theirScore.toLocaleString()}.{' '}
            {total > challenge.theirScore ? 'You beat it.' : total === challenge.theirScore ? 'Dead heat.' : 'Not this time.'}
          </p>
        )}

        <ul className="summary-list">
          {lines.map((l) => (
            <li key={l.name}>
              <span className={`band-dot band-${bandForRatio(l.score / MAX_ROUND_SCORE)}`} aria-hidden />
              <span className="summary-name">{l.name}</span>
              <span className="summary-pts">
                {l.distance !== undefined &&
                  (l.inside ? 'inside · ' : `${Math.round(l.distance).toLocaleString()} tiles · `)}
                {l.score.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>

        {mode === 'daily' && (
          <div className="chips">
            <button className="chip-btn" onClick={() => onOpen('history')}>
              <span className="chip-icon">▦</span>
              {streak.current > 1 ? `${streak.current}-day streak` : 'Your 30 days'}
            </button>
            <button className="chip-btn" onClick={() => onOpen('clan')}>
              <span className="chip-icon">⚔</span>
              Clan
            </button>
            <button className="chip-btn" onClick={() => onOpen('reminders')}>
              <span className="chip-icon">☀</span>
              Remind me
            </button>
          </div>
        )}

        <div className="sheet-actions">
          {isToday && (
            <>
              <button className="primary" onClick={() => copy('result', shareText(dayKey, scores, hard))}>
                {copied === 'result' ? 'Copied' : 'Share result'}
              </button>
              <button className="secondary" onClick={onPlayEndless}>
                Play endless
              </button>
            </>
          )}
          {isArchive && (
            <>
              <button className="primary" onClick={onBackToToday}>
                Back to today
              </button>
              <button className="secondary" onClick={() => onOpen('history')}>
                Another day
              </button>
            </>
          )}
          {mode === 'endless' && (
            <>
              <button className="primary" onClick={() => copy('challenge', challengeText(seed, scores))}>
                {copied === 'challenge' ? 'Copied' : 'Challenge'}
              </button>
              <button className="secondary" onClick={onPlayEndless}>
                Play again
              </button>
            </>
          )}
        </div>
        {isToday && (
          <button className="secondary wide" onClick={() => onOpen('history')}>
            Play previous days
          </button>
        )}
        {isToday && replaying && (
          <p className="muted summary-note">You've already played today's five.</p>
        )}
      </div>
    </div>
  )
}
