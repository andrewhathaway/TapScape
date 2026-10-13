import { useEffect, useState, type FormEvent } from 'react'
import { ROUNDS_PER_DAY } from '../game/daily'
import { MAX_ROUND_SCORE, bandForRatio } from '../game/scoring'
import { copyText, groupInviteUrl } from '../game/share'
import {
  MAX_GROUP_NAME,
  MAX_PLAYER_NAME,
  createGroup,
  fetchGroup,
  getMemberships,
  getPlayer,
  joinGroup,
  leaveGroup,
  normaliseCode,
  peekGroup,
  setPrimaryClan,
  type GroupView,
  type Membership,
} from '../game/groups'
import { track } from '../game/analytics'

const BAND_EMOJI = ['🟩', '🟨', '🟧', '⬛']
const DAY_MAX = MAX_ROUND_SCORE * ROUNDS_PER_DAY

function bands(scores: number[]): string {
  return scores.map((s) => BAND_EMOJI[bandForRatio(s / MAX_ROUND_SCORE)]).join('')
}

interface Props {
  today: string
  /** A code arriving via an invite link: opens straight onto the join form. */
  inviteCode?: string | null
  /** Called once the join form is answered either way, so it doesn't reappear. */
  onInviteDone?: () => void
  /** Open straight onto this clan's board (from the header badge or the card). */
  openCode?: string | null
}

type View = { kind: 'list' } | { kind: 'group'; code: string } | { kind: 'join'; code: string }

/**
 * Friend groups. One modal: your groups, a group's scores, or the create/join
 * forms. Scores only ever go up when a daily is finished, so there is nothing
 * here to refresh obsessively — it's a once-a-day glance.
 */
