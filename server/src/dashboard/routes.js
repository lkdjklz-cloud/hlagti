import { z } from 'zod'
import { Router } from 'express'
import prisma from '../db.js'
import { authRequired, roles, attachBarber } from '../auth/middleware.js'
import { startEntry, doneEntry, cancelQueue, walkIn } from '../queue/service.js'
import { startOfTodayLocal } from '../lib/barbers.js'
import { notifyBarber } from '../notify/notify.js'
const router = Router()

router.use(authRequired, roles('BARBER'), attachBarber)

function boardPayload(req) {
  return {
    barber: {
      id: req.barber.id,
      slug: req.barber.slug,
      shopName: req.barber.shopName,
      open: req.barber.open,
      area: req.barber.area,
      city: req.barber.city,
      avgMinutes: req.barber.avgMinutes,
      slotsEnabled: req.barber.slotsEnabled,
      loyaltyEvery: req.barber.loyaltyEvery
    }
  }
}

// After a visit finishes, notify the barber when a customer reaches the
// free-haircut threshold (loyalty enabled and X paid visits completed).
async function loyaltyAfterVisit(req, { customerName, customerPhone = null, userId = null, paid = true }) {
  const every = req.barber.loyaltyEvery
  if (!every) return
  const key = userId
    ? `u:${userId}`
    : customerPhone
      ? `p:${customerPhone.replace(/\s+/g, '')}`
      : null
  if (!key) return
  const start = startOfTodayLocal()
  const [q, s] = await Promise.all([
    prisma.queueEntry.findMany({
      where: { barberId: req.barber.id, status: 'DONE', doneAt: { gte: start } },
      select: { paid: true, userId: true, customerPhone: true }
    }),
    prisma.slot.findMany({
      where: { barberId: req.barber.id, status: 'DONE' },
      select: { paid: true, userId: true, customerPhone: true }
    })
  ])
  const all = [...q, ...s]
  const paidCount = all.filter((r) => {
    const k = r.userId ? `u:${r.userId}` : r.customerPhone ? `p:${r.customerPhone.replace(/\s+/g, '')}` : null
    return k === key && r.paid !== false
  }).length
  const atThreshold = paidCount > 0 && paidCount % every === 0
  if (atThreshold) {
    await notifyBarber(req.barber, {
      type: 'loyalty_reached',
      title: 'مكافأة ولاء 🎁',
      body: `${customerName} أتمّ ${paidCount} زيارة مدفوعة — زيارته القادمة مجانية!`,
      data: { url: '/dashboard' }
    })
  }
}

// ── Queue board ─────────────────────────────────────────────
router.get('/queue', async (req, res, next) => {
  try {
    const startOfDay = startOfTodayLocal()
    const queue = await prisma.queueEntry.findMany({
      where: { barberId: req.barber.id, status: { in: ['WAITING', 'IN_SERVICE'] } },
      orderBy: { number: 'asc' }
    })
    const done = await prisma.queueEntry.findMany({
      where: { barberId: req.barber.id, status: 'DONE', doneAt: { gte: startOfDay } },
      orderBy: { doneAt: 'desc' },
      take: 20
    })
    return res.json({
      ...boardPayload(req),
      queue,
      doneToday: done,
      statWaiting: queue.filter((e) => e.status === 'WAITING').length,
      statInService: queue.filter((e) => e.status === 'IN_SERVICE').length
    })
  } catch (e) {
    return next(e)
  }
})

router.post('/queue/:id/start', async (req, res, next) => {
  try {
    const entry = await prisma.queueEntry.findUnique({ where: { id: req.params.id } })
    if (!entry || entry.barberId !== req.barber.id) {
      return res.status(404).json({ error: 'not_found' })
    }
    const updated = await startEntry(entry.id)
    return res.json({ entry: updated })
  } catch (e) {
    return next(e)
  }
})

router.post('/queue/:id/done', async (req, res, next) => {
  try {
    const entry = await prisma.queueEntry.findUnique({ where: { id: req.params.id } })
    if (!entry || entry.barberId !== req.barber.id) {
      return res.status(404).json({ error: 'not_found' })
    }
    const updated = await doneEntry(entry.id, { paid: req.body?.paid !== false })
    loyaltyAfterVisit(req, {
      customerName: entry.customerName,
      customerPhone: entry.customerPhone,
      userId: entry.userId,
      paid: req.body?.paid !== false
    })
    return res.json({ entry: updated })
  } catch (e) {
    return next(e)
  }
})

router.post('/queue/:id/cancel', async (req, res, next) => {
  try {
    const entry = await prisma.queueEntry.findUnique({ where: { id: req.params.id } })
    if (!entry || entry.barberId !== req.barber.id) {
      return res.status(404).json({ error: 'not_found' })
    }
    const updated = await cancelQueue(entry.id, { ticket: null, user: null }, req.barber)
    return res.json({ entry: updated })
  } catch (e) {
    return next(e)
  }
})

