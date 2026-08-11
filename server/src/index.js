import http from 'node:http'
import express from 'express'
import cors from 'cors'
import { config } from './config.js'
import { initSocket } from './socket.js'
import prisma from './db.js'
import authRoutes from './auth/routes.js'
import barbersRoutes from './barbers/routes.js'
import queueRoutes from './queue/routes.js'
import dashboardRoutes from './dashboard/routes.js'

const app = express()

app.use(cors({ origin: config.clientUrl, credentials: true }))
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'hlagti-server' })
})

app.use('/api/auth', authRoutes)
app.use('/api', barbersRoutes)
app.use('/api', queueRoutes)
app.use('/api/dashboard', dashboardRoutes)

// Public config fragment (VAPID public key for push)
app.get('/api/config/public', (_req, res) => {
  res.json({ vapidPublicKey: config.vapid.publicKey })
})

// Central error handler (async errors land here via next(e))
app.use((err, _req, res, next) => {
  if (res.headersSent) return next(err)
  const status = err.status || 500
  const message = status === 500 ? 'internal_error' : err.message
  if (status === 500) console.error('[error]', err)
  return res.status(status).json({ error: message })
})

const httpServer = http.createServer(app)
initSocket(httpServer)

async function start() {
  await prisma.$connect()
  httpServer.listen(config.port, () => {
    console.log(`[hlagti-server] listening on http://localhost:${config.port}`)
  })
}

start().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})