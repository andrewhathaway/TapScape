// Plain Node, no test runner: `npm run test:schedule`. Covers DST, half-hour
// zones and the east-of-UTC rollover rule in nextSendAt.
import { nextLocalHour, nextSendAt, dayKeyOf } from './schedule.ts'
const iso = (ms: number) => new Date(ms).toISOString()
const at = (s: string) => Date.parse(s)
let fails = 0
const eq = (label: string, got: number, want: string) => {
  const ok = iso(got) === want
  if (!ok) fails++
  console.log(ok ? 'ok  ' : 'FAIL', label, '→', iso(got), ok ? '' : `(want ${want})`)
}
// London, BST: 8am local = 07:00Z
eq('London summer, before 8', nextLocalHour(at('2026-07-01T05:00:00Z'), 'Europe/London', 8), '2026-07-01T07:00:00.000Z')
eq('London summer, after 8', nextLocalHour(at('2026-07-01T09:00:00Z'), 'Europe/London', 8), '2026-07-02T07:00:00.000Z')
// London, GMT in winter
eq('London winter', nextLocalHour(at('2026-12-01T09:00:00Z'), 'Europe/London', 8), '2026-12-02T08:00:00.000Z')
// Across the DST change (clocks go back 2026-10-25 in UK)
eq('London across DST end', nextLocalHour(at('2026-10-24T08:00:00Z'), 'Europe/London', 8), '2026-10-25T08:00:00.000Z')
// New York, EDT: 8am = 12:00Z
eq('New York', nextLocalHour(at('2026-07-01T00:00:00Z'), 'America/New_York', 8), '2026-07-01T12:00:00.000Z')
// Kolkata +5:30: 8am = 02:30Z
eq('Kolkata half-hour zone', nextLocalHour(at('2026-07-01T00:00:00Z'), 'Asia/Kolkata', 8), '2026-07-01T02:30:00.000Z')
// Sydney, AEST +10 in July: 8am Tue = Mon 22:00Z
eq('Sydney plain', nextLocalHour(at('2026-07-06T05:00:00Z'), 'Australia/Sydney', 8), '2026-07-06T22:00:00.000Z')
// Sydney after playing Monday's puzzle: must wait for the Tuesday rollover
eq('Sydney already played Mon', nextSendAt(at('2026-07-06T05:00:00Z'), 'Australia/Sydney', 8, ['2026-07-06']), '2026-07-07T00:00:00.000Z')
// London after playing today: tomorrow 8am as normal
eq('London already played today', nextSendAt(at('2026-07-06T14:00:00Z'), 'Europe/London', 8, ['2026-07-06']), '2026-07-07T07:00:00.000Z')
// Played at 7am local, reminder at 8: skip to tomorrow
eq('London played before 8', nextSendAt(at('2026-07-06T06:10:00Z'), 'Europe/London', 8, ['2026-07-06']), '2026-07-07T07:00:00.000Z')
// Tokyo (+9) after playing Monday's: rollover is 9am local, fine to send then
eq('Tokyo already played Mon', nextSendAt(at('2026-07-06T05:00:00Z'), 'Asia/Tokyo', 8, ['2026-07-06']), '2026-07-07T00:00:00.000Z')
// Kolkata: rollover is 5:30am local, too early, so the next 8am instead
eq('Kolkata played before 8', nextSendAt(at('2026-07-06T02:00:00Z'), 'Asia/Kolkata', 8, ['2026-07-06']), '2026-07-07T02:30:00.000Z')
// Honolulu (-10) played Mon evening local (= Tue UTC): fresh puzzle lands 2pm Tue local
eq('Honolulu played evening', nextSendAt(at('2026-07-07T06:00:00Z'), 'Pacific/Honolulu', 8, ['2026-07-07']), '2026-07-08T00:00:00.000Z')
// Exactly on the hour counts as passed
eq('exactly on the hour', nextLocalHour(at('2026-07-01T07:00:00Z'), 'Europe/London', 8), '2026-07-02T07:00:00.000Z')
console.log(dayKeyOf(at('2026-07-06T23:59:59Z')), fails ? `${fails} FAILED` : 'all passed')
process.exit(fails ? 1 : 0)
