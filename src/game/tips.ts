/**
 * One-time teaching moments, shown by doing rather than by reading: the first
 * pin, the first reveal. Each fires once per device, then never again.
 */

const KEY = 'tapscape:tips:v1'

export type Tip = 'placePin' | 'firstReveal'

function read(): Partial<Record<Tip, true>> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<Tip, true>>
  } catch {
    return {}
  }
}

export function tipPending(tip: Tip): boolean {
  return read()[tip] !== true
}

export function markTipSeen(tip: Tip): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [tip]: true }))
  } catch {
    // Private browsing: the tip just shows again next time.
  }
}
