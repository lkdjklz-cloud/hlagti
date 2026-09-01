import { useEffect, useMemo, useState } from 'react'

// Leaflet is loaded on demand so the heavy map lib stays OUT of the main
// bundle — it's only fetched when a shop page actually has coordinates.
export default function ShopMap({ lat, lng, shopName }) {
  const [lib, setLib] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([import('react-leaflet'), import('leaflet'), import('leaflet/dist/leaflet.css')])
      .then(([reactLeaflet, leaflet]) => {
        if (!alive) return
        setLib({ ...reactLeaflet, L: leaflet.default })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const pinIcon = useMemo(() => {
    if (!lib) return null
    return lib.L.divIcon({
      className: 'shop-pin',
      html: '<svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true"><path fill="#e5484d" d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/></svg>',
      iconSize: [34, 34],
      iconAnchor: [17, 33],
      popupAnchor: [0, -28]
    })
  }, [lib])

  if (lat === null || lat === undefined || lng === null || lng === undefined) return null

  const { MapContainer, TileLayer, Marker, Popup } = lib || {}

  return (
    <div className={`shop-map-wrap${ready ? ' is-ready' : ''}`}>
      {!ready && <div className="shop-map-skeleton">جارٍ تحميل الخريطة…</div>}
      {lib && pinIcon && (
        <MapContainer
          center={[lat, lng]}
          zoom={15}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%' }}
          whenReady={() => setReady(true)}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={[lat, lng]} icon={pinIcon}>
            <Popup>{shopName || 'الصالون'}</Popup>
          </Marker>
        </MapContainer>
      )}
    </div>
  )
}