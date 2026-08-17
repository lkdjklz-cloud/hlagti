import { z } from 'zod'
import { Router } from 'express'
import { resolveBarberBySlug } from '../lib/barbers.js'
import { slotAvailability, bookSlot } from './service.js'
import { notifyBarber } from '../notify/notify.js'
import { minutesToTime } from './service.js'

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
  phone: z.string().max(20).optional().nullable()
})

router.post('/barbers/:slug/slots', async (req, res, next) => {
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
      customerPhone: parsed.data.phone,
      userId: req.auth ? req.auth.uid : null
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
    return res.status(201).json({ slot })
  } catch (e) {
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
    return next(e)
  }
})

export default router