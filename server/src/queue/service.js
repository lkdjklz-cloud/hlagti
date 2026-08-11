import prisma from '../db.js'
import { signGuestTicket } from '../auth/tokens.js'
import { emitQueueUpdate, emitTicketUpdate, emitTicketRemoved } from '../socket.js'
import { startOfTodayLocal } from '../lib/barbers.js'
import {
  activeEntries,
  waitingCount,
  inService,
  boardSnapshot,
  ticketSnapshot
} from './board.js'

export async function joinQueue(barber, { customerName = 'زبون', userId = null } = {}) {
  const startOfDay = startOfTodayLocal()
  const last = await prisma.queueEntry.findFirst({
    where: { barberId: barber.id, joinedAt: { gte: startOfDay } },
    orderBy: { number: 'desc' }
  })
  const number = (last?.number || 0) + 1

  const entry = await prisma.queueEntry.create({
    data: {
      barberId: barber.id,
      number,
      customerName: (customerName || '').trim() || 'زبون',
      userId,
      status: 'WAITING',
      joinedAt: new Date()
    }
  })

  await broadcast(barber, [entry.id])
  return entry
}

async function ensureActive(entryId) {
  const entry = await prisma.queueEntry.findUnique({ where: { id: entryId } })
  if (!entry) {
    const err = new Error('not_found')
    err.status = 404
    throw err
  }
  if (entry.status === 'CANCELLED') {
    const err = new Error('already_cancelled')
    err.status = 409
    throw err
  }
  return entry
}

// actor: { user } (logged-in owner) or { ticket } (guest token)
// barber: when passed, allows the barber to cancel anyone in their own queue.
export async function cancelQueue(entryId, actor, barber = null) {
  const entry = await ensureActive(entryId)
  const isBarber = barber && entry.barberId === barber.id
  const isGuest = actor.ticket && actor.ticket.entryId === entryId
  const isOwner = actor.user && entry.userId === actor.user.uid
  if (!isBarber && !isGuest && !isOwner) {
    const err = new Error('forbidden')
    err.status = 403
    throw err
  }
  if (entry.status !== 'WAITING') {
    const err = new Error('cannot_cancel')
    err.status = 409
    throw err
  }

  const updated = await prisma.queueEntry.update({
    where: { id: entry.id },
    data: { status: 'CANCELLED', canceledAt: new Date() }
  })

  const b = barber || (await prisma.barber.findUnique({ where: { id: entry.barberId } }))
  emitTicketRemoved(entry.id)
  await broadcast(b, [])
  return updated
}

// Barber dashboard actions
export async function startEntry(entryId) {
  const entry = await ensureActive(entryId)
  if (entry.status !== 'WAITING') {
    const err = new Error('cannot_start')
    err.status = 409
    throw err
  }
  const updated = await prisma.queueEntry.update({
    where: { id: entry.id },
    data: { status: 'IN_SERVICE', startedAt: new Date() }
  })
  const barber = await prisma.barber.findUnique({ where: { id: entry.barberId } })
  await broadcast(barber, [entry.id])
  return updated
}

export async function doneEntry(entryId) {
  const entry = await ensureActive(entryId)
  if (entry.status !== 'IN_SERVICE') {
    const err = new Error('cannot_done')
    err.status = 409
    throw err
  }
  const updated = await prisma.queueEntry.update({
    where: { id: entry.id },
    data: { status: 'DONE', doneAt: new Date() }
  })
  const barber = await prisma.barber.findUnique({ where: { id: entry.barberId } })
  emitTicketRemoved(entry.id)
  await broadcast(barber, [])
  return updated
}

export async function walkIn(barber, { customerName = 'زبون' } = {}) {
  return joinQueue(barber, { customerName })
}

// Recompute the board + every waiting ticket and push to sockets.
// Emitting to all waiting entries keeps every viewer's position correct no
// matter which mutation happened (join behind, someone cancels, advance, …).
export async function broadcast(barber, _changedEntryIds = []) {
  const entries = await activeEntries(barber.id)
  const snapshot = boardSnapshot(entries, barber)
  emitQueueUpdate(barber.id, snapshot)

  for (const e of entries) {
    if (e.status !== 'WAITING') continue
    const { position, etaMinutes, waiting } = await ticketSnapshot(e, barber)
    emitTicketUpdate(e.id, {
      id: e.id,
      number: e.number,
      position,
      etaMinutes,
      waiting
    })
  }
}

export async function getMyTicketRaw(entryId) {
  const entry = await prisma.queueEntry.findUnique({ where: { id: entryId } })
  if (!entry) return null
  const barber = await prisma.barber.findUnique({ where: { id: entry.barberId } })
  return { entry, barber }
}

export function guestTicketFor(entry) {
  return signGuestTicket(entry.id)
}

export { waitingCount, inService }