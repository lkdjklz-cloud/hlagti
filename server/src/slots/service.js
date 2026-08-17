import prisma from '../db.js'

export const WEEK_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export function parseWorkingHours(raw) {
  try {
    return JSON.parse(raw || '{}')
  } catch {
    return {}
  }
}

function pad(n) {
  return String(n).padStart(2, '0')
}

// Parse "HH:MM" → minutes since midnight. null/'' → null.
export function toMinutes(t) {
  if (!t) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t).trim())
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

export function minutesToTime(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${pad(h)}:${pad(m)}`
}

// Local date YYYY-MM-DD → Date at 00:00 (server local).
export function localDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function dateKeyFor(date) {
  const y = date.getFullYear()
  const m = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  return `${y}-${m}-${d}`
}

// Works out the open/close window for a given date from workingHours,
// falling back to barber.opensAt/closesAt.
export function windowFor(barber, date) {
  const wh = parseWorkingHours(barber.workingHours)
  const weekday = WEEK_KEYS[date.getDay()]
  const day = wh[weekday]
  if (day === null) return null
  const open = toMinutes(day?.open) ?? toMinutes(barber.opensAt)
  const close = toMinutes(day?.close) ?? toMinutes(barber.closesAt)
  if (open === null || close === null || close <= open) return null
  return { open, close }
}

// All candidate slot start-times for a date (step = slot length).
// For today, times already passed are excluded.
export function candidateTimes(barber, date) {
  const win = windowFor(barber, date)
  if (!win) return []
  const step = barber.slotLengthMinutes || 30
  const now = new Date()
  const isToday =
    now.getFullYear() === date.getFullYear() &&
    now.getMonth() === date.getMonth() &&
    now.getDate() === date.getDate()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const times = []
  for (let t = win.open; t + step <= win.close; t += step) {
    if (isToday && t < nowMinutes) continue
    times.push(t)
  }
  return times
}

export async function slotAvailability(barber, dateStr) {
  const date = localDate(dateStr)
  if (Number.isNaN(date.getTime())) return { date: dateStr, slots: [] }

  const dayStart = date
  const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)

  let booked
  try {
    booked = await prisma.slot.findMany({
      where: { barberId: barber.id, startsAt: { gte: dayStart, lt: dayEnd } },
      select: { startsAt: true, status: true }
    })
  } catch (e) {
    console.log('[db:error] slotAvailability', barber.slug, dateStr, e)
    throw e
  }
  const takenTimes = new Set(
    booked.filter((b) => b.status !== 'CANCELLED').map((b) => b.startsAt.getTime())
  )

  const times = candidateTimes(barber, date).map((t) => {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, t)
    return { time: minutesToTime(t), full: false, taken: takenTimes.has(start.getTime()) }
  })

  // No working window → mark as closed
  const closed = windowFor(barber, date) ? false : true
  return { date: dateStr, closed, slots: times }
}

// Book a slot inside a transaction; conflicts → throws {status:409}.
export async function bookSlot(
  barber,
  { dateStr, time, customerName, customerPhone = null, userId = null }
) {
  const date = localDate(dateStr)
  if (Number.isNaN(date.getTime())) {
    const err = new Error('invalid_date')
    err.status = 400
    throw err
  }
  const startMin = toMinutes(time)
  if (startMin === null) {
    const err = new Error('invalid_time')
    err.status = 400
    throw err
  }
  const step = barber.slotLengthMinutes || 30
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, startMin)
  const end = new Date(start.getTime() + step * 60000)

  const win = windowFor(barber, date)
  if (!win || startMin < win.open || startMin + step > win.close) {
    const err = new Error('slot_outside_hours')
    err.status = 409
    throw err
  }
  if (startMin % step !== 0) {
    const err = new Error('slot_off_grid')
    err.status = 409
    throw err
  }

  const now = new Date()
  const isToday =
    now.getFullYear() === start.getFullYear() &&
    now.getMonth() === start.getMonth() &&
    now.getDate() === start.getDate()
  if (isToday && start.getTime() <= now.getTime()) {
    const err = new Error('slot_in_past')
    err.status = 409
    throw err
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const clash = await tx.slot.findFirst({
        where: { barberId: barber.id, startsAt: start, status: { not: 'CANCELLED' } }
      })
      if (clash) {
        const err = new Error('slot_taken')
        err.status = 409
        throw err
      }
      return tx.slot.create({
        data: {
          barberId: barber.id,
          startsAt: start,
          endsAt: end,
          customerName: (customerName || '').trim() || 'زبون',
          customerPhone: customerPhone || null,
          userId,
          status: 'BOOKED'
        }
      })
    })
  } catch (e) {
    if (!e.status || e.status >= 500) {
      console.log('[db:error] bookSlot', barber.slug, dateStr, time, e)
    }
    throw e
  }
}

export function slotDateTimeKey(dateStr, time) {
  return `${dateStr}T${time}`
}