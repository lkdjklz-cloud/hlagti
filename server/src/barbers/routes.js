import { Router } from 'express'
import { resolveBarberBySlug } from '../lib/barbers.js'
import { findActiveBooking } from '../lib/booking.js'
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
    rating: null, // phase 2 (reviews)
    open: barber.open,
    workingHours: safeJson(barber.workingHours),
    slotsEnabled: barber.slotsEnabled,
    slotLengthMinutes: barber.slotLengthMinutes,
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

router.get('/barbers', async (_req, res, next) => {
  try {
    const barbers = await prisma.barber.findMany({
      include: { services: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'asc' }
    })
    return res.json(barbers.map(publicBarber))
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