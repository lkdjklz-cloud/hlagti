import prisma from '../db.js'
import { sendEmail } from './email.js'
import { sendPush, pushConfigured } from './push.js'
import { startOfTodayLocal } from '../lib/barbers.js'

export function parseData(s) {
  try {
    return JSON.parse(s || '{}')
  } catch {
    return {}
  }
}

// Create a notification and attempt delivery (push + email).
export async function createNotification({
  userId = null,
  email = null,
  key = null,
  type,
  title,
  body,
  data = {}
}) {
  const n = await prisma.notification.create({
    data: { userId, email, key, type, title, body, data: JSON.stringify(data) }
  })
  await dispatch(n)
  return n
}

async function dispatch(n) {
  const data = parseData(n.data)
  const or = []
  if (n.userId) or.push({ userId: n.userId })
  if (data.entryId) or.push({ entryId: data.entryId })
  const subs = or.length ? await prisma.pushSubscription.findMany({ where: { OR: or } }) : []

  let sentPush = false
  if (subs.length && pushConfigured()) {
    const payload = { title: n.title, body: n.body, ...data, url: data.url || '/' }
    for (const sub of subs) {
      const res = await sendPush(sub, payload)
      if (res === true) sentPush = true
      else if (res === 'gone') {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
      }
    }
  } else if (subs.length) {
    await sendPush(subs[0], { title: n.title, body: n.body, ...data, url: data.url || '/' })
  }

  let sentEmail = false
  if (n.email) sentEmail = await sendEmail({ to: n.email, subject: n.title, text: n.body })

  await prisma.notification.update({ where: { id: n.id }, data: { sentPush, sentEmail } })
}

// True if a notification with the same key (type:entryId) exists for today.
export async function hasNotifiedToday(key) {
  if (!key) return false
  const found = await prisma.notification.findFirst({
    where: { key, createdAt: { gte: startOfTodayLocal() } }
  })
  return !!found
}

// Latest stored position for a "position" style notification (change detection).
export async function lastPosition(key) {
  const found = await prisma.notification.findFirst({
    where: { type: 'position', key },
    orderBy: { createdAt: 'desc' }
  })
  if (!found) return null
  return parseData(found.data).position
}

// Notify a barber (stored in their outbox + push + live socket badge).
export async function notifyBarber(barber, { type, title, body, data = {} }) {
  if (!barber?.userId) return null
  const n = await createNotification({
    userId: barber.userId,
    type,
    title,
    body,
    data: { ...data, barberId: barber.id, url: data.url || '/dashboard' }
  })
  const { emitNotify } = await import('../socket.js')
  emitNotify(barber.id, {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    createdAt: n.createdAt,
    readAt: n.readAt
  })
  return n
}