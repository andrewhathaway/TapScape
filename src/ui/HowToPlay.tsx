export default function HowToPlay() {
  return (
    <div className="prose">
      <p>
        Five Old School RuneScape locations, one at a time. Click the map where you think
        each one is, then lock in your guess.
      </p>
      <p>
        You score by how close you land — up to <strong>5,000 points</strong> a round, falling
        off with distance in game tiles. Places are areas, not pinpricks: land anywhere
        inside the highlighted region and you take full marks. Just outside still scores
        nearly all of them; the other side of Gielinor scores almost nothing.
      </p>
      <ul>
        <li>
          <strong>Daily</strong> — the same five locations for everyone, changing at midnight
          UTC. One go per day.
        </li>
        <li>
          <strong>Endless</strong> — a fresh five whenever you want them. Nothing is recorded.
        </li>
      </ul>
      <p className="muted">
        Rounds open with well-known places and get harder as you go.
      </p>
    </div>
  )
}
