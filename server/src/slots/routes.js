import { z } from 'zod'
import { Router } from 'express'
import { resolveBarberBySlug } from '../lib/barbers.js'
import { slotAvailability, bookSlot } from './service.js'

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
    return next(e)
  }
})

const bookSchema = z.object({
  date: z.string(),
  time: z.string(),
  customerName: z.string().max(60).optional()
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
      userId: req.auth ? req.auth.uid : null
    })
    return res.status(201).json({ slot })
  } catch (e) {
    return next(e)
  }
})

export default router