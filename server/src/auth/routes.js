import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { Router } from 'express'
import prisma from '../db.js'
import { signUser, verifyRefreshToken } from './tokens.js'
import { authRequired } from './middleware.js'

const router = Router()

// ── Rate limiting for login ─────────────────────────────────
const loginAttempts = new Map() // key → { count, resetAt }
const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000 // 15 minutes

function checkRateLimit(key) {
  const now = Date.now()
  const entry = loginAttempts.get(key)
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  entry.count++
  return entry.count <= MAX_ATTEMPTS
}

// Periodic cleanup of expired entries (every 5 min)
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of loginAttempts) {
    if (now > entry.resetAt) loginAttempts.delete(key)
  }
}, 5 * 60 * 1000).unref()

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

// Barbers: require BOTH email and phone
const barberRegisterSchema = z.object({
  username: usernameField,
  email: z.string().email(),
  phone: z.string().min(8).max(20),
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
    const existingEmail = await prisma.user.findUnique({ where: { email: d.email.toLowerCase() } })
    if (existingEmail) return res.status(409).json({ error: 'email_taken' })
    const existingPhone = await prisma.user.findFirst({ where: { phone: d.phone } })
    if (existingPhone) return res.status(409).json({ error: 'phone_taken' })
    const taken = await findUniqueUsername(prisma, d.username)
    if (taken) return res.status(409).json(taken)

    const passwordHash = await bcrypt.hash(d.password, 10)
    const user = await prisma.user.create({
      data: {
        username: d.username,
        email: d.email.toLowerCase(),
        phone: d.phone,
        passwordHash,
        name: d.name,
        role: 'BARBER'
      }
    })
    const barber = await createBarberFor(user, d)
    const tokens = signUser(user)
    return res.status(201).json({
      ...tokens,
      user: { id: user.id, username: user.username, email: user.email, name: user.name, role: user.role },
      barber: { id: barber.id, slug: barber.slug, shopName: barber.shopName }
    })
  } catch (e) {
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
    return next(e)
  }
})

// Customers: require EITHER email or phone (at least one). Empty strings
// from forms are treated as absent so a blank optional phone never fails.
const toUndef = (v) => (v === '' || v === null || v === undefined ? undefined : v)
const customerRegisterSchema = z.object({
  username: usernameField,
  email: z.preprocess(toUndef, z.string().email().optional()),
  phone: z.preprocess(toUndef, z.string().min(8).max(20).optional()),
  password: z.string().min(6).max(100),
  name: z.string().min(2).max(60)
}).refine((data) => data.email || data.phone, {
  message: 'يجب توفير البريد الإلكتروني أو رقم الهاتف',
  path: ['email']
})

router.post('/register/customer', async (req, res, next) => {
  const parsed = customerRegisterSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', issues: parsed.error.flatten() })
  }
  const d = parsed.data
  try {
    if (d.email) {
      const existingEmail = await prisma.user.findUnique({ where: { email: d.email.toLowerCase() } })
      if (existingEmail) return res.status(409).json({ error: 'email_taken' })
    }
    if (d.phone) {
      const existingPhone = await prisma.user.findFirst({ where: { phone: d.phone } })
      if (existingPhone) return res.status(409).json({ error: 'phone_taken' })
    }
    const taken = await findUniqueUsername(prisma, d.username)
    if (taken) return res.status(409).json(taken)
    const passwordHash = await bcrypt.hash(d.password, 10)
    const user = await prisma.user.create({
      data: {
        username: d.username,
        email: d.email?.toLowerCase() || null,
        phone: d.phone || null,
        passwordHash,
        name: d.name,
        role: 'CUSTOMER'
      }
    })
    const tokens = signUser(user)
    return res.status(201).json({
      ...tokens,
      user: { id: user.id, username: user.username, email: user.email, name: user.name, role: user.role }
    })
  } catch (e) {
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
    return next(e)
  }
})

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1)
})

router.post('/login', async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', issues: parsed.error.flatten() })
  }
  const { email, password } = parsed.data
  const ip = req.ip || req.connection?.remoteAddress || 'unknown'
  const rlKey = `login:${ip}:${email.toLowerCase()}`
  if (!checkRateLimit(rlKey)) {
    return res.status(429).json({ error: 'too_many_attempts', retryAfter: Math.ceil(WINDOW_MS / 1000) })
  }
  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: email.toLowerCase() },
          { phone: email }
        ]
      }
    })
    if (!user || !user.passwordHash) return res.status(401).json({ error: 'bad_credentials' })
    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) return res.status(401).json({ error: 'bad_credentials' })

    loginAttempts.delete(rlKey)

    const barber = user.role === 'BARBER'
      ? await prisma.barber.findUnique({ where: { userId: user.id } })
      : null

    const tokens = signUser(user)
    return res.json({
      ...tokens,
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

const refreshSchema = z.object({
  refreshToken: z.string()
})

router.post('/refresh', async (req, res, next) => {
  const parsed = refreshSchema.safeParse(req.body || {})
  if (!parsed.success) {
    return res.status(400).json({ error: 'validation', issues: parsed.error.flatten() })
  }
  try {
    const decoded = verifyRefreshToken(parsed.data.refreshToken)
    const user = await prisma.user.findUnique({ where: { id: decoded.uid } })
    if (!user) return res.status(401).json({ error: 'user_not_found' })
    const tokens = signUser(user)
    return res.json(tokens)
  } catch (e) {
    return res.status(401).json({ error: 'invalid_refresh_token' })
  }
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
    const tokens = signUser(updated)
    return res.status(201).json({
      ...tokens,
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