export default function Groups({ today, inviteCode, onInviteDone, openCode }: Props) {
  const [memberships, setMemberships] = useState<Membership[]>(getMemberships)
  const [view, setView] = useState<View>(() =>
    inviteCode
      ? { kind: 'join', code: normaliseCode(inviteCode) }
      : openCode
        ? { kind: 'group', code: openCode }
        : { kind: 'list' },
  )

  const refresh = () => setMemberships(getMemberships())

  if (view.kind === 'join') {
    return (
      <JoinForm
        code={view.code}
        onDone={(m) => {
          refresh()
          onInviteDone?.()
          setView(m ? { kind: 'group', code: m.code } : { kind: 'list' })
        }}
      />
    )
  }

  if (view.kind === 'group') {
    return (
      <GroupPanel
        code={view.code}
        today={today}
        onBack={() => setView({ kind: 'list' })}
        onLeft={() => {
          refresh()
          setView({ kind: 'list' })
        }}
      />
    )
  }

  return (
    <div className="groups">
      {memberships.length === 0 ? (
        <p className="muted">
          A clan is a code you share with friends. Everyone in it sees each other's daily
          scores and nothing else. No accounts, no email.
        </p>
      ) : (
        <ul className="groups-list">
          {memberships.map((m) => (
            <li key={m.code}>
              <button className="streak-row" onClick={() => setView({ kind: 'group', code: m.code })}>
                <span>{m.name}</span>
                <span className="streak-more">{m.code} ›</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <CreateOrJoin
        onDone={(m) => {
          refresh()
          setView({ kind: 'group', code: m.code })
        }}
      />
    </div>
  )
}

function NameField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span>Your name</span>
      <input
        value={value}
        maxLength={MAX_PLAYER_NAME}
        placeholder="Shown to your clan"
        onChange={(e) => onChange(e.target.value)}
        required
      />
    </label>
  )
}

function CreateOrJoin({ onDone }: { onDone: (m: Membership) => void }) {
  const [tab, setTab] = useState<'create' | 'join'>('create')
  const [playerName, setPlayerName] = useState(() => getPlayer()?.name ?? '')
  const [groupName, setGroupName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const result =
      tab === 'create' ? await createGroup(groupName, playerName) : await joinGroup(code, playerName)
    setBusy(false)
    track(tab === 'create' ? 'clan_create' : 'clan_join', { ok: !!result, via: 'form' })
    if (result) onDone(result)
    else setError(tab === 'create' ? "Couldn't create that clan" : 'No clan with that code')
  }

  return (
    <form className="groups-form" onSubmit={submit}>
      <div className="modes" role="tablist">
        <button type="button" className={tab === 'create' ? 'tab active' : 'tab'} onClick={() => setTab('create')}>
          New clan
        </button>
        <button type="button" className={tab === 'join' ? 'tab active' : 'tab'} onClick={() => setTab('join')}>
          Join with a code
        </button>
      </div>

      {tab === 'create' ? (
        <label className="field">
          <span>Clan name</span>
          <input
            value={groupName}
            maxLength={MAX_GROUP_NAME}
            placeholder="e.g. The Lads"
            onChange={(e) => setGroupName(e.target.value)}
            required
          />
        </label>
      ) : (
        <label className="field">
          <span>Code</span>
          <input
            value={code}
            placeholder="ABCD-EFGH"
            autoCapitalize="characters"
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </label>
      )}
      <NameField value={playerName} onChange={setPlayerName} />

      {error && <p className="muted">{error}</p>}
      <div className="sheet-actions">
        <button className="primary" disabled={busy}>
          {tab === 'create' ? 'Create clan' : 'Join clan'}
        </button>
      </div>
    </form>
  )
}

function JoinForm({ code, onDone }: { code: string; onDone: (m: Membership | null) => void }) {
  const [groupName, setGroupName] = useState<string | null | undefined>(undefined)
  const [playerName, setPlayerName] = useState(() => getPlayer()?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void peekGroup(code).then((g) => setGroupName(g?.name ?? null))
  }, [code])

  if (groupName === undefined) return <p className="muted">Looking up {code}…</p>
  if (groupName === null) {
    return (
      <div className="prose">
        <p>No clan matches the code {code}. It may have been typed wrong, or the clan was deleted.</p>
        <div className="sheet-actions">
          <button className="secondary" onClick={() => onDone(null)}>
            Back
          </button>
        </div>
      </div>
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const m = await joinGroup(code, playerName)
    setBusy(false)
    track('clan_join', { ok: !!m, via: 'invite' })
    if (m) onDone(m)
    else setError("Couldn't join just now")
  }

  return (
    <form className="groups-form" onSubmit={submit}>
      <p>
        Join <strong>{groupName}</strong>? Members see each other's daily TapScape scores and
        nothing else.
      </p>
      <NameField value={playerName} onChange={setPlayerName} />
      {error && <p className="muted">{error}</p>}
      <div className="sheet-actions">
        <button className="primary" disabled={busy}>
          Join {groupName}
        </button>
        <button type="button" className="secondary" onClick={() => onDone(null)}>
          Not now
        </button>
      </div>
    </form>
  )
}

interface PanelProps {
  code: string
  today: string
  onBack: () => void
  onLeft: () => void
}

function GroupPanel({ code, today, onBack, onLeft }: PanelProps) {
  const [group, setGroup] = useState<GroupView | null | undefined>(undefined)
  const [copied, setCopied] = useState(false)
  const me = getPlayer()?.id

  useEffect(() => {
    setPrimaryClan(code)
    void fetchGroup(code).then(setGroup)
  }, [code])

  if (group === undefined) return <p className="muted">Loading…</p>
  if (group === null) {
    return (
      <div className="prose">
        <p>Couldn't load this clan right now.</p>
        <div className="sheet-actions">
          <button className="secondary" onClick={onBack}>
            Back
          </button>
        </div>
      </div>
    )
  }

  const todayEntries = group.days.find((d) => d.dayKey === today)?.entries ?? []
  const played = new Set(todayEntries.map((e) => e.playerId))
  const waiting = group.members.filter((m) => !played.has(m.id))

  // Week totals: sum across the days we were sent, plus how many days that was.
  const week = new Map<string, { name: string; total: number; days: number }>()
  for (const day of group.days) {
    for (const e of day.entries) {
      const w = week.get(e.playerId) ?? { name: e.name, total: 0, days: 0 }
      w.total += e.total
      w.days += 1
      week.set(e.playerId, w)
    }
  }
  const weekRows = [...week.entries()].sort((a, b) => b[1].total - a[1].total)

  const invite = async () => {
    track('clan_invite_copy')
    setCopied(await copyText(`Join my TapScape clan "${group.name}": ${groupInviteUrl(code)}`))
    setTimeout(() => setCopied(false), 2000)
  }

  const leave = async () => {
    if (!confirm(`Leave ${group.name}?`)) return
    track('clan_leave')
    await leaveGroup(code)
    onLeft()
  }

  return (
    <div className="groups">
      <div className="group-head">
        <button className="link" onClick={onBack}>
          ‹ Clans
        </button>
        <span className="muted">{code}</span>
      </div>
      <h3>{group.name}</h3>

      <h4 className="muted">
        Today · {todayEntries.length} of {group.members.length} played
      </h4>
      {todayEntries.length === 0 ? (
        <p className="muted">Nobody has played yet today.</p>
      ) : (
        <ol className="group-scores">
          {todayEntries.map((e) => (
            <li key={e.playerId} className={e.playerId === me ? 'me' : undefined}>
              <span className="group-name">
                {e.name}
                <span className="group-bands" aria-hidden>
                  {bands(e.scores)}
                </span>
              </span>
              <span className="group-total">{e.total.toLocaleString()}</span>
            </li>
          ))}
        </ol>
      )}
      {waiting.length > 0 && todayEntries.length > 0 && (
        <p className="muted group-waiting">Not yet: {waiting.map((m) => m.name).join(', ')}</p>
      )}

      {weekRows.length > 0 && (
        <>
          <h4 className="muted">Last 7 days</h4>
          <ol className="group-scores">
            {weekRows.map(([id, w]) => (
              <li key={id} className={id === me ? 'me' : undefined}>
                <span className="group-name">
                  {w.name}
                  <span className="group-sub">
                    {w.days} {w.days === 1 ? 'day' : 'days'} · avg {Math.round(w.total / w.days).toLocaleString()}
                  </span>
                </span>
                <span className="group-total">{w.total.toLocaleString()}</span>
              </li>
            ))}
          </ol>
          <p className="muted group-note">Out of {DAY_MAX.toLocaleString()} a day.</p>
        </>
      )}

      <div className="sheet-actions">
        <button className="primary" onClick={invite}>
          {copied ? 'Copied' : 'Copy invite link'}
        </button>
        <button className="secondary narrow" onClick={leave}>
          Leave
        </button>
      </div>
    </div>
  )
}
