import { z } from 'zod'
import { Router } from 'express'
import prisma from '../db.js'
import { resolveBarberBySlug } from '../lib/barbers.js'
import { activeEntries, boardSnapshot } from './board.js'
import { joinQueue, cancelQueue, getMyTicketRaw, guestTicketFor } from './service.js'
import { verifyToken } from '../auth/tokens.js'

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

// Public board: waiting count, in-service, eta.
router.get('/barbers/:slug/queue', async (req, res, next) => {
  try {
    const barber = await resolveBarberBySlug(req.params.slug)
    if (!barber) return res.status(404).json({ error: 'not_found' })
    const entries = await activeEntries(barber.id)
    return res.json(boardSnapshot(entries, barber))
  } catch (e) {
    return next(e)
  }
})

const joinSchema = z.object({
  customerName: z.string().min(1).max(60).optional(),
  phone: z.string().max(20).optional().nullable()
})

router.post('/barbers/:slug/queue/join', async (req, res, next) => {
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
      phone: parsed.data.phone,
      userId
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
    return next(e)
  }
})

// My active ticket (restore on reload). Guest via ?token, or logged-in user.
router.get('/queue/my', async (req, res, next) => {
  let entryId = null
  try {
    const guest = guestFromQuery(req)
    if (req.auth && req.auth.uid) {
      const mine = await prisma.queueEntry.findFirst({
        where: { userId: req.auth.uid, status: 'WAITING' },
        orderBy: { joinedAt: 'desc' }
      })
      if (mine) entryId = mine.id
    }
    if (!entryId && guest) entryId = guest.entryId
    if (!entryId) return res.json({ ticket: null })

    const data = await getMyTicketRaw(entryId)
    if (!data) return res.json({ ticket: null })
    const entries = await activeEntries(data.barber.id)
    const snapshot = boardSnapshot(entries, data.barber)
    const { position, etaMinutes } = await import('./board.js').then((m) =>
      m.ticketSnapshot(data.entry, data.barber)
    )
    return res.json({
      ticket: {
        id: data.entry.id,
        number: data.entry.number,
        customerName: data.entry.customerName,
        status: data.entry.status,
        position,
        etaMinutes,
        waiting: snapshot.waiting,
        barber: {
          slug: data.barber.slug,
          shopName: data.barber.shopName,
          area: data.barber.area,
          city: data.barber.city
        }
      }
    })
  } catch (e) {
    return next(e)
  }
})

// Cancel by guest token or owner JWT.
router.delete('/queue/:id', async (req, res, next) => {
  try {
    const guest = guestFromQuery(req)
    await cancelQueue(req.params.id, { ticket: guest, user: req.auth || null })
    return res.json({ ok: true })
  } catch (e) {
    return next(e)
  }
})

export default router