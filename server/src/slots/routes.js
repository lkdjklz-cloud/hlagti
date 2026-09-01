import { z } from 'zod'
import { Router } from 'express'
import prisma from '../db.js'
import { resolveBarberBySlug } from '../lib/barbers.js'
import { slotAvailability, bookSlot } from './service.js'
import { notifyBarber } from '../notify/notify.js'
import { minutesToTime } from './service.js'
import { signBookingToken, verifyToken } from '../auth/tokens.js'
import { authOptional } from '../auth/middleware.js'

const router = Router()

router.get('/barbers/:slug/slots', async (req, res, next) => {
  try {
    const barber = await resolveBarberBySlug(req.params.slug)
    if (!barber) return res.status(404).json({ error: 'not_found' })
    const dateStr = String(req.query.date || '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ error: 'invalid_date' })
    }
    return res.json(await slotAvailability(barber, dateStr))
  } catch (e) {
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
    return next(e)
  }
})

const bookSchema = z.object({
  date: z.string(),
  time: z.string(),
  customerName: z.string().max(60).optional(),
  deviceId: z.string().max(80).optional().nullable()
})

router.post('/barbers/:slug/slots', authOptional, async (req, res, next) => {
  try {
    const barber = await resolveBarberBySlug(req.params.slug)
    if (!barber) return res.status(404).json({ error: 'not_found' })
    const parsed = bookSchema.safeParse(req.body || {})
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', issues: parsed.error.flatten() })
    }
    const slot = await bookSlot(barber, {
      dateStr: parsed.data.date,
      time: parsed.data.time,
      customerName: parsed.data.customerName,
      userId: req.auth ? req.auth.uid : null,
      deviceId: parsed.data.deviceId
    })
    const [y, m, d] = parsed.data.date.split('-').map(Number)
    const local = new Date(y, m - 1, d)
    const dayLabel = ['أح', 'إث', 'ثلا', 'أرب', 'خم', 'جم', 'سب'][local.getDay() ?? 0]
    await notifyBarber(barber, {
      type: 'slot_booked',
      title: 'حجز موعد جديد',
      body: `${slot.customerName} حجز ${dayLabel} ${d}/${m} الساعة ${minutesToTime(
        new Date(slot.startsAt).getHours() * 60 + new Date(slot.startsAt).getMinutes()
      )}.`,
      data: { slotId: slot.id, url: '/dashboard' }
    })
    return res.status(201).json({ slot, token: signBookingToken(slot.id) })
  } catch (e) {
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
    return next(e)
  }
})

// ── Customer cancels their own appointment ───────────────────
// Ownership via the booking token issued at booking time or the logged-in
// account that made the booking (deviceId alone is NOT proof of ownership).
const cancelSchema = z.object({
  token: z.string().optional().nullable()
})

router.post('/barbers/:slug/slots/:id/cancel', authOptional, async (req, res, next) => {
  try {
    const barber = await resolveBarberBySlug(req.params.slug)
    if (!barber) return res.status(404).json({ error: 'not_found' })
    const parsed = cancelSchema.safeParse(req.body || {})
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', issues: parsed.error.flatten() })
    }

    let tokenSlotId = null
    if (parsed.data.token) {
      try {
        const decoded = verifyToken(parsed.data.token)
        if (decoded.type === 'booking') tokenSlotId = decoded.slotId
      } catch {
        tokenSlotId = null
      }
    }

    const slot = await prisma.slot.findUnique({ where: { id: req.params.id } })
    if (!slot || slot.barberId !== barber.id) return res.status(404).json({ error: 'not_found' })

    const ownsByToken = tokenSlotId === slot.id
    const ownsByUser = req.auth && slot.userId === req.auth.uid
    if (!ownsByToken && !ownsByUser) {
      return res.status(403).json({ error: 'forbidden' })
    }
    if (slot.status === 'CANCELLED') return res.status(409).json({ error: 'already_cancelled' })
    if (slot.status === 'DONE') return res.status(409).json({ error: 'already_done' })

    const updated = await prisma.slot.update({
      where: { id: slot.id },
      data: { status: 'CANCELLED' }
    })
    await notifyBarber(barber, {
      type: 'slot_cancelled',
      title: 'أُلغي حجز موعد',
      body: `${slot.customerName || 'زبون'} ألغى حجزه الساعة ${minutesToTime(
        new Date(slot.startsAt).getHours() * 60 + new Date(slot.startsAt).getMinutes()
      )}.`,
      data: { slotId: slot.id, url: '/dashboard' }
    })
    return res.json({ slot: updated })
  } catch (e) {
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
    return next(e)
  }
})

export default router