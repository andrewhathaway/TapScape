/**
 * One anonymous count per finished daily, so the homepage preview card can say
 * how many people played today and what yesterday's average was. No id, no
 * scores beyond the total.
 */
export function reportDailyStat(dayKey: string, total: number): void {
  void fetch('/api/stats/played', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ dayKey, total }),
    keepalive: true,
  }).catch(() => {})
}
