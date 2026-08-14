import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'
import { config } from './config.js'

let io = null

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: config.clientUrl, methods: ['GET', 'POST'] }
  })

  io.on('connection', (socket) => {
    // Guest ticket holders / logged-in owners may join their own ticket room.
    socket.on('ticket:join', (payload) => {
      try {
        if (!payload || typeof payload.token !== 'string') return
        const decoded = jwt.verify(payload.token, config.jwtSecret)
        if (decoded.type !== 'guest') return
        socket.join(`ticket:${decoded.entryId}`)
      } catch {
        /* ignore invalid ticket token */
      }
    })

    // Any viewer of a barber page joins the public queue room.
    socket.on('barber:join', (barberId) => {
      if (typeof barberId === 'string') socket.join(`barber:${barberId}`)
    })
  })

  return io
}

export function getIo() {
  if (!io) throw new Error('Socket.io not initialized yet')
  return io
}

export function emitQueueUpdate(barberId, data) {
  if (!io) return
  getIo().to(`barber:${barberId}`).emit('queue:update', data)
}

export function emitTicketUpdate(entryId, data) {
  if (!io) return
  getIo().to(`ticket:${entryId}`).emit('ticket:update', data)
}

export function emitTicketRemoved(entryId) {
  if (!io) return
  getIo().to(`ticket:${entryId}`).emit('ticket:removed')
}

export function emitNotify(barberId, notification) {
  if (!io) return
  getIo().to(`barber:${barberId}`).emit('notify:new', notification)
}