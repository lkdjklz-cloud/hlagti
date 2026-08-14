import { io } from 'socket.io-client'

let socket = null

export function getSocket() {
  if (!socket) socket = io()
  return socket
}

export function joinBarberRoom(barberId) {
  getSocket().emit('barber:join', barberId)
}

export function leaveBarberRoom(barberId) {
  getSocket().emit('barber:leave', barberId)
}

export function joinTicketRoom(token) {
  getSocket().emit('ticket:join', { token })
}

export function onQueueUpdate(cb) {
  const s = getSocket()
  s.on('queue:update', cb)
  return () => s.off('queue:update', cb)
}

export function onTicketUpdate(cb) {
  const s = getSocket()
  s.on('ticket:update', cb)
  return () => s.off('ticket:update', cb)
}

export function onTicketRemoved(cb) {
  const s = getSocket()
  s.on('ticket:removed', cb)
  return () => s.off('ticket:removed', cb)
}

export function onNotifyNew(cb) {
  const s = getSocket()
  s.on('notify:new', cb)
  return () => s.off('notify:new', cb)
}