import prisma from '../db.js'
import { verifyToken } from './tokens.js'

export function authRequired(req, res, next) {
  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  try {
    const payload = verifyToken(header.slice(7))
    if (!payload.uid) return res.status(401).json({ error: 'unauthorized' })
    req.auth = payload
    return next()
  } catch {
    return res.status(401).json({ error: 'unauthorized' })
  }
}

// Populates req.auth when a valid owner token is provided, without rejecting
// anonymous (guest) requests. Useful on public booking endpoints.
export function authOptional(req, _res, next) {
  const header = req.headers.authorization || ''
  if (header.startsWith('Bearer ')) {
    try {
      const payload = verifyToken(header.slice(7))
      if (payload?.uid) req.auth = payload
    } catch {
      /* invalid token → treat as anonymous */
    }
  }
  return next()
}

export function roles(...allowed) {
  return (req, res, next) => {
    if (!req.auth || !allowed.includes(req.auth.role)) {
      return res.status(403).json({ error: 'forbidden' })
    }
    return next()
  }
}

// Attaches the Barber row for a logged-in barber.
export async function attachBarber(req, _res, next) {
  try {
    const barber = await prisma.barber.findUnique({ where: { userId: req.auth.uid } })
    if (!barber) return next({ status: 404, message: 'barber profile not found' })
    req.barber = barber
    return next()
  } catch (e) {
    console.log(`[http:error] ${req.method} ${req.originalUrl}`, e)
    return next(e)
  }
}