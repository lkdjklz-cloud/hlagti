import prisma from '../db.js'
import { signGuestTicket } from '../auth/tokens.js'
import { emitQueueUpdate, emitTicketUpdate, emitTicketRemoved } from '../socket.js'
import {
  createNotification,
  hasNotifiedToday,
  lastPosition,
  notifyBarber
} from '../notify/notify.js'
import {
  activeEntries,
  waitingCount,
  inService,
  boardSnapshot,
  ticketSnapshot
} from './board.js'
import { assertNoActiveBooking } from '../lib/booking.js'

export async function joinQueue(
  barber,
  { customerName = 'زبون', userId = null, deviceId = null, customerPhone = null } = {}
) {
  // One active booking per barber (queue ticket OR booked slot).
  await assertNoActiveBooking(barber.id, { userId, deviceId })

  // Unique daily numbering with retry to handle concurrent joins.
  const MAX_RETRIES = 3
  let entry
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      entry = await prisma.$transaction(async (tx) => {
        const last = await tx.queueEntry.findMany({
          where: { barberId: barber.id },
          orderBy: { number: 'desc' },
          take: 1,
          select: { number: true }
        })
        const number = last.length ? last[0].number + 1 : 1
        return tx.queueEntry.create({
          data: {
            barberId: barber.id,
            number,
            customerName: (customerName || '').trim() || 'زبون',
            customerPhone: customerPhone || null,
            guestId: deviceId || null,
            userId,
            status: 'WAITING',
            joinedAt: new Date()
          }
        })
      })
      break
    } catch (e) {
      if (e.code === 'P2002' && attempt < MAX_RETRIES - 1) {
        // Unique constraint violation — retry with fresh number
        continue
      }
      console.log('[db:error] queueEntry.create joinQueue', barber.slug, e)
      throw e
    }
  }

  await broadcast(barber, [entry.id])
  await notifyBarber(barber, {
    type: 'queue_joined',
    title: 'زبون جديد في الطابور',
    body: `${entry.customerName} (رقم ${entry.number}) انضم للانتظار.`,
    data: { entryId: entry.id, url: '/dashboard' }
  })
  return entry
}

