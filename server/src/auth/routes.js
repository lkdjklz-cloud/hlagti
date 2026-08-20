import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { Router } from 'express'
import prisma from '../db.js'
import { signUser } from './tokens.js'
import { authRequired } from './middleware.js'

const router = Router()

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/

function slugify(name) {
  const base = String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'salon'
  const rand = Math.random().toString(36).slice(2, 7)
  return `${base}-${rand}`
}

const DEFAULT_SERVICES = [
  { name: 'قصّة', price: 300, durationMinutes: 20, sortOrder: 0 },
  { name: 'حلاقة + لحية', price: 500, durationMinutes: 30, sortOrder: 1 },
  { name: 'لحية فقط', price: 200, durationMinutes: 15, sortOrder: 2 }
]

const DEFAULT_WORKING_HOURS = Object.fromEntries(
  ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((day) => [
    day,
    { open: '09:00', close: '22:00' }
  ])
)

async function createBarberFor(user, { shopName, area, city, bio }) {
  return prisma.barber.create({
    data: {
      userId: user.id,
      slug: slugify(shopName),
      shopName,
      area,
      city,
      bio,
      opensAt: '09:00',
      closesAt: '22:00',
      workingHours: JSON.stringify(DEFAULT_WORKING_HOURS),
      slotsEnabled: true,
      slotLengthMinutes: 30,
      services: { create: DEFAULT_SERVICES }
    }
  })
}

const usernameField = z.string().regex(USERNAME_RE, 'invalid_username')

const barberRegisterSchema = z.object({
  username: usernameField,
  email: z.string().email(),
  password: z.string().min(6).max(100),
  name: z.string().min(2).max(60),
  shopName: z.string().min(2).max(80),
  area: z.string().optional(),
  city: z.string().optional(),
  bio: z.string().optional()
})

export async function findUniqueUsername(prismaClient, username) {
  const user = await prismaClient.user.findUnique({ where: { username } })
  return user ? { error: 'username_taken' } : null
}

router.post('/register/barber', async (req, res, next) => {
  const parsed = barberRegisterSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', issues: parsed.error.flatten() })
  }
  const d = parsed.data
  try {
    const existing = await prisma.user.findUnique({ where: { email: d.email.toLowerCase() } })
    if (existing) return res.status(409).json({ error: 'email_taken' })
    const taken = await findUniqueUsername(prisma, d.username)
    if (taken) return res.status(409).json(taken)

    const passwordHash = await bcrypt.hash(d.password, 10)
    const user = await prisma.user.create({
      data: {
        username: d.username,
        email: d.email.toLowerCase(),
        passwordHash,
        name: d.name,
        role: 'BARBER'
      }
    })
    const barber = await createBarberFor(user, d)
    return res.status(201).json({
      token: signUser(user),
      user: { id: user.id, username: user.username, email: user.email, name: user.name, role: user.role },
      barber: { id: barber.id, slug: barber.slug, shopName: barber.shopName }
    })
  } catch (e) {
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
    return next(e)
  }
})

const customerRegisterSchema = z.object({
  username: usernameField,
  email: z.string().email(),
  password: z.string().min(6).max(100),
  name: z.string().min(2).max(60),
  phone: z.string().optional()
})

router.post('/register/customer', async (req, res, next) => {
  const parsed = customerRegisterSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', issues: parsed.error.flatten() })
  }
  const d = parsed.data
  try {
    const existing = await prisma.user.findUnique({ where: { email: d.email.toLowerCase() } })
    if (existing) return res.status(409).json({ error: 'email_taken' })
    const taken = await findUniqueUsername(prisma, d.username)
    if (taken) return res.status(409).json(taken)
    const passwordHash = await bcrypt.hash(d.password, 10)
    const user = await prisma.user.create({
      data: {
        username: d.username,
        email: d.email.toLowerCase(),
        passwordHash,
        name: d.name,
        phone: d.phone,
        role: 'CUSTOMER'
      }
    })
    return res.status(201).json({
      token: signUser(user),
      user: { id: user.id, username: user.username, email: user.email, name: user.name, role: user.role }
    })
  } catch (e) {
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
    return next(e)
  }
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
})

router.post('/login', async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', issues: parsed.error.flatten() })
  }
  const { email, password } = parsed.data
  try {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
    if (!user || !user.passwordHash) return res.status(401).json({ error: 'bad_credentials' })
    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return res.status(401).json({ error: 'bad_credentials' })

    const barber = user.role === 'BARBER'
      ? await prisma.barber.findUnique({ where: { userId: user.id } })
      : null

    return res.json({
      token: signUser(user),
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role
      },
      barber: barber ? { id: barber.id, slug: barber.slug, shopName: barber.shopName } : null
    })
  } catch (e) {
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
    return next(e)
  }
})

router.get('/me', authRequired, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.auth.uid } })
    if (!user) return res.status(404).json({ error: 'not_found' })
    const barber = user.role === 'BARBER'
      ? await prisma.barber.findUnique({ where: { userId: user.id } })
      : null
    return res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone
      },
      barber: barber || null
    })
  } catch (e) {
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
    return next(e)
  }
})

// ── Become a barber ──────────────────────────────────────────
const upgradeSchema = z.object({
  shopName: z.string().min(2).max(80),
  area: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  bio: z.string().max(500).optional()
})

router.post('/upgrade/barber', authRequired, async (req, res, next) => {
  const parsed = upgradeSchema.safeParse(req.body || {})
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', issues: parsed.error.flatten() })
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: req.auth.uid } })
    if (!user) return res.status(404).json({ error: 'not_found' })
    const already = await prisma.barber.findUnique({ where: { userId: user.id } })
    if (already) return res.status(409).json({ error: 'already_barber' })

    const barber = await createBarberFor(user, parsed.data)
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { role: 'BARBER' }
    })
    return res.status(201).json({
      token: signUser(updated),
      user: {
        id: updated.id,
        username: updated.username,
        email: updated.email,
        name: updated.name,
        role: updated.role
      },
      barber: { id: barber.id, slug: barber.slug, shopName: barber.shopName }
    })
  } catch (e) {
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
    return next(e)
  }
})

export default router