import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import OsrsMap from './map/OsrsMap'
import Modal from './ui/Modal'
import HowToPlay from './ui/HowToPlay'
import About from './ui/About'
import History, { HISTORY_DAYS } from './ui/History'
import Reminder from './ui/Reminder'
import Groups from './ui/Groups'
import { LOCATIONS, wikiUrl } from './data/locations'
import { MAP_VIEW } from './map/tiles'
import { dailyRounds, endlessRounds, msUntilNextDay, randomSeed, todayKey } from './game/daily'
import { MAX_ROUND_SCORE, isInside, scoreForDistance, tileDistance } from './game/scoring'
import { challengeText, copyText, shareText } from './game/share'
import { reportPlayed, syncReminders } from './game/reminders'
import { getMemberships, postScores } from './game/groups'
import { reportDailyStat } from './game/stats'
import {
  getDayResult,
  getHistory,
  getStreak,
  hasSeenIntro,
  markIntroSeen,
  saveDayResult,
  type Milestone,
} from './game/storage'
import type { Guess, WorldPoint } from './game/types'

type Mode = 'daily' | 'endless'
type Sheet = 'intro' | 'how' | 'about' | 'history' | 'groups' | null

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
    !hasSeenIntro() ? 'intro' : launch.invite ? 'groups' : null,
  )
  const [roundIndex, setRoundIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [pending, setPending] = useState<WorldPoint | null>(null)
  const [results, setResults] = useState<Guess[]>([])
  const [milestone, setMilestone] = useState<Milestone | null>(null)
  const [hard, setHard] = useState(readHard)
  const [secondsLeft, setSecondsLeft] = useState(HARD_SECONDS)
  /** ?stream=1: big text, running score hidden, for playing on stream. */
  const [stream] = useState(() => new URLSearchParams(window.location.search).get('stream') === '1')

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

  const closeIntro = (then: () => void) => {
    markIntroSeen()
    setSheet(launch.invite ? 'groups' : null)
    then()
  }

  const hardRun = replaying ? archived?.hard === true : hard

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
        <button
          className={hard ? 'tab hard active' : 'tab hard'}
          onClick={toggleHard}
          disabled={midRun}
          aria-pressed={hard}
          title={`Hard mode: ${HARD_SECONDS} seconds a round, no zooming in close`}
        >
          Hard
        </button>

        <div className="prompt">
          {showSummary ? (
            <div className="prompt-name">Run complete</div>
          ) : (
            <>
              <div className="prompt-label">
                Round {roundIndex + 1} of {rounds.length}
                {mode === 'daily' && ` · ${dayKey}`}
                {mode === 'endless' && challenge && ' · Challenge'}
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
              <div className="readout">
                <div className="readout-score">{current.score.toLocaleString()} pts</div>
                <div className="readout-dist">
                  {isInside(current.distance, current.location.radius)
                    ? `Inside ${current.location.name}`
                    : `${Math.round(current.distance).toLocaleString()} tiles from ${current.location.name}`}
                </div>
                {current.location.blurb && (
                  <div className="readout-fact">
                    {current.location.blurb}{' '}
                    <a href={wikiUrl(current.location)} target="_blank" rel="noreferrer">
                      Wiki ›
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div className="hint">
                {pending ? 'Drag to adjust, or lock it in.' : 'Click the map to place your guess.'}
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
                : 'Lock in guess'}
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
            onShowHistory={() => setSheet('history')}
            onShowGroups={() => setSheet('groups')}
          />
        )}
      </div>

      {sheet === 'intro' && (
        <Modal title="TapScape">
          <HowToPlay />
          <div className="sheet-actions">
            {launch.challenge ? (
              <button className="primary" onClick={() => closeIntro(() => {})}>
                Play the challenge
              </button>
            ) : (
              <button className="primary" onClick={() => closeIntro(() => startSession('daily'))}>
                Play today's
              </button>
            )}
            <button className="secondary" onClick={() => closeIntro(() => startSession('endless'))}>
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
      {sheet === 'history' && (
        <Modal title={`Last ${HISTORY_DAYS} days`} onClose={() => setSheet(null)}>
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
      {sheet === 'groups' && (
        <Modal title="Friends" onClose={() => setSheet(null)}>
          <Groups today={today} inviteCode={invite} onInviteDone={() => setInvite(null)} />
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

const DATE_LABEL = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })

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
  onShowHistory: () => void
  onShowGroups: () => void
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
  onShowHistory,
  onShowGroups,
}: SummaryProps) {
  const [copied, setCopied] = useState<'result' | 'challenge' | null>(null)
  const streak = useMemo(() => getStreak(), [])
  const played = useMemo(
    () => getHistory(today, HISTORY_DAYS).filter((d) => d.result).length,
    [today],
  )
  const groups = useMemo(() => getMemberships().length, [])
  const max = MAX_ROUND_SCORE * lines.length
  const isToday = mode === 'daily' && dayKey === today
  const isArchive = mode === 'daily' && !isToday
  const scores = lines.map((l) => l.score)

  const copy = async (kind: 'result' | 'challenge', text: string) => {
    setCopied((await copyText(text)) ? kind : null)
    setTimeout(() => setCopied(null), 2000)
  }

  const heading = mode === 'endless'
    ? challenge ? 'Challenge' : 'Practice run'
    : isToday ? dayKey : DATE_LABEL.format(new Date(`${dayKey}T00:00:00Z`))

  return (
    <div className="summary">
      <div className="summary-card">
        <h2>{heading}</h2>
        {isToday && replaying && (
          <p className="muted">
            You've already played today. Next puzzle in <Countdown />
          </p>
        )}
        {isArchive && <p className="muted">An earlier puzzle, played from your history.</p>}
        {challenge?.theirScore != null && (
          <p className="muted">
            Your friend scored {challenge.theirScore.toLocaleString()}.{' '}
            {total > challenge.theirScore ? 'You beat it.' : total === challenge.theirScore ? 'Dead heat.' : 'Not this time.'}
          </p>
        )}

        <div className="summary-total">{total.toLocaleString()}</div>
        <div className="muted">
          out of {max.toLocaleString()}
          {isToday && !replaying && (
            <>
              {' '}· next puzzle in <Countdown />
            </>
          )}
        </div>
        <div className="pills">
          {hard && <span className="pill">Hard mode</span>}
          {milestone && <span className="pill milestone">{milestoneText(milestone)}</span>}
        </div>

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

        {mode === 'daily' && (
          <button className="streak-row" onClick={onShowHistory}>
            <span className="muted">
              {streak.current > 1
                ? `Streak ${streak.current} · best ${streak.best}`
                : `${played} ${played === 1 ? 'day' : 'days'} played`}
            </span>
            <span className="streak-more">Last {HISTORY_DAYS} days ›</span>
          </button>
        )}

        {isToday && (
          <button className="streak-row" onClick={onShowGroups}>
            <span className="muted">
              {groups === 0 ? 'Compare scores with friends' : groups === 1 ? '1 group' : `${groups} groups`}
            </span>
            <span className="streak-more">Friends ›</span>
          </button>
        )}

        {isToday && <Reminder />}

        <div className="sheet-actions">
          {isToday && (
            <>
              <button className="primary" onClick={() => copy('result', shareText(dayKey, scores, hard))}>
                {copied === 'result' ? 'Copied' : 'Share result'}
              </button>
              <button className="secondary" onClick={onPlayEndless}>
                Keep playing
              </button>
            </>
          )}
          {isArchive && (
            <>
              <button className="primary" onClick={onBackToToday}>
                Back to today
              </button>
              <button className="secondary" onClick={onShowHistory}>
                Play another day
              </button>
            </>
          )}
          {mode === 'endless' && (
            <>
              <button className="primary" onClick={() => copy('challenge', challengeText(seed, scores))}>
                {copied === 'challenge' ? 'Copied' : 'Challenge a friend'}
              </button>
              <button className="secondary" onClick={onPlayEndless}>
                Play again
              </button>
            </>
          )}
        </div>
        {isToday && (
          <button className="secondary wide" onClick={onShowHistory}>
            Play previous days
          </button>
        )}
      </div>
    </div>
  )
}
