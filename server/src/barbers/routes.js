import { Router } from 'express'
import { resolveBarberBySlug } from '../lib/barbers.js'
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
    return next(e)
  }
})

router.get('/barbers/:slug', async (req, res, next) => {
  try {
    const barber = await resolveBarberBySlug(req.params.slug)
    if (!barber) return res.status(404).json({ error: 'not_found' })
    return res.json(publicBarber(barber))
  } catch (e) {
    return next(e)
  }
})

export default router