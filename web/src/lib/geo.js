export function getPosition() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('geolocation_unavailable'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6))
        }),
      (err) => reject(new Error(err.code === 1 ? 'geolocation_denied' : 'geolocation_failed')),
      { timeout: 10000, maximumAge: 60000 }
    )
  })
}

export function formatKm(km) {
  if (km === null || km === undefined) return null
  if (km < 1) return `${Math.round(km * 1000)} م`
  return `${km.toLocaleString('fr-FR')} كم`
}