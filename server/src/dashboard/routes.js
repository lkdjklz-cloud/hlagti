import { z } from 'zod'
import { Router } from 'express'
import prisma from '../db.js'
import { authRequired, roles, attachBarber } from '../auth/middleware.js'
import { startEntry, doneEntry, cancelQueue, walkIn } from '../queue/service.js'
import { startOfTodayLocal } from '../lib/barbers.js'
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
      slotsEnabled: req.barber.slotsEnabled
    }
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
    const updated = await doneEntry(entry.id)
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
  customerName: z.string().min(1).max(60)
})

router.post('/walkin', async (req, res, next) => {
  try {
    const parsed = walkInSchema.safeParse(req.body || {})
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', issues: parsed.error.flatten() })
    }
    const entry = await walkIn(req.barber, { customerName: parsed.data.customerName })
    return res.status(201).json({ entry })
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
  slotLengthMinutes: z.number().int().min(15).max(120).optional()
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

export default router