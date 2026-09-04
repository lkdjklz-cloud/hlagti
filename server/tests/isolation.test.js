import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import prisma from '../src/db.js'
import { activeEntries, boardSnapshot } from '../src/queue/board.js'
import { joinQueue, cancelQueue } from '../src/queue/service.js'
import { bookSlot, slotAvailability } from '../src/slots/service.js'
import { upsertReview, listReviews } from '../src/reviews/service.js'
import { attachBarber } from '../src/auth/middleware.js'

// Two fully independent barbers chosen so every isolation claim scopes by
// barberId. A is the "actor" barber; B is the "other tenant" it must never
// touch.
const A = { row: null, user: null }
const B = { row: null, user: null }

const A_IDENTITY = { slug: 'iso-a', shopName: 'صالون أ' }
const B_IDENTITY = { slug: 'iso-b', shopName: 'صالون ب' }

async function makeBarber(slug, shopName) {
  const user = await prisma.user.create({
    data: { email: `iso-${slug}-${Date.now()}@test.local`, name: shopName, role: 'BARBER' }
  })
  const workingHours = Object.fromEntries(
    ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, { open: '09:00', close: '22:00' }])
  )
  const row = await prisma.barber.create({
    data: {
      userId: user.id,
      slug: `iso-${slug}-${Date.now()}`,
      shopName,
      opensAt: '09:00',
      closesAt: '22:00',
      workingHours: JSON.stringify(workingHours),
      slotLengthMinutes: 30
    }
  })
  return { row, user }
}

before(async () => {
  // Remove any prior leftovers, then create two fresh barbers.
  await prisma.review.deleteMany({ where: { barber: { OR: [{ slug: { contains: 'iso-a' } }, { slug: { contains: 'iso-b' } }] } } })
  await prisma.barber.deleteMany({ where: { slug: { contains: 'iso-a' } } })
  await prisma.barber.deleteMany({ where: { slug: { contains: 'iso-b' } } })
  A.row = (await makeBarber(A_IDENTITY.slug, A_IDENTITY.shopName)).row
  A.user = (await prisma.user.findUnique({ where: { id: A.row.userId } }))
  B.row = (await makeBarber(B_IDENTITY.slug, B_IDENTITY.shopName)).row
  B.user = (await prisma.user.findUnique({ where: { id: B.row.userId } }))

  // Give both a couple of services so "service isolation" is meaningful.
  await prisma.service.createMany({
    data: [
      { barberId: A.row.id, name: 'قصّة أ', price: 100, durationMinutes: 10, sortOrder: 0 },
      { barberId: B.row.id, name: 'قصّة ب', price: 200, durationMinutes: 20, sortOrder: 0 }
    ]
  })
})

test('attachBarber resolves exactly the matching barber (no cross-tenant)', async () => {
  const reqA = { auth: { uid: A.user.id } }
  const reqB = { auth: { uid: B.user.id } }
  await attachBarber(reqA, null, () => {})
  await attachBarber(reqB, null, () => {})
  assert.equal(reqA.barber.id, A.row.id)
  assert.equal(reqB.barber.id, B.row.id)
  assert.notEqual(reqA.barber.id, reqB.barber.id)
})

test('queue join on A never affects B board or numbering', async () => {
  await joinQueue(A.row, { customerName: 'أ' })
  await joinQueue(A.row, { customerName: 'أ2' })

  const aBoard = await boardSnapshot(await activeEntries(A.row.id), A.row)
  const bBoard = await boardSnapshot(await activeEntries(B.row.id), B.row)

  assert.equal(aBoard.waiting, 2)
  assert.equal(bBoard.waiting, 0, 'B sees no A entries')
  // B's numbering independently starts at 1 after its own first join.
  const bFirst = await joinQueue(B.row, { customerName: 'ب' })
  assert.equal(bFirst.number, 1)
})

test('cancelQueue rejects when acting on the wrong tenant barber', async () => {
  const aEntry = await activeEntries(A.row.id)
  const first = aEntry.find((e) => e.customerName === 'أ')
  // Trying to cancel A's entry while passing B as the barber context must fail.
  await assert.rejects(
    () => cancelQueue(first.id, { user: null }, B.row),
    (e) => e.status === 403
  )
  // The correct barber context succeeds.
  await cancelQueue(first.id, { user: null }, A.row)
})

test('reviews are scoped per barber — nobody else sees them', async () => {
  const reviewer = await prisma.user.create({
    data: { email: `iso-rv-${Date.now()}@test.local`, name: 'مراجع' }
  })
  await upsertReview(A.row.id, reviewer.id, { rating: 5, comment: 'فقط لصالون أ' })

  const a = await listReviews(A.row.id)
  const b = await listReviews(B.row.id)
  assert.equal(a.length, 1)
  assert.equal(a[0].comment, 'فقط لصالون أ')
  assert.equal(b.length, 0, 'B has no reviews from A')

  // Aggregate rating is only on the reviewed barber.
  const aBarber = await prisma.barber.findUnique({ where: { id: A.row.id } })
  const bBarber = await prisma.barber.findUnique({ where: { id: B.row.id } })
  assert.equal(aBarber.ratingCount, 1)
  assert.equal(bBarber.ratingCount, 0, 'B rating untouched')

  await prisma.user.delete({ where: { id: reviewer.id } })
})

test('slot booking on A is invisible to B availability and vice versa', async () => {
  const d = new Date()
  d.setDate(d.getDate() + 3)
  const pad = (n) => String(n).padStart(2, '0')
  const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const time = '10:00'
  await bookSlot(A.row, { dateStr, time, customerName: 'موعد أ' })

  const availB = await slotAvailability(B.row, dateStr)
  const takenB = availB.slots.find((s) => s.time === time)
  assert.ok(takenB, 'B sees the candidate time')
  assert.equal(takenB.taken, false, "A's booking does not block B")

  // B booking same time works — no cross-tenant clash.
  await bookSlot(B.row, { dateStr, time, customerName: 'موعد ب' })
  const availA = await slotAvailability(A.row, dateStr)
  const takenA = availA.slots.find((s) => s.time === time)
  assert.equal(takenA.taken, true)
})

test('services are isolated per barber', async () => {
  const aSvc = await prisma.service.findMany({ where: { barberId: A.row.id } })
  const bSvc = await prisma.service.findMany({ where: { barberId: B.row.id } })
  assert.ok(aSvc.length >= 1)
  assert.ok(bSvc.length >= 1)
  assert.ok(!aSvc.some((s) => s.name === 'قصّة ب'), 'A does not contain B service')
  assert.ok(!bSvc.some((s) => s.name === 'قصّة أ'), 'B does not contain A service')
})

after(async () => {
  await prisma.review.deleteMany({ where: { barberId: { in: [A.row.id, B.row.id] } } })
  await prisma.queueEntry.deleteMany({ where: { barberId: { in: [A.row.id, B.row.id] } } })
  await prisma.slot.deleteMany({ where: { barberId: { in: [A.row.id, B.row.id] } } })
  await prisma.service.deleteMany({ where: { barberId: { in: [A.row.id, B.row.id] } } })
  await prisma.barber.deleteMany({ where: { id: { in: [A.row.id, B.row.id] } } })
  const ids = [A.user?.id, B.user?.id].filter(Boolean)
  if (ids.length) await prisma.user.deleteMany({ where: { id: { in: ids } } })
  await prisma.$disconnect()
})
