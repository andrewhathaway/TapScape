interface Props {
  /** Arrived via a challenge link: the primary action starts that run instead. */
  challenge: boolean
  onPlayDaily: () => void
  onPlayEndless: () => void
  onPlayChallenge: () => void
}

/**
 * First visit. Three lines and a button; the full rules live in the menu for
 * anyone who wants them, and the first round teaches the rest as it goes.
 */
export default function Intro({ challenge, onPlayDaily, onPlayEndless, onPlayChallenge }: Props) {
  return (
    <div className="intro">
      <p className="intro-lede">Five places. One map. How well do you know Gielinor?</p>
      <ol className="intro-steps">
        <li>
          <span className="intro-num">1</span>
          <span>Tap the map where you think each place is.</span>
        </li>
        <li>
          <span className="intro-num">2</span>
          <span>Closer scores more. Inside the gold circle is full marks.</span>
        </li>
        <li>
          <span className="intro-num">3</span>
          <span>A new five every day, the same for everyone.</span>
        </li>
      </ol>
      <div className="sheet-actions">
        {challenge ? (
          <button className="primary" onClick={onPlayChallenge}>
            Play the challenge
          </button>
        ) : (
          <button className="primary" onClick={onPlayDaily}>
            Play today's five
          </button>
        )}
        <button className="secondary" onClick={onPlayEndless}>
          Endless
        </button>
      </div>
    </div>
  )
}
