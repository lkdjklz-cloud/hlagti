import prisma from '../db.js'

// Active = WAITING or IN_SERVICE. A person in service is still "ahead" of you.

export async function activeEntries(barberId) {
  return prisma.queueEntry.findMany({
    where: { barberId, status: { in: ['WAITING', 'IN_SERVICE'] } },
    orderBy: { number: 'asc' }
  })
}

export function positionOf(entries, number) {
  return entries.filter((e) => e.number < number).length
}

export function waitingCount(entries) {
  return entries.filter((e) => e.status === 'WAITING').length
}

export function inService(entries) {
  return entries.filter((e) => e.status === 'IN_SERVICE')[0] || null
}

export function etaFor(position, avgMinutes) {
  return position * avgMinutes
}

// Public board snapshot used by the vendor page and socket broadcast.
export async function boardSnapshot(entries, barber) {
  const waiting = waitingCount(entries)
  const serving = inService(entries)
  const lastNum = await prisma.queueEntry.findFirst({
    where: { barberId: barber.id },
    orderBy: { number: 'desc' },
    select: { number: true }
  })
  return {
    barberId: barber.id,
    open: barber.open,
    avgMinutes: barber.avgMinutes,
    waiting,
    inService: serving ? serving.customerName : null,
    etaMinutes: etaFor(waiting + (serving ? 1 : 0), barber.avgMinutes),
    nextNumber: lastNum ? lastNum.number + 1 : 1
  }
}

// Ticket snapshot for a specific entry (position + eta + status).
export async function ticketSnapshot(entry, barber, entries) {
  if (!entries) entries = await activeEntries(barber.id)
  const pos = positionOf(entries, entry.number)
  return {
    id: entry.id,
    number: entry.number,
    status: entry.status,
    position: pos,
    etaMinutes: etaFor(pos, barber.avgMinutes),
    waiting: waitingCount(entries),
    customerName: entry.customerName
  }
}