import prisma from '../db.js'

// Customers are identified ONLY by their unique username (no phone fallback).
// Free = a visit marked paid:false when the barber completed it.

async function tallyForBarber(barberId) {
  let queueDone = []
  let slotDone = []
  try {
    ;[queueDone, slotDone] = await Promise.all([
      prisma.queueEntry.findMany({
        where: { barberId, status: 'DONE' },
        select: { paid: true, user: { select: { username: true } } }
      }),
      prisma.slot.findMany({
        where: { barberId, status: 'DONE' },
        select: { paid: true, user: { select: { username: true } } }
      })
    ])
  } catch (e) {
    console.log('[db:error] loyalty tallyForBarber', barberId, e)
    return null
  }
  const tally = new Map() // username -> { paid, free }
  for (const row of [...queueDone, ...slotDone]) {
    const uname = row.user?.username
    if (!uname) continue
    const item = tally.get(uname) || { paid: 0, free: 0 }
    if (row.paid !== false) item.paid++
    else item.free++
    tally.set(uname, item)
  }
  return tally
}

function toStats(t, every) {
  const paid = t?.paid || 0
  const free = t?.free || 0
  const inCycle = paid % every
  const cycles = Math.floor(paid / every)
  const nextFree = paid > 0 && cycles > free
  const remaining = nextFree ? 0 : every - inCycle
  return { enabled: true, every, paid, free, inCycle, remaining, nextFree }
}

// Stats for ONE user at a barber (null when no loyalty / unknown user).
export async function loyaltyStats(barberId, userId) {
  if (!userId) return null
  const map = await loyaltyStatsForUsers(barberId, [userId])
  return map.get(userId) || null
}

// Stats for many users at a barber: Map<userId, {enabled,every,paid,free,inCycle,remaining,nextFree}>.
export async function loyaltyStatsForUsers(barberId, userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))]
  const out = new Map()
  if (!ids.length) return out

  let users = []
  try {
    users = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, username: true }
    })
  } catch (e) {
    console.log('[db:error] loyalty loyaltyStatsForUsers users', e)
    return out
  }
  if (!users.length) return out

  const barber = await prisma.barber
    .findUnique({ where: { id: barberId }, select: { loyaltyEvery: true } })
    .catch((e) => {
      console.log('[db:error] loyalty barber', barberId, e)
      return null
    })
  const every = barber?.loyaltyEvery || null
  if (!every) {
    for (const u of users) out.set(u.id, { enabled: false, every: null, paid: 0, free: 0, inCycle: 0, remaining: 0, nextFree: false })
    return out
  }

  const tally = await tallyForBarber(barberId)
  if (!tally) return out
  for (const u of users) out.set(u.id, toStats(tally.get(u.username), every))
  return out
}