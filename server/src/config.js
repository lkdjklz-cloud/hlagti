import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '../.env') })

const jwtSecret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'dev-secret')
if (process.env.NODE_ENV === 'production' && !jwtSecret) {
  throw new Error('JWT_SECRET environment variable is required in production')
}
if (jwtSecret && jwtSecret.length < 16) {
  console.warn('[config] WARNING: JWT_SECRET is shorter than 16 characters — use a stronger secret in production')
}

export const config = {
  port: Number(process.env.PORT || 3001),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  jwtSecret,
  guestTicketTtlHours: Number(process.env.GUEST_TICKET_TTL_HOURS || 12),
  rateLimits: {
    registerPerIp: Number(process.env.REGISTER_LIMIT || 10),
    refreshPerIp: Number(process.env.REFRESH_LIMIT || 120)
  },
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'mailto:dev@hlagti.local'
  },
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'حلاقتي <no-reply@hlagti.local>'
  }
}