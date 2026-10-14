import { useState } from 'react'
import { track } from '../game/analytics'

/**
 * iPhones only deliver web push to sites on the Home Screen, and Safari has no
 * install API. So this walks the player through the three steps with a
 * picture each, and the first step's button opens Safari's own share menu,
 * which is where "Add to Home Screen" lives.
 */
export default function IosGuide() {
  const [shared, setShared] = useState(false)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const openShare = async () => {
    track('ios_guide_share', { supported: canShare })
    if (!canShare) return
    try {
      await navigator.share({ title: 'TapScape', url: window.location.origin + '/' })
      setShared(true)
    } catch {
      // Dismissed. The steps are still on screen.
    }
  }

  return (
    <div className="guide">
      <p className="guide-lede">
        iPhones only deliver notifications to apps on the Home Screen, so there's a one-time
        setup. Three steps, about a minute.
      </p>

      <ol className="guide-steps">
        <li>
          <div className="guide-art"><ShareArt /></div>
          <div className="guide-text">
            <strong>Add TapScape to your Home Screen</strong>
            <span>
              Tap Safari's share button, scroll the list, and choose <b>Add to Home Screen</b>, then <b>Add</b>.
            </span>
            {canShare ? (
              <button className="primary small" onClick={() => void openShare()}>
                {shared ? 'Share menu opened' : 'Open the share menu'}
              </button>
            ) : (
              <span className="muted">The share button is the square with an arrow at the bottom of Safari.</span>
            )}
          </div>
        </li>
        <li>
          <div className="guide-art"><HomeArt /></div>
          <div className="guide-text">
            <strong>Open it from the Home Screen</strong>
            <span>Use the new TapScape icon, not Safari. It opens full-screen, like an app, and keeps its own settings.</span>
          </div>
        </li>
        <li>
          <div className="guide-art"><MenuArt /></div>
          <div className="guide-text">
            <strong>Turn on the reminder there</strong>
            <span>Menu → <b>Morning reminder</b> → <b>Remind me</b>, pick your hour, and allow notifications when iPhone asks.</span>
          </div>
        </li>
      </ol>

      <p className="muted guide-note">
        Needs iOS 16.4 or later. One quiet notification a day, skipped on days you've already played,
        and it stops on its own if you stop playing.
      </p>
    </div>
  )
}

/* ---- illustrations: the app's palette, drawn to read at 90px tall ---- */

function ShareArt() {
  return (
    <svg viewBox="0 0 120 90" role="img" aria-label="Safari's share button and the Add to Home Screen option">
      <rect x="4" y="4" width="112" height="82" rx="10" fill="#211d14" stroke="#3a3426" />
      <rect x="12" y="12" width="96" height="18" rx="6" fill="#17150f" stroke="#3a3426" />
      <circle cx="21" cy="21" r="4" fill="#63a844" />
      <rect x="30" y="18" width="40" height="6" rx="3" fill="#3a3426" />
      <rect x="12" y="36" width="96" height="18" rx="6" fill="#ffb833" />
      <rect x="18" y="39" width="12" height="12" rx="3" fill="none" stroke="#1a1403" strokeWidth="1.8" />
      <path d="M24 42v6M21 45h6" stroke="#1a1403" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="36" y="42" width="56" height="6" rx="3" fill="#1a1403" />
      <rect x="12" y="60" width="96" height="18" rx="6" fill="#17150f" stroke="#3a3426" />
      <rect x="30" y="66" width="48" height="6" rx="3" fill="#3a3426" />
      <g transform="translate(96 60)">
        <rect x="-10" y="-14" width="20" height="24" rx="4" fill="#17150f" stroke="#ffb833" strokeWidth="1.5" />
        <path d="M0 4V-10M-4 -6l4-4 4 4" stroke="#ffb833" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  )
}

function HomeArt() {
  return (
    <svg viewBox="0 0 120 90" role="img" aria-label="A Home Screen with the TapScape icon highlighted">
      <rect x="4" y="4" width="112" height="82" rx="10" fill="#211d14" stroke="#3a3426" />
      {[0, 1, 2, 3].map((c) =>
        [0, 1].map((r) => (
          <rect key={`${c}${r}`} x={14 + c * 26} y={14 + r * 30} width="20" height="20" rx="5" fill="#3a3426" />
        )),
      )}
      <g transform="translate(66 44)">
        <rect x="0" y="0" width="20" height="20" rx="5" fill="#17150f" stroke="#ffb833" strokeWidth="2" />
        <path d="M10 4c-2.5 0-4.4 1.9-4.4 4.3 0 3.1 4.4 7.6 4.4 7.6s4.4-4.5 4.4-7.6C14.4 5.9 12.5 4 10 4z" fill="#ffb833" />
        <circle cx="10" cy="8.2" r="1.6" fill="#17150f" />
      </g>
      <rect x="60" y="68" width="32" height="5" rx="2.5" fill="#ffb833" />
      <path d="M100 30l-8 10M100 30l-3 1M100 30l-1 3" stroke="#ffb833" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function MenuArt() {
  return (
    <svg viewBox="0 0 120 90" role="img" aria-label="The menu with Morning reminder highlighted">
      <rect x="4" y="4" width="112" height="82" rx="10" fill="#211d14" stroke="#3a3426" />
      <rect x="92" y="10" width="16" height="16" rx="8" fill="#17150f" stroke="#3a3426" />
      <path d="M96 15h8M96 18h8M96 21h8" stroke="#a2977d" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="12" y="32" width="96" height="14" rx="5" fill="#17150f" stroke="#3a3426" />
      <rect x="18" y="37" width="34" height="4" rx="2" fill="#3a3426" />
      <rect x="12" y="50" width="96" height="18" rx="5" fill="#ffb833" />
      <circle cx="22" cy="59" r="4" fill="none" stroke="#1a1403" strokeWidth="1.6" />
      <path d="M22 52v1.5M22 64.5V66M15 59h1.5M27.5 59H29M17 54l1 1M26 63l1 1M27 54l-1 1M18 63l-1 1" stroke="#1a1403" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="31" y="56" width="46" height="5" rx="2.5" fill="#1a1403" />
      <path d="M98 55l4 4-4 4" stroke="#1a1403" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="12" y="72" width="96" height="8" rx="4" fill="#17150f" stroke="#3a3426" />
    </svg>
  )
}
