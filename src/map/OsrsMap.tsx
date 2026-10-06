import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { MAP_VIEW, attachOsrsTiles, toLatLng, toWorld } from './tiles'
import { MIN_RADIUS_TILES } from '../game/scoring'
import type { Location, Plane, WorldPoint } from '../game/types'

interface Props {
  guess: WorldPoint | null
  answer: Location | null
  /** Omitted once the round is locked in, which also freezes picking. */
  onPick?: (point: WorldPoint) => void
  plane?: Plane
}

export default function OsrsMap({ guess, answer, onPick, plane = 0 }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const overlayRef = useRef<L.LayerGroup | null>(null)
  const pickRef = useRef(onPick)
  pickRef.current = onPick

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const map = L.map(host, {
      crs: L.CRS.Simple,
      minZoom: MAP_VIEW.minZoom,
      maxZoom: MAP_VIEW.maxZoom,
      zoomControl: true,
      attributionControl: true,
    })
    // `inside` picks the zoom where the view sits within the bounds, so the map
    // fills the screen rather than letterboxing. Snapping stays on integer zooms:
    // fractional zoom puts every tile on a non-integer scale and Safari crawls.
    const play = L.latLngBounds(toLatLng(MAP_VIEW.playSw), toLatLng(MAP_VIEW.playNe))
    map.setView(play.getCenter(), map.getBoundsZoom(play, true), { animate: false })
    map.setMaxBounds(
      L.latLngBounds(toLatLng(MAP_VIEW.sw), toLatLng(MAP_VIEW.ne)).pad(0.1),
    )

    attachOsrsTiles(map, plane)

    const overlay = L.layerGroup().addTo(map)
    overlayRef.current = overlay
    mapRef.current = map

    map.on('click', (e: L.LeafletMouseEvent) => {
      pickRef.current?.(toWorld(e.latlng, plane))
    })

    return () => {
      map.remove()
      mapRef.current = null
      overlayRef.current = null
    }
  }, [plane])

  // Redraw guess / answer markers whenever the round state changes.
  useEffect(() => {
    const map = mapRef.current
    const overlay = overlayRef.current
    if (!map || !overlay) return
    overlay.clearLayers()

    if (guess) {
      L.marker(toLatLng(guess), { icon: pinIcon('guess'), draggable: !!onPick })
        .on('dragend', (e) => pickRef.current?.(toWorld((e.target as L.Marker).getLatLng(), plane)))
        .addTo(overlay)
    }

    if (answer) {
      // The region first, so the pin and the guess line sit on top of it.
      const radius = Math.max(answer.radius ?? 0, MIN_RADIUS_TILES)
      const region = L.circle(toLatLng(answer), {
        radius,
        color: '#ffb833',
        weight: 1,
        fillColor: '#ffb833',
        fillOpacity: 0.16,
      }).addTo(overlay)

      L.marker(toLatLng(answer), { icon: pinIcon('answer') }).addTo(overlay)
      if (guess) {
        const line = L.polyline([toLatLng(guess), toLatLng(answer)], {
          color: '#ffb833',
          weight: 2,
          dashArray: '6 6',
        }).addTo(overlay)
        // Union of the two, so a tight guess still frames the whole region.
        map.fitBounds(line.getBounds().extend(region.getBounds()).pad(0.4), { animate: true })
      }
    }
  }, [guess, answer, onPick, plane])

  return <div className="map-root" ref={hostRef} />
}

function pinIcon(kind: 'guess' | 'answer'): L.DivIcon {
  return L.divIcon({
    className: `pin pin-${kind}`,
    html: `<span></span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  })
}
