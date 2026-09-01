import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'
import { config } from './config.js'

let io = null

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: config.clientUrl, methods: ['GET', 'POST'] }
  })

  io.on('connection', (socket) => {
    const joinedRooms = new Set()

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

    socket.on('barber:join', (barberId) => {
      if (typeof barberId !== 'string') return
      if (joinedRooms.size >= 20) return // cap per socket
      const room = `barber:${barberId}`
      if (!joinedRooms.has(room)) {
        joinedRooms.add(room)
        socket.join(room)
      }
    })

    socket.on('barber:leave', (barberId) => {
      if (typeof barberId !== 'string') return
      const room = `barber:${barberId}`
      joinedRooms.delete(room)
      socket.leave(room)
    })

    socket.on('disconnect', () => {
      joinedRooms.clear()
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

export function emitTicketEvent(entryId, event, data) {
  if (!io) return
  getIo().to(`ticket:${entryId}`).emit(event, data)
}

export function emitNotify(barberId, notification) {
  if (!io) return
  getIo().to(`barber:${barberId}`).emit('notify:new', notification)
}