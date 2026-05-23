'use client'

import { useEffect, useRef } from 'react'

/**
 * Wrapper de Leaflet (OpenStreetMap). Carga la librería dinámicamente solo
 * client-side. Carga CSS desde CDN para evitar configurar Next CSS pipeline.
 *
 * Coords seed para Mateos 809, León: lat 21.1250, lng -101.6863.
 */
export default function LocationMap({
  lat = 21.125,
  lng = -101.6863,
  zoom = 15,
  label = 'Mateos 809',
}: {
  lat?: number
  lng?: number
  zoom?: number
  label?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)

  useEffect(() => {
    if (!ref.current) return
    if (mapRef.current) return

    let cancelled = false

    // Inyectar CSS de Leaflet desde CDN una sola vez.
    const cssId = 'leaflet-cdn-css'
    if (!document.getElementById(cssId)) {
      const link = document.createElement('link')
      link.id = cssId
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      link.crossOrigin = ''
      document.head.appendChild(link)
    }

    import('leaflet').then((L) => {
      if (cancelled || !ref.current) return

      // Fix de iconos default (Leaflet referencia imágenes vía URL relativa)
      const iconBase = 'https://unpkg.com/leaflet@1.9.4/dist/images/'
      // @ts-ignore — patched at runtime
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: iconBase + 'marker-icon-2x.png',
        iconUrl: iconBase + 'marker-icon.png',
        shadowUrl: iconBase + 'marker-shadow.png',
      })

      const map = L.map(ref.current, {
        center: [lat, lng],
        zoom,
        scrollWheelZoom: false,
        zoomControl: true,
      })
      mapRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map)

      L.marker([lat, lng]).addTo(map).bindPopup(label).openPopup()
    })

    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [lat, lng, zoom, label])

  return (
    <div
      ref={ref}
      role="region"
      aria-label="Mapa de ubicación"
      style={{
        width: '100%',
        height: 420,
        background: 'var(--bg-2)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-3)',
        overflow: 'hidden',
      }}
    />
  )
}