const walkInSchema = z.object({
  customerName: z.string().min(1).max(60),
  phone: z.string().max(20).optional().nullable()
})

router.post('/walkin', async (req, res, next) => {
  try {
    const parsed = walkInSchema.safeParse(req.body || {})
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', issues: parsed.error.flatten() })
    }
    const entry = await walkIn(req.barber, {
      customerName: parsed.data.customerName,
      phone: parsed.data.phone
    })
    return res.status(201).json({ entry })
  } catch (e) {
    return next(e)
  }
})

// ── Appointments (upcoming bookings) ───────────────────────
router.get('/appointments', async (req, res, next) => {
  try {
    const start = startOfTodayLocal()
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 30)
    const slots = await prisma.slot.findMany({
      where: {
        barberId: req.barber.id,
        startsAt: { gte: start, lt: end },
        status: { in: ['BOOKED', 'ARRIVED'] }
      },
      orderBy: { startsAt: 'asc' }
    })
    return res.json({ appointments: slots })
  } catch (e) {
    return next(e)
  }
})

// ── Today's bookings ────────────────────────────────────────
router.get('/slots', async (req, res, next) => {
  try {
    const start = startOfTodayLocal()
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
    const slots = await prisma.slot.findMany({
      where: { barberId: req.barber.id, startsAt: { gte: start, lt: end } },
      orderBy: { startsAt: 'asc' }
    })
    return res.json({ slots })
  } catch (e) {
    return next(e)
  }
})

router.post('/slots/:id/cancel', async (req, res, next) => {
  try {
    const slot = await prisma.slot.findUnique({ where: { id: req.params.id } })
    if (!slot || slot.barberId !== req.barber.id) {
      return res.status(404).json({ error: 'not_found' })
    }
    const updated = await prisma.slot.update({
      where: { id: slot.id },
      data: { status: 'CANCELLED' }
    })
    return res.json({ slot: updated })
  } catch (e) {
    return next(e)
  }
})

// Customer arrived for their appointment → ARRIVED ("حضر").
// Passing paid=false when marking done means "loyalty free visit".
router.post('/slots/:id/arrive', async (req, res, next) => {
  try {
    const slot = await prisma.slot.findUnique({ where: { id: req.params.id } })
    if (!slot || slot.barberId !== req.barber.id) {
      return res.status(404).json({ error: 'not_found' })
    }
    if (slot.status !== 'BOOKED') {
      return res.status(409).json({ error: 'not_booked' })
    }
    const updated = await prisma.slot.update({ where: { id: slot.id }, data: { status: 'ARRIVED' } })
    return res.json({ slot: updated })
  } catch (e) {
    return next(e)
  }
})

// Customer left the shop → DONE (paid or free).
router.post('/slots/:id/done', async (req, res, next) => {
  try {
    const slot = await prisma.slot.findUnique({ where: { id: req.params.id } })
    if (!slot || slot.barberId !== req.barber.id) {
      return res.status(404).json({ error: 'not_found' })
    }
    if (slot.status === 'CANCELLED') {
      return res.status(409).json({ error: 'already_cancelled' })
    }
    const updated = await prisma.slot.update({
      where: { id: slot.id },
      data: { status: 'DONE', paid: req.body?.paid !== false }
    })
    loyaltyAfterVisit(req, {
      customerName: slot.customerName,
      customerPhone: slot.customerPhone,
      userId: slot.userId,
      paid: req.body?.paid !== false
    })
    return res.json({ slot: updated })
  } catch (e) {
    return next(e)
  }
})

// ── Settings ────────────────────────────────────────────────
const settingsSchema = z.object({
  shopName: z.string().min(2).max(80).optional(),
  area: z.string().max(80).optional().nullable(),
  city: z.string().max(80).optional().nullable(),
  bio: z.string().max(500).optional().nullable(),
  open: z.boolean().optional(),
  avgMinutes: z.number().int().min(5).max(120).optional(),
  workingHours: z.any().optional(),
  slotsEnabled: z.boolean().optional(),
  slotLengthMinutes: z.number().int().min(15).max(120).optional(),
  loyaltyEvery: z.number().int().min(2).max(50).optional().nullable()
})

router.patch('/settings', async (req, res, next) => {
  try {
    const parsed = settingsSchema.safeParse(req.body || {})
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', issues: parsed.error.flatten() })
    }
    const d = parsed.data
    const data = { ...d }
    if (d.workingHours !== undefined) data.workingHours = JSON.stringify(d.workingHours)
    const barber = await prisma.barber.update({
      where: { id: req.barber.id },
      data
    })
    return res.json({ barber })
  } catch (e) {
    return next(e)
  }
})

