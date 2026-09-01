import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import prisma from '../src/db.js'
import { activeEntries, positionOf, waitingCount, boardSnapshot } from '../src/queue/board.js'
import { joinQueue, cancelQueue } from '../src/queue/service.js'

const barber = {}

before(async () => {
  await prisma.queueEntry.deleteMany({ where: { barber: { slug: 'test-salon' } } })
  const existing = await prisma.barber.findUnique({ where: { slug: 'test-salon' } })
  if (existing) {
    await prisma.barber.delete({ where: { id: existing.id } })
  }
  const user = await prisma.user.create({
    data: { email: `t-${Date.now()}@test.local`, name: 'تست', role: 'BARBER' }
  })
  barber.userId = user.id
  barber.row = await prisma.barber.create({
    data: { userId: user.id, slug: 'test-salon', shopName: 'تست صالون', avgMinutes: 17 }
  })
  await joinQueue(barber.row, { customerName: 'أ' })
  await joinQueue(barber.row, { customerName: 'ب' })
  await joinQueue(barber.row, { customerName: 'ج' })
})

test('joinQueue assigns sequential numbers', async () => {
  const e = await joinQueue(barber.row, { customerName: 'د' })
  assert.equal(e.number, 4)
})

test('positionOf counts only active entries ahead', async () => {
  const entries = await activeEntries(barber.row.id)
  // before(3) + joinQueue test(1) = 4 total waiting
  assert.equal(waitingCount(entries), 4)
  const e2 = entries.find((e) => e.customerName === 'ب')
  assert.equal(positionOf(entries, e2.number), 1)
})

test('cancelQueue removes person; positions for those behind recompute', async () => {
  const entries = await activeEntries(barber.row.id)
  const e1 = entries.find((e) => e.customerName === 'أ')
  await cancelQueue(e1.id, { user: null, ticket: { entryId: e1.id } })

  const after = await activeEntries(barber.row.id)
  const e3 = after.find((e) => e.customerName === 'ج')
  assert.equal(positionOf(after, e3.number), 1)

  const b = await prisma.barber.findUnique({ where: { id: barber.row.id } })
  const snap = await boardSnapshot(after, b)
  assert.equal(snap.nextNumber, 5)
  assert.equal(snap.waiting, 3)
})

test('cancelQueue device-match allows a guest to cancel their own entry', async () => {
  const j = await joinQueue(barber.row, { customerName: 'بالجهاز', deviceId: `dev-x-${Date.now()}` })
  await cancelQueue(j.id, { user: null, ticket: null, deviceId: j.guestId })
  const gone = await prisma.queueEntry.findUnique({ where: { id: j.id } })
  assert.equal(gone.status, 'CANCELLED')
})

test('cancelQueue rejects a mismatched device', async () => {
  const j = await joinQueue(barber.row, { customerName: 'جهاز آخر', deviceId: `dev-y-${Date.now()}` })
  await assert.rejects(
    () => cancelQueue(j.id, { user: null, ticket: null, deviceId: 'someone-else-device' }),
    (e) => e.status === 403
  )
})

after(async () => {
  await prisma.queueEntry.deleteMany({ where: { barber: { slug: 'test-salon' } } })
  await prisma.barber.delete({ where: { id: barber.row.id } })
  await prisma.user.delete({ where: { id: barber.userId } })
  await prisma.$disconnect()
})