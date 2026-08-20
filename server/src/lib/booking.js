import prisma from '../db.js'

export const ACTIVE_QUEUE_STATUS = ['WAITING', 'IN_SERVICE']
export const ACTIVE_SLOT_STATUS = ['BOOKED', 'ARRIVED']

// identity: { userId?, deviceId? } — a person is identified by their account
// (userId → username/loyalty) or, for anonymous guests, their device id.
export async function findActiveBooking(barberId, identity) {
  const { userId, deviceId } = identity || {}
  if (!userId && !deviceId) return null

  const or = []
  if (userId) or.push({ userId })
  if (deviceId) or.push({ guestId: deviceId })

  let queue, slot
  try {
    ;[queue, slot] = await Promise.all([
      prisma.queueEntry.findFirst({
        where: { barberId, status: { in: ACTIVE_QUEUE_STATUS }, OR: or },
        orderBy: { joinedAt: 'desc' }
      }),
      prisma.slot.findFirst({
        where: { barberId, status: { in: ACTIVE_SLOT_STATUS }, OR: or },
        orderBy: { startsAt: 'asc' }
      })
    ])
  } catch (e) {
    console.log('[db:error] findActiveBooking', barberId, e)
    throw e
  }

  if (queue && slot) {
    return queue.joinedAt >= slot.createdAt
      ? { kind: 'queue', entry: queue }
      : { kind: 'slot', slot }
  }
  if (queue) return { kind: 'queue', entry: queue }
  if (slot) return { kind: 'slot', slot }
  return null
}

// Enforce "one active booking per barber": throws 409 already_booked.
export async function assertNoActiveBooking(barberId, identity) {
  const existing = await findActiveBooking(barberId, identity)
  if (existing) {
    const err = new Error('already_booked')
    err.status = 409
    throw err
  }
}