// ── Services ────────────────────────────────────────────────
router.get('/services', async (req, res, next) => {
  try {
    const services = await prisma.service.findMany({
      where: { barberId: req.barber.id },
      orderBy: { sortOrder: 'asc' }
    })
    return res.json({ services })
  } catch (e) {
    return next(e)
  }
})

const serviceSchema = z.object({
  name: z.string().min(1).max(80),
  price: z.number().int().min(0),
  durationMinutes: z.number().int().min(5).max(240),
  sortOrder: z.number().int().optional()
})

router.post('/services', async (req, res, next) => {
  try {
    const parsed = serviceSchema.safeParse(req.body || {})
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', issues: parsed.error.flatten() })
    }
    const max = await prisma.service.aggregate({
      where: { barberId: req.barber.id },
      _max: { sortOrder: true }
    })
    const service = await prisma.service.create({
      data: {
        ...parsed.data,
        sortOrder: parsed.data.sortOrder ?? (max._max.sortOrder ?? -1) + 1,
        barberId: req.barber.id
      }
    })
    return res.status(201).json({ service })
  } catch (e) {
    return next(e)
  }
})

const serviceUpdateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  price: z.number().int().min(0).optional(),
  durationMinutes: z.number().int().min(5).max(240).optional(),
  sortOrder: z.number().int().optional()
})

router.patch('/services/:id', async (req, res, next) => {
  try {
    const parsed = serviceUpdateSchema.safeParse(req.body || {})
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', issues: parsed.error.flatten() })
    }
    const existing = await prisma.service.findUnique({ where: { id: req.params.id } })
    if (!existing || existing.barberId !== req.barber.id) {
      return res.status(404).json({ error: 'not_found' })
    }
    const service = await prisma.service.update({
      where: { id: existing.id },
      data: parsed.data
    })
    return res.json({ service })
  } catch (e) {
    return next(e)
  }
})

router.delete('/services/:id', async (req, res, next) => {
  try {
    const existing = await prisma.service.findUnique({ where: { id: req.params.id } })
    if (!existing || existing.barberId !== req.barber.id) {
      return res.status(404).json({ error: 'not_found' })
    }
    await prisma.service.delete({ where: { id: existing.id } })
    return res.json({ ok: true })
  } catch (e) {
    return next(e)
  }
})

// ── In-app notifications for the barber ─────────────────────
router.get('/notifications', async (req, res, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.barber.userId },
      orderBy: { createdAt: 'desc' },
      take: 40
    })
    const unread = notifications.filter((n) => !n.readAt).length
    return res.json({ notifications, unread })
  } catch (e) {
    return next(e)
  }
})

router.post('/notifications/read', async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.barber.userId, readAt: null },
      data: { readAt: new Date() }
    })
    return res.json({ ok: true })
  } catch (e) {
    return next(e)
  }
})

// ── Loyalty ─────────────────────────────────────────────────
// Customers are identified by userId when logged in, else by phone.
function loyaltyKey(row) {
  return row.userId ? `u:${row.userId}` : row.customerPhone ? `p:${row.customerPhone.replace(/\s+/g, '')}` : null
}

router.get('/loyalty', async (req, res, next) => {
  try {
    const every = req.barber.loyaltyEvery
    const start = startOfTodayLocal()
    const [queueDone, slotDone] = await Promise.all([
      prisma.queueEntry.findMany({
        where: { barberId: req.barber.id, status: 'DONE', doneAt: { gte: start } },
        select: { customerName: true, customerPhone: true, paid: true, userId: true }
      }),
      prisma.slot.findMany({
        where: { barberId: req.barber.id, status: 'DONE' },
        select: { customerName: true, customerPhone: true, paid: true, userId: true }
      })
    ])

    const rows = [
      ...queueDone.map((r) => ({ ...r, customerName: r.customerName, customerPhone: r.customerPhone })),
      ...slotDone.map((r) => ({ ...r, customerName: r.customerName, customerPhone: r.customerPhone }))
    ]

    const byKey = new Map()
    for (const row of rows) {
      const key = loyaltyKey(row)
      if (!key) continue
      const item = byKey.get(key) || {
        name: row.customerName,
        phone: row.customerPhone,
        paid: 0,
        free: 0
      }
      if (row.paid !== false) item.paid++
      else item.free++
      byKey.set(key, item)
    }

    const customers = [...byKey.values()].map((c) => {
      const inCycle = c.paid % every
      const cycles = Math.floor(c.paid / every)
      // A free reward is "earned" once per completed cycle of paid visits;
      // when it hasn't been claimed yet, the next visit is free.
      const nextFree = c.paid > 0 && cycles > c.free
      return { ...c, every, inCycle, remaining: every - inCycle, nextFree }
    })
    customers.sort((a, b) => b.paid - a.paid)

    return res.json({ enabled: !!every, every, customers })
  } catch (e) {
    return next(e)
  }
})

export default router