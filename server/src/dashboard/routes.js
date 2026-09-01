import { z } from 'zod'
import { Router } from 'express'
import path from 'node:path'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import multer from 'multer'
import prisma from '../db.js'
import { authRequired, roles, attachBarber } from '../auth/middleware.js'
import { startEntry, doneEntry, cancelQueue, walkIn } from '../queue/service.js'
import { startOfTodayLocal } from '../lib/barbers.js'
import { loyaltyStatsForUsers } from '../lib/loyalty.js'
import { notifyBarber, createNotification } from '../notify/notify.js'
const router = Router()

const uploadsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'uploads')

const ALLOWED_PHOTO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const PHOTO_MAX_BYTES = 3 * 1024 * 1024
const photoCol = crypto.randomBytes(12).toString('hex')
const photoUpload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => {
      const ext = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[file.mimetype]
      cb(null, `${Date.now()}-${photoCol}${ext}`)
    }
  }),
  limits: { fileSize: PHOTO_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_PHOTO_MIME.has(file.mimetype)) return cb(new Error('invalid_image_type'))
    cb(null, true)
  }
})

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

// After a visit finishes, notify the barber AND the customer about loyalty:
//  - a PAID visit that crossed the threshold earns a reward ("next one is
//    free") → barber outbox + customer inbox/push,
//  - a FREE visit (paid === false) that was just claimed → customer gets a
//    celebratory notification + a live socket celebration on their ticket.
// Customers are identified ONLY by their unique username (no phone fallback).
async function loyaltyAfterVisit(req, { customerName, userId = null, paid = true, entryId = null }) {
  const every = req.barber.loyaltyEvery
  const shopName = req.barber.shopName
  if (!every) return
  if (!userId) return
  let who = null
  try {
    who = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true }
    })
  } catch (e) {
    console.log('[db:error] loyaltyAfterVisit user', userId, e)
    return
  }
  if (!who?.username) return
  const key = `username:${who.username}`
  const [q, s] = await Promise.all([
    prisma.queueEntry.findMany({
      where: { barberId: req.barber.id, status: 'DONE' },
      select: { paid: true, userId: true, user: { select: { username: true } } }
    }),
    prisma.slot.findMany({
      where: { barberId: req.barber.id, status: 'DONE' },
      select: { paid: true, userId: true, user: { select: { username: true } } }
    })
  ]).catch((e) => {
    console.log('[db:error] loyaltyAfterVisit count', e)
    return [[], []]
  })
  const all = [...q, ...s]
  const filtered = all.filter((r) => {
    const k = r.user?.username ? `username:${r.user.username}` : null
    return k === key
  })
  const paidCount = filtered.filter((r) => r.paid !== false).length
  const freeCount = filtered.filter((r) => r.paid === false).length
  const happyName = customerName && customerName !== 'زبون' ? customerName : who.username

  // A paid visit just earned a fresh reward → tell the barber AND the customer.
  const earnedNewReward = paidCount > 0 && Math.floor(paidCount / every) > freeCount
  if (earnedNewReward) {
    await notifyBarber(req.barber, {
      type: 'loyalty_reached',
      title: 'مكافأة ولاء 🎁',
      body: `${happyName} (@${who.username}) أتمّ ${paidCount} زيارة مدفوعة — زيارته القادمة مجانية!`,
      data: { url: '/dashboard' }
    })
    await createNotification({
      userId,
      type: 'loyalty_reward',
      key: `loyalty_reward:${userId}:${Math.floor(paidCount / every)}`,
      title: 'مكافأة ولائك هنا! 🎁',
      body: `أحسنت ${happyName}! أتممت ${every} حلقات مدفوعة — حلاقتك القادمة لدى ${shopName} مجانية!`,
      data: { barberId: req.barber.id, url: `/barber/${req.barber.slug}` }
    })
  }

  // A free visit was just claimed → celebrate with the customer (inbox/push
  // + a live firework on their open ticket screen).
  if (!paid) {
    const celebratory = {
      moment: 'free',
      title: 'حلاقتك كانت مجانية! 🎉',
      body: `أحسنت ${happyName}! أتممنا حلاقتك بالمجان بفضل ولائك في ${shopName} — شكرًا لثقتك 💈`,
      url: `/barber/${req.barber.slug}`
    }
    if (entryId) {
      const { emitTicketEvent } = await import('../socket.js')
      emitTicketEvent(entryId, 'loyalty:celebrate', celebratory)
    }
    await createNotification({
      userId,
      type: 'loyalty_free',
      key: `loyalty_free:${entryId || userId}`,
      title: celebratory.title,
      body: celebratory.body,
      data: { barberId: req.barber.id, ...celebratory }
    })
  }
}

