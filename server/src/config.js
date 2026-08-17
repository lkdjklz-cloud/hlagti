import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '../../.env') })

export const config = {
  port: Number(process.env.PORT || 3001),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  guestTicketTtlHours: Number(process.env.GUEST_TICKET_TTL_HOURS || 12),
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