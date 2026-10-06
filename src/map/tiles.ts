import L from 'leaflet'
import type { Plane, WorldPoint } from '../game/types'

/**
 * Weird Gloop re-renders the map each game update and publishes it under a new
 * dated version; there is no "latest" alias, so this is pinned.
 * Refresh it with `node scripts/refresh-map-version.mjs`.
 */
export const MAP_VERSION = '2026-08-12_a'

const SURFACE_MAP_ID = 0
const TILE_SIZE = 256

/** The rendered surface tileset covers exactly this box, oceans included. */
export const SURFACE_BOUNDS = { minX: 768, maxX: 4096, minY: 1792, maxY: 4352 }

/**
 * Where the game actually happens. Fitting the full tileset instead would frame
 * a lot of empty ocean and shrink Gielinor into the middle of the screen.
 */
const PLAY_BOUNDS = { minX: 1000, maxX: 3950, minY: 2400, maxY: 4100 }

export const MAP_VIEW = {
  minZoom: -2,
  maxZoom: 5,
  playSw: { x: PLAY_BOUNDS.minX, y: PLAY_BOUNDS.minY, plane: 0 } as WorldPoint,
  playNe: { x: PLAY_BOUNDS.maxX, y: PLAY_BOUNDS.maxY, plane: 0 } as WorldPoint,
  sw: { x: SURFACE_BOUNDS.minX, y: SURFACE_BOUNDS.minY, plane: 0 } as WorldPoint,
  ne: { x: SURFACE_BOUNDS.maxX, y: SURFACE_BOUNDS.maxY, plane: 0 } as WorldPoint,
}

/**
 * Leaflet's CRS.Simple puts 2^zoom pixels per unit and flips y downward, which
 * is exactly the game's grid once we treat lat as world y and lng as world x.
 */
export function toLatLng(p: WorldPoint): L.LatLngExpression {
  return [p.y, p.x]
}

export function toWorld(ll: L.LatLng, plane: Plane = 0): WorldPoint {
  return { x: Math.floor(ll.lng), y: Math.floor(ll.lat), plane }
}

const OsrsTileLayer = L.TileLayer.extend({
  getTileUrl(coords: L.Coords) {
    // Tile rows are numbered northward on the server but southward in Leaflet.
    const y = -coords.y - 1
    return L.Util.template(this._url, {
      ...this.options,
      z: this._getZoomForUrl(),
      x: coords.x,
      y,
    })
  },
})

export function attachOsrsTiles(map: L.Map, plane: Plane): L.TileLayer {
  const url =
    `https://maps.runescape.wiki/osrs/versions/${MAP_VERSION}` +
    `/tiles/rendered/${SURFACE_MAP_ID}/{z}/${plane}_{x}_{y}.png`

  const layer = new (OsrsTileLayer as unknown as new (
    url: string,
    opts: L.TileLayerOptions,
  ) => L.TileLayer)(url, {
    tileSize: TILE_SIZE,
    minZoom: MAP_VIEW.minZoom,
    maxZoom: MAP_VIEW.maxZoom,
    maxNativeZoom: 3,
    minNativeZoom: -3,
    noWrap: true,
    attribution:
      'Map data &copy; <a href="https://meta.weirdgloop.org/w/Meta:Copyrights" target="_blank" rel="noreferrer">Weird Gloop</a> &middot; assets &copy; Jagex',
  })

  return layer.addTo(map)
}