// ── Queue board ─────────────────────────────────────────────
router.get('/queue', async (req, res, next) => {
  try {
    const startOfDay = startOfTodayLocal()
    const queueRaw = await prisma.queueEntry.findMany({
      where: { barberId: req.barber.id, status: { in: ['WAITING', 'IN_SERVICE'] } },
      orderBy: { number: 'asc' }
    })
    const done = await prisma.queueEntry.findMany({
      where: { barberId: req.barber.id, status: 'DONE', doneAt: { gte: startOfDay } },
      orderBy: { doneAt: 'desc' },
      take: 20
    })
    const loyaltyMap = await loyaltyStatsForUsers(
      req.barber.id,
      [...queueRaw, ...done].map((e) => e.userId)
    )
    const withLoyalty = (e) => {
      const l = loyaltyMap.get(e.userId)
      return l && l.enabled ? { ...e, loyaltyNextFree: l.nextFree, loyaltyRemaining: l.remaining } : e
    }
    const queue = queueRaw
    return res.json({
      ...boardPayload(req),
      queue: queue.map(withLoyalty),
      doneToday: done.map(withLoyalty),
      statWaiting: queue.filter((e) => e.status === 'WAITING').length,
      statInService: queue.filter((e) => e.status === 'IN_SERVICE').length
    })
  } catch (e) {
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
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
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
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
    await loyaltyAfterVisit(req, {
      customerName: entry.customerName,
      userId: entry.userId,
      paid: req.body?.paid !== false,
      entryId: entry.id
    })
    return res.json({ entry: updated })
  } catch (e) {
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
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
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
    return next(e)
  }
})

const walkInSchema = z.object({
  customerName: z.string().min(1).max(60),
  phone: z.string().max(20).optional()
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
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
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
    const withS = async (arr) => {
      const loyaltyMap = await loyaltyStatsForUsers(
        req.barber.id,
        arr.map((s) => s.userId)
      )
      return arr.map((s) => {
        const l = loyaltyMap.get(s.userId)
        return l && l.enabled ? { ...s, loyaltyNextFree: l.nextFree, loyaltyRemaining: l.remaining } : s
      })
    }
    return res.json({ appointments: await withS(slots) })
  } catch (e) {
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
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
    const loyaltyMap = await loyaltyStatsForUsers(
      req.barber.id,
      slots.map((s) => s.userId)
    )
    const withS = slots.map((s) => {
      const l = loyaltyMap.get(s.userId)
      return l && l.enabled ? { ...s, loyaltyNextFree: l.nextFree, loyaltyRemaining: l.remaining } : s
    })
    return res.json({ slots: withS })
  } catch (e) {
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
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
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
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
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
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
      data: { status: 'DONE', paid: req.body?.paid !== false, doneAt: new Date() }
    })
    await loyaltyAfterVisit(req, {
      customerName: slot.customerName,
      userId: slot.userId,
      paid: req.body?.paid !== false,
      entryId: null
    })
    return res.json({ slot: updated })
  } catch (e) {
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
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
  workingHours: z.record(
    z.enum(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']),
    z.object({
      open: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/).or(z.literal('')),
      close: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/).or(z.literal(''))
    }).nullable()
  ).optional(),
  slotsEnabled: z.boolean().optional(),
  slotLengthMinutes: z.number().int().min(15).max(120).optional(),
  loyaltyEvery: z.number().int().min(2).max(50).optional().nullable(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable()
})

