import { getReminderState, pushSupported } from '../game/reminders'
import { getMemberships } from '../game/groups'

export type MenuTarget = 'how' | 'history' | 'clan' | 'reminders' | 'about'

interface Props {
  hard: boolean
  /** True mid-run: the switch shows but can't flip until the run ends. */
  hardLocked: boolean
  onToggleHard: () => void
  stream: boolean
  onToggleStream: () => void
  onOpen: (target: MenuTarget) => void
}

function hourLabel(hour: number): string {
  if (hour === 0) return 'midnight'
  if (hour === 12) return 'noon'
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`
}

/**
 * Everything that isn't the round, in one place. Rows open a sheet; switches
 * change a setting in place with a one-line explanation beside them.
 */
export default function Menu({ hard, hardLocked, onToggleHard, stream, onToggleStream, onOpen }: Props) {
  const reminder = getReminderState()
  const clans = getMemberships().length

  return (
    <div className="menu">
      <ul className="menu-list">
        <Row label="How to play" onClick={() => onOpen('how')} />
        <Row label="Your 30 days" hint="Scores, streak, missed days" onClick={() => onOpen('history')} />
        <Row
          label="Clan"
          hint={clans === 0 ? 'Compare scores with friends' : clans === 1 ? '1 clan' : `${clans} clans`}
          onClick={() => onOpen('clan')}
        />
        {pushSupported() && (
          <Row
            label="Morning reminder"
            hint={reminder.enabled ? `On · ${hourLabel(reminder.hour)}` : 'Off'}
            onClick={() => onOpen('reminders')}
          />
        )}
      </ul>

      <ul className="menu-list">
        <Switch
          label="Hard mode"
          hint={hardLocked ? 'Finish this run to change it' : '30 seconds a round, no zooming in close'}
          on={hard}
          disabled={hardLocked}
          onToggle={onToggleHard}
        />
        <Switch
          label="Streamer mode"
          hint="Big text, score hidden until the reveal"
          on={stream}
          onToggle={onToggleStream}
        />
      </ul>

      <ul className="menu-list">
        <li>
          <a className="menu-row" href="/where/">
            <span className="menu-label">All 450 locations</span>
            <span className="menu-hint">Where each one is, with a map</span>
            <span className="menu-chevron">↗</span>
          </a>
        </li>
        <Row label="About" onClick={() => onOpen('about')} />
      </ul>
    </div>
  )
}

function Row({ label, hint, onClick }: { label: string; hint?: string; onClick: () => void }) {
  return (
    <li>
      <button className="menu-row" onClick={onClick}>
        <span className="menu-label">{label}</span>
        {hint && <span className="menu-hint">{hint}</span>}
        <span className="menu-chevron">›</span>
      </button>
    </li>
  )
}

function Switch({
  label,
  hint,
  on,
  disabled,
  onToggle,
}: {
  label: string
  hint: string
  on: boolean
  disabled?: boolean
  onToggle: () => void
}) {
  return (
    <li>
      <button
        className="menu-row"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={onToggle}
      >
        <span className="menu-label">{label}</span>
        <span className="menu-hint">{hint}</span>
        <span className={on ? 'switch on' : 'switch'} aria-hidden>
          <span className="switch-knob" />
        </span>
      </button>
    </li>
  )
}
