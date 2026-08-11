import http from 'node:http'
import express from 'express'
import cors from 'cors'
import { config } from './config.js'
import { initSocket } from './socket.js'
import prisma from './db.js'

const app = express()

app.use(cors({ origin: config.clientUrl, credentials: true }))
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'hlagti-server' })
})

// Public config fragment (VAPID public key for push)
app.get('/api/config/public', (_req, res) => {
  res.json({ vapidPublicKey: config.vapid.publicKey })
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