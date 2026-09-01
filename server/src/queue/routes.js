import { z } from 'zod'
import { Router } from 'express'
import prisma from '../db.js'
import { resolveBarberBySlug } from '../lib/barbers.js'
import { activeEntries, boardSnapshot } from './board.js'
import { joinQueue, cancelQueue, getMyTicketRaw, guestTicketFor } from './service.js'
import { loyaltyStats } from '../lib/loyalty.js'
import { verifyToken } from '../auth/tokens.js'
import { authOptional } from '../auth/middleware.js'

const router = Router()

export function guestFromQuery(req) {
  const token = req.query.token
  if (!token || typeof token !== 'string') return null
  try {
    const decoded = verifyToken(token)
    if (decoded.type === 'guest') return decoded
    return null
  } catch {
    return null
  }
}

// Guest ticket token supplied via request body (avoids credentials in URLs).
export function guestFromBody(req) {
  const token = req.body && req.body.token
  if (!token || typeof token !== 'string') return null
  try {
    const decoded = verifyToken(token)
    if (decoded.type === 'guest') return decoded
    return null
  } catch {
    return null
  }
}

// Public board: waiting count, in-service, eta.
router.get('/barbers/:slug/queue', async (req, res, next) => {
  try {
    const barber = await resolveBarberBySlug(req.params.slug)
    if (!barber) return res.status(404).json({ error: 'not_found' })
    const entries = await activeEntries(barber.id)
    return res.json(await boardSnapshot(entries, barber))
  } catch (e) {
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
    return next(e)
  }
})

const nillIfBlank = (v) => (typeof v === 'string' && !v.trim() ? undefined : v)
const joinSchema = z.object({
  customerName: z.preprocess(nillIfBlank, z.string().min(1).max(60).optional()),
  deviceId: z.string().max(80).optional().nullable()
})

router.post('/barbers/:slug/queue/join', authOptional, async (req, res, next) => {
  try {
    const barber = await resolveBarberBySlug(req.params.slug)
    if (!barber) return res.status(404).json({ error: 'not_found' })
    const parsed = joinSchema.safeParse(req.body || {})
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', issues: parsed.error.flatten() })
    }
    const userId = req.auth ? req.auth.uid : null
    const entry = await joinQueue(barber, {
      customerName: parsed.data.customerName,
      userId,
      deviceId: parsed.data.deviceId
    })
    return res.status(201).json({
      entry: {
        id: entry.id,
        number: entry.number,
        status: entry.status
      },
      token: guestTicketFor(entry)
    })
  } catch (e) {
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
    return next(e)
  }
})

// My active ticket (restore on reload). Guest via body token, or logged-in user.
router.post('/queue/my', authOptional, async (req, res, next) => {
  let entryId = null
  try {
    const guest = guestFromBody(req)
    if (req.auth && req.auth.uid) {
      const mine = await prisma.queueEntry.findFirst({
        where: { userId: req.auth.uid, status: { in: ['WAITING', 'IN_SERVICE'] } },
        orderBy: { joinedAt: 'desc' }
      })
      if (mine) entryId = mine.id
    }
    if (!entryId && guest) entryId = guest.entryId
    if (!entryId) return res.json({ ticket: null })

    const data = await getMyTicketRaw(entryId)
    if (!data) return res.json({ ticket: null })
    const entries = await activeEntries(data.barber.id)
    const snapshot = await boardSnapshot(entries, data.barber)
    const { position, etaMinutes } = await import('./board.js').then((m) =>
      m.ticketSnapshot(data.entry, data.barber)
    )
    const loyalty = data.entry.userId ? await loyaltyStats(data.barber.id, data.entry.userId) : null
    return res.json({
      ticket: {
        id: data.entry.id,
        number: data.entry.number,
        customerName: data.entry.customerName,
        status: data.entry.status,
        position,
        etaMinutes,
        waiting: snapshot.waiting,
        loyalty,
        barber: {
          slug: data.barber.slug,
          shopName: data.barber.shopName,
          area: data.barber.area,
          city: data.barber.city
        }
      }
    })
  } catch (e) {
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
    return next(e)
  }
})

// Cancel by guest token, matching device, or owner JWT.
router.delete('/queue/:id', authOptional, async (req, res, next) => {
  try {
    const guest = guestFromBody(req) || guestFromQuery(req)
    const deviceId =
      (req.body && typeof req.body.deviceId === 'string' ? req.body.deviceId : null) ||
      (typeof req.query.deviceId === 'string' ? req.query.deviceId : null) ||
      null
    await cancelQueue(req.params.id, { ticket: guest, user: req.auth || null, deviceId })
    return res.json({ ok: true })
  } catch (e) {
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
    return next(e)
  }
})

export default router