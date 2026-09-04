import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import prisma from '../src/db.js'
import { upsertReview, listReviews } from '../src/reviews/service.js'

const barber = { row: null }
const users = {}

async function makeUser(role, name) {
  return prisma.user.create({
    data: { email: `rev-${name}-${Date.now()}@test.local`, name, role }
  })
}

before(async () => {
  await prisma.review.deleteMany({ where: { barber: { slug: 'test-reviews' } } })
  const existing = await prisma.barber.findUnique({ where: { slug: 'test-reviews' } })
  if (existing) {
    await prisma.barber.delete({ where: { id: existing.id } })
  }
  const owner = await makeUser('BARBER', 'صاحب')
  users.owner = owner
  barber.row = await prisma.barber.create({
    data: { userId: owner.id, slug: 'test-reviews', shopName: 'صالون المراجعات' }
  })
  users.a = await makeUser('CUSTOMER', 'مراجع أ')
  users.b = await makeUser('CUSTOMER', 'مراجع ب')
})

test('upsertReview creates a review and updates aggregates', async () => {
  const { review, barber: updated } = await upsertReview(barber.row.id, users.a.id, {
    rating: 5,
    comment: 'رائع!'
  })
  assert.equal(review.rating, 5)
  assert.equal(review.comment, 'رائع!')
  assert.equal(updated.avgRating, 5)
  assert.equal(updated.ratingCount, 1)
})

test('upsertReview is idempotent per user (update not duplicate)', async () => {
  const { review } = await upsertReview(barber.row.id, users.a.id, { rating: 4, comment: 'أفضل' })
  assert.equal(review.rating, 4)
  assert.equal(review.comment, 'أفضل')
  const all = await prisma.review.findMany({ where: { barberId: barber.row.id } })
  assert.equal(all.length, 1)
})

test('multiple reviewers combine averages', async () => {
  await upsertReview(barber.row.id, users.b.id, { rating: 2 })
  const updated = await prisma.barber.findUnique({ where: { id: barber.row.id } })
  assert.equal(updated.ratingCount, 2)
  assert.equal(updated.avgRating, 3)
})

test('listReviews returns newest first with author names', async () => {
  const reviews = await listReviews(barber.row.id)
  assert.equal(reviews.length, 2)
  assert.equal(reviews[0].user.name, 'مراجع ب')
  assert.equal(reviews[1].user.name, 'مراجع أ')
  assert.ok(reviews[0].createdAt >= reviews[1].createdAt)
})

test('upsertReview rejects out-of-range or non-integer ratings', async () => {
  await assert.rejects(
    () => upsertReview(barber.row.id, users.a.id, { rating: 6 }),
    (e) => e.status === 400
  )
  await assert.rejects(
    () => upsertReview(barber.row.id, users.a.id, { rating: 0 }),
    (e) => e.status === 400
  )
})

after(async () => {
  await prisma.review.deleteMany({ where: { barber: { slug: 'test-reviews' } } })
  await prisma.barber.delete({ where: { id: barber.row.id } })
  await prisma.user.deleteMany({
    where: { id: { in: [users.owner.id, users.a.id, users.b.id] } }
  })
  await prisma.$disconnect()
})
