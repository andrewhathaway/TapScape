import { MAX_ROUND_SCORE, bandForRatio } from './scoring'

const BAND_EMOJI = ['🟩', '🟨', '🟧', '⬛']

export const SITE_URL = 'https://tapscape.andrewhathaway.net'

function band(score: number): string {
  return BAND_EMOJI[bandForRatio(score / MAX_ROUND_SCORE)]
}

/** A result page the Worker renders with its own preview image, so the link unfurls as a card. */
export function resultUrl(dayKey: string, scores: number[]): string {
  return `${SITE_URL}/r/${dayKey}/${scores.join('-')}`
}

export function shareText(dayKey: string, scores: number[]): string {
  const total = scores.reduce((a, b) => a + b, 0)
  return [
    `TapScape ${dayKey}`,
    `${total.toLocaleString()} / ${(MAX_ROUND_SCORE * scores.length).toLocaleString()}`,
    scores.map(band).join(''),
    resultUrl(dayKey, scores),
  ].join('\n')
}

export function challengeUrl(seed: number, total: number): string {
  return `${SITE_URL}/c/${seed.toString(36)}/${total}`
}

/** Invites play rather than showing off: the same five places, see if you can beat it. */
export function challengeText(seed: number, scores: number[]): string {
  const total = scores.reduce((a, b) => a + b, 0)
  return [
    `I scored ${total.toLocaleString()} on five OSRS locations in TapScape.`,
    `Same five places — can you beat it?`,
    scores.map(band).join(''),
    challengeUrl(seed, total),
  ].join('\n')
}

export function groupInviteUrl(code: string): string {
  return `${SITE_URL}/?group=${code}`
}

/** Clipboard API needs a secure context; the textarea path covers the rest. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand('copy')
      el.remove()
      return ok
    } catch {
      return false
    }
  }
}
