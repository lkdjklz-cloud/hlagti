import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import { config } from './config.js'
import { initSocket } from './socket.js'
import prisma from './db.js'
import authRoutes from './auth/routes.js'
import barbersRoutes from './barbers/routes.js'
import queueRoutes from './queue/routes.js'
import slotsRoutes from './slots/routes.js'
import notifyRoutes from './notify/routes.js'
import dashboardRoutes from './dashboard/routes.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsDir = path.join(__dirname, '..', 'uploads')

const app = express()

app.use(cors({ origin: config.clientUrl, credentials: true }))
app.use(express.json({ limit: '1mb' }))

app.use('/uploads', express.static(uploadsDir))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'hlagti-server' })
})

app.use('/api/auth', authRoutes)
app.use('/api', barbersRoutes)
app.use('/api', queueRoutes)
app.use('/api', slotsRoutes)
app.use('/api', notifyRoutes)
app.use('/api/dashboard', dashboardRoutes)

// Public config fragment (VAPID public key for push)
app.get('/api/config/public', (_req, res) => {
  res.json({ vapidPublicKey: config.vapid.publicKey })
})

// Static web build + SPA fallback (single deployable unit).
// Only active when the production build exists, so local dev via Vite stays untouched.
const distDir = path.join(__dirname, '..', '..', 'web', 'dist')
const distIndex = path.join(distDir, 'index.html')
if (fs.existsSync(distIndex)) {
  app.use(express.static(distDir))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next()
    return res.sendFile(distIndex)
  })
}

// Central error handler (async errors land here via next(e))
app.use((err, _req, res, next) => {
  if (res.headersSent) return next(err)
  const status = err.status || 500
  const message = status === 500 ? 'internal_error' : err.message
  console.log(`[http:error] ${_req.method} ${_req.originalUrl} -> ${status}:`, err)
  return res.status(status).json({ error: message })
})

const httpServer = http.createServer(app)
const io = initSocket(httpServer)

async function start() {
  await prisma.$connect()
  httpServer.listen(config.port, () => {
    console.log(`[hlagti-server] listening on http://localhost:${config.port}`)
  })
}

function shutdown(signal) {
  console.log(`[hlagti-server] ${signal} received — shutting down`)
  httpServer.close(() => {
    io.close()
    prisma.$disconnect().then(() => process.exit(0)).catch(() => process.exit(1))
  })
  // Force exit after 10s if graceful shutdown stalls
  setTimeout(() => process.exit(1), 10000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

start().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})