router.patch('/settings', async (req, res, next) => {
  try {
    const parsed = settingsSchema.safeParse(req.body || {})
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', issues: parsed.error.flatten() })
    }
    const d = parsed.data
    const data = { ...d }
    if (d.lat !== undefined || d.lng !== undefined) {
      const latSet = d.lat !== undefined && d.lat !== null
      const lngSet = d.lng !== undefined && d.lng !== null
      if (latSet !== lngSet) {
        return res.status(400).json({ error: 'validation', issues: { lat: 'both lat and lng required' } })
      }
      if (!latSet) {
        data.lat = null
        data.lng = null
      }
    }
    if (d.workingHours !== undefined) {
      const wh = {}
      for (const [day, h] of Object.entries(d.workingHours)) {
        if (h && (h.open !== '' || h.close !== '')) {
          wh[day] = h.open === '' ? { ...h, open: null } : h.close === '' ? { ...h, close: null } : h
        } else {
          wh[day] = null
        }
      }
      data.workingHours = JSON.stringify(wh)
    }
    const barber = await prisma.barber.update({
      where: { id: req.barber.id },
      data
    })
    return res.json({ barber })
  } catch (e) {
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
    return next(e)
  }
})

// ── Barber profile photo ─────────────────────────────────────────
await fs.mkdir(uploadsDir, { recursive: true })

function photoPathFromUrl(photoUrl) {
  if (!photoUrl || !photoUrl.startsWith('/uploads/')) return null
  return path.join(uploadsDir, path.basename(photoUrl))
}

async function removePhotoFile(photoUrl) {
  const abs = photoPathFromUrl(photoUrl)
  if (!abs) return
  await fs.unlink(abs).catch(() => {})
}

router.post('/photo', (req, res, next) => {
  photoUpload.single('photo')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message === 'invalid_image_type' ? 'invalid_image_type' : 'invalid_image' })
    }
    if (!req.file) return res.status(400).json({ error: 'no_file' })
    try {
      const old = req.barber.photoUrl
      const photoUrl = `/uploads/${req.file.filename}`
      await prisma.barber.update({ where: { id: req.barber.id }, data: { photoUrl } })
      await removePhotoFile(old)
      return res.status(201).json({ photoUrl })
    } catch (e) {
      await removePhotoFile(`/uploads/${req.file.filename}`)
      return next(e)
    }
  })
})

router.delete('/photo', async (req, res, next) => {
  try {
    const old = req.barber.photoUrl
    await prisma.barber.update({ where: { id: req.barber.id }, data: { photoUrl: null } })
    await removePhotoFile(old)
    return res.json({ photoUrl: null })
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
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
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
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
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
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
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
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
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
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
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
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
    return next(e)
  }
})

// ── Loyalty ─────────────────────────────────────────────────
// Customers are identified ONLY by their unique username (no phone fallback).
function loyaltyKey(row) {
  if (row.user?.username) return `username:${row.user.username}`
  return null
}

router.get('/loyalty', async (req, res, next) => {
  try {
    const every = req.barber.loyaltyEvery
    const [queueDone, slotDone] = await Promise.all([
      prisma.queueEntry.findMany({
        where: { barberId: req.barber.id, status: 'DONE' },
        select: {
          customerName: true,
          paid: true,
          userId: true,
          user: { select: { username: true } }
        }
      }),
      prisma.slot.findMany({
        where: { barberId: req.barber.id, status: 'DONE' },
        select: {
          customerName: true,
          paid: true,
          userId: true,
          user: { select: { username: true } }
        }
      })
    ])

    const byKey = new Map()
    for (const row of [...queueDone, ...slotDone]) {
      const key = loyaltyKey(row)
      if (!key) continue
      const item = byKey.get(key) || {
        name: row.user?.username || row.customerName,
        paid: 0,
        free: 0
      }
      if (row.paid !== false) item.paid++
      else item.free++
      byKey.set(key, item)
    }

    const customers = every
      ? [...byKey.values()].map((c) => {
          const inCycle = c.paid % every
          const cycles = Math.floor(c.paid / every)
          // A free reward is "earned" once per completed cycle of paid visits;
          // when it hasn't been claimed yet, the next visit is free.
          const nextFree = c.paid > 0 && cycles > c.free
          return { ...c, every, inCycle, remaining: every - inCycle, nextFree }
        })
      : []
    if (every) customers.sort((a, b) => b.paid - a.paid)

    return res.json({ enabled: !!every, every, customers })
  } catch (e) {
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
    return next(e)
  }
})

export default router