import { z } from 'zod'
import { Router } from 'express'
import prisma from '../db.js'
import { verifyToken } from '../auth/tokens.js'

const router = Router()

const schema = z.object({
  subscription: z.object({
    endpoint: z.string(),
    keys: z.object({
      p256dh: z.string(),
      auth: z.string()
    })
  }),
  ticketToken: z.string().optional()
})

// Subscribe a device to pushes. Guest via ticketToken (→ entryId) or JWT (→ userId).
router.post('/push/subscribe', async (req, res, next) => {
  try {
    const parsed = schema.safeParse(req.body || {})
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation', issues: parsed.error.flatten() })
    }
    const { endpoint, keys } = parsed.data.subscription

    let userId = req.auth ? req.auth.uid : null
    let entryId = null
    if (!userId && parsed.data.ticketToken) {
      try {
        const decoded = verifyToken(parsed.data.ticketToken)
        if (decoded.type === 'guest') entryId = decoded.entryId
      } catch {
        /* invalid guest token */
      }
    }

    const existing = await prisma.pushSubscription.findUnique({ where: { endpoint } })
    const data = {
      userId: userId ?? existing?.userId ?? null,
      entryId: entryId ?? existing?.entryId ?? null,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: req.headers['user-agent'] || null
    }

    if (existing) {
      await prisma.pushSubscription.update({ where: { endpoint }, data })
    } else {
      await prisma.pushSubscription.create({ data })
    }
    return res.json({ ok: true })
  } catch (e) {
    return next(e)
  }
})

const unsubSchema = z.object({ endpoint: z.string() })

router.post('/push/unsubscribe', async (req, res, next) => {
  try {
    const parsed = unsubSchema.safeParse(req.body || {})
    if (!parsed.success) return res.status(400).json({ error: 'validation' })
    await prisma.pushSubscription.delete({ where: { endpoint: parsed.data.endpoint } }).catch(() => {})
    return res.json({ ok: true })
  } catch (e) {
    return next(e)
  }
})

export default router