import { MAX_ROUND_SCORE } from './scoring'

const BANDS: [number, string][] = [
  [0.8, '🟩'],
  [0.5, '🟨'],
  [0.25, '🟧'],
  [0, '⬛'],
]

export const SITE_URL = 'https://tapscape.andrewhathaway.net'

function band(score: number): string {
  const ratio = score / MAX_ROUND_SCORE
  return BANDS.find(([min]) => ratio >= min)![1]
}

export function shareText(dayKey: string, scores: number[]): string {
  const total = scores.reduce((a, b) => a + b, 0)
  return [
    `TapScape ${dayKey}`,
    `${total.toLocaleString()} / ${(MAX_ROUND_SCORE * scores.length).toLocaleString()}`,
    scores.map(band).join(''),
    SITE_URL,
  ].join('\n')
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
