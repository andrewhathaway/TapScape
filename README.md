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

`src/data/locations.json` is generated from the OSRS Wiki — 450 surface locations
with coordinates, split into three difficulty tiers.

```bash
npm run data:locations     # rebuild from the wiki
npm run data:map-version   # re-pin MAP_VERSION to the current tileset
```

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

## Deploying

A Cloudflare Worker serving static assets, on a custom domain.

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
