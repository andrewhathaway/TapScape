/**
 * GA4 events, on top of the page-view tag in index.html. Names are what
 * shows up in the GA4 "Events" report. Nothing identifying is sent: mode,
 * on/off flags and round totals, never a player id or a name.
 */

type Params = Record<string, string | number | boolean>

declare global {
  interface Window {
    gtag?: (command: 'event', name: string, params?: Params) => void
  }
}

export function track(name: string, params: Params = {}): void {
  try {
    window.gtag?.('event', name, params)
  } catch {
    // An ad blocker removing gtag is not our problem to surface.
  }
}
