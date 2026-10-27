import { useEffect, useState, type FormEvent } from 'react'
import { MAX_NOTE, getTodayNote, postNote } from '../game/groups'
import { MAX_ROUND_SCORE, isInside } from '../game/scoring'
import { track } from '../game/analytics'
import type { Guess } from '../game/types'

interface Props {
  dayKey: string
  /** Today's five scores, re-sent with the note. Present on a reload too. */
  scores: number[]
  /** This run's rounds, for the suggestion chips; empty when the card is replaying from storage. */
  results: Guess[]
  /** Whether this player currently leads a clan today, for the dare chip. */
  leading: boolean
  /** Called after a note posts, so boards can refresh. */
  onPosted: () => void
}

/**
 * Suggestions drawn from the run itself, so saying something costs one tap.
 * Best place, worst place, and a dare if you're on top.
 */
function suggestions(results: Guess[], leading: boolean): string[] {
  const out: string[] = []
  if (results.length === 0) return out
  const best = results.reduce((a, b) => (b.score > a.score ? b : a))
  const worst = results.reduce((a, b) => (b.score < a.score ? b : a))
  const bestInside = isInside(best.distance, best.location.radius)
  if (bestInside) out.push(`Carried by ${best.location.name}`)
  if (worst.score < MAX_ROUND_SCORE * 0.25) {
    const round = results.indexOf(worst) + 1
    out.push(worst.score < 100 ? `Never heard of ${worst.location.name}` : `Round ${round} robbed me`)
  }
  if (leading) out.push('Beat that')
  if (out.length < 2) out.push(results.every((r) => isInside(r.distance, r.location.radius)) ? 'Clean sweep' : 'Could be worse')
  return out.slice(0, 3)
}

/**
 * One line to your clan, under the board on the result card. Offered once,
 * never prompted; collapses to a quote with Edit once posted; clears at midnight.
 */
export default function ClanNote({ dayKey, scores, results, leading, onPosted }: Props) {
  const [posted, setPosted] = useState<string | null>(() => getTodayNote(dayKey))
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skipped, setSkipped] = useState(false)

  useEffect(() => {
    setPosted(getTodayNote(dayKey))
  }, [dayKey])

  const chips = suggestions(results, leading)

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    const note = text.trim()
    if (!note) return
    setBusy(true)
    setError(null)
    const ok = await postNote(dayKey, scores, note)
    setBusy(false)
    if (!ok) return setError("Couldn't post that just now")
    track('clan_note', { action: 'post', chars: note.length })
    setPosted(note)
    setEditing(false)
    onPosted()
  }

  const clear = async () => {
    setBusy(true)
    const ok = await postNote(dayKey, scores, '')
    setBusy(false)
    if (ok) {
      track('clan_note', { action: 'clear' })
      setPosted(null)
      setText('')
      setEditing(false)
      onPosted()
    }
  }

  if (posted && !editing) {
    return (
      <div className="note-posted">
        <span className="note-quote" aria-hidden>“</span>
        <span className="note-body">
          {posted}
          <span className="note-meta">Your clans see this today · clears at midnight</span>
        </span>
        <button className="link strong" onClick={() => { setText(posted); setEditing(true) }}>
          Edit
        </button>
      </div>
    )
  }

  if (skipped && !editing) return null

  return (
    <form className="note-compose" onSubmit={submit}>
      <div className="note-k">
        <span>Say something to your clan</span>
        <span className="note-count">{text ? `${MAX_NOTE - text.length} left` : 'optional'}</span>
      </div>
      <div className="note-field">
        <input
          id="clan-note"
          value={text}
          maxLength={MAX_NOTE}
          placeholder={chips[0] ? `e.g. "${chips[0]}"` : 'One line, 80 characters'}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          aria-label="Note to your clan"
        />
        {text.trim() && (
          <button className="primary small" disabled={busy}>
            Post
          </button>
        )}
      </div>
      {!text && chips.length > 0 && (
        <div className="note-chips">
          {chips.map((c) => (
            <button key={c} type="button" className="note-chip" onClick={() => setText(c)}>
              {c}
            </button>
          ))}
        </div>
      )}
      <div className="note-acts">
        <span className="muted">{error ?? 'Clanmates see it next to your score today'}</span>
        {editing && posted ? (
          <span className="note-links">
            <button type="button" className="link" onClick={() => void clear()} disabled={busy}>Remove</button>
            <button type="button" className="link" onClick={() => setEditing(false)}>Cancel</button>
          </span>
        ) : (
          <button type="button" className="link" onClick={() => { track('clan_note', { action: 'skip' }); setSkipped(true) }}>
            Skip
          </button>
        )}
      </div>
    </form>
  )
}
