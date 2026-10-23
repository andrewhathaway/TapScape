# TapScape

A daily geography game for the Old School RuneScape world map. You get five
locations, you click where you think each one is, and you score by how close
you land.

**[tapscape.andrewhathaway.net](https://tapscape.andrewhathaway.net)**

Two modes: **Daily** is the same five locations for everyone, rolling over at
midnight UTC, one run per day. **Endless** deals a fresh five whenever you want.

> Unofficial fan project. Not affiliated with or endorsed by Jagex.

## Running it

```bash
npm install
npm run dev
```

## How the map works

Tiles come from Weird Gloop's map server, which the OSRS Wiki uses:

```
https://maps.runescape.wiki/osrs/versions/{version}/tiles/rendered/{mapId}/{z}/{plane}_{x}_{y}.png
```

Two things about this are easy to get wrong:

**There is an older scheme that still serves tiles.** `maps.runescape.wiki/osrs/data/dataloader.json`
advertises `tiles/{mapID}_{cacheVersion}/…` at cache version `2019-10-31_1`. Those
URLs return `200`, so it looks like working data — but the map predates Varlamore
and Kebos. The live version string is scraped off a rendered wiki article, because
there is no `latest` alias and `versions/` returns `403`.

**Server tile rows count northward, Leaflet counts southward.** With `L.CRS.Simple`
a world point maps to `lat = y`, `lng = x`, and at zoom *z* there are 2^z pixels per
game tile — so at `z=0` one 256px tile covers 256 game units. The tile layer
overrides `getTileUrl` to flip the row: `y = -coords.y - 1`.

Zoom stays on integer levels deliberately. Fractional zoom (`zoomSnap: 0`) frames the
opening view more precisely, but it puts every tile on a non-integer CSS scale and
Safari composites that very slowly.

## Where the locations come from

`src/data/locations.json` is generated from the OSRS Wiki — 550 surface locations
with coordinates, split into three difficulty tiers.

```bash
npm run data:locations     # rebuild from the wiki
npm run data:map-version   # re-pin MAP_VERSION to the current tileset
```

The wiki retires old tileset versions a few weeks after publishing a new one,
and a retired version goes black tile by tile as edge caches expire. So the
pin is only a fallback: the Worker's cron checks the wiki's live version
twice a day (several article pages, newest wins, verified against a canary
tile) and stores it in KV; the app and the location pages read it from
`/api/config` at startup and swap the tile URL if it has moved on.

Coordinates live in each article's `{{Map}}` template. The wiki runs no Cargo or
SMW, so this reads raw wikitext. The subtlety is that **cities declare their map as
`mtype=polygon` with a bare vertex list and no `x`/`y` at all** — a parser that only
reads `x`/`y` silently drops Falador, Rimmington, Draynor Manor and friends while
appearing to work. Polygons are reduced to their bounding-box centre.

Tier 1 is hand-picked. Article length was the original proxy for fame and it put
`Abandoned Mine` alongside `Barrows`, which is not a gimme round. Open water,
whole regions and `Gielinor` itself are excluded — nothing a pin can be right about.

## Tests

```bash
npm run dev -- --port 5179
npm run smoke -- <screenshot-dir>          # local
npm run smoke -- <screenshot-dir> <url>    # or against a deployment
```

A Playwright run through the intro modal, a full five-round daily, and the reload
lock. It counts tile responses and collects console errors. Look at the
screenshots — some regressions only show up in the image.

## Coming back, and bringing friends

Beyond the streak and the share grid, a few things are there to make tomorrow
more likely and to turn a share into an invitation:

- **Countdown** to the next puzzle on the result card.
- **Archive days.** Any empty cell in the 30-day history grid is playable. It
  fills the grid but never moves the streak — a streak is days played on the day.
- **Quiet milestones.** One line on the result card for a personal best, a
  streak of 3/7/14/30/50/100/365, or crossing 10/25/50/100/250/500 places
  found. Never more than one, never a modal.
- **Clans.** A code (`ABCD-EFGH`) shared with friends. Members see each
  other's daily scores and a seven-day table, nothing else. Stored in D1 with
  no accounts: a random id per device and the name you typed. (The code calls
  them groups; players see "clan".) Today's standings show on the result card
  (a swipeable row when you're in more than one clan), as a rank badge in the
  header once you've played, and as a "Bob scored 14,200 today" line before
  round one if a clanmate has already played. Boards are fetched once per visit
  and again after your score lands.
- **Share pages.** A shared result links to `/r/<day>/<scores>`, a challenge to
  `/c/<seed>/<score>`. The Worker renders each with its own 1200×630 preview
  (`worker/og.ts`, hand-built SVG rasterised by resvg in WebAssembly), so the
  link unfurls as a card in Discord, Reddit and iMessage. The card shows no
  location names — the viewer hasn't played yet.
- **Challenges.** An endless run is seeded, so "Challenge a friend" sends the
  same five places with your score to beat.
- **Location pages.** `scripts/build-pages.mjs` writes `/where/<id>/` for all
  550 locations after the build: a map, the coordinates, what's nearby, and a
  nudge to play. They answer "where is X in OSRS" searches and are in the
  sitemap.
- **A fact after every guess.** Each location carries a one-sentence `blurb`
  from the wiki's TextExtracts API (`npm run data:blurbs`), shown under the
  distance readout with a link to the article.
- **Hard mode.** A switch in the menu: thirty seconds a round and the map
  capped at zoom 1 while guessing. Same daily puzzle; the result is flagged
  `hard` in storage and in the share text. An unanswered round is scored from
  the middle of the map.
- **Streamer mode.** A switch in the menu, kept in the URL as `?stream=1` so
  an OBS browser source keeps it: hides the running score and enlarges the
  prompt, the clock and the readout.
- **Teaching by doing.** The intro is three lines. The first pin and the first
  reveal each get a one-time hint (`src/game/tips.ts`). Everything that isn't
  the round lives behind the menu button.
- **You versus everyone today.** After each reveal: this place's average
  today, the gap, and a line of context ("hardest place today", "31% got
  inside"). On the result card: "Better than 72%" (or "2nd today" when few
  have played), a 25-bucket histogram of totals once ten others have played,
  a single bar before that, and a signed difference per location. Shown only
  when at least one *other* person has played; this player's own run is
  subtracted when it is already in the numbers. How many have played is never
  shown anywhere, including the homepage card. Hard-mode runs are kept under
  `YYYY-MM-DD#hard` so they aren't compared with normal ones.
- **Live homepage card.** `/og/today.png` is the homepage's `og:image`: day
  number, how many have played so far and yesterday's average, over a crop of
  the map, cached ten minutes. Counts come from an anonymous ping per finished
  daily into `daily_stats`.

## Sheets on phones

Every modal and the result card share one sheet (`src/ui/Modal.tsx`). On wide
screens it is a centred dialog. On phones it rises from the bottom, capped at
the visible height (`dvh`, since iOS `vh` includes the space behind Safari's
toolbar), with the title pinned at the top, `.sheet-actions` pinned at the
bottom, and only the middle scrolling. Dismiss with ×, a tap outside, a swipe
down on the header, Escape, or the browser back button (one history entry is
pushed while a sheet is open).

## The landing nudge

First-time players get one line above the hint at the start of round two of
their first daily (round one belongs to the tutorial pill): "Want tomorrow's
five brought to you at 8am?" (`src/game/nudge.ts`). After eight seconds or
the next pin it folds into a small sun badge in the corner, which opens the
reminder sheet. The aim is to win the habit at the first chance. Rules: never
for anyone who has finished a daily before, never in the Home Screen app,
never beside the clan race line, at most once a day, "Not now" buys a week,
two "Not now"s retire the pill (the badge and menu row stay), and it all
disappears once the reminder is on or blocked.

## Search and measurement

The homepage ships a static block inside `#root` (headline, what the game is,
links to the location index) that React replaces on mount, so crawlers and
reader modes get text rather than an empty div. Unknown paths are real 404s
(`public/404.html`; the app has no client-side routes). The homepage carries
`WebApplication` JSON-LD and every location page a `BreadcrumbList`.

GA4 events, all anonymous, from `src/game/analytics.ts`: `run_complete`
(mode, kind, hard, total), `share_result`, `share_challenge`, `clan_create`,
`clan_join` (via form or invite), `clan_invite_copy`, `clan_leave`,
`reminder` (result), `hard_mode`, `stream_mode`, `sheet_open`,
`archive_play`, `challenge_open`, `clan_invite_open`, `milestone`.

## Daily reminders

Players can opt in, after finishing a daily run, to one Web Push notification a
day at an hour they choose. The browser holds the subscription; a Cloudflare
Worker (`worker/`) keeps the schedule in D1 and an hourly cron sends whatever is
due. Nothing identifying is stored: endpoint, keys, time zone, hour.

The quiet bits are deliberate. The offer appears only on the result card, the
browser's permission prompt only after a tap, one notification a day with a
six-hour TTL so it never lands at night, and a subscriber who hasn't played for
two weeks gets one goodbye and is dropped — reopening the game quietly resumes
them. The puzzle rolls at midnight UTC, so for players east of about UTC+8 the
reminder waits for the rollover rather than pointing at yesterday's puzzle
(`worker/schedule.ts`, checked by `npm run test:schedule`).

iOS only delivers web push to sites added to the Home Screen, so on iPhone the
card explains that instead of offering.

### Running it locally

```bash
node scripts/vapid-keys.mjs > .dev.vars
printf 'VAPID_SUBJECT=https://tapscape.andrewhathaway.net\nALLOW_TEST_SEND=1\n' >> .dev.vars
npm run db:migrate:local
npm run dev:worker          # Worker + D1 on :8787
npm run dev                 # Vite on :5173, proxies /api to the Worker
```

Finish a daily run, tap **Remind me**, accept the prompt, then **Send test** (only
shown on localhost) fires the real notification through the push service.
`curl 'localhost:8787/__scheduled?cron=0+*+*+*+*'` runs the cron by hand.
Inspect the table with
`npx wrangler d1 execute tapscape-reminders --local --command 'SELECT * FROM subscriptions'`.

The Worker on :8787 also serves the built `dist/`, so share pages and location
pages can be checked there after `npm run build`:
`localhost:8787/r/2026-10-12/5000-4000-2000-1000-0`, its image under `/og/…png`,
and `localhost:8787/where/lumbridge/`.

## Deploying

A Cloudflare Worker serving static assets, with the reminder API alongside, on
a custom domain. One-time setup for the reminders:

```bash
npx wrangler d1 create tapscape-reminders     # paste the id into wrangler.jsonc
npm run db:migrate
node scripts/vapid-keys.mjs                   # then, for each line it prints:
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT         # mailto: or https: URL
```

Do not rotate the VAPID keys casually: every existing subscription is bound to
the public key and would have to be recreated.

```bash
npm run deploy
```

Pushes to `main` deploy via GitHub Actions, which needs `CLOUDFLARE_API_TOKEN`
and `CLOUDFLARE_ACCOUNT_ID` as repository secrets.

## Licence

Code is MIT. The location data is derived from the OSRS Wiki and carries
**CC BY-NC-SA 3.0**, which means no commercial use — including ad-supported
hosting — and share-alike on modifications.

**If you deploy a fork, please don't hotlink Weird Gloop's tile server.** It runs
on donations. See [NOTICE.md](NOTICE.md) for the full picture.
