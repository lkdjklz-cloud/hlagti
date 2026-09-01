import { Router } from 'express'
import { resolveBarberBySlug } from '../lib/barbers.js'
import { findActiveBooking } from '../lib/booking.js'
import { loyaltyStats } from '../lib/loyalty.js'
import { authOptional } from '../auth/middleware.js'
import prisma from '../db.js'

const router = Router()

function publicBarber(barber) {
  return {
    id: barber.id,
    slug: barber.slug,
    shopName: barber.shopName,
    bio: barber.bio,
    area: barber.area,
    city: barber.city,
    lat: barber.lat,
    lng: barber.lng,
    photoUrl: barber.photoUrl,
    rating: null, // phase 2 (reviews)
    open: barber.open,
    workingHours: safeJson(barber.workingHours),
    slotsEnabled: barber.slotsEnabled,
    slotLengthMinutes: barber.slotLengthMinutes,
    loyaltyEvery: barber.loyaltyEvery,
    avgMinutes: barber.avgMinutes,
    services: (barber.services || []).map((s) => ({
      id: s.id,
      name: s.name,
      price: s.price,
      durationMinutes: s.durationMinutes
    }))
  }
}

function safeJson(s) {
  try {
    return JSON.parse(s || '{}')
  } catch {
    return {}
  }
}

function haversineKm(aLat, aLng, bLat, bLng) {
  const R = 6371
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

router.get('/barbers', async (req, res, next) => {
  try {
    const lat = parseFloat(req.query.lat)
    const lng = parseFloat(req.query.lng)
    const hasNear = Number.isFinite(lat) && Number.isFinite(lng)
    const barbers = await prisma.barber.findMany({
      include: { services: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'asc' }
    })
    const list = barbers.map((b) => {
      const pub = publicBarber(b)
      if (hasNear && Number.isFinite(b.lat) && Number.isFinite(b.lng)) {
        pub.distanceKm = Number(haversineKm(lat, lng, b.lat, b.lng).toFixed(1))
      } else {
        pub.distanceKm = null
      }
      return pub
    })
    if (hasNear) {
      list.sort((a, b) => {
        if (a.distanceKm === null && b.distanceKm === null) return 0
        if (a.distanceKm === null) return 1
        if (b.distanceKm === null) return -1
        return a.distanceKm - b.distanceKm
      })
    }
    return res.json(list)
  } catch (e) {
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
    return next(e)
  }
})

router.get('/barbers/:slug', async (req, res, next) => {
  try {
    const barber = await resolveBarberBySlug(req.params.slug)
    if (!barber) return res.status(404).json({ error: 'not_found' })
    return res.json(publicBarber(barber))
  } catch (e) {
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
    return next(e)
  }
})

// The caller's own loyalty progress at this barber (logged-in customers only;
// guests have no loyalty identity).
router.get('/barbers/:slug/loyalty/my', authOptional, async (req, res, next) => {
  try {
    const barber = await resolveBarberBySlug(req.params.slug)
    if (!barber) return res.status(404).json({ error: 'not_found' })
    const uid = req.auth?.uid || null
    const loyalty = uid ? await loyaltyStats(barber.id, uid) : null
    return res.json({ loyalty })
  } catch (e) {
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
    return next(e)
  }
})

// The caller's ONE active booking (queue ticket or appointment) at this barber.
// Owner token is optional: guests identify via ?deviceId, owners via JWT.
router.get('/barbers/:slug/my-booking', authOptional, async (req, res, next) => {
  try {
    const barber = await resolveBarberBySlug(req.params.slug)
    if (!barber) return res.status(404).json({ error: 'not_found' })
    const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId : null
    const booking = await findActiveBooking(barber.id, { userId: req.auth?.uid || null, deviceId })
    if (!booking) return res.json({ booking: null })
    if (booking.kind === 'queue') {
      const e = booking.entry
      return res.json({
        booking: {
          kind: 'queue',
          id: e.id,
          number: e.number,
          customerName: e.customerName,
          status: e.status,
          joinedAt: e.joinedAt
        }
      })
    }
    const s = booking.slot
    return res.json({
      booking: {
        kind: 'slot',
        id: s.id,
        startsAt: s.startsAt,
        customerName: s.customerName,
        status: s.status,
        createdAt: s.createdAt
      }
    })
  } catch (e) {
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
    return next(e)
  }
})

export default router