async function ensureActive(entryId) {
  let entry
  try {
    entry = await prisma.queueEntry.findUnique({ where: { id: entryId } })
  } catch (e) {
    console.log('[db:error] queueEntry.findUnique ensureActive', entryId, e)
    throw e
  }
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

// actor: { user } (logged-in owner) or { ticket } (guest token) or { deviceId }
// barber: when passed, allows the barber to cancel anyone in their own queue.
export async function cancelQueue(entryId, actor, barber = null) {
  const entry = await ensureActive(entryId)
  const isBarber = barber && entry.barberId === barber.id
  const isGuest = actor.ticket && actor.ticket.entryId === entryId
  const isOwner = actor.user && entry.userId === actor.user.uid
  const isDeviceMatch =
    !isBarber && !isGuest && !isOwner && !!actor.deviceId && entry.guestId === actor.deviceId
  if (!isBarber && !isGuest && !isOwner && !isDeviceMatch) {
    const err = new Error('forbidden')
    err.status = 403
    throw err
  }
  if (entry.status !== 'WAITING') {
    const err = new Error('cannot_cancel')
    err.status = 409
    throw err
  }

  let updated
  try {
    updated = await prisma.queueEntry.update({
      where: { id: entry.id },
      data: { status: 'CANCELLED', canceledAt: new Date() }
    })
  } catch (e) {
    console.log('[db:error] queueEntry.update cancelQueue', entry.id, e)
    throw e
  }

  const b = barber || (await prisma.barber.findUnique({ where: { id: entry.barberId } }))
  emitTicketRemoved(entry.id)
  await broadcast(b, [])
  // Let the barber know when a customer backs out.
  if (!isBarber) {
    await notifyBarber(b, {
      type: 'queue_cancelled',
      title: 'أُلغي انتظار زبون',
      body: `${entry.customerName} (رقم ${entry.number}) ألغى انتظاره.`,
      data: { entryId: entry.id, url: '/dashboard' }
    })
  }
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
  let updated
  try {
    updated = await prisma.queueEntry.update({
      where: { id: entry.id },
      data: { status: 'IN_SERVICE', startedAt: new Date() }
    })
  } catch (e) {
    console.log('[db:error] queueEntry.update startEntry', entry.id, e)
    throw e
  }
  const barber = await prisma.barber.findUnique({ where: { id: entry.barberId } })
  await broadcast(barber, [entry.id])
  return updated
}

export async function doneEntry(entryId, { paid = true } = {}) {
  const entry = await ensureActive(entryId)
  if (entry.status !== 'IN_SERVICE') {
    const err = new Error('cannot_done')
    err.status = 409
    throw err
  }
  let updated
  try {
    updated = await prisma.queueEntry.update({
      where: { id: entry.id },
      data: { status: 'DONE', paid, doneAt: new Date() }
    })
  } catch (e) {
    console.log('[db:error] queueEntry.update doneEntry', entry.id, e)
    throw e
  }
  const barber = await prisma.barber.findUnique({ where: { id: entry.barberId } })
  emitTicketRemoved(entry.id)
  await broadcast(barber, [])
  return updated
}

export async function walkIn(barber, { customerName = 'زبون', phone = null } = {}) {
  return joinQueue(barber, { customerName, customerPhone: phone })
}

// Recompute the board + every waiting ticket and push to sockets.
// Emitting to all waiting entries keeps every viewer's position correct no
// matter which mutation happened (join behind, someone cancels, advance, …).
export async function broadcast(barber, _changedEntryIds = []) {
  let entries
  try {
    entries = await activeEntries(barber.id)
  } catch (e) {
    console.log('[db:error] activeEntries broadcast', barber.slug, e)
    throw e
  }
  const snapshot = await boardSnapshot(entries, barber)
  emitQueueUpdate(barber.id, snapshot)

  const waiting = entries.filter((e) => e.status === 'WAITING')
  await Promise.allSettled(
    waiting.map(async (e) => {
      try {
        const t = await ticketSnapshot(e, barber, entries)
        emitTicketUpdate(e.id, {
          id: e.id,
          number: e.number,
          position: t.position,
          etaMinutes: t.etaMinutes,
          waiting: t.waiting
        })
        await notifyEntry(e, t, barber)
      } catch (err) {
        console.log('[notify:error] broadcast entry', e.id, err)
      }
    })
  )
}

// Push/email evaluation for a single waiting entry.
async function notifyEntry(e, t, barber) {
  const position = t.position
  const key = (kind) => `${kind}:${e.id}`

  // Position-change push (only relevant above the milestone ranks).
  // userId is included when the customer is logged in so their push
  // subscription (bound to userId) is matched; guests match via data.entryId.
  if (position >= 2) {
    const prev = await lastPosition(key('position'))
    if (prev === null || prev !== position) {
      const aheadLabel =
        position === 2 ? 'شخصان فقط قبلك' : `${position} أشخاص قبلك`
      await createNotification({
        key: key('position'),
        type: 'position',
        userId: e.userId,
        title: 'تذكرة الانتظار',
        body: `تحرّك دورك — ${aheadLabel}.`,
        data: { entryId: e.id, position, url: `/barber/${barber.slug}` }
      })
    }
  }

  if (position === 1 && !(await hasNotifiedToday(key('milestone_one')))) {
    await createNotification({
      key: key('milestone_one'),
      type: 'milestone_one',
      userId: e.userId,
      title: 'دورك قريب جدًا',
      body: 'شخص واحد فقط قبلك — كن جاهزًا، دورك التالي!',
      data: { entryId: e.id, position: 1, url: `/barber/${barber.slug}` }
    })
  }

  if (position === 0 && !(await hasNotifiedToday(key('milestone_zero')))) {
    await createNotification({
      key: key('milestone_zero'),
      type: 'milestone_zero',
      userId: e.userId,
      title: 'أتى دورك!',
      body: 'لا أحد قبلك الآن — كن جاهزًا.',
      data: { entryId: e.id, position: 0, url: `/barber/${barber.slug}` }
    })
  }
}

export async function getMyTicketRaw(entryId) {
  let entry
  try {
    entry = await prisma.queueEntry.findUnique({ where: { id: entryId } })
  } catch (e) {
    console.log('[db:error] queueEntry.findUnique getMyTicketRaw', entryId, e)
    throw e
  }
  if (!entry) return null
  const barber = await prisma.barber.findUnique({ where: { id: entry.barberId } })
  return { entry, barber }
}

export function guestTicketFor(entry) {
  return signGuestTicket(entry.id)
}

export { waitingCount, inService }